import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockSupabase } = vi.hoisted(() => ({ mockSupabase: { current: null } }));
vi.mock("./supabase", async () => {
  const { createMockSupabase } = await import("@/test/mockSupabase");
  mockSupabase.current = createMockSupabase();
  return { supabase: mockSupabase.current };
});

import {
  CONFIG_IMPRESSAO_PADRAO,
  buscarConfigImpressao,
  salvarConfigImpressao,
  resolverIdentidadeTenant,
  montarComprovantePagamento,
  montarCupomPreNota,
  montarViaProducao,
  montarComprovanteMovimento,
  montarComprovanteFechamento,
  horarioLancamentoPedido,
} from "./impressao";

beforeEach(() => {
  vi.clearAllMocks();
  mockSupabase.current.reset();
});

describe("resolverIdentidadeTenant (Fase 6 — sem marca hardcoded)", () => {
  it("sem tenant nenhum: nome cai na marca da PLATAFORMA, sem endereço/CNPJ (config padrão)", () => {
    const identidade = resolverIdentidadeTenant(null, undefined);

    expect(identidade).toEqual({ nome: "Kora", logoUrl: null, endereco: "", cnpj: "", rodape: "Obrigado pela preferência!" });
  });

  it("sem tema custom: o cupom sai com o nome CADASTRADO do estabelecimento", () => {
    // Run 5, leva 11 — o pior caso do defeito: o cabeçalho do cupom é papel
    // que vai para a mão do cliente. Todo estabelecimento sem `nome_exibicao`
    // (o padrão de quem acabou de ser cadastrado) entregava um cupom com a
    // marca de OUTRA empresa impressa em cima (decisão 017).
    const identidade = resolverIdentidadeTenant({ nome: "Casa Coffee", tema: {} }, undefined);

    expect(identidade.nome).toBe("Casa Coffee");
    expect(identidade.nome).not.toBe("GastroMundi");
  });

  it("com tema custom: usa nome/logo do tenant", () => {
    const tenant = { tema: { nome_exibicao: "Pizzaria do João", logo_url: "https://cdn/logo.png" } };

    const identidade = resolverIdentidadeTenant(tenant, {});

    expect(identidade.nome).toBe("Pizzaria do João");
    expect(identidade.logoUrl).toBe("https://cdn/logo.png");
  });

  it("mostrarLogo: false esconde o logo mesmo com tema custom", () => {
    const tenant = { tema: { logo_url: "https://cdn/logo.png" } };

    const identidade = resolverIdentidadeTenant(tenant, { mostrarLogo: false });

    expect(identidade.logoUrl).toBeNull();
  });

  it("endereço/CNPJ só aparecem quando mostrarEnderecoCnpj está ligado", () => {
    const cfg = { mostrarEnderecoCnpj: true, endereco: "Rua das Flores, 123", cnpj: "00.000.000/0001-00" };

    const identidade = resolverIdentidadeTenant(null, cfg);

    expect(identidade.endereco).toBe("Rua das Flores, 123");
    expect(identidade.cnpj).toBe("00.000.000/0001-00");
  });

  it("endereço/CNPJ ficam vazios quando mostrarEnderecoCnpj está desligado, mesmo com dado preenchido", () => {
    const cfg = { mostrarEnderecoCnpj: false, endereco: "Rua das Flores, 123", cnpj: "00.000.000/0001-00" };

    const identidade = resolverIdentidadeTenant(null, cfg);

    expect(identidade.endereco).toBe("");
    expect(identidade.cnpj).toBe("");
  });
});

describe("montarComprovantePagamento (itens, totais, troco, identidade)", () => {
  const vendaBase = {
    comanda: "12",
    items: [
      { name: "X-Burguer", price: 30, qty: 2, emoji: "🍔" },
      { name: "Refrigerante", price: 8, qty: 1, cancelado: true },
    ],
    valorTaxa: 6,
    valorAjuste: -5,
    total: 61,
    pagamentos: [{ metodo: "dinheiro", valor: 61, recebido: 70, troco: 9 }],
  };

  it("exclui itens cancelados e calcula o subtotal só dos ativos", () => {
    const comprovante = montarComprovantePagamento({ venda: vendaBase });

    expect(comprovante.itens).toEqual([{ nome: "X-Burguer", qty: 2, preco: 30, emoji: "🍔", obs: [] }]);
    expect(comprovante.subtotal).toBe(60);
  });

  it("traz taxa de serviço, ajuste e total corretos", () => {
    const comprovante = montarComprovantePagamento({ venda: vendaBase });

    expect(comprovante.valorTaxa).toBe(6);
    expect(comprovante.valorAjuste).toBe(-5);
    expect(comprovante.total).toBe(61);
  });

  it("soma o troco de todos os pagamentos (trocoTotal)", () => {
    const comprovante = montarComprovantePagamento({ venda: vendaBase });

    expect(comprovante.pagamentos).toEqual(vendaBase.pagamentos);
    expect(comprovante.trocoTotal).toBe(9);
  });

  it("soma troco em split de pagamento (mais de um método)", () => {
    const venda = {
      ...vendaBase,
      pagamentos: [
        { metodo: "dinheiro", valor: 30, recebido: 35, troco: 5 },
        { metodo: "pix", valor: 31, recebido: 0, troco: 0 },
      ],
    };

    const comprovante = montarComprovantePagamento({ venda });

    expect(comprovante.trocoTotal).toBe(5);
  });

  it("usa a identidade do tenant informado", () => {
    const tenant = { tema: { nome_exibicao: "Pizzaria do João" } };

    const comprovante = montarComprovantePagamento({ venda: vendaBase, tenant });

    expect(comprovante.identidade.nome).toBe("Pizzaria do João");
  });

  it("sem tema, o comprovante leva o nome cadastrado do estabelecimento", () => {
    const comprovante = montarComprovantePagamento({ venda: vendaBase, tenant: { nome: "Casa Coffee", tema: {} } });

    expect(comprovante.identidade.nome).toBe("Casa Coffee");
  });

  it("sem tenant nenhum, cai na marca da plataforma — nunca na de um cliente", () => {
    const comprovante = montarComprovantePagamento({ venda: vendaBase });

    expect(comprovante.identidade.nome).toBe("Kora");
    expect(comprovante.identidade.nome).not.toBe("GastroMundi");
  });

  it("lida com venda vazia/incompleta sem lançar", () => {
    expect(() => montarComprovantePagamento({})).not.toThrow();
    const comprovante = montarComprovantePagamento({});
    expect(comprovante.itens).toEqual([]);
    expect(comprovante.subtotal).toBe(0);
  });
});

describe("montarCupomPreNota (base para o futuro add-on fiscal, F019)", () => {
  it("reaproveita os mesmos dados do comprovante", () => {
    const venda = { items: [{ name: "Suco", price: 10, qty: 1 }], total: 10, pagamentos: [] };

    const cupom = montarCupomPreNota({ venda });

    expect(cupom.itens).toEqual([{ nome: "Suco", qty: 1, preco: 10, emoji: "", obs: [] }]);
    expect(cupom.total).toBe(10);
  });

  it("marca naoFiscal e traz o aviso explícito", () => {
    const cupom = montarCupomPreNota({ venda: { items: [], total: 0, pagamentos: [] } });

    expect(cupom.naoFiscal).toBe(true);
    expect(cupom.avisoNaoFiscal).toMatch(/sem valor fiscal/i);
  });

  it("dadosFiscais nasce null — ponto de extensão do F019, sem inventar dado fiscal", () => {
    const cupom = montarCupomPreNota({ venda: { items: [], total: 0, pagamentos: [] } });

    expect(cupom.dadosFiscais).toBeNull();
  });
});

describe("montarViaProducao (só itens produzíveis, sem preço/pagamento)", () => {
  const pedidoBase = {
    comanda: "7",
    mesa: "3",
    garcom: "joao",
    created_at: "2026-07-21T12:00:00.000Z",
    items: [
      { name: "X-Burguer", qty: 1, price: 30, produzivel: true },
      { name: "Refrigerante Lata", qty: 2, price: 8, produzivel: false },
      { name: "Batata Frita", qty: 1, price: 15, cancelado: true },
      { name: "Suco Natural", qty: 1, price: 12 }, // sem o campo produzivel definido — assume produzível
    ],
  };

  it("lista só itens produzíveis (exclui produzivel:false e cancelados)", () => {
    const via = montarViaProducao({ pedido: pedidoBase });

    expect(via.itens.map((i) => i.nome)).toEqual(["X-Burguer", "Suco Natural"]);
  });

  it("nunca inclui preço nos itens da via de produção", () => {
    const via = montarViaProducao({ pedido: pedidoBase });

    via.itens.forEach((item) => expect(item).not.toHaveProperty("preco"));
  });

  it("traz comanda/mesa/garçom/horário", () => {
    const via = montarViaProducao({ pedido: pedidoBase });

    expect(via.comanda).toBe("7");
    expect(via.mesa).toBe("3");
    expect(via.garcom).toBe("joao");
    expect(via.horario).toBe("2026-07-21T12:00:00.000Z");
  });

  it("traz as observações de cada item", () => {
    const pedido = { items: [{ name: "X-Burguer", qty: 1, obs: ["sem cebola"] }] };

    const via = montarViaProducao({ pedido });

    expect(via.itens[0].obs).toEqual(["sem cebola"]);
  });

  it("preserva id e categoria do item (é deles que o roteamento por ponto vive)", () => {
    const pedido = { items: [{ id: 17, name: "Caipirinha", qty: 1, category: "Bebidas" }] };

    const via = montarViaProducao({ pedido });

    expect(via.itens[0].id).toBe(17);
    expect(via.itens[0].category).toBe("Bebidas");
  });

  it("item sem id/categoria não inventa valor (cai no ponto padrão depois)", () => {
    const via = montarViaProducao({ pedido: { items: [{ name: "Avulso", qty: 1 }] } });

    expect(via.itens[0].id).toBeNull();
    expect(via.itens[0].category).toBe("");
  });

  it("pedido sem itens não lança e retorna lista vazia", () => {
    expect(() => montarViaProducao({ pedido: {} })).not.toThrow();
    expect(montarViaProducao({ pedido: {} }).itens).toEqual([]);
  });

  it("horário = launched_at mais recente entre os itens (B1)", () => {
    const pedido = {
      comanda: "9",
      created_at: "2026-07-21T12:00:00.000Z",
      items: [
        { name: "X-Burguer", qty: 1, launched_at: "2026-07-21T12:05:00.000Z" },
        { name: "Suco", qty: 1, launched_at: "2026-07-21T12:20:00.000Z" },
      ],
    };
    // usa o lançamento mais recente, não o created_at da comanda
    expect(montarViaProducao({ pedido }).horario).toBe("2026-07-21T12:20:00.000Z");
  });
});

describe("horarioLancamentoPedido", () => {
  it("pega o launched_at mais recente dos itens", () => {
    const pedido = {
      created_at: "2026-07-21T12:00:00.000Z",
      items: [
        { launched_at: "2026-07-21T12:05:00.000Z" },
        { launched_at: "2026-07-21T12:20:00.000Z" },
        { launched_at: "2026-07-21T12:10:00.000Z" },
      ],
    };
    expect(horarioLancamentoPedido(pedido)).toBe("2026-07-21T12:20:00.000Z");
  });

  it("cai para created_at quando nenhum item tem launched_at (comanda antiga)", () => {
    const pedido = { created_at: "2026-07-21T12:00:00.000Z", items: [{ name: "X" }] };
    expect(horarioLancamentoPedido(pedido)).toBe("2026-07-21T12:00:00.000Z");
  });

  it("ignora itens sem launched_at ao calcular o mais recente", () => {
    const pedido = {
      created_at: "2026-07-21T12:00:00.000Z",
      items: [{ name: "sem marco" }, { launched_at: "2026-07-21T13:00:00.000Z" }],
    };
    expect(horarioLancamentoPedido(pedido)).toBe("2026-07-21T13:00:00.000Z");
  });
});

describe("montarComprovanteMovimento (sangria/suprimento — o papel que vai para a gaveta)", () => {
  it("monta um documento comprovante_caixa com o título derivado do tipo (maiúsculas)", () => {
    const doc = montarComprovanteMovimento({ tipo: "sangria", valor: 50, motivo: "cofre" });

    expect(doc.tipo).toBe("comprovante_caixa");
    expect(doc.titulo).toBe("SANGRIA");
  });

  it("sangria: destaque é o valor retirado", () => {
    const doc = montarComprovanteMovimento({ tipo: "sangria", valor: 50 });

    expect(doc.destaque).toEqual({ rotulo: "Valor retirado", valor: 50 });
  });

  it("suprimento: destaque é o valor colocado, com título próprio", () => {
    const doc = montarComprovanteMovimento({ tipo: "suprimento", valor: 30 });

    expect(doc.titulo).toBe("SUPRIMENTO");
    expect(doc.destaque).toEqual({ rotulo: "Valor colocado", valor: 30 });
  });

  it("mostra o dinheiro na gaveta depois do movimento quando informado", () => {
    const doc = montarComprovanteMovimento({ tipo: "sangria", valor: 50, disponivelDepois: 120 });

    expect(doc.linhas).toEqual([{ rotulo: "Dinheiro na gaveta após", valor: 120, forte: true }]);
  });

  it("não inventa a linha da gaveta quando o disponível não veio (nunca imprime número errado)", () => {
    const doc = montarComprovanteMovimento({ tipo: "sangria", valor: 50 });

    expect(doc.linhas).toEqual([]);
  });

  it("traz motivo, operador e autorizador nas notas — e omite os que faltam", () => {
    const doc = montarComprovanteMovimento({
      tipo: "sangria", valor: 200, motivo: "cofre", autor: "Ana", autorizadoPor: "gerente1",
    });

    expect(doc.notas).toEqual([
      { rotulo: "Motivo", texto: "cofre" },
      { rotulo: "Operador", texto: "Ana" },
      { rotulo: "Autorizado por", texto: "gerente1" },
    ]);
  });

  it("sem autorizador (retirada dentro do limite), a nota some", () => {
    const doc = montarComprovanteMovimento({ tipo: "suprimento", valor: 30, autor: "Ana" });

    expect(doc.notas).toEqual([{ rotulo: "Operador", texto: "Ana" }]);
  });

  it("usa a identidade do tenant — nunca a marca de outro cliente", () => {
    const doc = montarComprovanteMovimento({ tipo: "sangria", valor: 50, tenant: { tema: { nome_exibicao: "Pizzaria do João" } } });

    expect(doc.identidade.nome).toBe("Pizzaria do João");
  });

  it("valor não numérico não derruba a impressão (cai em 0)", () => {
    const doc = montarComprovanteMovimento({ tipo: "sangria", valor: "abc" });

    expect(doc.destaque.valor).toBe(0);
  });
});

describe("montarComprovanteFechamento (o resumo da conferência)", () => {
  const base = {
    totalVendas: 500,
    fundo: 100,
    totalEsperado: 600,
    totalConferido: 600,
    diferenca: 0,
    situacao: "conferido",
  };

  it("monta um documento comprovante_caixa de fechamento", () => {
    const doc = montarComprovanteFechamento(base);

    expect(doc.tipo).toBe("comprovante_caixa");
    expect(doc.titulo).toBe("FECHAMENTO DE CAIXA");
  });

  it("traz vendas, fundo, esperado, conferido e a diferença rotulada pela situação", () => {
    const doc = montarComprovanteFechamento(base);

    expect(doc.linhas).toEqual([
      { rotulo: "Total de vendas", valor: 500 },
      { rotulo: "Fundo de caixa", valor: 100 },
      { rotulo: "Total esperado", valor: 600, forte: true },
      { rotulo: "Total conferido", valor: 600, forte: true },
      { rotulo: "Caixa Conferido", valor: 0, forte: true, sinal: true },
    ]);
  });

  it("só mostra reforços/retiradas quando houve movimento (retiradas com sinal negativo)", () => {
    const doc = montarComprovanteFechamento({ ...base, suprimentos: 40, sangrias: 200 });

    const reforcos = doc.linhas.find((l) => l.rotulo === "Reforços");
    const retiradas = doc.linhas.find((l) => l.rotulo === "Retiradas");
    expect(reforcos).toEqual({ rotulo: "Reforços", valor: 40, sinal: true });
    expect(retiradas).toEqual({ rotulo: "Retiradas", valor: -200, sinal: true });
  });

  it("sem movimento de caixa, não imprime linhas de reforço/retirada", () => {
    const doc = montarComprovanteFechamento(base);

    expect(doc.linhas.some((l) => l.rotulo === "Reforços" || l.rotulo === "Retiradas")).toBe(false);
  });

  it("rotula a diferença conforme a situação (falta) sem esconder o sinal", () => {
    const doc = montarComprovanteFechamento({ ...base, totalConferido: 585, diferenca: -15, situacao: "falta" });

    const linhaDif = doc.linhas.find((l) => l.forte && l.sinal);
    expect(linhaDif).toEqual({ rotulo: "Falta no Caixa", valor: -15, forte: true, sinal: true });
  });

  it("monta o quadro por método de pagamento (sistema × conferido)", () => {
    const doc = montarComprovanteFechamento({
      ...base,
      porMetodo: [
        { rotulo: "Dinheiro", sistema: 300, conferido: 300 },
        { rotulo: "Pix", sistema: 200, conferido: 200 },
      ],
    });

    expect(doc.tabela).toEqual({
      cabecalho: ["Método", "Sistema", "Conferido"],
      linhas: [
        { rotulo: "Dinheiro", valores: [300, 300] },
        { rotulo: "Pix", valores: [200, 200] },
      ],
    });
  });

  it("sem métodos, o quadro nasce null (não imprime tabela vazia)", () => {
    const doc = montarComprovanteFechamento(base);

    expect(doc.tabela).toBeNull();
  });

  it("traz operador e observação nas notas, omitindo os que faltam", () => {
    const doc = montarComprovanteFechamento({ ...base, autor: "Ana", observacao: "fechou cedo" });

    expect(doc.notas).toEqual([
      { rotulo: "Operador", texto: "Ana" },
      { rotulo: "Observação", texto: "fechou cedo" },
    ]);
  });

  it("usa a identidade do tenant — nunca a marca de outro cliente", () => {
    const doc = montarComprovanteFechamento({ ...base, tenant: { tema: { nome_exibicao: "Pizzaria do João" } } });

    expect(doc.identidade.nome).toBe("Pizzaria do João");
  });
});

// O que `buscarConfigImpressao` devolve para quem NÃO tem nada gravado:
// os defaults + o ponto de impressão sintetizado (Leva 15). A síntese é o
// que faz uma instalação antiga continuar imprimindo sem migration, então
// `pontosImpressao` nunca chega vazio em quem consome a config.
const PADRAO_MESCLADO = {
  ...CONFIG_IMPRESSAO_PADRAO,
  pontosImpressao: [{ id: "p1", nome: "Cozinha", impressora: null, padrao: true }],
};

describe("buscarConfigImpressao", () => {
  it("retorna a config mesclada com os defaults quando a linha existe", async () => {
    mockSupabase.current.setTableResult("config", {
      data: { key: "config_impressao", value: { mostrarEnderecoCnpj: true, cnpj: "00.000.000/0001-00" } },
      error: null,
    });

    const { data, error } = await buscarConfigImpressao();

    expect(error).toBeNull();
    expect(data).toEqual({ ...PADRAO_MESCLADO, mostrarEnderecoCnpj: true, cnpj: "00.000.000/0001-00" });
  });

  it("retorna os defaults quando não há linha (caso normal, não erro)", async () => {
    mockSupabase.current.setTableResult("config", { data: null, error: null });

    const { data, error } = await buscarConfigImpressao();

    expect(error).toBeNull();
    expect(data).toEqual(PADRAO_MESCLADO);
  });

  it("ignora campos de versões antigas (impressoraQz / impressaoEmRede) sem quebrar", async () => {
    mockSupabase.current.setTableResult("config", {
      data: {
        key: "config_impressao",
        value: {
          impressaoEmRede: true,
          perfilImpressora: { larguraMm: 58, driver: "escpos-qztray", impressoraQz: "EPSON-ANTIGA" },
        },
      },
      error: null,
    });

    const { data, error } = await buscarConfigImpressao();

    expect(error).toBeNull();
    expect(data).not.toHaveProperty("impressaoEmRede");
    expect(data.perfilImpressora).not.toHaveProperty("impressoraQz");
    // driver que não existe mais volta pro default; o resto do papel é preservado
    expect(data.perfilImpressora.driver).toBe("browser-raster");
    expect(data.perfilImpressora.larguraMm).toBe(58);
    expect(data.perfilImpressora.impressora).toBeNull();
  });

  it("preserva o destino novo da impressora (Ponte) quando gravado", async () => {
    const impressora = { tipo: "rede", host: "192.168.0.50", porta: 9100 };
    mockSupabase.current.setTableResult("config", {
      data: { key: "config_impressao", value: { perfilImpressora: { driver: "escpos-ponte", impressora } } },
      error: null,
    });

    const { data } = await buscarConfigImpressao();

    expect(data.perfilImpressora.driver).toBe("escpos-ponte");
    expect(data.perfilImpressora.impressora).toEqual(impressora);
  });

  it("sem pontos gravados, sintetiza o ponto padrão com a impressora do perfil (instalação antiga não perde a impressão)", async () => {
    const impressora = { tipo: "windows", nome: "EPSON-COZINHA" };
    mockSupabase.current.setTableResult("config", {
      data: { key: "config_impressao", value: { perfilImpressora: { driver: "escpos-ponte", impressora } } },
      error: null,
    });

    const { data } = await buscarConfigImpressao();

    expect(data.pontosImpressao).toEqual([{ id: "p1", nome: "Cozinha", impressora, padrao: true }]);
    expect(data.roteamento).toEqual({ categorias: {}, produtos: {} });
  });

  it("preserva os pontos e o roteamento gravados", async () => {
    mockSupabase.current.setTableResult("config", {
      data: {
        key: "config_impressao",
        value: {
          pontosImpressao: [
            { id: "p1", nome: "Cozinha", impressora: null, padrao: true },
            { id: "p2", nome: "Bar", impressora: { tipo: "rede", host: "192.168.0.9", porta: 9100 }, padrao: false },
          ],
          roteamento: { categorias: { Bebidas: "p2" }, produtos: { 17: "p1" } },
        },
      },
      error: null,
    });

    const { data } = await buscarConfigImpressao();

    expect(data.pontosImpressao.map((p) => p.nome)).toEqual(["Cozinha", "Bar"]);
    expect(data.roteamento.categorias).toEqual({ Bebidas: "p2" });
    expect(data.roteamento.produtos).toEqual({ 17: "p1" });
  });

  it("roteamento gravado como lixo não derruba a leitura da config", async () => {
    mockSupabase.current.setTableResult("config", {
      data: { key: "config_impressao", value: { roteamento: "isso não é um objeto" } },
      error: null,
    });

    const { data } = await buscarConfigImpressao();

    expect(data.roteamento).toEqual({ categorias: {}, produtos: {} });
  });

  it("retorna os defaults (nunca quebra a impressão) se o Supabase falhar", async () => {
    mockSupabase.current.setTableError("config", { message: "falha de rede" });

    const { data, error } = await buscarConfigImpressao();

    expect(data).toEqual(PADRAO_MESCLADO);
    expect(error.message).toBe("falha de rede");
  });
});

describe("salvarConfigImpressao", () => {
  it("faz upsert na chave config_impressao", async () => {
    mockSupabase.current.setTableResult("config", { data: null, error: null });

    const { error } = await salvarConfigImpressao({ mostrarLogo: false });

    expect(error).toBeNull();
    const upsert = mockSupabase.current.calls.find((c) => c.table === "config" && c.method === "upsert");
    expect(upsert.args[0]).toEqual({ key: "config_impressao", value: { mostrarLogo: false } });
  });
});
