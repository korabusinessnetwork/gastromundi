import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockSupabase } = vi.hoisted(() => ({ mockSupabase: { current: null } }));
vi.mock("./supabase", async () => {
  const { createMockSupabase } = await import("@/test/mockSupabase");
  mockSupabase.current = createMockSupabase();
  return { supabase: mockSupabase.current };
});

import {
  calcularStatusAssinatura,
  calcularDiasParaVencimento,
  assinaturaPermiteOperacao,
  buscarAssinaturaAtual,
  sincronizarStatusAssinatura,
  confirmarRenovacaoAssinatura,
  resumirPagamentos,
} from "./assinatura";

beforeEach(() => {
  vi.clearAllMocks();
  mockSupabase.current.reset();
});

describe("calcularStatusAssinatura (fronteiras de data — carência de 3 dias)", () => {
  const vencimento = "2026-07-20";
  const carenciaDias = 3;

  it("véspera do vencimento → ativo", () => {
    expect(calcularStatusAssinatura(vencimento, carenciaDias, "2026-07-19")).toBe("ativo");
  });

  it("dia do vencimento → ainda ativo (inclusive)", () => {
    expect(calcularStatusAssinatura(vencimento, carenciaDias, "2026-07-20")).toBe("ativo");
  });

  it("um dia após o vencimento → carência", () => {
    expect(calcularStatusAssinatura(vencimento, carenciaDias, "2026-07-21")).toBe("carencia");
  });

  it("último dia da carência (vencimento + 3) → ainda carência (inclusive)", () => {
    expect(calcularStatusAssinatura(vencimento, carenciaDias, "2026-07-23")).toBe("carencia");
  });

  it("um dia depois de esgotada a carência (vencimento + 4) → bloqueado", () => {
    expect(calcularStatusAssinatura(vencimento, carenciaDias, "2026-07-24")).toBe("bloqueado");
  });

  it("muito tempo depois → continua bloqueado", () => {
    expect(calcularStatusAssinatura(vencimento, carenciaDias, "2026-09-01")).toBe("bloqueado");
  });

  it("carência 0 dias: um dia após o vencimento já bloqueia", () => {
    expect(calcularStatusAssinatura(vencimento, 0, "2026-07-21")).toBe("bloqueado");
  });
});

describe("calcularDiasParaVencimento", () => {
  const vencimento = "2026-07-20";

  it("positivo quando ainda faltam dias", () => {
    expect(calcularDiasParaVencimento(vencimento, "2026-07-17")).toBe(3);
  });

  it("zero no dia do vencimento", () => {
    expect(calcularDiasParaVencimento(vencimento, "2026-07-20")).toBe(0);
  });

  it("negativo quando já venceu", () => {
    expect(calcularDiasParaVencimento(vencimento, "2026-07-23")).toBe(-3);
  });
});

describe("buscarAssinaturaAtual", () => {
  it("retorna a assinatura (camelCase) quando a linha existe", async () => {
    mockSupabase.current.setTableResult("assinaturas", {
      data: { data_vencimento: "2026-08-05", carencia_dias: 3, valor_mensal: 199, status: "ativo" },
      error: null,
    });

    const { data, error } = await buscarAssinaturaAtual("t1");

    expect(error).toBeNull();
    expect(data).toEqual({ dataVencimento: "2026-08-05", carenciaDias: 3, valorMensal: 199, statusCache: "ativo" });
  });

  it("consulta apenas as colunas necessárias (sem select *)", async () => {
    mockSupabase.current.setTableResult("assinaturas", { data: null, error: null });

    await buscarAssinaturaAtual("t1");

    const select = mockSupabase.current.calls.find((c) => c.table === "assinaturas" && c.method === "select");
    expect(select.args[0]).not.toBe("*");
    expect(select.args[0]).toContain("data_vencimento");
  });

  it("retorna null sem consultar quando não há tenantId", async () => {
    const { data, error } = await buscarAssinaturaAtual(null);

    expect(data).toBeNull();
    expect(error).toBeNull();
    expect(mockSupabase.current.calls).toHaveLength(0);
  });

  it("propaga erro do Supabase sem lançar exceção", async () => {
    mockSupabase.current.setTableError("assinaturas", { message: "falha de rede" });

    const { data, error } = await buscarAssinaturaAtual("t1");

    expect(data).toBeNull();
    expect(error.message).toBe("falha de rede");
  });
});

describe("sincronizarStatusAssinatura", () => {
  it("chama a RPC e retorna o status calculado", async () => {
    mockSupabase.current.setRpcResult("sincronizar_status_assinatura", { data: "carencia", error: null });

    const { data, error } = await sincronizarStatusAssinatura("t1");

    expect(error).toBeNull();
    expect(data).toBe("carencia");
    const chamada = mockSupabase.current.calls.find((c) => c.rpc === "sincronizar_status_assinatura");
    expect(chamada.args[0]).toEqual({ p_tenant_id: "t1" });
  });

  it("propaga erro sem lançar (nunca deve travar o bootstrap)", async () => {
    mockSupabase.current.setRpcError("sincronizar_status_assinatura", { message: "falha de rede" });

    const { data, error } = await sincronizarStatusAssinatura("t1");

    expect(data).toBeNull();
    expect(error.message).toBe("falha de rede");
  });
});

describe("confirmarRenovacaoAssinatura", () => {
  it("valida valor e competência antes de chamar o Supabase", async () => {
    const { data, error } = await confirmarRenovacaoAssinatura({ tenantId: "t1", competencia: "2026-08-01", valor: 0, metodo: "pix", confirmadoPor: "gerente1" });

    expect(data).toBeNull();
    expect(error.message).toMatch(/valor/i);
    expect(mockSupabase.current.calls).toHaveLength(0);
  });

  it("chama a RPC com os parâmetros corretos quando os dados são válidos", async () => {
    mockSupabase.current.setRpcResult("confirmar_renovacao_assinatura", {
      data: { tenant_id: "t1", data_vencimento: "2026-09-04", status: "ativo" },
      error: null,
    });

    const { data, error } = await confirmarRenovacaoAssinatura({
      tenantId: "t1", competencia: "2026-08-05", valor: 199, metodo: "pix", confirmadoPor: "gerente1",
    });

    expect(error).toBeNull();
    expect(data).toEqual({ tenant_id: "t1", data_vencimento: "2026-09-04", status: "ativo" });
    const chamada = mockSupabase.current.calls.find((c) => c.rpc === "confirmar_renovacao_assinatura");
    expect(chamada.args[0]).toEqual({
      p_tenant_id: "t1", p_competencia: "2026-08-05", p_valor: 199, p_metodo: "pix", p_confirmado_por: "gerente1",
    });
  });

  it("propaga erro do Supabase (ex.: role sem permissão) sem lançar exceção", async () => {
    mockSupabase.current.setRpcError("confirmar_renovacao_assinatura", { message: "Sem permissão para confirmar renovação de assinatura." });

    const { data, error } = await confirmarRenovacaoAssinatura({
      tenantId: "t1", competencia: "2026-08-05", valor: 199, metodo: "pix", confirmadoPor: "caixa1",
    });

    expect(data).toBeNull();
    expect(error.message).toMatch(/permissão/i);
  });
});

describe("assinaturaPermiteOperacao (Fase 5 — espelha assinatura_ativa/assinatura_atual_ativa do Postgres)", () => {
  it("'ativo' permite operar", () => {
    expect(assinaturaPermiteOperacao("ativo")).toBe(true);
  });

  it("'carencia' ainda permite operar", () => {
    expect(assinaturaPermiteOperacao("carencia")).toBe(true);
  });

  it("'bloqueado' NÃO permite operar", () => {
    expect(assinaturaPermiteOperacao("bloqueado")).toBe(false);
  });

  it("'cancelado' NÃO permite operar", () => {
    expect(assinaturaPermiteOperacao("cancelado")).toBe(false);
  });

  it("status ausente/inválido não permite operar (seguro por padrão)", () => {
    expect(assinaturaPermiteOperacao(undefined)).toBe(false);
    expect(assinaturaPermiteOperacao(null)).toBe(false);
  });

  it("integra com o cálculo de status: renovar (novo vencimento futuro) volta a permitir operar", () => {
    const vencimentoVencido = "2026-07-01";
    const statusAntes = calcularStatusAssinatura(vencimentoVencido, 3, "2026-07-10"); // bem depois da carência
    expect(assinaturaPermiteOperacao(statusAntes)).toBe(false);

    // confirmar_renovacao_assinatura empurra data_vencimento += ciclo_dias e volta pro presente/futuro
    const vencimentoRenovado = "2026-08-01";
    const statusDepois = calcularStatusAssinatura(vencimentoRenovado, 3, "2026-07-10");
    expect(assinaturaPermiteOperacao(statusDepois)).toBe(true);
  });
});

/**
 * R7L4 — a forma de PRODUÇÃO: `data_vencimento` chega como string "YYYY-MM-DD"
 * (coluna `date`) e `hoje` é um `Date` de verdade. Os testes acima passam os
 * DOIS lados como string, então os dois eram deslocados igual e o erro se
 * anulava; só aqui ele aparece.
 *
 * A regra que tem de valer é a do SQL (`calcular_status_assinatura`,
 * 20260719_assinaturas.sql), que é quem de fato bloqueia via RLS:
 *   hoje <= vencimento → ativo · hoje <= vencimento + carência → carência.
 */
describe("calcularStatusAssinatura com `hoje` real (Date) — sem deslocar o dia", () => {
  const vencimento = "2026-08-15";
  const carenciaDias = 3;

  it("no próprio dia do vencimento → ativo, não carência", () => {
    expect(calcularStatusAssinatura(vencimento, carenciaDias, new Date(2026, 7, 15, 10, 0))).toBe("ativo");
  });

  it("no dia do vencimento às 23:59 → ainda ativo (a hora não antecipa o atraso)", () => {
    expect(calcularStatusAssinatura(vencimento, carenciaDias, new Date(2026, 7, 15, 23, 59, 59))).toBe("ativo");
  });

  it("na véspera, à meia-noite e um minuto → ativo", () => {
    expect(calcularStatusAssinatura(vencimento, carenciaDias, new Date(2026, 7, 14, 0, 1))).toBe("ativo");
  });

  it("um dia depois do vencimento → carência", () => {
    expect(calcularStatusAssinatura(vencimento, carenciaDias, new Date(2026, 7, 16, 0, 30))).toBe("carencia");
  });

  it("último dia da carência (vencimento + 3) → carência, não bloqueado", () => {
    expect(calcularStatusAssinatura(vencimento, carenciaDias, new Date(2026, 7, 18, 23, 0))).toBe("carencia");
  });

  it("primeiro dia depois da carência (vencimento + 4) → bloqueado", () => {
    expect(calcularStatusAssinatura(vencimento, carenciaDias, new Date(2026, 7, 19, 0, 1))).toBe("bloqueado");
  });

  it("carência 0: no dia do vencimento ainda opera; no dia seguinte bloqueia", () => {
    expect(calcularStatusAssinatura(vencimento, 0, new Date(2026, 7, 15, 12, 0))).toBe("ativo");
    expect(calcularStatusAssinatura(vencimento, 0, new Date(2026, 7, 16, 12, 0))).toBe("bloqueado");
  });

  it("virada de mês: vence 31/08 e é 01/09 → carência, não bloqueado", () => {
    expect(calcularStatusAssinatura("2026-08-31", carenciaDias, new Date(2026, 8, 1, 9, 0))).toBe("carencia");
  });

  it("virada de ano: vence 31/12 e é 01/01 do ano seguinte → carência", () => {
    expect(calcularStatusAssinatura("2026-12-31", carenciaDias, new Date(2027, 0, 1, 9, 0))).toBe("carencia");
  });

  it("o mês não sai trocado: vence 05/09 e é 05/08 → ativo (falta um mês)", () => {
    expect(calcularStatusAssinatura("2026-09-05", carenciaDias, new Date(2026, 7, 5, 9, 0))).toBe("ativo");
  });

  it("vencimento também como Date: no próprio dia → ativo", () => {
    expect(
      calcularStatusAssinatura(new Date(2026, 7, 15, 3, 0), carenciaDias, new Date(2026, 7, 15, 21, 0))
    ).toBe("ativo");
  });

  it("um instante em UTC é lido no calendário local de quem opera", () => {
    // 16/08 01:00Z é ainda 15/08 22:00 no Brasil — o dia que vale é o local.
    expect(calcularStatusAssinatura(vencimento, carenciaDias, "2026-08-16T01:00:00.000Z")).toBe("ativo");
  });

  it("sem `hoje`: vencendo hoje (dia local de verdade) → ativo", () => {
    const agora = new Date();
    const p = (n) => String(n).padStart(2, "0");
    const hojeISO = `${agora.getFullYear()}-${p(agora.getMonth() + 1)}-${p(agora.getDate())}`;

    expect(calcularStatusAssinatura(hojeISO, carenciaDias)).toBe("ativo");
    expect(calcularDiasParaVencimento(hojeISO)).toBe(0);
  });

  it("sem `hoje`: venceu ontem → carência (e não bloqueado)", () => {
    const ontem = new Date();
    ontem.setDate(ontem.getDate() - 1);
    const p = (n) => String(n).padStart(2, "0");
    const ontemISO = `${ontem.getFullYear()}-${p(ontem.getMonth() + 1)}-${p(ontem.getDate())}`;

    expect(calcularStatusAssinatura(ontemISO, carenciaDias)).toBe("carencia");
    expect(calcularDiasParaVencimento(ontemISO)).toBe(-1);
  });

  it("data ausente ou ilegível bloqueia (fecha por padrão, não libera)", () => {
    expect(calcularStatusAssinatura(null, 3, new Date(2026, 7, 15))).toBe("bloqueado");
    expect(calcularStatusAssinatura("", 3, new Date(2026, 7, 15))).toBe("bloqueado");
    expect(calcularStatusAssinatura("ontem", 3, new Date(2026, 7, 15))).toBe("bloqueado");
  });
});

describe("calcularDiasParaVencimento com `hoje` real (Date)", () => {
  it("conta o dia local exato, sem perder um dia", () => {
    expect(calcularDiasParaVencimento("2026-08-20", new Date(2026, 7, 15, 10, 0))).toBe(5);
  });

  it("zero no próprio dia do vencimento, a qualquer hora", () => {
    expect(calcularDiasParaVencimento("2026-08-15", new Date(2026, 7, 15, 0, 5))).toBe(0);
    expect(calcularDiasParaVencimento("2026-08-15", new Date(2026, 7, 15, 23, 55))).toBe(0);
  });

  it("-1 no dia seguinte ao vencimento", () => {
    expect(calcularDiasParaVencimento("2026-08-15", new Date(2026, 7, 16, 0, 5))).toBe(-1);
  });

  it("atravessa a virada de mês", () => {
    expect(calcularDiasParaVencimento("2026-09-01", new Date(2026, 7, 31, 20, 0))).toBe(1);
  });

  it("um instante em UTC é lido no calendário local de quem opera", () => {
    expect(calcularDiasParaVencimento("2026-08-20", "2026-08-16T01:00:00.000Z")).toBe(5);
  });
});

// F022-HISTORICO — o resumo do histórico de pagamentos da assinatura.
describe("resumirPagamentos", () => {
  const pg = (competencia, valor, extra = {}) => ({
    id: `p-${competencia}`,
    competencia,
    valor,
    metodo: "Pix",
    confirmado_por: "Plataforma",
    confirmado_em: `${competencia}T12:00:00.000Z`,
    ...extra,
  });

  it("lista vazia não quebra e soma zero", () => {
    expect(resumirPagamentos([])).toEqual({
      linhas: [], totalCentavos: 0, quantidadeValidos: 0, quantidadeEstornados: 0,
    });
    expect(resumirPagamentos()).toEqual({
      linhas: [], totalCentavos: 0, quantidadeValidos: 0, quantidadeEstornados: 0,
    });
    expect(resumirPagamentos(null).linhas).toEqual([]);
  });

  it("ordena do mais recente para o mais antigo", () => {
    // Quem abre o histórico está procurando o que acabou de lançar — e é esse
    // o lançamento com mais chance de estar errado.
    const { linhas } = resumirPagamentos([
      pg("2026-06-01", 300), pg("2026-08-01", 300), pg("2026-07-01", 300),
    ]);
    expect(linhas.map((l) => l.competencia)).toEqual(["2026-08-01", "2026-07-01", "2026-06-01"]);
  });

  it("empate de competência desempata pela hora do lançamento, mais nova primeiro", () => {
    // Acontece quando a competência foi estornada e lançada de novo: as duas
    // linhas convivem no mesmo mês.
    const { linhas } = resumirPagamentos([
      pg("2026-08-01", 300, { id: "velho", confirmado_em: "2026-08-01T09:00:00.000Z" }),
      pg("2026-08-01", 250, { id: "novo", confirmado_em: "2026-08-02T09:00:00.000Z" }),
    ]);
    expect(linhas.map((l) => l.id)).toEqual(["novo", "velho"]);
  });

  it("soma em centavos inteiros — três de 0,10 dão 30, não 30,000000000000004", () => {
    // O motivo de o total não ser somado em reais: `valor` é numeric e chega
    // como float. 0.1+0.1+0.1 === 0.30000000000000004 em JS.
    const { totalCentavos } = resumirPagamentos([
      pg("2026-06-01", 0.1), pg("2026-07-01", 0.1), pg("2026-08-01", 0.1),
    ]);
    expect(totalCentavos).toBe(30);
    expect(Number.isInteger(totalCentavos)).toBe(true);
  });

  it("valor com centavos quebrados vira inteiro sem arrastar dízima", () => {
    expect(resumirPagamentos([pg("2026-08-01", 1234.565)]).linhas[0].valorCentavos).toBe(123457);
    expect(resumirPagamentos([pg("2026-08-01", 300)]).totalCentavos).toBe(30000);
  });

  it("estornado continua na lista, mas fora do total", () => {
    // Histórico de dinheiro não some: o que sai é o valor da conta, não a linha.
    const { linhas, totalCentavos, quantidadeValidos, quantidadeEstornados } = resumirPagamentos([
      pg("2026-08-01", 300),
      pg("2026-07-01", 999, {
        estornado_em: "2026-07-10T10:00:00.000Z",
        estornado_por: "Plataforma",
        estorno_motivo: "valor digitado errado",
      }),
    ]);
    expect(linhas).toHaveLength(2);
    expect(totalCentavos).toBe(30000);
    expect(quantidadeValidos).toBe(1);
    expect(quantidadeEstornados).toBe(1);

    const estornado = linhas.find((l) => l.competencia === "2026-07-01");
    expect(estornado.estornado).toBe(true);
    expect(estornado.motivoEstorno).toBe("valor digitado errado");
    expect(estornado.estornadoPor).toBe("Plataforma");
  });

  it("linha legada sem quem confirmou e sem valor não vira NaN nem 'undefined'", () => {
    const { linhas, totalCentavos } = resumirPagamentos([
      { id: "x", competencia: "2026-08-01", valor: null },
    ]);
    expect(linhas[0].valorCentavos).toBe(0);
    expect(linhas[0].confirmadoPor).toBeNull();
    expect(linhas[0].metodo).toBeNull();
    expect(linhas[0].estornado).toBe(false);
    expect(totalCentavos).toBe(0);
  });

  it("competência malformada não derruba a ordenação", () => {
    const { linhas } = resumirPagamentos([
      { id: "ruim", competencia: null, valor: 10 },
      pg("2026-08-01", 300),
    ]);
    expect(linhas.map((l) => l.id)).toEqual(["p-2026-08-01", "ruim"]);
  });

  it("não modifica o array recebido", () => {
    // O componente guarda a resposta do banco no state e chama isto a cada
    // render: ordenar no lugar embaralharia o state por baixo do React.
    const cru = [pg("2026-06-01", 300), pg("2026-08-01", 300)];
    resumirPagamentos(cru);
    expect(cru.map((p) => p.competencia)).toEqual(["2026-06-01", "2026-08-01"]);
  });
});
