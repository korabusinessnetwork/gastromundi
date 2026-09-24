import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./supabase", async () => {
  const { createMockSupabase } = await import("@/test/mockSupabase");
  return { supabase: createMockSupabase() };
});

import { logAction } from "./logger";
import { supabase } from "./supabase";

/** Deixa a promise pendente rodar (o log é fire-and-forget). */
const cederOTurno = () => new Promise((resolve) => setTimeout(resolve, 0));

function ultimoLog() {
  return supabase.calls.filter((c) => c.table === "operator_logs" && c.method === "insert").at(-1)?.args[0];
}

beforeEach(() => {
  supabase.reset();
  vi.clearAllMocks();
});

describe("logAction", () => {
  it("grava operador, ação e payload", async () => {
    logAction("ana", "caixa:abrir", { valor: 200 });
    await cederOTurno();

    expect(ultimoLog()).toEqual({
      operator_id: "ana",
      action_type: "caixa:abrir",
      payload: { valor: 200 },
    });
  });

  it("sem operador identificado, grava 'unknown' em vez de nulo", async () => {
    logAction(null, "auth:login");
    await cederOTurno();

    expect(ultimoLog()).toEqual({
      operator_id: "unknown",
      action_type: "auth:login",
      payload: null,
    });
  });

  it("não devolve promise — o chamador não espera o log", () => {
    expect(logAction("ana", "x")).toBeUndefined();
  });

  it("falha ao gravar o log não derruba a ação do operador", async () => {
    supabase.from.mockImplementationOnce(() => {
      throw new Error("sem conexão");
    });
    const naUltimaRejeicao = vi.fn();
    process.on("unhandledRejection", naUltimaRejeicao);

    expect(() => logAction("ana", "venda:finalizar")).not.toThrow();
    await cederOTurno();

    process.off("unhandledRejection", naUltimaRejeicao);
    expect(naUltimaRejeicao).not.toHaveBeenCalled();
  });
});
