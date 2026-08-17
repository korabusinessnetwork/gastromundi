import { describe, it, expect, vi } from "vitest";

// A função testada aqui é pura, mas o módulo importa o client — sem
// VITE_SUPABASE_* no ambiente de teste, supabase.js lançaria.
vi.mock("./supabase", () => ({ supabase: {} }));

import { mensagemDaFalha } from "./pautasAuth";

describe("mensagemDaFalha", () => {
  it("não distingue usuário inexistente de senha errada", () => {
    const frase = "Usuário ou senha incorretos.";
    expect(mensagemDaFalha({ code: "invalid_credentials", status: 400 })).toBe(frase);
    expect(mensagemDaFalha({ code: "user_not_found", status: 400 })).toBe(frase);
  });

  it("conta não confirmada fala do painel, não da senha", () => {
    expect(mensagemDaFalha({ code: "email_not_confirmed", status: 400 }))
      .toMatch(/não confirmada/i);
  });

  it("rate limit pede para esperar", () => {
    expect(mensagemDaFalha({ code: "over_request_rate_limit", status: 429 })).toMatch(/espere/i);
    expect(mensagemDaFalha({ status: 429 })).toMatch(/espere/i);
  });

  it("falha de rede e 5xx falam do servidor, não da credencial", () => {
    expect(mensagemDaFalha({ message: "Failed to fetch" })).toMatch(/servidor/i);
    expect(mensagemDaFalha({ status: 500 })).toMatch(/servidor/i);
    expect(mensagemDaFalha({ status: 503 })).toMatch(/servidor/i);
  });
});
