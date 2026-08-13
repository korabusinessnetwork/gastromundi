import { describe, it, expect } from "vitest";
import { ehPautasHost, pautasAtivo, emailDoSocio, slugDoSocio } from "./pautasHost";

// Sem VITE_PAUTAS_SUBDOMAIN/VITE_ROOT_DOMAIN no ambiente de teste, passamos
// subdomínio e rootDomain explícitos como 2º/3º argumentos em cada chamada.
describe("ehPautasHost", () => {
  it("host dedicado das pautas é reconhecido", () => {
    expect(ehPautasHost("pautas.kora.codes", "pautas", "kora.codes")).toBe(true);
  });

  it("subdomínio de tenant NÃO é o host das pautas", () => {
    expect(ehPautasHost("gastromundi.kora.codes", "pautas", "kora.codes")).toBe(false);
    expect(ehPautasHost("casacoffeecolab.kora.codes", "pautas", "kora.codes")).toBe(false);
  });

  it("console, apex e www NÃO são o host das pautas", () => {
    expect(ehPautasHost("console.kora.codes", "pautas", "kora.codes")).toBe(false);
    expect(ehPautasHost("kora.codes", "pautas", "kora.codes")).toBe(false);
    expect(ehPautasHost("www.kora.codes", "pautas", "kora.codes")).toBe(false);
  });

  it("mesmo rótulo em OUTRO domínio raiz não casa", () => {
    expect(ehPautasHost("pautas.outrodominio.app", "pautas", "kora.codes")).toBe(false);
  });

  it("subdomínio aninhado (algo.pautas.kora.codes) não é o host exato", () => {
    expect(ehPautasHost("algo.pautas.kora.codes", "pautas", "kora.codes")).toBe(false);
  });

  it("sem subdomínio OU sem rootDomain configurado: inerte (false)", () => {
    expect(ehPautasHost("pautas.kora.codes", "", "kora.codes")).toBe(false);
    expect(ehPautasHost("pautas.kora.codes", "pautas", "")).toBe(false);
    expect(ehPautasHost("pautas.kora.codes", "", "")).toBe(false);
  });

  it("dev/preview/IP não são o host das pautas", () => {
    expect(ehPautasHost("localhost", "pautas", "kora.codes")).toBe(false);
    expect(ehPautasHost("127.0.0.1", "pautas", "kora.codes")).toBe(false);
    expect(ehPautasHost("gastromundi-git-main.vercel.app", "pautas", "kora.codes")).toBe(false);
  });

  it("hostname vazio/indefinido não quebra", () => {
    expect(ehPautasHost("", "pautas", "kora.codes")).toBe(false);
    expect(ehPautasHost(undefined, "pautas", "kora.codes")).toBe(false);
  });

  it("normaliza caixa alta e espaços", () => {
    expect(ehPautasHost("PAUTAS.KORA.CODES", "pautas", "kora.codes")).toBe(true);
    expect(ehPautasHost("  pautas.kora.codes  ", "pautas", "kora.codes")).toBe(true);
  });
});

describe("pautasAtivo", () => {
  it("sem VITE_PAUTAS_SUBDOMAIN/VITE_ROOT_DOMAIN no teste, está inerte (false)", () => {
    expect(pautasAtivo()).toBe(false);
  });
});

describe("emailDoSocio", () => {
  it("monta o e-mail no namespace @pautas.local", () => {
    expect(emailDoSocio("matheus")).toBe("matheus@pautas.local");
    expect(emailDoSocio("guilherme")).toBe("guilherme@pautas.local");
    expect(emailDoSocio("bonato")).toBe("bonato@pautas.local");
  });

  it("normaliza caixa alta e espaços em volta", () => {
    expect(emailDoSocio("  Matheus ")).toBe("matheus@pautas.local");
  });

  it("recusa usuário vazio ou com caractere que não forma e-mail", () => {
    expect(emailDoSocio("")).toBe(null);
    expect(emailDoSocio("   ")).toBe(null);
    expect(emailDoSocio(null)).toBe(null);
    expect(emailDoSocio("mat heus")).toBe(null);
    expect(emailDoSocio("mat@heus")).toBe(null);
    expect(emailDoSocio(".matheus")).toBe(null);
    expect(emailDoSocio("matheus.")).toBe(null);
  });
});

describe("slugDoSocio", () => {
  it("extrai o slug do e-mail da sessão", () => {
    expect(slugDoSocio("matheus@pautas.local")).toBe("matheus");
    expect(slugDoSocio("BONATO@PAUTAS.LOCAL")).toBe("bonato");
  });

  it("e-mail de outro namespace não vira sócio", () => {
    expect(slugDoSocio("admin@console.local")).toBe(null);
    expect(slugDoSocio("caixa@gastromundi.local")).toBe(null);
    expect(slugDoSocio("alguem@gmail.com")).toBe(null);
  });

  it("ausente ou incompleto devolve null", () => {
    expect(slugDoSocio(null)).toBe(null);
    expect(slugDoSocio(undefined)).toBe(null);
    expect(slugDoSocio("")).toBe(null);
    expect(slugDoSocio("@pautas.local")).toBe(null);
  });
});
