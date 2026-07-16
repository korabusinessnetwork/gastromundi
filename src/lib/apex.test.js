import { describe, it, expect } from "vitest";
import { ehApexInstitucional } from "./apex";

// Sem VITE_ROOT_DOMAIN no ambiente de teste, passamos rootDomain explícito
// como 2º argumento em cada chamada.
describe("ehApexInstitucional", () => {
  it("apex e www.apex são institucional", () => {
    expect(ehApexInstitucional("kora.codes", "kora.codes")).toBe(true);
    expect(ehApexInstitucional("www.kora.codes", "kora.codes")).toBe(true);
  });

  it("subdomínio de tenant não é institucional", () => {
    expect(ehApexInstitucional("casacoffeecolab.kora.codes", "kora.codes")).toBe(false);
  });

  it("dev/preview/IP não são institucional mesmo com rootDomain configurado", () => {
    expect(ehApexInstitucional("localhost", "kora.codes")).toBe(false);
    expect(ehApexInstitucional("127.0.0.1", "kora.codes")).toBe(false);
    expect(ehApexInstitucional("gastromundi-git-main.vercel.app", "kora.codes")).toBe(false);
  });

  it("sem rootDomain configurado, sempre inerte (false)", () => {
    expect(ehApexInstitucional("kora.codes", "")).toBe(false);
    expect(ehApexInstitucional("www.kora.codes", "")).toBe(false);
    expect(ehApexInstitucional("qualquer.coisa", "")).toBe(false);
  });

  it("hostname vazio/indefinido não quebra", () => {
    expect(ehApexInstitucional("", "kora.codes")).toBe(false);
    expect(ehApexInstitucional(undefined, "kora.codes")).toBe(false);
  });

  it("normaliza caixa alta", () => {
    expect(ehApexInstitucional("KORA.CODES", "kora.codes")).toBe(true);
  });
});
