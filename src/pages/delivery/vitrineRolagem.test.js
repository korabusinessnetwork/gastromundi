import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * Guard da rolagem da vitrine.
 *
 * O defeito que este arquivo existe para não deixar voltar: o cliente abria o
 * cardápio, via os primeiros produtos e não conseguia chegar no resto, nem
 * arrastando com o mouse nem com o dedo no celular. Não era bug do cardápio,
 * era do documento: o app inteiro é uma casca do tamanho exato da janela, com
 * um painel rolando por dentro, e por isso `html` e `body` são fechados de
 * propósito. A vitrine era a única tela que contava com a rolagem do
 * documento, que não existe.
 *
 * A correção é a vitrine declarar o próprio painel rolável. Como isso mora em
 * CSS, nenhum teste de componente pega: jsdom não faz layout. Este guard lê o
 * arquivo e cobra as duas pontas juntas, que é o que dá sentido a elas.
 */

const RAIZ = join(__dirname, "..", "..", "..");
const ler = (...p) => readFileSync(join(RAIZ, ...p), "utf8");

/** Corpo da primeira regra `seletor { ... }` do arquivo. */
function blocoDe(css, seletor) {
  const i = css.indexOf(`${seletor} {`);
  if (i === -1) return "";
  return css.slice(i, css.indexOf("}", i));
}

describe("a vitrine de delivery rola sozinha", () => {
  it("o documento continua fechado, que é o motivo de a vitrine precisar rolar", () => {
    expect(ler("index.html")).toMatch(/body\s*\{[^}]*overflow:\s*hidden/);
    expect(blocoDe(ler("src", "styles", "tema.css"), "html")).toMatch(/overflow:\s*hidden/);
  });

  it("a vitrine é o painel que rola, com a altura da janela", () => {
    const vitrine = blocoDe(ler("src", "pages", "delivery", "vitrine.css"), ".vitrine");

    // Sem isto o cardápio passa a primeira dobra e o resto fica inalcançável.
    expect(vitrine).toMatch(/overflow-y:\s*auto/);
    // `min-height` não cria painel rolável: só empurra o conteúdo para fora.
    expect(vitrine).toMatch(/\n\s*height:\s*100dvh/);
    // A reserva para quem não tem `dvh` precisa vir ANTES, senão não é reserva.
    expect(vitrine.indexOf("height: 100vh")).toBeLessThan(vitrine.indexOf("height: 100dvh"));
  });
});
