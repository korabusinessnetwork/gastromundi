import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("./supabase", async () => {
  const { createMockSupabase } = await import("@/test/mockSupabase");
  return { supabase: createMockSupabase() };
});

import { perguntarAoJarvas } from "./jarvasAssistente";
import { supabase } from "./supabase";

/** Resposta de `fetch` no mínimo que o módulo consome. */
function resposta({ ok = true, json = {} } = {}) {
  return { ok, json: async () => json };
}

function chamadaFetch() {
  const [url, init] = fetch.mock.calls.at(-1);
  return { url, init, corpo: JSON.parse(init.body), headers: init.headers };
}

beforeEach(() => {
  supabase.reset();
  vi.clearAllMocks();
  supabase.auth.getSession.mockResolvedValue({ data: { session: { access_token: "tok-123" } } });
  vi.stubGlobal("fetch", vi.fn(async () => resposta({ json: { resposta: "Suas vendas subiram 12%." } })));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("perguntarAoJarvas", () => {
  it("devolve a resposta da Edge Function", async () => {
    expect(await perguntarAoJarvas("Como foram as vendas?")).toEqual({ resposta: "Suas vendas subiram 12%." });
  });

  it("chama a Edge Function do próprio projeto, por POST em JSON", async () => {
    await perguntarAoJarvas("Oi");
    const { url, init, headers } = chamadaFetch();

    expect(url).toMatch(/\/functions\/v1\/jarvas-assistente$/);
    expect(init.method).toBe("POST");
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("envia o token da sessão — a function valida o papel de quem pergunta", async () => {
    await perguntarAoJarvas("Oi");
    expect(chamadaFetch().headers.Authorization).toBe("Bearer tok-123");
  });

  it("manda pergunta e histórico; sem histórico, manda lista vazia", async () => {
    const historico = [
      { papel: "usuario", texto: "E ontem?" },
      { papel: "jarvas", texto: "Ontem foram R$ 900." },
    ];
    await perguntarAoJarvas("E hoje?", historico);
    expect(chamadaFetch().corpo).toEqual({ pergunta: "E hoje?", historico });

    await perguntarAoJarvas("Só isso");
    expect(chamadaFetch().corpo).toEqual({ pergunta: "Só isso", historico: [] });
  });

  it("a chave da API do LLM nunca sai daqui — só o token do usuário e a anon key", async () => {
    await perguntarAoJarvas("Oi");
    const { init } = chamadaFetch();
    expect(JSON.stringify(init)).not.toMatch(/sk-|openai|anthropic/i);
  });

  it("erro devolvido pela function vira a mensagem dela", async () => {
    fetch.mockResolvedValueOnce(resposta({ ok: false, json: { error: "Apenas gerente ou admin." } }));
    expect(await perguntarAoJarvas("Oi")).toEqual({ error: "Apenas gerente ou admin." });
  });

  it("erro sem mensagem vira um aviso genérico, nunca `undefined` na tela", async () => {
    fetch.mockResolvedValueOnce(resposta({ ok: false, json: {} }));
    expect(await perguntarAoJarvas("Oi")).toEqual({ error: "Erro ao consultar o Jarvas." });
  });

  it("sem rede, devolve mensagem humana com o que fazer — não lança", async () => {
    fetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    expect(await perguntarAoJarvas("Oi")).toEqual({
      error: "Sem conexão com o assistente. Tente novamente.",
    });
  });

  it("resposta que não é JSON também cai no aviso de conexão", async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => {
        throw new SyntaxError("Unexpected token <");
      },
    });
    expect(await perguntarAoJarvas("Oi")).toEqual({
      error: "Sem conexão com o assistente. Tente novamente.",
    });
  });

  it("sessão ausente não quebra — a function recusa, o app não trava", async () => {
    supabase.auth.getSession.mockResolvedValueOnce({ data: { session: null } });
    fetch.mockResolvedValueOnce(resposta({ ok: false, json: { error: "Não autorizado." } }));

    expect(await perguntarAoJarvas("Oi")).toEqual({ error: "Não autorizado." });
    expect(chamadaFetch().headers.Authorization).toBe("Bearer undefined");
  });
});
