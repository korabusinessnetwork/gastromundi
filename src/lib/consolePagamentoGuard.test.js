import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { parse } from "@babel/parser";

/**
 * Guard do caminho do dinheiro: no PDV, erro NÃO vai cru para o `console`.
 *
 * O que havia: `console.error("handleConfirmPayment error:", err?.message ?? err, err)`.
 * O terceiro argumento é o objeto inteiro. Um `PostgrestError` carrega
 * `details` e `hint` com o conteúdo da linha que violou a constraint, e um
 * erro vindo da cascata de pagamento carrega o payload da cobrança. O
 * `CLAUDE.md` proíbe logar dado financeiro, e o console de um PDV é um
 * terminal compartilhado onde ninguém raspa nada.
 *
 * Por que um teste e não uma nota: é a mesma lição do `travessaoGuard`. A
 * regra já estava escrita e foi quebrada porque nada a cobrava. Log de erro
 * é escrito no meio de outra tarefa, com pressa, e é aí que o hábito vence.
 *
 * O que ele cobra: nos arquivos do caminho do pagamento, todo argumento de
 * `console.*` que seja a variável de erro precisa passar por `resumoErro`.
 * String literal, template e o resto seguem livres.
 */

const RAIZ = join(__dirname, "..");

/** Onde a venda vira dinheiro. Não é o app inteiro de propósito: a regra
 *  vale em toda parte, mas cobrar no repositório todo transformaria este
 *  guard num varredor de refactor, e ele existe para proteger o caixa. */
const ARQUIVOS = [
  "components/desktop/views/PDVView/index.jsx",
  "components/desktop/views/PDVView/useFinalizarPagamento.js",
];

/** Nomes que, na prática, seguram o objeto de erro neste código. */
const NOMES_DE_ERRO = /^(err|erro|error|e|erroImpressao|erroGravar|erroVinculo)$/;

function ehConsole(callee) {
  return (
    callee?.type === "MemberExpression" &&
    callee.object?.type === "Identifier" &&
    callee.object.name === "console"
  );
}

/** `resumoErro(err)` é o jeito certo; qualquer outra chamada em volta não
 *  conta, para ninguém "resolver" embrulhando em `String()`. */
function envolvidoEmResumoErro(no) {
  return (
    no?.type === "CallExpression" &&
    no.callee?.type === "Identifier" &&
    no.callee.name === "resumoErro"
  );
}

function achadosDe(relativo) {
  const fonte = readFileSync(join(RAIZ, relativo), "utf8");
  const ast = parse(fonte, { sourceType: "module", plugins: ["jsx"] });
  const achados = [];

  const visitar = (no) => {
    if (!no || typeof no !== "object") return;
    if (Array.isArray(no)) return no.forEach(visitar);
    if (!no.type) return;

    if (no.type === "CallExpression" && ehConsole(no.callee)) {
      for (const arg of no.arguments) {
        if (envolvidoEmResumoErro(arg)) continue;
        // `err` solto, `err.message`, `err?.message ?? err`: em todos, o
        // objeto de erro aparece na expressão que vai ao console.
        const cruas = [];
        const procurar = (n) => {
          if (!n || typeof n !== "object") return;
          if (Array.isArray(n)) return n.forEach(procurar);
          if (n.type === "CallExpression" && envolvidoEmResumoErro(n)) return;
          if (n.type === "Identifier" && NOMES_DE_ERRO.test(n.name)) cruas.push(n.name);
          for (const chave of Object.keys(n)) {
            if (chave === "loc" || chave === "start" || chave === "end") continue;
            procurar(n[chave]);
          }
        };
        procurar(arg);
        if (cruas.length > 0) {
          achados.push({ linha: no.loc.start.line, variavel: cruas[0] });
        }
      }
    }

    for (const chave of Object.keys(no)) {
      if (chave === "loc" || chave === "start" || chave === "end") continue;
      visitar(no[chave]);
    }
  };

  visitar(ast.program.body);
  return achados;
}

describe("o caminho do pagamento não loga erro cru no console", () => {
  it.each(ARQUIVOS)("%s passa todo erro por resumoErro", (relativo) => {
    const achados = achadosDe(relativo);
    const detalhe = achados.map((a) => `linha ${a.linha}: console com \`${a.variavel}\` cru`).join("\n");
    expect(achados, `\n${relativo}\n${detalhe}\n`).toEqual([]);
  });

  it("o guard pega de verdade um console com erro cru", () => {
    // Sem esta conferência, um bug no visitador faria o teste passar sempre.
    const ast = parse('console.error("x:", err);', { sourceType: "module" });
    let achou = false;
    const visitar = (no) => {
      if (!no || typeof no !== "object") return;
      if (Array.isArray(no)) return no.forEach(visitar);
      if (no.type === "CallExpression" && ehConsole(no.callee)) {
        achou = no.arguments.some((a) => a.type === "Identifier" && NOMES_DE_ERRO.test(a.name));
      }
      for (const chave of Object.keys(no)) {
        if (chave === "loc" || chave === "start" || chave === "end") continue;
        visitar(no[chave]);
      }
    };
    visitar(ast.program.body);
    expect(achou).toBe(true);
  });
});
