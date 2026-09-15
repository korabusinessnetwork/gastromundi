import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./supabase", async () => {
  const { createMockSupabase } = await import("@/test/mockSupabase");
  return { supabase: createMockSupabase() };
});

import {
  validarFeedbackEquipe,
  validarAvaliacaoCliente,
  enviarFeedbackEquipe,
  enviarAvaliacaoCliente,
  listarFeedbacks,
  marcarResolvido,
  mediaDasNotas,
  LIMITE_TEXTO,
} from "./feedback";
import { supabase } from "./supabase";

beforeEach(() => {
  vi.clearAllMocks();
  supabase.reset?.();
});

describe("validarFeedbackEquipe", () => {
  it("exige que alguma coisa tenha sido escrita", () => {
    expect(validarFeedbackEquipe("").valido).toBe(false);
    expect(validarFeedbackEquipe("   ").valido).toBe(false);
  });

  it("recusa relato curto demais para ser entendido", () => {
    // Deixar passar "ok" enche a lista de ruído que o dono filtraria à mão.
    expect(validarFeedbackEquipe("ok").valido).toBe(false);
  });

  it("aceita um relato de verdade", () => {
    expect(validarFeedbackEquipe("A impressora não puxa")).toEqual({ valido: true, erro: null });
  });
});

describe("validarAvaliacaoCliente", () => {
  it("aceita de 1 a 5", () => {
    for (const n of [1, 2, 3, 4, 5]) expect(validarAvaliacaoCliente(n).valido).toBe(true);
  });

  it("recusa fora da faixa, quebrado ou ausente", () => {
    for (const n of [0, 6, -1, 2.5, null, undefined, "muito bom"]) {
      expect(validarAvaliacaoCliente(n).valido).toBe(false);
    }
  });
});

describe("enviarFeedbackEquipe", () => {
  it("não chama o banco quando o relato não vale", async () => {
    const { error } = await enviarFeedbackEquipe({ texto: "" });
    expect(error.message).toMatch(/escreva/i);
    expect(supabase.calls).toHaveLength(0);
  });

  it("grava com a tela e o autor, marcado como origem equipe", async () => {
    supabase.setTableResult("feedbacks", { data: { id: "f1" }, error: null });

    await enviarFeedbackEquipe({ texto: "A impressora não puxa", tela: "PDV", autor: "maria" });

    const insert = supabase.calls.find((c) => c.table === "feedbacks" && c.method === "insert");
    expect(insert.args[0]).toMatchObject({
      origem: "equipe",
      texto: "A impressora não puxa",
      tela: "PDV",
      autor: "maria",
    });
  });

  it("corta texto gigante em vez de mandar tudo para o banco", async () => {
    supabase.setTableResult("feedbacks", { data: { id: "f1" }, error: null });

    await enviarFeedbackEquipe({ texto: "a".repeat(LIMITE_TEXTO + 500) });

    const insert = supabase.calls.find((c) => c.method === "insert");
    expect(insert.args[0].texto).toHaveLength(LIMITE_TEXTO);
  });

  it("sem tela nem autor grava null, não string vazia", async () => {
    supabase.setTableResult("feedbacks", { data: { id: "f1" }, error: null });

    await enviarFeedbackEquipe({ texto: "Algo quebrou aqui" });

    const insert = supabase.calls.find((c) => c.method === "insert");
    expect(insert.args[0].tela).toBeNull();
    expect(insert.args[0].autor).toBeNull();
  });
});

describe("enviarAvaliacaoCliente", () => {
  it("vai pela RPC, não por insert — a vitrine é anônima", async () => {
    supabase.setRpcResult?.("registrar_feedback_cliente", { data: "f1", error: null });

    await enviarAvaliacaoCliente({ slug: "gastromundi", nota: 5, texto: "Chegou quentinho" });

    const rpc = supabase.calls.find((c) => c.rpc === "registrar_feedback_cliente");
    expect(rpc).toBeDefined();
    expect(rpc.args[0]).toMatchObject({ p_slug: "gastromundi", p_nota: 5 });
    expect(supabase.calls.some((c) => c.method === "insert")).toBe(false);
  });

  it("comentário vazio vira null — o servidor põe a nota por extenso", async () => {
    supabase.setRpcResult?.("registrar_feedback_cliente", { data: "f1", error: null });

    await enviarAvaliacaoCliente({ slug: "x", nota: 4, texto: "   " });

    const rpc = supabase.calls.find((c) => c.rpc === "registrar_feedback_cliente");
    expect(rpc.args[0].p_texto).toBeNull();
  });

  it("nota inválida não chega ao banco", async () => {
    const { error } = await enviarAvaliacaoCliente({ slug: "x", nota: 9 });
    expect(error.message).toMatch(/1 a 5/);
    expect(supabase.calls).toHaveLength(0);
  });

  it("sem slug não envia — não dá para adivinhar o estabelecimento", async () => {
    const { error } = await enviarAvaliacaoCliente({ nota: 5 });
    expect(error.message).toMatch(/estabelecimento/i);
    expect(supabase.calls).toHaveLength(0);
  });
});

describe("listarFeedbacks", () => {
  it("nunca faz select * — campos explícitos", async () => {
    supabase.setTableResult("feedbacks", { data: [], error: null });

    await listarFeedbacks();

    const select = supabase.calls.find((c) => c.table === "feedbacks" && c.method === "select");
    expect(select.args[0]).not.toBe("*");
    expect(select.args[0]).toContain("origem");
  });

  it("filtra por origem quando pedido", async () => {
    supabase.setTableResult("feedbacks", { data: [], error: null });

    await listarFeedbacks({ origem: "cliente" });

    const eq = supabase.calls.find((c) => c.method === "eq" && c.args[0] === "origem");
    expect(eq.args[1]).toBe("cliente");
  });
});

describe("marcarResolvido", () => {
  it("sem id não escreve nada", async () => {
    const { error } = await marcarResolvido("");
    expect(error.message).toMatch(/inválido/i);
    expect(supabase.calls).toHaveLength(0);
  });
});

describe("mediaDasNotas", () => {
  it("tira a média das avaliações", () => {
    expect(mediaDasNotas([{ nota: 5 }, { nota: 3 }])).toEqual({ media: 4, quantas: 2 });
  });

  it("sem avaliação a média é null, não zero", () => {
    // "Ainda não avaliaram" e "nota zero" são coisas muito diferentes para
    // quem lê — e zero seria uma calúnia.
    expect(mediaDasNotas([])).toEqual({ media: null, quantas: 0 });
    expect(mediaDasNotas([{ nota: null }])).toEqual({ media: null, quantas: 0 });
  });

  it("ignora nota quebrada em vez de contaminar a média", () => {
    expect(mediaDasNotas([{ nota: 5 }, { nota: 99 }, { nota: "x" }])).toEqual({ media: 5, quantas: 1 });
  });

  it("o feedback da equipe não tem nota e não entra na média", () => {
    expect(mediaDasNotas([{ origem: "equipe", texto: "quebrou" }, { nota: 4 }]))
      .toEqual({ media: 4, quantas: 1 });
  });
});
