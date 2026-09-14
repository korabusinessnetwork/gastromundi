import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join, relative } from "path";
import { parse } from "@babel/parser";

/**
 * Guard de sintaxe das Edge Functions: cada `.ts` de `supabase/functions`
 * tem de ser um módulo que o parser aceita.
 *
 * Por que existe. `reenviar-nfce/index.ts` passou meses sem compilar e
 * ninguém viu. O cabeçalho documentava o agendamento com um cron de
 * exemplo, um asterisco seguido de barra e de "5", dentro de um bloco de
 * comentário. Bloco de comentário termina no PRIMEIRO asterisco-barra,
 * então ele fechava no meio da frase e o resto do cabeçalho virava código.
 * O worker do reenvio fiscal não subiria em deploy nenhum. (Esta explicação
 * não escreve a sequência literal de propósito: escrevê-la aqui fecharia
 * este comentário pelo mesmo motivo. O caso exato está montado no último
 * teste do arquivo, onde ele é dado e não texto.)
 *
 * O buraco não era o erro, era não ter quem olhasse. As functions rodam no
 * Deno, fora do Vite e fora do `npm test`: o build do front não as toca, a
 * suíte não as importa (elas chamam `Deno.serve` no topo e importam de
 * URL), e o erro só apareceria no `supabase functions deploy`, que é passo
 * manual e raro. Quer dizer: entre escrever e descobrir podiam passar
 * meses, e passaram.
 *
 * O que ele NÃO é. Isto é análise sintática, não checagem de tipo: `const
 * x: number = "a"` passa aqui. Cobrir tipo exigiria o compilador do
 * TypeScript como dependência nova, e o defeito real que motivou o guard é
 * de sintaxe. Se um dia quisermos tipo, o lugar é outro.
 */

const RAIZ_FUNCTIONS = join(__dirname, "..", "..", "supabase", "functions");

/** As 9 entradas HTTP. Conferidas por nome para um glob que não casasse
 *  com nada não passar calado. */
const FUNCTIONS_ESPERADAS = [
  "cancelar-nfce",
  "emitir-nfce",
  "importar-dados",
  "inutilizar-nfce",
  "jarvas-assistente",
  "ler-cardapio-ia",
  "manage-user",
  "provisionar-estabelecimento",
  "reenviar-nfce",
];

function arquivosTs(dir, saida = []) {
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const caminho = join(dir, entrada.name);
    if (entrada.isDirectory()) arquivosTs(caminho, saida);
    else if (entrada.name.endsWith(".ts")) saida.push(caminho);
  }
  return saida;
}

const ARQUIVOS = arquivosTs(RAIZ_FUNCTIONS).sort();

/** @returns {null | { linha: number, coluna: number, msg: string }} */
function erroDeSintaxe(caminho) {
  try {
    parse(readFileSync(caminho, "utf8"), { sourceType: "module", plugins: ["typescript"] });
    return null;
  } catch (e) {
    return {
      linha: e.loc?.line ?? 0,
      coluna: e.loc?.column ?? 0,
      msg: String(e.message ?? e),
    };
  }
}

describe("as Edge Functions são módulos válidos", () => {
  it("achou os arquivos (glob vazio não passa como suíte verde)", () => {
    expect(ARQUIVOS.length).toBeGreaterThanOrEqual(FUNCTIONS_ESPERADAS.length);
  });

  it.each(FUNCTIONS_ESPERADAS)("a function %s tem index.ts e ele está na varredura", (nome) => {
    const esperado = join(RAIZ_FUNCTIONS, nome, "index.ts");
    expect(ARQUIVOS).toContain(esperado);
  });

  it.each(ARQUIVOS.map((c) => [relative(RAIZ_FUNCTIONS, c), c]))("%s compila", (_rotulo, caminho) => {
    const erro = erroDeSintaxe(caminho);
    const detalhe = erro ? `\nlinha ${erro.linha}, coluna ${erro.coluna}: ${erro.msg}\n` : "";
    expect(erro, detalhe).toBeNull();
  });

  it("o guard pega de verdade o defeito que o motivou", () => {
    // Sem esta conferência, um `parse` que engolisse erro faria o teste
    // passar sempre. O trecho abaixo é a forma exata do bug do
    // reenviar-nfce: o cron de exemplo fecha o comentário antes da hora.
    const comBug = [
      "/**",
      " * cron.schedule('reenvio-nfce','*/5 * * * *')",
      " */",
      "export const x = 1;",
    ].join("\n");
    expect(() => parse(comBug, { sourceType: "module", plugins: ["typescript"] })).toThrow();

    // E o mesmo texto com o `*` escapado, que é a correção, precisa passar.
    const corrigido = comBug.replace("'*/5", "'*\\/5");
    expect(() => parse(corrigido, { sourceType: "module", plugins: ["typescript"] })).not.toThrow();
  });
});
