import { describe, it, expect } from "vitest";
import { resolverSlugTenant, slugDoSubdominio, slugDaQuery, slugDaVitrine, emailDoLogin, urlDoCardapioPublico, urlDeAcessoDoTenant } from "./tenantSlug";

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

// Rodada 4 — a prévia "Ver cardápio do cliente" endereça a loja pela query
// enquanto não existe subdomínio comprado. Sem isto a vitrine caía no fallback
// e o dono de um estabelecimento via a loja de outro (decisão 017).
describe("slugDaQuery", () => {
  it("lê o ?loja=, normalizando caixa e espaços", () => {
    expect(slugDaQuery("?loja=casacoffee")).toBe("casacoffee");
    expect(slugDaQuery("?loja=CasaCoffee")).toBe("casacoffee");
    expect(slugDaQuery("?loja=%20casacoffee%20")).toBe("casacoffee");
    expect(slugDaQuery("?x=1&loja=bar-do-ze&y=2")).toBe("bar-do-ze");
  });

  it("sem parâmetro, vazio ou fora do formato de slug volta null", () => {
    expect(slugDaQuery("")).toBe(null);
    expect(slugDaQuery("?outra=coisa")).toBe(null);
    expect(slugDaQuery("?loja=")).toBe(null);
    expect(slugDaQuery("?loja=casa_coffee")).toBe(null);
    expect(slugDaQuery("?loja=-casa")).toBe(null);
    expect(slugDaQuery("?loja=casa-")).toBe(null);
    expect(slugDaQuery("?loja=casa.coffee")).toBe(null);
  });

  it("o que vem da URL é validado antes de virar parâmetro de RPC", () => {
    expect(slugDaQuery("?loja=' OR 1=1 --")).toBe(null);
    expect(slugDaQuery("?loja=%3Cscript%3E")).toBe(null);
    expect(slugDaQuery("?loja=../../etc/passwd")).toBe(null);
  });

  it("nunca lança: argumento ausente, nulo ou de outro tipo viram null", () => {
    expect(slugDaQuery()).toBe(null);
    expect(slugDaQuery(null)).toBe(null);
    expect(slugDaQuery(123)).toBe(null);
    expect(slugDaQuery({})).toBe(null);
  });
});

describe("slugDaVitrine", () => {
  it("subdomínio ganha da query — endereço publicado não se sequestra por URL", () => {
    expect(slugDaVitrine("casacoffee.kora.codes", "?loja=gastromundi")).toEqual({
      slug: "casacoffee",
      origem: "subdominio",
    });
  });

  it("sem subdomínio, o ?loja= válido decide (é o caso de hoje em produção)", () => {
    expect(slugDaVitrine("gastromundi.vercel.app", "?loja=casacoffee")).toEqual({
      slug: "casacoffee",
      origem: "query",
    });
    expect(slugDaVitrine("localhost", "?loja=casacoffee")).toEqual({
      slug: "casacoffee",
      origem: "query",
    });
  });

  it("sem subdomínio e sem query válida, é o comportamento de hoje", () => {
    expect(slugDaVitrine("localhost", "")).toEqual({ slug: "gastromundi", origem: "fallback" });
    expect(slugDaVitrine("gastromundi.vercel.app", "?loja=casa_coffee")).toEqual({
      slug: "gastromundi",
      origem: "fallback",
    });
  });

  it("subdomínio digitado errado continua reivindicando — a vitrine mostra 'sem loja', não a loja do fallback", () => {
    expect(slugDaVitrine("gastrumundi.kora.codes", "")).toEqual({
      slug: "gastrumundi",
      origem: "subdominio",
    });
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

describe("urlDoCardapioPublico (CONSOLE-UX 15)", () => {
  it("fora do host do console, devolve o caminho relativo com ?loja=", () => {
    expect(urlDoCardapioPublico("casacoffee", "kora.codes")).toBe("/cardapio?loja=casacoffee");
    expect(urlDoCardapioPublico("bar-do-ze", "localhost")).toBe("/cardapio?loja=bar-do-ze");
  });

  it("normaliza maiúsculas e espaços do banco antes de montar o endereço", () => {
    expect(urlDoCardapioPublico("  CasaCoffee  ", "localhost")).toBe("/cardapio?loja=casacoffee");
  });

  // No host do console o rótulo "console" É reivindicação de subdomínio e
  // venceria o ?loja= (precedência de slugDaVitrine): o link abriria a loja
  // errada. Lá vale o endereço publicado do próprio estabelecimento.
  it("no host dedicado do console, devolve o endereço publicado do estabelecimento", () => {
    const url = urlDoCardapioPublico("casacoffee", "console.kora.codes", {
      subdominioConsole: "console",
      rootDomain: "kora.codes",
    });
    expect(url).toBe("https://casacoffee.kora.codes/cardapio");
  });

  it("com o console em subdomínio ligado, host de tenant continua no caminho relativo", () => {
    const url = urlDoCardapioPublico("casacoffee", "outraloja.kora.codes", {
      subdominioConsole: "console",
      rootDomain: "kora.codes",
    });
    expect(url).toBe("/cardapio?loja=casacoffee");
  });

  it("slug ausente, vazio ou fora do formato DNS devolve null", () => {
    for (const slug of [null, undefined, "", "   ", "casa_coffee", "-casa", "casa-", "casa coffee", "loja.a"]) {
      expect(urlDoCardapioPublico(slug, "localhost"), `slug ${JSON.stringify(slug)}`).toBeNull();
    }
  });
});

describe("urlDeAcessoDoTenant (CONSOLE-UX 16)", () => {
  // Estado de hoje: sem domínio raiz, o login de TODO mundo cai no mesmo
  // namespace de e-mail, então a porta compartilhada realmente abre para
  // qualquer tenant — inclusive para quem nasceu antes do slug existir.
  it("sem domínio raiz, devolve a origem recebida qualquer que seja o slug", () => {
    const opcoes = { origem: "https://app.kora.codes", rootDomain: "" };
    expect(urlDeAcessoDoTenant("casacoffee", opcoes)).toBe("https://app.kora.codes");
    expect(urlDeAcessoDoTenant(null, opcoes)).toBe("https://app.kora.codes");
    expect(urlDeAcessoDoTenant("lixo no banco", opcoes)).toBe("https://app.kora.codes");
  });

  it("com domínio raiz, devolve o subdomínio do próprio estabelecimento", () => {
    const url = urlDeAcessoDoTenant("  CasaCoffee ", {
      origem: "https://console.kora.codes",
      rootDomain: "kora.codes",
    });
    expect(url).toBe("https://casacoffee.kora.codes");
  });

  // Aqui a origem do dono seria o endereço ERRADO (o host do Console, ou o
  // subdomínio de outro cliente), então não há endereço afirmável.
  it("com domínio raiz e slug inutilizável, devolve null", () => {
    for (const slug of [null, undefined, "", "   ", "casa_coffee", "-casa", "casa coffee"]) {
      const url = urlDeAcessoDoTenant(slug, {
        origem: "https://console.kora.codes",
        rootDomain: "kora.codes",
      });
      expect(url, `slug ${JSON.stringify(slug)}`).toBeNull();
    }
  });

  it("sem origem e sem window, devolve string vazia em vez de estourar", () => {
    expect(urlDeAcessoDoTenant("casacoffee", { origem: "", rootDomain: "" })).toBe("");
  });
});
