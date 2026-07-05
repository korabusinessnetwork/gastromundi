import { describe, it, expect, vi, beforeEach } from "vitest";

const { registrarInsight, buscarInsights } = vi.hoisted(() => ({
  registrarInsight: vi.fn(),
  buscarInsights: vi.fn(),
}));

const { supabaseMock, setLancamentosResult } = vi.hoisted(() => {
  let resultado = { data: [], error: null };
  const builder = {
    select: () => builder,
    eq: () => builder,
    limit: () => Promise.resolve(resultado),
  };
  return {
    supabaseMock: { from: () => builder },
    setLancamentosResult: (r) => { resultado = r; },
  };
});

vi.mock("./jarvas", () => ({ registrarInsight, buscarInsights }));
vi.mock("./supabase", () => ({ supabase: supabaseMock }));

import {
  regraEstoque,
  regraDivergenciaCaixa,
  regraTendenciaVendas,
  regraPrevisaoRuptura,
  regraPrevisaoFaturamento,
  regraContasVencidas,
} from "./jarvasEngine";

const dias = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();

beforeEach(() => {
  vi.clearAllMocks();
  setLancamentosResult({ data: [], error: null });
});

describe("regraEstoque", () => {
  it("produto zerado gera alerta danger de ruptura", async () => {
    const products = [{ id: 1, name: "Suco", active: true }];
    const estoque = { 1: 0 };
    await regraEstoque({ products, estoque, estoqueMinimos: {}, jaExiste: () => false });

    expect(registrarInsight).toHaveBeenCalledTimes(1);
    expect(registrarInsight).toHaveBeenCalledWith(
      expect.objectContaining({ tipo: "alerta", severidade: "danger", modulo: "estoque" }),
    );
  });

  it("produto abaixo do mínimo por produto gera sugestão warning", async () => {
    const products = [{ id: 2, name: "Guaraná", active: true }];
    const estoque = { 2: 3 };
    const estoqueMinimos = { 2: 5 };
    await regraEstoque({ products, estoque, estoqueMinimos, jaExiste: () => false });

    expect(registrarInsight).toHaveBeenCalledTimes(1);
    expect(registrarInsight).toHaveBeenCalledWith(
      expect.objectContaining({ tipo: "sugestao", severidade: "warning", modulo: "estoque" }),
    );
  });

  it("produto acima do mínimo não gera nada", async () => {
    const products = [{ id: 3, name: "Água", active: true }];
    const estoque = { 3: 20 };
    const estoqueMinimos = { 3: 5 };
    await regraEstoque({ products, estoque, estoqueMinimos, jaExiste: () => false });

    expect(registrarInsight).not.toHaveBeenCalled();
  });

  it("dedupe via jaExiste retorna sem registrar", async () => {
    const products = [{ id: 4, name: "Cerveja", active: true }];
    const estoque = { 4: 0 };
    await regraEstoque({ products, estoque, estoqueMinimos: {}, jaExiste: () => true });

    expect(registrarInsight).not.toHaveBeenCalled();
  });
});

describe("regraDivergenciaCaixa", () => {
  it("diferença <= R$1 não gera insight", async () => {
    const fechamentos = [{ id: 1, totalVendas: 100, totalConferido: 100.5 }];
    await regraDivergenciaCaixa({ fechamentos, jaExiste: () => false });

    expect(registrarInsight).not.toHaveBeenCalled();
  });

  it("diferença > R$1 (e <= R$50) gera alerta warning", async () => {
    const fechamentos = [{ id: 2, totalVendas: 100, totalConferido: 110 }];
    await regraDivergenciaCaixa({ fechamentos, jaExiste: () => false });

    expect(registrarInsight).toHaveBeenCalledWith(
      expect.objectContaining({ tipo: "alerta", severidade: "warning" }),
    );
  });

  it("diferença > R$50 gera alerta danger", async () => {
    const fechamentos = [{ id: 3, totalVendas: 100, totalConferido: 200 }];
    await regraDivergenciaCaixa({ fechamentos, jaExiste: () => false });

    expect(registrarInsight).toHaveBeenCalledWith(
      expect.objectContaining({ tipo: "alerta", severidade: "danger" }),
    );
  });

  it("payload origem contém os totais e a chave de rastreabilidade", async () => {
    const fechamentos = [{ id: 4, totalVendas: 100, totalConferido: 120 }];
    await regraDivergenciaCaixa({ fechamentos, jaExiste: () => false });

    expect(registrarInsight).toHaveBeenCalledWith(
      expect.objectContaining({
        origem: expect.objectContaining({
          chave: expect.any(String),
          dados: expect.objectContaining({ totalVendas: 100, totalConferido: 120 }),
        }),
      }),
    );
  });
});

describe("regraTendenciaVendas", () => {
  it("produto com +30% (e volume mínimo) gera insight de alta", async () => {
    const sales = [
      { at: dias(1), items: [{ name: "Hambúrguer", qty: 14 }] }, // últimos 7 dias
      { at: dias(10), items: [{ name: "Hambúrguer", qty: 10 }] }, // 7-14 dias atrás
    ];
    await regraTendenciaVendas({ sales, jaExiste: () => false });

    expect(registrarInsight).toHaveBeenCalledWith(
      expect.objectContaining({
        tipo: "insight",
        severidade: "info",
        origem: expect.objectContaining({ chave: expect.stringContaining("vendas:alta:") }),
      }),
    );
  });

  it("produto com -30% gera insight de queda", async () => {
    const sales = [
      { at: dias(1), items: [{ name: "Salada", qty: 6 }] },
      { at: dias(10), items: [{ name: "Salada", qty: 10 }] },
    ];
    await regraTendenciaVendas({ sales, jaExiste: () => false });

    expect(registrarInsight).toHaveBeenCalledWith(
      expect.objectContaining({
        tipo: "insight",
        severidade: "warning",
        origem: expect.objectContaining({ chave: expect.stringContaining("vendas:queda:") }),
      }),
    );
  });

  it("volume abaixo de MIN_UNIDADES_TENDENCIA não gera insight", async () => {
    const sales = [
      { at: dias(1), items: [{ name: "Suco", qty: 2 }] },
      { at: dias(10), items: [{ name: "Suco", qty: 3 }] },
    ];
    await regraTendenciaVendas({ sales, jaExiste: () => false });

    expect(registrarInsight).not.toHaveBeenCalled();
  });

  it("itens cancelados são ignorados no cálculo", async () => {
    // Sem o item cancelado (qty 100), a janela recente teria só 5 unidades —
    // resultando em queda. Se o cancelado fosse contado, o resultado seria alta.
    const sales = [
      {
        at: dias(1),
        items: [
          { name: "Pizza", qty: 100, cancelado: true },
          { name: "Pizza", qty: 5 },
        ],
      },
      { at: dias(10), items: [{ name: "Pizza", qty: 10 }] },
    ];
    await regraTendenciaVendas({ sales, jaExiste: () => false });

    expect(registrarInsight).toHaveBeenCalledWith(
      expect.objectContaining({
        severidade: "warning",
        origem: expect.objectContaining({ chave: expect.stringContaining("vendas:queda:") }),
      }),
    );
  });
});

describe("regraPrevisaoRuptura", () => {
  it("consumo médio que esgota em até 3 dias gera sugestão", async () => {
    const products = [{ id: 1, name: "Suco", active: true }];
    const estoque = { 1: 3 };
    // 28 unidades em 14 dias = 2/dia → 3 (estoque) / 2 (consumo/dia) = 1.5 dias restantes
    const sales = [{ at: dias(1), items: [{ id: 1, qty: 28 }] }];
    await regraPrevisaoRuptura({ products, estoque, sales, jaExiste: () => false });

    expect(registrarInsight).toHaveBeenCalledWith(
      expect.objectContaining({
        tipo: "sugestao",
        severidade: "warning",
        modulo: "estoque",
        origem: expect.objectContaining({ chave: expect.stringContaining("estoque:previsao_ruptura:") }),
      }),
    );
  });

  it("estoque folgado não gera sugestão", async () => {
    const products = [{ id: 1, name: "Suco", active: true }];
    const estoque = { 1: 1000 };
    const sales = [{ at: dias(1), items: [{ id: 1, qty: 28 }] }];
    await regraPrevisaoRuptura({ products, estoque, sales, jaExiste: () => false });

    expect(registrarInsight).not.toHaveBeenCalled();
  });

  it("produto sem vendas no período não gera sugestão", async () => {
    const products = [{ id: 1, name: "Suco", active: true }];
    const estoque = { 1: 5 };
    await regraPrevisaoRuptura({ products, estoque, sales: [], jaExiste: () => false });

    expect(registrarInsight).not.toHaveBeenCalled();
  });
});

describe("regraPrevisaoFaturamento", () => {
  it("calcula a média das semanas corretas, ignorando a semana corrente parcial", async () => {
    const sales = [
      { at: dias(2), total: 999 },  // semana corrente (parcial) — deve ser ignorada
      { at: dias(8), total: 100 },  // semana passada
      { at: dias(15), total: 200 }, // 2 semanas atrás
    ];
    await regraPrevisaoFaturamento({ sales, jaExiste: () => false });

    expect(registrarInsight).toHaveBeenCalledWith(
      expect.objectContaining({
        origem: expect.objectContaining({
          dados: expect.objectContaining({ somaSemana: [100, 200, 0, 0], media: 150 }),
        }),
      }),
    );
  });

  it("menos de 2 semanas com venda não gera insight", async () => {
    const sales = [{ at: dias(8), total: 100 }];
    await regraPrevisaoFaturamento({ sales, jaExiste: () => false });

    expect(registrarInsight).not.toHaveBeenCalled();
  });
});

describe("regraContasVencidas (Financeiro fase 1)", () => {
  it("gera alerta agregado com a quantidade e o total das contas vencidas", async () => {
    setLancamentosResult({ data: [{ id: "a", valor: 100 }, { id: "b", valor: 50.5 }], error: null });

    await regraContasVencidas({ jaExiste: () => false });

    expect(registrarInsight).toHaveBeenCalledWith(
      expect.objectContaining({
        tipo: "alerta",
        severidade: "warning",
        modulo: "financeiro",
        titulo: expect.stringContaining("2 conta(s) vencida(s)"),
        acao: expect.objectContaining({ label: "Ver financeiro", tipo: "abrir_financeiro" }),
      }),
    );
    expect(registrarInsight.mock.calls[0][0].titulo).toContain("150.50");
  });

  it("nenhuma conta vencida não gera insight", async () => {
    setLancamentosResult({ data: [], error: null });

    await regraContasVencidas({ jaExiste: () => false });

    expect(registrarInsight).not.toHaveBeenCalled();
  });

  it("dedupe via jaExiste retorna sem registrar", async () => {
    setLancamentosResult({ data: [{ id: "a", valor: 100 }], error: null });

    await regraContasVencidas({ jaExiste: () => true });

    expect(registrarInsight).not.toHaveBeenCalled();
  });

  it("erro na consulta não gera insight (nunca lança)", async () => {
    setLancamentosResult({ data: null, error: { message: "falha" } });

    await expect(regraContasVencidas({ jaExiste: () => false })).resolves.toBeUndefined();
    expect(registrarInsight).not.toHaveBeenCalled();
  });
});
