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
  filtrarFeedbacks,
  contarFeedbacks,
  quandoChegou,
  rotuloDaNota,
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

// ══════════════════════════════════════════════════════════════════
// A leitura dos feedbacks.
//
// Os dois canais gravavam desde a migração 20261010 e não havia tela
// para ler: a feature estava pela metade, e a metade que faltava era a
// que serve ao dono.
// ══════════════════════════════════════════════════════════════════
const LISTA = [
  { id: "1", origem: "equipe",  texto: "não salva",   resolvido: false },
  { id: "2", origem: "equipe",  texto: "lento",       resolvido: true },
  { id: "3", origem: "cliente", texto: "veio frio",   resolvido: false, nota: 2 },
  { id: "4", origem: "cliente", texto: "ótimo",       resolvido: true,  nota: 5 },
  { id: "5", origem: "cliente", texto: "bom",         resolvido: false, nota: 4 },
];

describe("filtrarFeedbacks", () => {
  it("por origem", () => {
    expect(filtrarFeedbacks(LISTA, { origem: "equipe" }).map((f) => f.id)).toEqual(["1", "2"]);
    expect(filtrarFeedbacks(LISTA, { origem: "cliente" }).map((f) => f.id)).toEqual(["3", "4", "5"]);
  });

  it("por situação", () => {
    expect(filtrarFeedbacks(LISTA, { situacao: "abertos" }).map((f) => f.id)).toEqual(["1", "3", "5"]);
    expect(filtrarFeedbacks(LISTA, { situacao: "resolvidos" }).map((f) => f.id)).toEqual(["2", "4"]);
  });

  it("os dois eixos ao mesmo tempo, que é a pergunta de verdade", () => {
    // "O que os clientes disseram e ainda não foi respondido."
    expect(
      filtrarFeedbacks(LISTA, { origem: "cliente", situacao: "abertos" }).map((f) => f.id),
    ).toEqual(["3", "5"]);
  });

  it("sem filtro devolve tudo", () => {
    expect(filtrarFeedbacks(LISTA)).toHaveLength(5);
    expect(filtrarFeedbacks(LISTA, { origem: "todas", situacao: "todos" })).toHaveLength(5);
  });

  it("valor inesperado não esvazia a lista", () => {
    // Sumir tudo por causa de um estado estranho da tela parece que os
    // feedbacks foram apagados.
    expect(filtrarFeedbacks(LISTA, { origem: "sei-la", situacao: "sei-la" })).toHaveLength(5);
  });

  it("lista ausente ou com buraco não quebra", () => {
    expect(filtrarFeedbacks(null)).toEqual([]);
    expect(filtrarFeedbacks(undefined)).toEqual([]);
    expect(filtrarFeedbacks([null, LISTA[0]])).toHaveLength(1);
  });
});

describe("contarFeedbacks", () => {
  it("conta cada recorte que vai dentro de um botão", () => {
    expect(contarFeedbacks(LISTA)).toEqual({
      total: 5, equipe: 2, cliente: 3, abertos: 3, resolvidos: 2,
    });
  });

  it("lista vazia conta zero em tudo", () => {
    expect(contarFeedbacks([])).toEqual({
      total: 0, equipe: 0, cliente: 0, abertos: 0, resolvidos: 0,
    });
    expect(contarFeedbacks(null).total).toBe(0);
  });
});

describe("quandoChegou", () => {
  const agora = new Date("2026-09-20T12:00:00Z");

  it("fala em dias, que é a medida que importa num relato", () => {
    expect(quandoChegou("2026-09-20T09:00:00Z", agora)).toBe("hoje");
    expect(quandoChegou("2026-09-19T09:00:00Z", agora)).toBe("ontem");
    expect(quandoChegou("2026-09-17T09:00:00Z", agora)).toBe("há 3 dias");
  });

  it("a partir de uma semana vira data, que é como se fala de algo antigo", () => {
    expect(quandoChegou("2026-09-10T09:00:00Z", agora)).toBe("10/09/2026");
  });

  it("data no futuro (relógio torto) não vira número negativo na tela", () => {
    expect(quandoChegou("2026-09-25T09:00:00Z", agora)).toBe("hoje");
  });

  it("data ilegível vira vazio, não 'Invalid Date'", () => {
    expect(quandoChegou("", agora)).toBe("");
    expect(quandoChegou(null, agora)).toBe("");
    expect(quandoChegou("sei-la", agora)).toBe("");
  });
});

describe("rotuloDaNota", () => {
  it("é a mesma palavra que o cliente escolheu na vitrine", () => {
    expect(rotuloDaNota(1)).toBe("Ruim");
    expect(rotuloDaNota(3)).toBe("Ok");
    expect(rotuloDaNota(5)).toBe("Ótimo");
  });

  it("fora da escala não inventa palavra", () => {
    expect(rotuloDaNota(0)).toBe("");
    expect(rotuloDaNota(9)).toBe("");
    expect(rotuloDaNota(null)).toBe("");
  });
});
