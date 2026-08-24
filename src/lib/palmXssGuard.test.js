import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * Guard de XSS armazenado no Palm (ponte/palm.html) — a tela que o garçom
 * abre no celular pela rede local.
 *
 * O PALM MONTA HTML POR CONCATENAÇÃO DE STRING
 * Não há framework aqui: o cardápio e o carrinho viram `innerHTML` colado à
 * mão. Tudo que vem do banco e entra nesse HTML precisa passar por
 * `escapar()`. Nome e categoria de produto já passavam; o `emoji` não —
 * e `emoji` é texto livre, sem validação nenhuma (ProdutosView grava
 * `emoji: form.emoji || null`, sem checar que é mesmo um emoji).
 *
 * Quem edita o cardápio (gerente/admin, ou qualquer conta com acesso à tela)
 * podia gravar `<img src=x onerror=...>` no campo do emoji e o script
 * executava no celular de TODO garçom que abrisse o cardápio, com o token da
 * Ponte na URL à mão. É XSS armazenado clássico: escrito uma vez, dispara em
 * todo mundo.
 *
 * O teste é textual porque palm.html não é módulo: é uma página servida pelo
 * servidor Node da Ponte, com o script inline. Não dá pra importar e
 * executar — então checamos a forma do código, que é o que muda quando
 * alguém acrescenta um campo novo esquecendo o escape.
 */
const PALM = join(__dirname, "../../ponte/palm.html");
const fonte = readFileSync(PALM, "utf8");

/** Remove chamadas `escapar(...)` inteiras, respeitando parênteses aninhados. */
function semEscapar(linha) {
  let saida = "";
  let i = 0;
  while (i < linha.length) {
    const inicio = linha.indexOf("escapar(", i);
    if (inicio < 0) {
      saida += linha.slice(i);
      break;
    }
    saida += linha.slice(i, inicio);
    let profundidade = 0;
    let j = inicio + "escapar".length;
    for (; j < linha.length; j++) {
      if (linha[j] === "(") profundidade++;
      else if (linha[j] === ")") {
        profundidade--;
        if (profundidade === 0) break;
      }
    }
    i = j + 1;
  }
  return saida;
}

/** Linhas de código (sem comentário) que abrem uma tag HTML numa string. */
function linhasQueMontamHtml() {
  return fonte
    .split("\n")
    .map((linha, n) => ({ n: n + 1, texto: linha }))
    .filter(({ texto }) => !texto.trim().startsWith("//"))
    .filter(({ texto }) => texto.includes('"<'));
}

describe("Palm — todo dado do banco é escapado antes de virar HTML", () => {
  it("o escapador existe e cobre os cinco caracteres perigosos", () => {
    expect(fonte).toMatch(/function escapar\(/);
    for (const alvo of ["&", "<", ">", '"', "'"]) {
      expect(fonte.includes(alvo)).toBe(true);
    }
    // Ordem importa: o & tem que ser trocado PRIMEIRO, senão o escape dos
    // outros vira texto quebrado (&lt; viraria &amp;lt;).
    const corpo = fonte.slice(fonte.indexOf("function escapar("));
    const posAmp = corpo.indexOf("&amp;");
    const posLt = corpo.indexOf("&lt;");
    expect(posAmp).toBeGreaterThan(-1);
    expect(posLt).toBeGreaterThan(posAmp);
  });

  it("nenhuma linha concatena campo de TEXTO cru dentro de HTML", () => {
    // Só os campos que carregam texto livre. `i.id` e `i.qty` também entram
    // em HTML aqui, e de propósito ficam de fora: `products.id` é BIGINT e
    // `qty` é contador do próprio script — nenhum dos dois passa por
    // digitação. Se um dia virarem texto, esta lista é onde se acrescenta.
    const CAMPOS_DE_TEXTO =
      /\+\s*\w+\.(name|emoji|category|obs|observacao|comanda|rotulo|cliente|descricao)\b|\w+\.(name|emoji|category|obs|observacao|comanda|rotulo|cliente|descricao)\s*\+/;
    const cruas = linhasQueMontamHtml()
      .map(({ n, texto }) => ({ n, limpo: semEscapar(texto) }))
      .filter(({ limpo }) => CAMPOS_DE_TEXTO.test(limpo))
      .map(({ n }) => n);
    // Se falhar, a linha citada injeta texto do banco direto no innerHTML.
    expect(cruas).toEqual([]);
  });

  it("o emoji do produto e o do carrinho passam por escapar()", () => {
    const comEmoji = fonte
      .split("\n")
      .filter((linha) => !linha.trim().startsWith("//"))
      .filter((linha) => linha.includes('"<') && /\.emoji\b/.test(linha));
    expect(comEmoji.length).toBe(2); // grid do cardápio e lista do carrinho
    for (const linha of comEmoji) {
      expect(linha).toMatch(/escapar\(\w+\.emoji\)/);
    }
  });

  it("nome e categoria continuam escapados — o escape antigo não se perdeu", () => {
    expect(fonte).toMatch(/escapar\(p\.name\)/);
    expect(fonte).toMatch(/escapar\(i\.name\)/);
    expect(fonte).toMatch(/escapar\(c\)/);
  });
});
