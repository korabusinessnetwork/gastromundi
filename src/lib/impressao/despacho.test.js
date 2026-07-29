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

import { enviarViaProducao, imprimirLancamento } from "./despacho";

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

  it("um ponto configurado imprime um papel só, sem carimbar o nome do ponto", async () => {
    configurarConfig({
      perfilImpressora: PERFIL_TERMICA,
      pontosImpressao: [{ id: "p1", nome: "Cozinha", impressora: PERFIL_TERMICA.impressora, padrao: true }],
    });

    const { error } = await enviarViaProducao(pedido);

    expect(error).toBeNull();
    expect(imprimirDocumento).toHaveBeenCalledTimes(1);
    const [documento] = imprimirDocumento.mock.calls[0];
    expect(documento).not.toHaveProperty("pontoNome");
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

describe("enviarViaProducao com vários pontos de impressão", () => {
  const COZINHA = { tipo: "windows", nome: "EPSON-COZINHA" };
  const BAR = { tipo: "rede", host: "192.168.0.9", porta: 9100 };

  const DOIS_PONTOS = [
    { id: "p1", nome: "Cozinha", impressora: COZINHA, padrao: true },
    { id: "p2", nome: "Bar", impressora: BAR, padrao: false },
  ];

  const pedidoMisto = {
    comanda: "12",
    created_at: "2026-07-26T18:00:00.000Z",
    items: [
      { id: 1, name: "X-Burguer", qty: 2, category: "Lanches" },
      { id: 2, name: "Caipirinha", qty: 1, category: "Bebidas" },
      { id: 3, name: "Chocolate Quente", qty: 1, category: "Bebidas" },
      { id: 4, name: "Petisco Sem Categoria", qty: 1 },
    ],
  };

  // Facilita ler as asserções: nome do ponto → nomes dos itens que saíram nele.
  function viasImpressas() {
    return imprimirDocumento.mock.calls.map(([documento, perfil]) => ({
      pontoNome: documento.pontoNome,
      impressora: perfil.impressora,
      itens: documento.itens.map((i) => i.nome),
    }));
  }

  it("separa os itens por categoria: cada ponto recebe só o que é dele", async () => {
    configurarConfig({
      perfilImpressora: PERFIL_TERMICA,
      pontosImpressao: DOIS_PONTOS,
      roteamento: { categorias: { Bebidas: "p2" }, produtos: {} },
    });

    const { error } = await enviarViaProducao(pedidoMisto);

    expect(error).toBeNull();
    expect(imprimirDocumento).toHaveBeenCalledTimes(2);
    expect(viasImpressas()).toEqual([
      { pontoNome: "Cozinha", impressora: COZINHA, itens: ["X-Burguer", "Petisco Sem Categoria"] },
      { pontoNome: "Bar", impressora: BAR, itens: ["Caipirinha", "Chocolate Quente"] },
    ]);
  });

  it("exceção por produto vence a categoria (bebida que é feita na cozinha)", async () => {
    configurarConfig({
      perfilImpressora: PERFIL_TERMICA,
      pontosImpressao: DOIS_PONTOS,
      roteamento: { categorias: { Bebidas: "p2" }, produtos: { 3: "p1" } },
    });

    await enviarViaProducao(pedidoMisto);

    expect(viasImpressas()).toEqual([
      { pontoNome: "Cozinha", impressora: COZINHA, itens: ["X-Burguer", "Chocolate Quente", "Petisco Sem Categoria"] },
      { pontoNome: "Bar", impressora: BAR, itens: ["Caipirinha"] },
    ]);
  });

  it("todo item sai em exatamente um papel — nenhum se perde, nenhum duplica", async () => {
    configurarConfig({
      perfilImpressora: PERFIL_TERMICA,
      pontosImpressao: DOIS_PONTOS,
      roteamento: { categorias: { Bebidas: "p2", Sobremesas: "p9" }, produtos: {} },
    });

    await enviarViaProducao(pedidoMisto);

    const todos = imprimirDocumento.mock.calls.flatMap(([doc]) => doc.itens.map((i) => i.nome));
    expect(todos.slice().sort()).toEqual(
      ["X-Burguer", "Caipirinha", "Chocolate Quente", "Petisco Sem Categoria"].sort()
    );
  });

  it("rota apontando pra ponto apagado cai no padrão (nada some da cozinha)", async () => {
    configurarConfig({
      perfilImpressora: PERFIL_TERMICA,
      pontosImpressao: DOIS_PONTOS,
      roteamento: { categorias: { Bebidas: "p7" }, produtos: {} },
    });

    await enviarViaProducao(pedidoMisto);

    expect(imprimirDocumento).toHaveBeenCalledTimes(1);
    expect(viasImpressas()[0].pontoNome).toBe("Cozinha");
    expect(viasImpressas()[0].itens).toHaveLength(4);
  });

  it("ponto sem item não gasta papel", async () => {
    configurarConfig({
      perfilImpressora: PERFIL_TERMICA,
      pontosImpressao: DOIS_PONTOS,
      roteamento: { categorias: { Sushi: "p2" }, produtos: {} },
    });

    await enviarViaProducao(pedidoMisto);

    expect(imprimirDocumento).toHaveBeenCalledTimes(1);
  });

  it("comanda sem item produzível ainda gera a via no ponto padrão", async () => {
    configurarConfig({ perfilImpressora: PERFIL_TERMICA, pontosImpressao: DOIS_PONTOS });

    const { error } = await enviarViaProducao({ comanda: "12", items: [] });

    expect(error).toBeNull();
    expect(imprimirDocumento).toHaveBeenCalledTimes(1);
    const [, perfil] = imprimirDocumento.mock.calls[0];
    expect(perfil.impressora).toEqual(COZINHA);
  });

  it("cada ponto usa a própria impressora, mas o mesmo papel/layout do perfil", async () => {
    configurarConfig({
      perfilImpressora: PERFIL_TERMICA,
      pontosImpressao: DOIS_PONTOS,
      roteamento: { categorias: { Bebidas: "p2" }, produtos: {} },
    });

    await enviarViaProducao(pedidoMisto);

    imprimirDocumento.mock.calls.forEach(([, perfil]) => {
      expect(perfil.larguraMm).toBe(58);
      expect(perfil.driver).toBe("escpos-ponte");
    });
  });

  it("falha em um ponto não impede o outro de imprimir, e o erro diz qual não saiu", async () => {
    configurarConfig({
      perfilImpressora: PERFIL_TERMICA,
      pontosImpressao: DOIS_PONTOS,
      roteamento: { categorias: { Bebidas: "p2" }, produtos: {} },
    });
    imprimirDocumento.mockImplementation(async (documento) =>
      documento.pontoNome === "Bar"
        ? { error: { message: "A Ponte KORA não está rodando neste computador." } }
        : { error: null }
    );

    const { error } = await enviarViaProducao(pedidoMisto);

    expect(imprimirDocumento).toHaveBeenCalledTimes(2);
    expect(error?.message).toMatch(/Bar/);
    expect(error?.message).not.toMatch(/Cozinha/);
    expect(error?.message).toMatch(/Ponte KORA não está rodando/);
  });

  it("driver que lança em um ponto não derruba os outros", async () => {
    configurarConfig({
      perfilImpressora: PERFIL_TERMICA,
      pontosImpressao: DOIS_PONTOS,
      roteamento: { categorias: { Bebidas: "p2" }, produtos: {} },
    });
    imprimirDocumento.mockImplementation(async (documento) => {
      if (documento.pontoNome === "Cozinha") throw new Error("impressora sumiu");
      return { error: null };
    });

    const { error } = await enviarViaProducao(pedidoMisto);

    expect(imprimirDocumento).toHaveBeenCalledTimes(2);
    expect(error?.message).toMatch(/Cozinha/);
    expect(error?.message).toMatch(/impressora sumiu/);
  });
});

describe("imprimirLancamento", () => {
  it("imprime quando a chave está ligada", async () => {
    configurarConfig({ perfilImpressora: PERFIL_TERMICA, imprimirAoLancar: true });

    const { error, impresso } = await imprimirLancamento(pedido);

    expect(error).toBeNull();
    expect(impresso).toBe(true);
    expect(imprimirDocumento).toHaveBeenCalledTimes(1);
  });

  it("imprime em instalação antiga, que não tem a chave gravada", async () => {
    configurarConfig({ perfilImpressora: PERFIL_TERMICA });

    const { impresso } = await imprimirLancamento(pedido);

    expect(impresso).toBe(true);
    expect(imprimirDocumento).toHaveBeenCalledTimes(1);
  });

  it("não imprime nada quando a chave está desligada", async () => {
    configurarConfig({ perfilImpressora: PERFIL_TERMICA, imprimirAoLancar: false });

    const { error, impresso } = await imprimirLancamento(pedido);

    expect(error).toBeNull();
    expect(impresso).toBe(false);
    expect(imprimirDocumento).not.toHaveBeenCalled();
  });

  it("não gasta papel quando nada do lançamento vai para a produção", async () => {
    configurarConfig({ perfilImpressora: PERFIL_TERMICA });

    const soBebidaPronta = {
      comanda: "12",
      items: [{ name: "Refrigerante", qty: 1, category: "Bebidas", produzivel: false }],
    };
    const { impresso } = await imprimirLancamento(soBebidaPronta);

    expect(impresso).toBe(false);
    expect(imprimirDocumento).not.toHaveBeenCalled();
  });

  it("devolve o erro do driver sem lançar — o pedido já está gravado", async () => {
    configurarConfig({ perfilImpressora: PERFIL_TERMICA });
    imprimirDocumento.mockResolvedValue({ error: { message: "Ponte KORA fechada." } });

    const { error, impresso } = await imprimirLancamento(pedido);

    expect(impresso).toBe(true);
    expect(error?.message).toBe("Ponte KORA fechada.");
  });

  it("imprime só os itens que recebeu, não a comanda inteira", async () => {
    configurarConfig({ perfilImpressora: PERFIL_TERMICA });

    await imprimirLancamento({ comanda: "12", items: [{ name: "Pudim", qty: 1, category: "Sobremesas" }] });

    const [documento] = imprimirDocumento.mock.calls[0];
    expect(documento.itens.map((i) => i.nome ?? i.name)).toEqual(["Pudim"]);
  });
});
