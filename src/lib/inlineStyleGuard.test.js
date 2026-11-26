import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative, sep } from "path";
import { contarEstiloInline } from "../../scripts/contarEstiloInline.mjs";

/**
 * Guard do estilo inline (fase 5 do plano de refatoração, tarefas 5.1 a 5.28).
 *
 * A regra é do projeto (decisões 018 e 023, ADR-007): estilo não fica acoplado
 * à marcação. O padrão é `.css` co-localizado, com cor, espaço e tipografia nas
 * variáveis `--gm-*`, que cada estabelecimento sobrescreve (white-label). O
 * único `style={}` permitido é o que só atribui variável CSS a partir de dado:
 * `style={{ "--largura": `${x}px` }}`.
 *
 * Por que um teste: é a mesma lição do `travessaoGuard`. Estilo inline é escrito
 * no meio de outra tarefa, com pressa, e é aí que o hábito vence a regra.
 *
 * Como funciona: a fase 5 levou a contagem de 1.526 a zero, arquivo por
 * arquivo, com uma linha de base que só encolhia. Ela zerou na refatoração
 * 5.28 e saiu: agora a regra é zero, sem lista de exceções. Valor que vem de
 * dado vira variável CSS; estado vira classe modificadora (ver
 * `memory/patterns.md`).
 *
 * Lê a árvore de sintaxe, não o texto: conta todo atributo `style` (objeto,
 * variável ou expressão), menos o objeto que só tem chaves `"--..."`.
 */
const RAIZ = join(__dirname, "..");
const IGNORAR = [/\.test\.(jsx|js)$/, /[/\\]test[/\\]/];

function arquivos(dir, saida = []) {
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) arquivos(caminho, saida);
    else if (/\.jsx$/.test(nome) && !IGNORAR.some((r) => r.test(caminho))) saida.push(caminho);
  }
  return saida;
}

function contagemAtual() {
  const mapa = {};
  for (const caminho of arquivos(RAIZ)) {
    const n = contarEstiloInline(readFileSync(caminho, "utf8"));
    if (n > 0) mapa[relative(RAIZ, caminho).split(sep).join("/")] = n;
  }
  return Object.fromEntries(Object.entries(mapa).sort(([a], [b]) => a.localeCompare(b)));
}

describe("o sistema não tem estilo inline (fase 5)", () => {
  it("nenhum arquivo tem style={{}} que não seja só variável CSS", () => {
    const encontrados = Object.entries(contagemAtual()).map(([arq, n]) => `${arq}: ${n}`);
    expect(encontrados, "Estilo vai para o .css do componente, com var(--gm-*); dado vira variável CSS").toEqual([]);
  });
});
