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
} from "./impressao";

beforeEach(() => {
  vi.clearAllMocks();
  mockSupabase.current.reset();
});

describe("resolverIdentidadeTenant (Fase 6 — sem marca hardcoded)", () => {
  it("sem tema custom: nome cai no fallback GastroMundi, sem endereço/CNPJ (config padrão)", () => {
    const identidade = resolverIdentidadeTenant(null, undefined);

    expect(identidade).toEqual({ nome: "GastroMundi", logoUrl: null, endereco: "", cnpj: "", rodape: "Obrigado pela preferência!" });
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

  it("usa o fallback GastroMundi sem tenant/tema", () => {
    const comprovante = montarComprovantePagamento({ venda: vendaBase });

    expect(comprovante.identidade.nome).toBe("GastroMundi");
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

  it("pedido sem itens não lança e retorna lista vazia", () => {
    expect(() => montarViaProducao({ pedido: {} })).not.toThrow();
    expect(montarViaProducao({ pedido: {} }).itens).toEqual([]);
  });
});

describe("buscarConfigImpressao", () => {
  it("retorna a config mesclada com os defaults quando a linha existe", async () => {
    mockSupabase.current.setTableResult("config", {
      data: { key: "config_impressao", value: { mostrarEnderecoCnpj: true, cnpj: "00.000.000/0001-00" } },
      error: null,
    });

    const { data, error } = await buscarConfigImpressao();

    expect(error).toBeNull();
    expect(data).toEqual({ ...CONFIG_IMPRESSAO_PADRAO, mostrarEnderecoCnpj: true, cnpj: "00.000.000/0001-00" });
  });

  it("retorna os defaults quando não há linha (caso normal, não erro)", async () => {
    mockSupabase.current.setTableResult("config", { data: null, error: null });

    const { data, error } = await buscarConfigImpressao();

    expect(error).toBeNull();
    expect(data).toEqual(CONFIG_IMPRESSAO_PADRAO);
  });

  it("retorna os defaults (nunca quebra a impressão) se o Supabase falhar", async () => {
    mockSupabase.current.setTableError("config", { message: "falha de rede" });

    const { data, error } = await buscarConfigImpressao();

    expect(data).toEqual(CONFIG_IMPRESSAO_PADRAO);
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
