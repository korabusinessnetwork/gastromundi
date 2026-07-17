import { describe, it, expect } from "vitest";
import { isErroDeRede } from "./rede";

// Nos testes o navigator do jsdom fica online; o que se testa aqui é a
// classificação pela mensagem (o caminho real do supabase-js).
describe("isErroDeRede", () => {
  it("reconhece as mensagens de fetch falho dos navegadores", () => {
    expect(isErroDeRede({ message: "TypeError: Failed to fetch" })).toBe(true); // Chrome
    expect(isErroDeRede({ message: "NetworkError when attempting to fetch resource." })).toBe(true); // Firefox
    expect(isErroDeRede({ message: "Load failed" })).toBe(true); // Safari
    expect(isErroDeRede({ message: "fetch failed" })).toBe(true); // undici/node
    expect(isErroDeRede({ message: "The operation timed out" })).toBe(true);
    expect(isErroDeRede({ name: "AbortError", message: "The user aborted a request." })).toBe(true);
  });

  it("olha também details quando message não ajuda", () => {
    expect(isErroDeRede({ message: "", details: "getaddrinfo ENOTFOUND xyz.supabase.co" })).toBe(true);
  });

  it("não confunde erro de negócio com erro de rede", () => {
    expect(isErroDeRede(null)).toBe(false);
    expect(isErroDeRede({ message: "new row violates row-level security policy" })).toBe(false);
    expect(isErroDeRede({ message: 'duplicate key value violates unique constraint "pending_pkey"', code: "23505" })).toBe(false);
    expect(isErroDeRede({ message: "invalid input syntax for type uuid" })).toBe(false);
  });
});
