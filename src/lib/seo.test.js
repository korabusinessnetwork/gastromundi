// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import {
  CAMINHOS_PUBLICOS,
  aplicarSeoDaRota,
  canonicalDaRota,
  definirCanonical,
  definirNoindex,
  normalizarCaminho,
} from "./seo";

const DOMINIO = "kora.codes";

function canonicalNoDom() {
  return document.head.querySelector('link[rel="canonical"]')?.getAttribute("href") ?? null;
}

function robotsNoDom() {
  return document.head.querySelector('meta[name="robots"]')?.getAttribute("content") ?? null;
}

describe("seo — canônico e indexação por host", () => {
  beforeEach(() => {
    document.head.querySelector('link[rel="canonical"]')?.remove();
    document.head.querySelector('meta[name="robots"]')?.remove();
  });

  describe("normalizarCaminho", () => {
    it("trata barra final e caixa como a mesma página", () => {
      expect(normalizarCaminho("/demo/")).toBe("/demo");
      expect(normalizarCaminho("/Demo")).toBe("/demo");
      expect(normalizarCaminho("/")).toBe("/");
      expect(normalizarCaminho("")).toBe("/");
      expect(normalizarCaminho(undefined)).toBe("/");
    });
  });

  describe("canonicalDaRota", () => {
    it("aponta a raiz e a demo para o domínio nu", () => {
      expect(canonicalDaRota("/", DOMINIO)).toBe("https://kora.codes/");
      expect(canonicalDaRota("/demo/", DOMINIO)).toBe("https://kora.codes/demo");
    });

    it("não inventa canônico para rota que não é da vitrine", () => {
      expect(canonicalDaRota("/login", DOMINIO)).toBeNull();
      expect(canonicalDaRota("/app/pdv", DOMINIO)).toBeNull();
    });

    it("sem VITE_ROOT_DOMAIN não existe endereço oficial a anunciar", () => {
      expect(canonicalDaRota("/", "")).toBeNull();
    });
  });

  describe("definirCanonical / definirNoindex", () => {
    it("escreve, reaproveita e apaga a tag de canônico", () => {
      definirCanonical("https://kora.codes/");
      expect(canonicalNoDom()).toBe("https://kora.codes/");

      definirCanonical("https://kora.codes/demo");
      expect(document.head.querySelectorAll('link[rel="canonical"]')).toHaveLength(1);
      expect(canonicalNoDom()).toBe("https://kora.codes/demo");

      definirCanonical(null);
      expect(canonicalNoDom()).toBeNull();
    });

    it("liga e desliga o noindex mantendo o follow", () => {
      definirNoindex(true);
      expect(robotsNoDom()).toBe("noindex, follow");
      definirNoindex(true);
      expect(document.head.querySelectorAll('meta[name="robots"]')).toHaveLength(1);
      definirNoindex(false);
      expect(robotsNoDom()).toBeNull();
    });
  });

  describe("aplicarSeoDaRota", () => {
    it("no apex, a vitrine é indexável e tem canônico", () => {
      const r = aplicarSeoDaRota({
        hostname: DOMINIO,
        pathname: "/",
        rootDomain: DOMINIO,
      });
      expect(r).toEqual({ canonical: "https://kora.codes/", noindex: false });
      expect(canonicalNoDom()).toBe("https://kora.codes/");
      expect(robotsNoDom()).toBeNull();
    });

    it("no www, o canônico aponta para o domínio nu (uma página só)", () => {
      const r = aplicarSeoDaRota({
        hostname: "www.kora.codes",
        pathname: "/demo",
        rootDomain: DOMINIO,
      });
      expect(r.canonical).toBe("https://kora.codes/demo");
      expect(r.noindex).toBe(false);
    });

    it("subdomínio de estabelecimento não é vitrine: noindex e sem canônico", () => {
      const r = aplicarSeoDaRota({
        hostname: "casacoffee.kora.codes",
        pathname: "/",
        rootDomain: DOMINIO,
      });
      expect(r).toEqual({ canonical: null, noindex: true });
      expect(canonicalNoDom()).toBeNull();
      expect(robotsNoDom()).toBe("noindex, follow");
    });

    it("rota de operação no apex também sai do índice", () => {
      const r = aplicarSeoDaRota({
        hostname: DOMINIO,
        pathname: "/login",
        rootDomain: DOMINIO,
      });
      expect(r.noindex).toBe(true);
      expect(r.canonical).toBeNull();
    });

    it("caminho inexistente (404) nunca é indexado", () => {
      const r = aplicarSeoDaRota({
        hostname: DOMINIO,
        pathname: "/pagina-que-nao-existe-123",
        rootDomain: DOMINIO,
      });
      expect(r).toEqual({ canonical: null, noindex: true });
    });

    it("troca de rota limpa o que a rota anterior deixou", () => {
      aplicarSeoDaRota({ hostname: DOMINIO, pathname: "/", rootDomain: DOMINIO });
      aplicarSeoDaRota({ hostname: DOMINIO, pathname: "/login", rootDomain: DOMINIO });
      expect(canonicalNoDom()).toBeNull();
      expect(robotsNoDom()).toBe("noindex, follow");

      aplicarSeoDaRota({ hostname: DOMINIO, pathname: "/demo", rootDomain: DOMINIO });
      expect(canonicalNoDom()).toBe("https://kora.codes/demo");
      expect(robotsNoDom()).toBeNull();
    });

    it("sem domínio raiz configurado, roda inerte e não indexa nada", () => {
      const r = aplicarSeoDaRota({ hostname: "localhost", pathname: "/", rootDomain: "" });
      expect(r).toEqual({ canonical: null, noindex: true });
    });
  });

  it("a lista de caminhos públicos é a vitrine, a demo e a privacidade", () => {
    expect(CAMINHOS_PUBLICOS).toEqual(["/", "/demo", "/privacidade"]);
  });
});
