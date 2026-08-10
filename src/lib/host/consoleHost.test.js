import { describe, it, expect } from "vitest";
import { ehConsoleHost, consoleAtivo } from "./consoleHost";

// Sem VITE_CONSOLE_SUBDOMAIN/VITE_ROOT_DOMAIN no ambiente de teste, passamos
// subdomínio e rootDomain explícitos como 2º/3º argumentos em cada chamada.
describe("ehConsoleHost", () => {
  it("host dedicado do console é reconhecido", () => {
    expect(ehConsoleHost("console.kora.codes", "console", "kora.codes")).toBe(true);
  });

  it("subdomínio de tenant NÃO é o host do console", () => {
    expect(ehConsoleHost("casacoffeecolab.kora.codes", "console", "kora.codes")).toBe(false);
    expect(ehConsoleHost("gastromundi.kora.codes", "console", "kora.codes")).toBe(false);
  });

  it("apex e www NÃO são o host do console", () => {
    expect(ehConsoleHost("kora.codes", "console", "kora.codes")).toBe(false);
    expect(ehConsoleHost("www.kora.codes", "console", "kora.codes")).toBe(false);
  });

  it("mesmo rótulo em OUTRO domínio raiz não casa", () => {
    expect(ehConsoleHost("console.outrodominio.app", "console", "kora.codes")).toBe(false);
  });

  it("subdomínio aninhado (algo.console.kora.codes) não é o host exato", () => {
    expect(ehConsoleHost("algo.console.kora.codes", "console", "kora.codes")).toBe(false);
  });

  it("sem subdomínio OU sem rootDomain configurado: inerte (false)", () => {
    expect(ehConsoleHost("console.kora.codes", "", "kora.codes")).toBe(false);
    expect(ehConsoleHost("console.kora.codes", "console", "")).toBe(false);
    expect(ehConsoleHost("console.kora.codes", "", "")).toBe(false);
  });

  it("dev/preview/IP não são o host do console", () => {
    expect(ehConsoleHost("localhost", "console", "kora.codes")).toBe(false);
    expect(ehConsoleHost("127.0.0.1", "console", "kora.codes")).toBe(false);
    expect(ehConsoleHost("gastromundi-git-main.vercel.app", "console", "kora.codes")).toBe(false);
  });

  it("hostname vazio/indefinido não quebra", () => {
    expect(ehConsoleHost("", "console", "kora.codes")).toBe(false);
    expect(ehConsoleHost(undefined, "console", "kora.codes")).toBe(false);
  });

  it("normaliza caixa alta e espaços", () => {
    expect(ehConsoleHost("CONSOLE.KORA.CODES", "console", "kora.codes")).toBe(true);
    expect(ehConsoleHost("  console.kora.codes  ", "console", "kora.codes")).toBe(true);
  });
});

describe("consoleAtivo", () => {
  it("sem VITE_CONSOLE_SUBDOMAIN/VITE_ROOT_DOMAIN no teste, está inerte (false)", () => {
    expect(consoleAtivo()).toBe(false);
  });
});
