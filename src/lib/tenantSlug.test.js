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

  // Run 5, leva 7 — rótulo vazio voltava "" em vez de null. String vazia não é
  // nullish, então furava o `??` de `emailDoLogin` (e-mail `usuario@.local`)
  // enquanto o `!!` da tela de login a tratava como "sem reivindicação" e
  // pintava a marca do fallback: URL de um estabelecimento, tela de outro.
  it("rótulo vazio não é reivindicação nenhuma — volta null, nunca string vazia", () => {
    for (const host of [".kora.codes", "..kora.codes", ".a.kora.codes"]) {
      expect(slugDoSubdominio(host), host).toBe(null);
    }
  });

  it("nunca devolve string vazia — só um rótulo ou null", () => {
    for (const host of ["", "  ", ".", "..", "localhost", ".kora.codes", "kora.codes", "casacoffee.kora.codes"]) {
      const r = slugDoSubdominio(host);
      expect(r === null || (typeof r === "string" && r.length > 0), `host "${host}" devolveu ${JSON.stringify(r)}`).toBe(true);
    }
  });

  it("rótulo vazio também volta null com rootDomain configurado", () => {
    expect(slugDoSubdominio(".kora.codes", "kora.codes")).toBe(null);
  });

  it("rótulo estranho CONTINUA sendo reivindicação — não pode cair no fallback", () => {
    // Sem isso a tela deixaria entrar no tenant do fallback em vez de mostrar
    // "endereço não encontrado".
    expect(slugDoSubdominio("casa_coffee.kora.codes")).toBe("casa_coffee");
    expect(slugDoSubdominio("-casa.kora.codes", "kora.codes")).toBe("-casa");
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

  // Run 5, leva 7 — antes montava o e-mail com qualquer slug. O servidor
  // respondia "Unable to validate email address: invalid format" e a tela de
  // login mostrava isso como se fosse erro de senha.
  it("slug que não forma endereço válido devolve null em vez de e-mail torto", () => {
    expect(emailDoLogin("admin", "casa_coffee.kora.codes")).toBeNull();
    expect(emailDoLogin("admin", "-casa.kora.codes")).toBeNull();
    expect(emailDoLogin("admin", "casa-.kora.codes")).toBeNull();
  });

  it("rótulo vazio não vira `admin@.local` — cai no fallback do resolver", () => {
    // Aqui não há reivindicação de verdade, então o namespace de sempre serve.
    expect(emailDoLogin("admin", ".kora.codes")).toBe("admin@gastromundi.local");
  });

  it("nunca devolve um e-mail com domínio vazio", () => {
    for (const host of ["", ".", "..", ".kora.codes", "..kora.codes", "casacoffee.kora.codes", "localhost"]) {
      const e = emailDoLogin("admin", host);
      if (e !== null) expect(e, `host "${host}"`).not.toMatch(/@\.local$/);
    }
  });
});
