import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join, sep, relative } from "path";
import { parse } from "@babel/parser";

/**
 * Guard da regra absoluta de escrita do dono: **em texto de tela em português,
 * travessão não entra, vírgula entra.**
 *
 * Por que um teste e não uma anotação no `CLAUDE.md`: a regra já estava escrita
 * e continuou sendo quebrada, inclusive por mim, porque nada a cobrava. Texto
 * de tela é escrito no meio de outra tarefa, e é exatamente aí que o hábito
 * vence a regra. Este arquivo é o que faz a regra existir de verdade.
 *
 * O que ele olha: só o que chega na tela. `JSXText`, string literal e pedaço de
 * template literal, lidos da árvore de sintaxe e não por grep. Comentário de
 * código fica de fora de propósito: comentário não é front, e proibir travessão
 * lá só tornaria a regra irritante o bastante para ser ignorada.
 *
 * As duas formas que NÃO são pontuação e continuam valendo:
 *
 *   1. **O marcador de célula vazia.** `{valor ?? "—"}` numa tabela quer dizer
 *      "não há valor". Vírgula sozinha numa célula não quer dizer nada. A
 *      comparação é exata, sem `trim`, porque `" — "` com espaço dos dois lados
 *      é outra coisa: é separador dentro de uma frase montada
 *      (`[bairro, taxa].join(" — ")` vira "Centro — R$ 5,00" na tela), e isso é
 *      pontuação, tem de virar vírgula. Confundir os dois foi o erro da
 *      primeira varredura.
 *   2. **A frase que cita o próprio símbolo**, como "clique no “—” da coluna
 *      Mensalidade". Trocar ali produziria uma instrução falsa, porque a tela
 *      continua mostrando o travessão naquela célula.
 *
 * E uma exceção nomeada, que não é forma e sim origem: `src/lib/assinatura.js`
 * duplica byte a byte uma frase que o BANCO levanta (`RAISE EXCEPTION` na
 * `20260913`), e existe outro guard para as duas nunca divergirem. Trocar só do
 * lado do JS faria o usuário ler duas frases diferentes para a mesma recusa.
 * Ela sai quando a mensagem do banco sair, e há mais 21 mensagens de erro em
 * migrations no mesmo caso, que é decisão de produto pendente (custa reaplicar
 * migration em produção por causa de pontuação).
 */

const RAIZ = join(__dirname, "..");

/** Origem do texto que o usuário lê. Teste e mock ficam de fora. */
const IGNORAR = [/\.test\.(jsx|js)$/, /[/\\]test[/\\]/];

/** A exceção nomeada, com o porquê ao lado dela no próprio arquivo. */
const EXCECOES = new Set(["lib/assinatura.js"]);

function arquivos(dir, saida = []) {
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) {
      arquivos(caminho, saida);
    } else if (/\.(jsx|js)$/.test(nome) && !IGNORAR.some((r) => r.test(caminho))) {
      saida.push(caminho);
    }
  }
  return saida;
}

/**
 * `"—"` é marcador de vazio; `" — "` é separador, e separador é pontuação.
 *
 * Em JSX o marcador nasce como `<td>{valor ?? "—"}</td>` (string literal, a
 * comparação é exata) ou como o símbolo escrito direto no corpo do elemento,
 * `<td>\n  —\n</td>`, e aí o texto vem com a indentação em volta. O `trim` é
 * para esse segundo caso, e é por isso que ele não pode valer sozinho: o
 * separador `<span> — {obs}</span>` também fica igual ao marcador depois do
 * trim, e ele é exatamente a forma que a regra proíbe. O que separa os dois é
 * estar SOZINHO no elemento: marcador é todo o conteúdo da célula, separador
 * tem uma expressão do lado.
 */
function marcadorDeVazio(texto, tipo, sozinhoNoElemento = false) {
  if (tipo !== "JSXText") return texto === "—";
  return sozinhoNoElemento && texto.trim() === "—";
}

/**
 * Filho de JSX que é o único TEXTO do elemento, ignorando indentação.
 *
 * Pontuação separa dois pedaços de texto, então o que desqualifica o marcador é
 * um irmão que também produz texto: outro `JSXText` com conteúdo, ou uma
 * expressão (`{item.obs}`). Ícone irmão (`<LuClock />`) não produz texto e não
 * desqualifica: `<span><LuClock /> —</span>` continua sendo "não há valor", e
 * escrever vírgula ali daria "🕐 ,".
 */
function textoMarcadorDoElemento(no) {
  if (no.type !== "JSXElement" && no.type !== "JSXFragment") return null;
  const textuais = (no.children ?? []).filter(
    (c) =>
      (c.type === "JSXText" && c.value.trim() !== "") ||
      c.type === "JSXExpressionContainer",
  );
  if (textuais.length !== 1) return null;
  return textuais[0].type === "JSXText" ? textuais[0] : null;
}

/** "clique no “—” da coluna": a frase fala DO símbolo, não usa o símbolo. */
function citaOSimbolo(texto) {
  return /[“"']\s*—\s*[”"']/.test(texto);
}

function textoDeTela(no) {
  if (no.type === "JSXText") return no.value;
  if (no.type === "StringLiteral") return no.value;
  if (no.type === "TemplateElement") return no.value.raw;
  return null;
}

function varrer(caminho) {
  const fonte = readFileSync(caminho, "utf8");
  if (!fonte.includes("—")) return [];

  const ast = parse(fonte, { sourceType: "module", plugins: ["jsx"] });
  const achados = [];

  // Nós de texto que são o conteúdo inteiro do elemento pai. A travessia é de
  // cima para baixo, então o pai sempre carimba antes de o filho ser visitado.
  const sozinhos = new Set();

  const visitar = (no) => {
    if (!no || typeof no !== "object") return;
    if (Array.isArray(no)) return no.forEach(visitar);
    if (!no.type) return;

    const marcador = textoMarcadorDoElemento(no);
    if (marcador) sozinhos.add(marcador);

    const texto = textoDeTela(no);
    if (texto?.includes("—") && !marcadorDeVazio(texto, no.type, sozinhos.has(no)) && !citaOSimbolo(texto)) {
      achados.push({
        linha: no.loc.start.line,
        trecho: texto.replace(/\s+/g, " ").trim().slice(0, 90),
      });
    }

    for (const chave of Object.keys(no)) {
      if (chave === "loc" || chave === "start" || chave === "end") continue;
      visitar(no[chave]);
    }
  };

  visitar(ast.program.body);
  return achados;
}

describe("regra absoluta: travessão não entra em texto de tela", () => {
  it("nenhum arquivo de front usa travessão como pontuação", () => {
    const problemas = [];

    for (const caminho of arquivos(RAIZ)) {
      const rel = relative(RAIZ, caminho).split(sep).join("/");
      if (EXCECOES.has(rel)) continue;
      for (const a of varrer(caminho)) {
        problemas.push(`${rel}:${a.linha}  ${a.trecho}`);
      }
    }

    // A mensagem é a metade útil deste teste: quem quebrar precisa ver o que
    // escrever no lugar, não só que errou.
    expect(
      problemas,
      problemas.length
        ? `Travessão em texto de tela. Troque por vírgula:\n\n${problemas.join("\n")}\n\n` +
          `Se o travessão for o marcador de célula vazia ("—" sozinho) ou uma frase ` +
          `que cita o símbolo, ele já é aceito e o teste não acusaria; confira se não ` +
          `sobrou espaço em volta, porque " — " é separador e conta como pontuação.`
        : undefined,
    ).toEqual([]);
  });

  it("o marcador de célula vazia continua permitido", () => {
    // Sem isto, alguém "consertaria" o guard achando que ele deveria pegar tudo,
    // e a tabela passaria a mostrar vírgula onde não há valor.
    expect(marcadorDeVazio("—", "StringLiteral")).toBe(true);
    // Símbolo escrito no corpo da célula, com a indentação em volta e sozinho.
    expect(marcadorDeVazio("\n  —\n", "JSXText", true)).toBe(true);
    // O separador NÃO é marcador, e esta é a linha que separa os dois casos.
    expect(marcadorDeVazio(" — ", "StringLiteral")).toBe(false);
    expect(marcadorDeVazio("Centro — R$ 5,00", "StringLiteral")).toBe(false);
    // O furo que existia: em JSX o separador vem sempre com espaço em volta, e
    // com `trim` sozinho ele passava por marcador. O que o desempata é ter uma
    // expressão do lado, ou seja, não estar sozinho no elemento.
    expect(marcadorDeVazio(" — ", "JSXText", false)).toBe(false);
    expect(marcadorDeVazio("\n  —\n", "JSXText", false)).toBe(false);
  });

  it("separador tem texto do lado; marcador, no máximo um ícone", () => {
    const jsx = (fonte) =>
      parse(`const a = ${fonte};`, { sourceType: "module", plugins: ["jsx"] })
        .program.body[0].declarations[0].init;

    // `<span> — {item.obs}</span>` na tela é "Coca-Cola — sem gelo": travessão
    // como pontuação, o caso que a regra proíbe.
    expect(textoMarcadorDoElemento(jsx("<span> — {obs}</span>"))).toBeNull();
    // Texto dos dois lados no MESMO nó: aqui quem desqualifica é o conteúdo, o
    // marcador é só o símbolo e nada mais.
    expect(marcadorDeVazio("Centro — Zona Sul", "JSXText", true)).toBe(false);

    // `<td>\n  —\n</td>` é o marcador de célula vazia: nada do lado.
    expect(textoMarcadorDoElemento(jsx("<td>\n  —\n</td>"))).not.toBeNull();
    // Marcador ao lado de um ÍCONE segue marcador: o ícone não produz texto, e
    // vírgula ali ("🕐 ,") não quereria dizer nada.
    expect(textoMarcadorDoElemento(jsx("<span><LuClock /> —</span>"))).not.toBeNull();
  });

  it("frase que cita o símbolo continua permitida", () => {
    expect(citaOSimbolo('Clique no “—” da coluna Mensalidade')).toBe(true);
    expect(citaOSimbolo("Escreva o motivo — ele fica gravado")).toBe(false);
  });
});
