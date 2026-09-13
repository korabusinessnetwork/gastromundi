import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./supabase", async () => {
  const { createMockSupabase } = await import("@/test/mockSupabase");
  return { supabase: createMockSupabase() };
});

import { emitirEvento, registrarInsight, buscarInsights, atualizarStatusInsight } from "./jarvas";
import { supabase } from "./supabase";

/** Deixa as promises pendentes rodarem (emitirEvento é fire-and-forget). */
const cederOTurno = () => new Promise((resolve) => setTimeout(resolve, 0));

/** Argumentos da última chamada a `metodo` na tabela. */
function payloadDe(tabela, metodo) {
  return supabase.calls.filter((c) => c.table === tabela && c.method === metodo).at(-1)?.args[0];
}

beforeEach(() => {
  supabase.reset();
  vi.clearAllMocks();
});

describe("emitirEvento", () => {
  it("grava tipo, módulo, payload e operador", async () => {
    emitirEvento("venda.finalizada", "pdv", { total: 120 }, "ana");
    await cederOTurno();

    expect(payloadDe("jarvas_eventos", "insert")).toEqual({
      tipo: "venda.finalizada",
      modulo: "pdv",
      payload: { total: 120 },
      operator_id: "ana",
    });
  });

  it("evento sem payload nem operador ainda é gravado", async () => {
    emitirEvento("caixa.fechado", "caixa");
    await cederOTurno();

    expect(payloadDe("jarvas_eventos", "insert")).toEqual({
      tipo: "caixa.fechado",
      modulo: "caixa",
      payload: {},
      operator_id: null,
    });
  });

  it("não devolve promise — quem chama não tem o que awaitar (fire-and-forget)", () => {
    expect(emitirEvento("x", "pdv")).toBeUndefined();
  });

  it("falha do Jarvas não sobe para quem chamou — a operação principal segue", async () => {
    supabase.from.mockImplementationOnce(() => {
      throw new Error("tabela do Jarvas não existe");
    });
    const naUltimaRejeicao = vi.fn();
    process.on("unhandledRejection", naUltimaRejeicao);

    expect(() => emitirEvento("venda.finalizada", "pdv")).not.toThrow();
    await cederOTurno();

    process.off("unhandledRejection", naUltimaRejeicao);
    expect(naUltimaRejeicao).not.toHaveBeenCalled();
  });
});

describe("registrarInsight", () => {
  it("aplica os defaults da spec: severidade info e visibilidade operacional", async () => {
    supabase.setTableResult("jarvas_insights", { data: { id: "i1" }, error: null });

    const { data, error } = await registrarInsight({
      tipo: "alerta",
      modulo: "estoque",
      titulo: "Estoque baixo",
      descricao: "Coca abaixo do mínimo.",
    });

    expect(error).toBeNull();
    expect(data).toEqual({ id: "i1" });
    expect(payloadDe("jarvas_insights", "insert")).toEqual({
      tipo: "alerta",
      severidade: "info",
      visibilidade: "operacional",
      modulo: "estoque",
      titulo: "Estoque baixo",
      descricao: "Coca abaixo do mínimo.",
      acao: null,
      origem: {},
    });
  });

  it("preserva ação e origem quando informadas — rastreabilidade é da spec", async () => {
    supabase.setTableResult("jarvas_insights", { data: { id: "i2" }, error: null });
    const acao = { label: "Repor estoque", tipo: "abrir_tela", params: { tela: "estoque" } };
    const origem = { evento_ids: [7, 8], dados: { produto: "Coca" } };

    await registrarInsight({
      tipo: "sugestao",
      severidade: "warning",
      visibilidade: "estrategico",
      modulo: "estoque",
      titulo: "Repor",
      descricao: "Acabando.",
      acao,
      origem,
    });

    expect(payloadDe("jarvas_insights", "insert")).toMatchObject({
      severidade: "warning",
      visibilidade: "estrategico",
      acao,
      origem,
    });
  });

  it("erro do banco volta como error, sem lançar", async () => {
    supabase.setTableError("jarvas_insights", new Error("RLS negou"));
    const { data, error } = await registrarInsight({ tipo: "insight", modulo: "pdv", titulo: "T", descricao: "D" });
    expect(data).toBeNull();
    expect(error).toBeInstanceOf(Error);
  });
});

describe("buscarInsights", () => {
  function chamadasDe(metodo) {
    return supabase.calls.filter((c) => c.method === metodo).map((c) => c.args);
  }

  it("sem filtros, traz os não resolvidos, mais novos primeiro, no teto de 50", async () => {
    await buscarInsights();

    expect(chamadasDe("in")).toEqual([["status", ["novo", "lido"]]]);
    expect(chamadasDe("order")).toEqual([["created_at", { ascending: false }]]);
    expect(chamadasDe("limit")).toEqual([[50]]);
    expect(chamadasDe("eq")).toEqual([]);
  });

  it("status como texto vira igualdade, não lista", async () => {
    await buscarInsights({ status: "descartado" });
    expect(chamadasDe("in")).toEqual([]);
    expect(chamadasDe("eq")).toEqual([["status", "descartado"]]);
  });

  it("módulo e limite entram no filtro quando informados", async () => {
    await buscarInsights({ modulo: "caixa", limite: 5 });
    expect(chamadasDe("eq")).toEqual([["modulo", "caixa"]]);
    expect(chamadasDe("limit")).toEqual([[5]]);
  });

  it("devolve o que veio do banco", async () => {
    supabase.setTableResult("jarvas_insights", { data: [{ id: "i1" }], error: null });
    const { data, error } = await buscarInsights();
    expect(data).toEqual([{ id: "i1" }]);
    expect(error).toBeNull();
  });
});

describe("atualizarStatusInsight", () => {
  it("registra quem agiu e quando (auditoria da spec)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-23T18:00:00.000Z"));
    supabase.setTableResult("jarvas_insights", { data: { id: "i1", status: "lido" }, error: null });

    const { data } = await atualizarStatusInsight("i1", "lido", "ana");

    expect(payloadDe("jarvas_insights", "update")).toEqual({
      status: "lido",
      status_por: "ana",
      status_em: "2026-08-23T18:00:00.000Z",
    });
    expect(supabase.calls.filter((c) => c.method === "eq").map((c) => c.args)).toEqual([["id", "i1"]]);
    expect(data).toEqual({ id: "i1", status: "lido" });
    vi.useRealTimers();
  });

  it("sem operador, grava nulo em vez da string 'undefined'", async () => {
    await atualizarStatusInsight("i1", "descartado");
    expect(payloadDe("jarvas_insights", "update")).toMatchObject({ status_por: null });
  });

  it("erro do banco volta como error", async () => {
    supabase.setTableError("jarvas_insights", new Error("timeout"));
    const { data, error } = await atualizarStatusInsight("i1", "executado", "ana");
    expect(data).toBeNull();
    expect(error).toBeInstanceOf(Error);
  });
});
