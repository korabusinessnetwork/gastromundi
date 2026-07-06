import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockSupabase } = vi.hoisted(() => ({ mockSupabase: { current: null } }));
vi.mock("./supabase", async () => {
  const { createMockSupabase } = await import("@/test/mockSupabase");
  mockSupabase.current = createMockSupabase();
  return { supabase: mockSupabase.current };
});

import {
  calcularPeriodo,
  calcularPeriodoAnterior,
  calcularVariacaoPercentual,
  calcularMargemProdutos,
  buscarRelatorioVendas,
  buscarFichasTecnicas,
} from "./relatorios";

beforeEach(() => {
  vi.clearAllMocks();
  mockSupabase.current?.calls?.splice(0);
});

describe("calcularPeriodo", () => {
  const ref = new Date("2026-07-15T14:30:00");

  it("'dia' cobre só o dia de referência", () => {
    const { inicio, fim } = calcularPeriodo("dia", ref);
    expect(inicio.toISOString().slice(0, 10)).toBe("2026-07-15");
    expect(fim.getTime() - inicio.getTime()).toBe(24 * 60 * 60 * 1000);
  });

  it("'semana' cobre os últimos 7 dias (inclui hoje)", () => {
    const { inicio, fim } = calcularPeriodo("semana", ref);
    expect((fim.getTime() - inicio.getTime()) / (24 * 60 * 60 * 1000)).toBe(7);
  });

  it("'mes' cobre os últimos 30 dias", () => {
    const { inicio, fim } = calcularPeriodo("mes", ref);
    expect((fim.getTime() - inicio.getTime()) / (24 * 60 * 60 * 1000)).toBe(30);
  });

  it("rejeita tipo desconhecido", () => {
    expect(() => calcularPeriodo("ano", ref)).toThrow();
  });
});

describe("calcularPeriodoAnterior", () => {
  it("retorna o intervalo imediatamente anterior, com mesma duração", () => {
    const inicio = new Date("2026-07-08T00:00:00Z");
    const fim = new Date("2026-07-15T00:00:00Z");
    const anterior = calcularPeriodoAnterior(inicio, fim);

    expect(anterior.fim.getTime()).toBe(inicio.getTime());
    expect(anterior.fim.getTime() - anterior.inicio.getTime()).toBe(fim.getTime() - inicio.getTime());
  });
});

describe("calcularVariacaoPercentual", () => {
  it("calcula aumento percentual", () => {
    expect(calcularVariacaoPercentual(150, 100)).toBe(50);
  });

  it("calcula queda percentual", () => {
    expect(calcularVariacaoPercentual(50, 100)).toBe(-50);
  });

  it("retorna null quando não há base de comparação (ambos zero)", () => {
    expect(calcularVariacaoPercentual(0, 0)).toBeNull();
  });

  it("trata período anterior zerado com valor atual positivo como alta de 100%", () => {
    expect(calcularVariacaoPercentual(80, 0)).toBe(100);
  });
});

describe("calcularMargemProdutos", () => {
  it("calcula margem para produto com ficha técnica cadastrada", () => {
    const topProdutos = [{ produto_id: 1, nome: "X-Burguer", unidades: 10, receita: 300 }];
    const fichas = [{ produtoId: 1, rendimento: "1", ingredientes: [{ qtd: "1", custoUnit: "12" }] }];

    const [resultado] = calcularMargemProdutos(topProdutos, fichas);

    expect(resultado.semCusto).toBe(false);
    expect(resultado.custoUnitario).toBe(12);
    expect(resultado.custoTotal).toBe(120);
    expect(resultado.margemValor).toBe(180);
    expect(resultado.margemPercentual).toBeCloseTo(60, 5);
  });

  it("sinaliza semCusto quando não há ficha técnica para o produto (não inventa número)", () => {
    const topProdutos = [{ produto_id: 99, nome: "Suco", unidades: 5, receita: 50 }];

    const [resultado] = calcularMargemProdutos(topProdutos, []);

    expect(resultado.semCusto).toBe(true);
    expect(resultado.margemValor).toBeUndefined();
  });

  it("divide o custo da ficha pelo rendimento (custo por porção)", () => {
    const topProdutos = [{ produto_id: 2, nome: "Bolo (fatia)", unidades: 8, receita: 80 }];
    const fichas = [{ produtoId: 2, rendimento: "4", ingredientes: [{ qtd: "1", custoUnit: "20" }] }];

    const [resultado] = calcularMargemProdutos(topProdutos, fichas);

    expect(resultado.custoUnitario).toBe(5); // 20 / 4 porções
    expect(resultado.custoTotal).toBe(40);
  });
});

describe("buscarRelatorioVendas", () => {
  it("rejeita período inválido sem chamar o Supabase", async () => {
    const { data, error } = await buscarRelatorioVendas({ inicio: "2026-07-10", fim: "2026-07-01" });
    expect(data).toBeNull();
    expect(error.message).toMatch(/início/i);
    expect(mockSupabase.current.calls).toHaveLength(0);
  });

  it("chama a RPC relatorio_vendas com o intervalo em ISO", async () => {
    mockSupabase.current.setRpcResult("relatorio_vendas", { data: { faturamento: 100 }, error: null });

    const { data, error } = await buscarRelatorioVendas({ inicio: "2026-07-01T00:00:00Z", fim: "2026-07-08T00:00:00Z" });

    expect(error).toBeNull();
    expect(data).toEqual({ faturamento: 100 });
    const chamada = mockSupabase.current.calls.find((c) => c.rpc === "relatorio_vendas");
    expect(chamada.args[0]).toEqual({
      p_inicio: "2026-07-01T00:00:00.000Z",
      p_fim: "2026-07-08T00:00:00.000Z",
      p_limite_produtos: 20,
    });
  });

  it("propaga erro do Supabase sem lançar exceção", async () => {
    mockSupabase.current.setRpcError("relatorio_vendas", { message: "falha de rede" });

    const { data, error } = await buscarRelatorioVendas({ inicio: "2026-07-01", fim: "2026-07-08" });

    expect(data).toBeNull();
    expect(error.message).toBe("falha de rede");
  });
});

describe("buscarFichasTecnicas", () => {
  it("retorna a lista de fichas quando cadastradas", async () => {
    mockSupabase.current.setTableResult("config", { data: { key: "fichas_tecnicas", value: [{ produtoId: 1 }] }, error: null });

    const { data, error } = await buscarFichasTecnicas();

    expect(error).toBeNull();
    expect(data).toEqual([{ produtoId: 1 }]);
  });

  it("retorna lista vazia quando nenhuma ficha foi cadastrada ainda (não é erro)", async () => {
    mockSupabase.current.setTableError("config", { code: "PGRST116", message: "no rows" });

    const { data, error } = await buscarFichasTecnicas();

    expect(error).toBeNull();
    expect(data).toEqual([]);
  });
});
