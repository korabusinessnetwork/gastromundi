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

// Captura as impressões sem tocar em driver real (window.print / Ponte).
vi.mock("./drivers", () => ({ imprimirDocumento }));

import { enviarViaProducao } from "./despacho";

const PERFIL_TERMICA = {
  larguraMm: 58,
  driver: "escpos-ponte",
  impressora: { tipo: "windows", nome: "EPSON-COZINHA" },
};

function configurarConfig(value) {
  mockSupabase.current.setTableResult("config", { data: { value }, error: null });
}

const pedido = {
  comanda: "12",
  mesa: "3",
  garcom: "joao",
  created_at: "2026-07-26T18:00:00.000Z",
  items: [
    { name: "X-Burguer", qty: 2, category: "Lanches", obs: ["sem cebola"] },
    { name: "Refrigerante", qty: 1, category: "Bebidas", produzivel: false },
    { name: "Batata", qty: 1, category: "Lanches", cancelado: true },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockSupabase.current.reset();
  localStorage.clear();
  imprimirDocumento.mockResolvedValue({ error: null });
});

describe("enviarViaProducao", () => {
  it("imprime uma única via, no perfil do estabelecimento", async () => {
    configurarConfig({ perfilImpressora: PERFIL_TERMICA });

    const { error } = await enviarViaProducao(pedido);

    expect(error).toBeNull();
    expect(imprimirDocumento).toHaveBeenCalledTimes(1);
    const [, perfil] = imprimirDocumento.mock.calls[0];
    expect(perfil).toMatchObject(PERFIL_TERMICA);
  });

  it("monta a via de produção com comanda/mesa/garçom e só os itens produzíveis", async () => {
    configurarConfig({ perfilImpressora: PERFIL_TERMICA });

    await enviarViaProducao(pedido);

    const [documento] = imprimirDocumento.mock.calls[0];
    expect(documento.tipo).toBe("via_producao");
    expect(documento.comanda).toBe("12");
    expect(documento.mesa).toBe("3");
    expect(documento.garcom).toBe("joao");
    expect(documento.itens.map((i) => i.nome)).toEqual(["X-Burguer"]);
    expect(documento.itens[0].obs).toEqual(["sem cebola"]);
  });

  it("sem config gravada, usa o perfil padrão em vez de deixar a comanda sem sair", async () => {
    mockSupabase.current.setTableResult("config", { data: null, error: null });

    const { error } = await enviarViaProducao(pedido);

    expect(error).toBeNull();
    const [, perfil] = imprimirDocumento.mock.calls[0];
    expect(perfil.driver).toBe("browser-raster");
  });

  it("banco fora do ar não impede a impressão (config cai nos defaults)", async () => {
    mockSupabase.current.setTableError("config", { message: "falha de rede" });

    const { error } = await enviarViaProducao(pedido);

    expect(error).toBeNull();
    expect(imprimirDocumento).toHaveBeenCalledTimes(1);
  });

  it("propaga o erro do driver pra quem chamou (o caixa precisa saber que não saiu)", async () => {
    configurarConfig({ perfilImpressora: PERFIL_TERMICA });
    imprimirDocumento.mockResolvedValue({ error: { message: "A Ponte KORA não está rodando neste computador." } });

    const { error } = await enviarViaProducao(pedido);

    expect(error?.message).toMatch(/Ponte KORA não está rodando/);
  });

  it("config antiga com impressoraQz não quebra — o campo legado é ignorado", async () => {
    configurarConfig({
      impressaoEmRede: true,
      perfilImpressora: { larguraMm: 80, driver: "escpos-qztray", impressoraQz: "EPSON-ANTIGA" },
    });

    const { error } = await enviarViaProducao(pedido);

    expect(error).toBeNull();
    const [, perfil] = imprimirDocumento.mock.calls[0];
    expect(perfil).not.toHaveProperty("impressoraQz");
    expect(perfil.driver).toBe("browser-raster");
    expect(perfil.larguraMm).toBe(80);
  });
});
