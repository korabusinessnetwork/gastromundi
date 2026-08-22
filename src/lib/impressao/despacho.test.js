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

// A Ponte KORA só sabe que duas impressões são a mesma pelo campo `id`. Se
// esse id viesse do TEXTO do papel, duas comandas de mesas diferentes com o
// mesmo texto virariam uma só, e a mesma comanda com o texto alterado entre a
// tentativa e o reenvio sairia duas vezes. Ele tem que nascer da AÇÃO.
describe("id de impressão nascido da ação, não do texto do papel", () => {
  const COZINHA = { tipo: "windows", nome: "EPSON-COZINHA" };
  const BAR = { tipo: "rede", host: "192.168.0.9", porta: 9100 };
  const DOIS_PONTOS = [
    { id: "p1", nome: "Cozinha", impressora: COZINHA, padrao: true },
    { id: "p2", nome: "Bar", impressora: BAR, padrao: false },
  ];

  /** Uma comanda com um lançamento só — o que o PDV manda ao lançar. */
  const lancamento = (pedidoId, quando, items) => ({
    id: pedidoId,
    comanda: "12",
    items: items.map((item) => ({ ...item, launched_at: quando })),
  });

  const UM_X_BURGUER = [{ id: 1, name: "X-Burguer", qty: 1, category: "Lanches" }];

  const idsEnviados = () => imprimirDocumento.mock.calls.map(([, perfil]) => perfil.idImpressao);

  it("o lançamento sai identificado, com id do tamanho que a Ponte honra", async () => {
    // Comanda com id de verdade (UUID do banco), que somado ao instante do
    // lançamento e ao id do ponto já passa dos 64 caracteres crus.
    configurarConfig({ perfilImpressora: PERFIL_TERMICA });

    await imprimirLancamento(
      lancamento("6f0f2a7c-6a3f-4c66-9d0f-2b1c7f9a5e31", "2026-07-26T18:00:00.000Z", UM_X_BURGUER)
    );

    expect(idsEnviados()[0]).toEqual(expect.any(String));
    // Abaixo de 8 caracteres a Ponte recusa o trabalho com 400 (ponte/servidor.js).
    expect(idsEnviados()[0].length).toBeGreaterThanOrEqual(8);
    // Acima de 64 ela corta o id — e o corte apagaria justamente a parte que
    // separa um ponto de impressão do outro.
    expect(idsEnviados()[0].length).toBeLessThanOrEqual(64);
  });

  it("cada ponto de impressão da MESMA ação recebe um id diferente", async () => {
    // O erro que mata a comanda no segundo ponto: mesmo id nos dois papéis, a
    // Ponte devolve "duplicado" no segundo e o bar nunca recebe nada.
    configurarConfig({
      perfilImpressora: PERFIL_TERMICA,
      pontosImpressao: DOIS_PONTOS,
      roteamento: { categorias: { Bebidas: "p2" }, produtos: {} },
    });

    await imprimirLancamento(
      lancamento("ped-a", "2026-07-26T18:00:00.000Z", [
        { id: 1, name: "X-Burguer", qty: 1, category: "Lanches" },
        { id: 2, name: "Caipirinha", qty: 1, category: "Bebidas" },
      ])
    );

    expect(imprimirDocumento).toHaveBeenCalledTimes(2);
    const [idCozinha, idBar] = idsEnviados();
    expect(idCozinha).toEqual(expect.any(String));
    expect(idBar).not.toBe(idCozinha);
  });

  it("a mesma ação pedida de novo repete o id — é assim que a Ponte segura o papel dobrado", async () => {
    configurarConfig({ perfilImpressora: PERFIL_TERMICA });
    const pedidoLancado = lancamento("ped-a", "2026-07-26T18:00:00.000Z", UM_X_BURGUER);

    await imprimirLancamento(pedidoLancado);
    await imprimirLancamento(pedidoLancado);

    expect(idsEnviados()[0]).toEqual(expect.any(String));
    expect(idsEnviados()[1]).toBe(idsEnviados()[0]);
  });

  it("a mesma ação reenviada com o papel alterado mantém o id (senão a comanda sairia duas vezes)", async () => {
    // O caixa lança, a impressora falha, o garçom corrige a observação e manda
    // de novo: é o MESMO lançamento (mesma comanda, mesmo instante), com texto
    // diferente. Se o id viesse do texto, a Ponte não reconheceria o reenvio e
    // o prato sairia duas vezes na bancada.
    configurarConfig({ perfilImpressora: PERFIL_TERMICA });

    await imprimirLancamento(
      lancamento("ped-a", "2026-07-26T18:00:00.000Z", [
        { id: 1, name: "X-Burguer", qty: 1, category: "Lanches" },
      ])
    );
    await imprimirLancamento(
      lancamento("ped-a", "2026-07-26T18:00:00.000Z", [
        { id: 1, name: "X-Burguer SEM CEBOLA", qty: 2, category: "Lanches" },
      ])
    );

    const [primeiro, segundo] = imprimirDocumento.mock.calls.map(([documento]) =>
      documento.itens.map((i) => `${i.qty}x ${i.nome}`).join("|")
    );
    expect(segundo).not.toBe(primeiro); // papel diferente
    expect(idsEnviados()[0]).toEqual(expect.any(String));
    expect(idsEnviados()[1]).toBe(idsEnviados()[0]); // mesmo id
  });

  it("leva com mais de um lançamento junto vai sem id (nenhuma chave representa a leva)", async () => {
    // Dois instantes diferentes no mesmo papel: a chave de um lançamento não
    // identifica o outro. Mandar a do primeiro faria a Ponte prometer uma
    // proteção que não cobre o resto do papel.
    configurarConfig({ perfilImpressora: PERFIL_TERMICA });

    await imprimirLancamento({
      id: "ped-a",
      comanda: "12",
      items: [
        { id: 1, name: "X-Burguer", qty: 1, category: "Lanches", launched_at: "2026-07-26T18:00:00.000Z" },
        { id: 2, name: "Batata", qty: 1, category: "Lanches", launched_at: "2026-07-26T18:05:00.000Z" },
      ],
    });

    expect(imprimirDocumento).toHaveBeenCalledTimes(1);
    expect(idsEnviados()[0]).toBeUndefined();
  });

  it("dois lançamentos da mesma comanda nunca dividem o mesmo id", async () => {
    configurarConfig({ perfilImpressora: PERFIL_TERMICA });

    await imprimirLancamento(lancamento("ped-a", "2026-07-26T18:00:00.000Z", UM_X_BURGUER));
    await imprimirLancamento(lancamento("ped-a", "2026-07-26T18:05:00.000Z", UM_X_BURGUER));

    expect(idsEnviados()[1]).not.toBe(idsEnviados()[0]);
  });

  it("comandas diferentes com o mesmo texto no mesmo instante têm ids diferentes", async () => {
    // Duas mesas pedindo a mesma coisa ao mesmo tempo: o papel é idêntico
    // letra por letra. Se o id viesse do texto, uma das duas não sairia.
    configurarConfig({ perfilImpressora: PERFIL_TERMICA });

    await imprimirLancamento(lancamento("ped-a", "2026-07-26T18:00:00.000Z", UM_X_BURGUER));
    await imprimirLancamento(lancamento("ped-b", "2026-07-26T18:00:00.000Z", UM_X_BURGUER));

    const [primeiro, segundo] = imprimirDocumento.mock.calls.map(([documento]) =>
      documento.itens.map((i) => i.nome).join("|")
    );
    expect(segundo).toBe(primeiro); // mesmo papel
    expect(idsEnviados()[1]).not.toBe(idsEnviados()[0]); // ids diferentes
  });

  it("lançamento sem carimbo rastreável vai sem id, em vez de inventar um", async () => {
    // Item sem `launched_at` (comanda antiga, caminho que não carimba) não
    // tem ação identificável. Mandar um id qualquer aqui seria prometer uma
    // proteção que não existe — a rede de segurança de `enviarImpressaoPonte`
    // é quem assume.
    configurarConfig({ perfilImpressora: PERFIL_TERMICA });

    await imprimirLancamento({ id: "ped-a", comanda: "12", items: UM_X_BURGUER });

    expect(imprimirDocumento).toHaveBeenCalledTimes(1);
    expect(idsEnviados()[0]).toBeUndefined();
  });

  it("via de produção pedida na tela da Cozinha vai sem id (a reimpressão precisa sair no papel)", async () => {
    configurarConfig({ perfilImpressora: PERFIL_TERMICA });

    await enviarViaProducao(lancamento("ped-a", "2026-07-26T18:00:00.000Z", UM_X_BURGUER));

    expect(idsEnviados()[0]).toBeUndefined();
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
