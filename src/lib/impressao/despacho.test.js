// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockSupabase, imprimirDocumento } = vi.hoisted(() => ({
  mockSupabase: { current: null },
  imprimirDocumento: vi.fn(async () => ({ error: null })),
}));
vi.mock("../supabase", async () => {
  const { createMockSupabase } = await import("@/test/mockSupabase");
  mockSupabase.current = createMockSupabase();
  return { supabase: mockSupabase.current };
});

// Captura as impressões sem tocar em driver real (window.print / QZ Tray).
vi.mock("./drivers", () => ({ imprimirDocumento }));

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
