import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * O que o operador lê quando o Jarvas recusa.
 *
 * A Edge Function passou a ter teto diário de uso por estabelecimento, como a
 * função irmã que lê cardápio por IA já tinha: sem ele, qualquer admin ou
 * gerente autenticado podia chamar o Jarvas em laço e queimar cota paga, e o
 * Jarvas custa mais por chamada porque manda todo o contexto do negócio junto.
 * A recusa vem como 429 com `error` mais `dica`, e a dica é a metade útil: diz
 * quantas perguntas são por dia e quando volta a valer.
 */

vi.mock("./supabase", () => ({
  supabase: {
    auth: { getSession: vi.fn(() => Promise.resolve({ data: { session: { access_token: "t" } } })) },
  },
}));

import { perguntarAoJarvas } from "./jarvasAssistente";

const respostaDe = (corpo, ok = true, status = 200) =>
  Promise.resolve({ ok, status, json: () => Promise.resolve(corpo) });

beforeEach(() => { vi.stubGlobal("fetch", vi.fn()); });
afterEach(() => { vi.unstubAllGlobals(); });

describe("perguntarAoJarvas", () => {
  it("devolve a resposta quando o servidor responde", async () => {
    fetch.mockReturnValue(respostaDe({ resposta: "Vendeu R$ 1.200,00 ontem." }));

    expect(await perguntarAoJarvas("como foi ontem?")).toEqual({
      resposta: "Vendeu R$ 1.200,00 ontem.",
    });
  });

  it("no teto diário, junta a dica à recusa para o operador saber o que fazer", async () => {
    fetch.mockReturnValue(respostaDe(
      {
        error: "O Jarvas já respondeu o máximo de perguntas de hoje.",
        dica: "São até 50 perguntas por dia neste estabelecimento. Tente de novo amanhã.",
      },
      false,
      429,
    ));

    const { error } = await perguntarAoJarvas("e hoje?");
    expect(error).toBe(
      "O Jarvas já respondeu o máximo de perguntas de hoje. " +
      "São até 50 perguntas por dia neste estabelecimento. Tente de novo amanhã.",
    );
  });

  it("recusa sem dica continua mostrando só o motivo", async () => {
    fetch.mockReturnValue(respostaDe({ error: "Sem permissão." }, false, 403));

    expect(await perguntarAoJarvas("e hoje?")).toEqual({ error: "Sem permissão." });
  });

  it("queda de rede vira mensagem humana, não exceção", async () => {
    fetch.mockRejectedValue(new Error("Failed to fetch"));

    expect(await perguntarAoJarvas("e hoje?")).toEqual({
      error: "Sem conexão com o assistente. Tente novamente.",
    });
  });
});
