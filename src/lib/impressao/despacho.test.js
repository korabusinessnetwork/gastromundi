// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockSupabase, imprimirDocumento, enfileirarTrabalho } = vi.hoisted(() => ({
  mockSupabase: { current: null },
  imprimirDocumento: vi.fn(async () => ({ error: null })),
  enfileirarTrabalho: vi.fn(async () => ({ data: { id: "trab-1" }, error: null })),
}));
vi.mock("../supabase", async () => {
  const { createMockSupabase } = await import("@/test/mockSupabase");
  mockSupabase.current = createMockSupabase();
  return { supabase: mockSupabase.current };
});

// Captura as impressões sem tocar em driver real (window.print / QZ Tray).
vi.mock("./drivers", () => ({ imprimirDocumento }));

// Captura o enfileiramento (Fase 3) sem tocar no banco.
vi.mock("./fila", () => ({ enfileirarTrabalho }));

import { imprimirViaProducaoRoteada } from "./despacho";

const CONFIG_VALUE = {
  perfilImpressora: { larguraMm: 80, driver: "browser-raster", impressoraQz: null },
};

function configurarConfig(value = CONFIG_VALUE) {
  mockSupabase.current.setTableResult("config", { data: { value }, error: null });
}
function configurarRoteamento(roteamento, locais) {
  mockSupabase.current.setTableResult("categorias_roteamento", { data: roteamento, error: null });
  mockSupabase.current.setTableResult("locais_impressao", { data: locais, error: null });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSupabase.current.reset();
  localStorage.clear();
  imprimirDocumento.mockResolvedValue({ error: null });
  enfileirarTrabalho.mockResolvedValue({ data: { id: "trab-1" }, error: null });
});

describe("imprimirViaProducaoRoteada (Fase 1 — orquestração)", () => {
  it("roteia em N vias, uma por local, cada uma no perfil vinculado nesta máquina", async () => {
    configurarConfig();
    configurarRoteamento(
      [
        { categoria: "Comidas", local_impressao_id: "loc-cozinha" },
        { categoria: "Bebidas", local_impressao_id: "loc-bar" },
      ],
      [
        { id: "loc-cozinha", nome: "Cozinha" },
        { id: "loc-bar", nome: "Bar" },
      ],
    );
    // Bar tem impressora térmica vinculada nesta máquina; cozinha não.
    localStorage.setItem(
      "gastromundi:impressoras_config_v2",
      JSON.stringify({ "loc-bar": { nome: "EPSON-BAR" } }),
    );

    const pedido = {
      comanda: "5",
      items: [
        { name: "Hambúrguer", qty: 1, category: "Comidas" },
        { name: "Cerveja", qty: 2, category: "Bebidas" },
      ],
    };

    const { error } = await imprimirViaProducaoRoteada(pedido);

    expect(error).toBeNull();
    expect(imprimirDocumento).toHaveBeenCalledTimes(2);

    const [docCozinha, perfilCozinha] = imprimirDocumento.mock.calls[0];
    expect(docCozinha.itens.map((i) => i.nome)).toEqual(["Hambúrguer"]);
    expect(perfilCozinha.driver).toBe("browser-raster"); // sem vínculo → perfil global

    const [docBar, perfilBar] = imprimirDocumento.mock.calls[1];
    expect(docBar.itens.map((i) => i.nome)).toEqual(["Cerveja"]);
    expect(perfilBar).toMatchObject({ driver: "escpos-qztray", impressoraQz: "EPSON-BAR" });
  });

  it("sem roteamento configurado → fallback: 1 via única no perfil global (sem regressão)", async () => {
    configurarConfig();
    configurarRoteamento([], []);

    const pedido = { comanda: "9", items: [{ name: "Cerveja", qty: 1, category: "Bebidas" }] };

    const { error } = await imprimirViaProducaoRoteada(pedido);

    expect(error).toBeNull();
    expect(imprimirDocumento).toHaveBeenCalledTimes(1);
    const [doc, perfil] = imprimirDocumento.mock.calls[0];
    expect(doc.tipo).toBe("via_producao");
    expect(doc.itens.map((i) => i.nome)).toEqual(["Cerveja"]);
    // buscarConfigImpressao mescla os defaults do perfil — o fallback usa
    // o perfil global (browser-raster), sem impressora física vinculada.
    expect(perfil).toMatchObject({ driver: "browser-raster", impressoraQz: null });
  });

  it("agrega erros de impressão por local numa mensagem só", async () => {
    configurarConfig();
    configurarRoteamento(
      [
        { categoria: "Comidas", local_impressao_id: "loc-cozinha" },
        { categoria: "Bebidas", local_impressao_id: "loc-bar" },
      ],
      [
        { id: "loc-cozinha", nome: "Cozinha" },
        { id: "loc-bar", nome: "Bar" },
      ],
    );
    imprimirDocumento
      .mockResolvedValueOnce({ error: null })
      .mockResolvedValueOnce({ error: { message: "impressora offline" } });

    const pedido = {
      items: [
        { name: "Fritas", qty: 1, category: "Comidas" },
        { name: "Suco", qty: 1, category: "Bebidas" },
      ],
    };

    const { error } = await imprimirViaProducaoRoteada(pedido);

    expect(error).not.toBeNull();
    expect(error.message).toContain("Bar");
    expect(error.message).toContain("impressora offline");
  });
});

// Vincula locais NESTA máquina pelo cache da estação (Fase 2).
function vincularNestaMaquina(impressoras) {
  localStorage.setItem(
    "gastromundi:estacao_bindings.v1",
    JSON.stringify({ estacaoId: "est-1", impressoras }),
  );
}

describe("imprimirViaProducaoRoteada (Fase 3 — impressão em rede)", () => {
  const roteamentoCozinhaBar = () =>
    configurarRoteamento(
      [
        { categoria: "Comidas", local_impressao_id: "loc-cozinha" },
        { categoria: "Bebidas", local_impressao_id: "loc-bar" },
      ],
      [
        { id: "loc-cozinha", nome: "Cozinha" },
        { id: "loc-bar", nome: "Bar" },
      ],
    );
  const pedidoCozinhaBar = () => ({
    comanda: "7",
    items: [
      { name: "Fritas", qty: 1, category: "Comidas" },
      { name: "Cerveja", qty: 2, category: "Bebidas" },
    ],
  });

  it("rede ligada: local vinculado aqui imprime na hora; local de outro PC vai pra fila", async () => {
    configurarConfig({ ...CONFIG_VALUE, impressaoEmRede: true });
    roteamentoCozinhaBar();
    vincularNestaMaquina({ "loc-cozinha": { nome: "EPSON-COZINHA" } }); // bar NÃO é desta máquina

    const { error } = await imprimirViaProducaoRoteada(pedidoCozinhaBar());

    expect(error).toBeNull();
    // Cozinha (vinculada aqui) imprimiu; bar (de outro PC) não imprimiu aqui.
    expect(imprimirDocumento).toHaveBeenCalledTimes(1);
    const [docCozinha, perfilCozinha] = imprimirDocumento.mock.calls[0];
    expect(docCozinha.itens.map((i) => i.nome)).toEqual(["Fritas"]);
    expect(perfilCozinha).toMatchObject({ driver: "escpos-qztray", impressoraQz: "EPSON-COZINHA" });
    // Bar foi enfileirado para o PC dono do local.
    expect(enfileirarTrabalho).toHaveBeenCalledTimes(1);
    const [arg] = enfileirarTrabalho.mock.calls[0];
    expect(arg.localImpressaoId).toBe("loc-bar");
    expect(arg.documento.itens.map((i) => i.nome)).toEqual(["Cerveja"]);
  });

  it("rede DESLIGADA (padrão): local não vinculado imprime no perfil global aqui, sem fila (zero regressão)", async () => {
    configurarConfig(); // sem impressaoEmRede → default false
    roteamentoCozinhaBar();
    // nada vinculado nesta máquina

    const { error } = await imprimirViaProducaoRoteada(pedidoCozinhaBar());

    expect(error).toBeNull();
    expect(enfileirarTrabalho).not.toHaveBeenCalled();
    expect(imprimirDocumento).toHaveBeenCalledTimes(2); // as duas vias saem aqui
  });

  it("rede ligada + falha ao enfileirar → erro agregado avisa que não entrou na fila", async () => {
    configurarConfig({ ...CONFIG_VALUE, impressaoEmRede: true });
    roteamentoCozinhaBar();
    vincularNestaMaquina({ "loc-cozinha": { nome: "EPSON-COZINHA" } });
    enfileirarTrabalho.mockResolvedValueOnce({ data: null, error: { message: "sem rede" } });

    const { error } = await imprimirViaProducaoRoteada(pedidoCozinhaBar());

    expect(error).not.toBeNull();
    expect(error.message).toContain("Bar");
    expect(error.message.toLowerCase()).toContain("fila");
  });
});
