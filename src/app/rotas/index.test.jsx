// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { escolherRotas } from "./index";

const caminhos = (rotas) => rotas.map((r) => r.path);
const elementoDe = (rotas, path) => rotas.find((r) => r.path === path).element;

describe("escolherRotas, uma superfície por endereço", () => {
  it("no host dedicado do Console, só o Console existe", () => {
    const rotas = escolherRotas({ naHostDoConsole: true, consoleForaDoHost: false, noApex: false });
    expect(caminhos(rotas)).toEqual(["/login", "/console", "/", "*"]);
  });

  it("nos outros hosts, site da Kora, cardápio público, Console e estabelecimento, sem rota repetida", () => {
    const rotas = escolherRotas({ naHostDoConsole: false, consoleForaDoHost: false, noApex: false });
    const lista = caminhos(rotas);
    for (const p of ["/", "/demo", "/entrar", "/criar-conta", "/patchnotes", "/cardapio", "/console", "/login", "/palm", "/app", "*"]) {
      expect(lista).toContain(p);
    }
    expect(new Set(lista).size).toBe(lista.length);
  });

  it("fora do site da Kora, as rotas do site levam ao login", () => {
    const rotas = escolherRotas({ naHostDoConsole: false, consoleForaDoHost: false, noApex: false });
    for (const p of ["/", "/demo", "/entrar", "/criar-conta", "/patchnotes"]) {
      expect(elementoDe(rotas, p).props.to).toBe("/login");
    }
  });

  it("no site da Kora, as rotas do site mostram as páginas", () => {
    const rotas = escolherRotas({ naHostDoConsole: false, consoleForaDoHost: false, noApex: true });
    expect(elementoDe(rotas, "/patchnotes").props.to).toBeUndefined();
  });

  it("com o Console em subdomínio ligado, o /console de um estabelecimento leva ao login", () => {
    const rotas = escolherRotas({ naHostDoConsole: false, consoleForaDoHost: true, noApex: false });
    expect(elementoDe(rotas, "/console").props.to).toBe("/login");
  });

  it("o app do computador mantém a tela inicial e as 12 telas", () => {
    const app = escolherRotas({ naHostDoConsole: false, consoleForaDoHost: false, noApex: false }).find((r) => r.path === "/app");
    expect(app.children.map((r) => (r.index ? "(inicial)" : r.path))).toEqual([
      "(inicial)", "pdv", "produtos", "delivery", "relatorio", "configuracoes", "estoque",
      "financeiro", "cozinha", "clientes", "admin", "notas-fiscais", "fiscal",
    ]);
  });
});
