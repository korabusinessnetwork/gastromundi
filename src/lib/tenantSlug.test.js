import { describe, it, expect } from "vitest";
import { resolverSlugTenant, slugDoSubdominio, emailDoLogin } from "./tenantSlug";

// Sem VITE_ROOT_DOMAIN / VITE_TENANT_SLUG no ambiente de teste, valem o
// fallback 'gastromundi' e a heurística de 3+ rótulos.
describe("resolverSlugTenant", () => {
  it("subdomínio de tenant vira slug (heurística 3+ rótulos)", () => {
    expect(resolverSlugTenant("casacoffee.gastromundi.app")).toBe("casacoffee");
    expect(resolverSlugTenant("bar-do-ze.gastromundi.app")).toBe("bar-do-ze");
  });

  it("www e domínio nu caem no fallback", () => {
    expect(resolverSlugTenant("www.gastromundi.app")).toBe("gastromundi");
    expect(resolverSlugTenant("gastromundi.app")).toBe("gastromundi");
  });

  it("dev/preview/IP caem no fallback (inerte)", () => {
    expect(resolverSlugTenant("localhost")).toBe("gastromundi");
    expect(resolverSlugTenant("127.0.0.1")).toBe("gastromundi");
    expect(resolverSlugTenant("gastromundi-git-main.vercel.app")).toBe("gastromundi");
  });

  it("hostname vazio/indefinido não quebra", () => {
    expect(resolverSlugTenant("")).toBe("gastromundi");
    expect(resolverSlugTenant("  ")).toBe("gastromundi");
  });

  it("normaliza caixa alta", () => {
    expect(resolverSlugTenant("CasaCoffee.GastroMundi.App")).toBe("casacoffee");
  });
});

describe("slugDoSubdominio", () => {
  it("subdomínio reivindica o 1º rótulo, SEM fallback (heurística 3+ rótulos)", () => {
    expect(slugDoSubdominio("casacoffee.kora.codes")).toBe("casacoffee");
    expect(slugDoSubdominio("gastrumundi.kora.codes")).toBe("gastrumundi"); // digitado errado ≠ fallback
  });

  it("ambientes sem subdomínio não reivindicam nada (null)", () => {
    expect(slugDoSubdominio("localhost")).toBe(null);
    expect(slugDoSubdominio("127.0.0.1")).toBe(null);
    expect(slugDoSubdominio("gastromundi-git-main.vercel.app")).toBe(null);
    expect(slugDoSubdominio("kora.codes")).toBe(null);
    expect(slugDoSubdominio("www.kora.codes")).toBe(null);
    expect(slugDoSubdominio("")).toBe(null);
  });

  it("com rootDomain: apex/www e domínios de fora não reivindicam; subdomínio sim", () => {
    expect(slugDoSubdominio("kora.codes", "kora.codes")).toBe(null);
    expect(slugDoSubdominio("www.kora.codes", "kora.codes")).toBe(null);
    expect(slugDoSubdominio("casacoffee.kora.codes", "kora.codes")).toBe("casacoffee");
    expect(slugDoSubdominio("errado.kora.codes", "kora.codes")).toBe("errado");
    expect(slugDoSubdominio("outrodominio.com.br", "kora.codes")).toBe(null);
  });

  it("normaliza caixa alta e espaços", () => {
    expect(slugDoSubdominio(" CasaCoffee.Kora.Codes ", "kora.codes")).toBe("casacoffee");
  });
});

describe("emailDoLogin", () => {
  it("monta o e-mail namespaced pelo slug do subdomínio", () => {
    expect(emailDoLogin("admin", "casacoffee.gastromundi.app")).toBe("admin@casacoffee.local");
  });

  it("no fallback mantém o namespace de hoje (@gastromundi.local)", () => {
    expect(emailDoLogin("admin", "localhost")).toBe("admin@gastromundi.local");
  });

  it("subdomínio errado NÃO cai no namespace do fallback", () => {
    expect(emailDoLogin("admin", "gastrumundi.kora.codes")).toBe("admin@gastrumundi.local");
  });
});
