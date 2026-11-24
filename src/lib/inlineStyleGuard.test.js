import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync, writeFileSync } from "fs";
import { join, relative, sep } from "path";
import { contarEstiloInline } from "../../scripts/contarEstiloInline.mjs";

/**
 * Guard do estilo inline (fase 5 do plano de refatoração, tarefa 5.1).
 *
 * A regra é do projeto (decisões 018 e 023, ADR-007): estilo não fica acoplado
 * à marcação. O padrão é `.css` co-localizado, com cor, espaço e tipografia nas
 * variáveis `--gm-*`, que cada estabelecimento sobrescreve (white-label). O
 * único `style={}` permitido é o que só atribui variável CSS a partir de dado:
 * `style={{ "--gm-largura": `${x}px` }}`.
 *
 * Por que um teste: é a mesma lição do `travessaoGuard`. Estilo inline é escrito
 * no meio de outra tarefa, com pressa, e é aí que o hábito vence a regra.
 *
 * Como funciona: a contagem de cada arquivo está em
 * `inlineStyleGuard.linhaDeBase.json`. O teste falha se um arquivo SOBE, se um
 * arquivo novo aparece com estilo inline, e também se um arquivo DESCE sem a
 * linha de base acompanhar: assim ela nunca guarda folga e só encolhe. Para
 * atualizar depois de tirar estilo de um arquivo:
 *
 *   GERAR_LINHA_DE_BASE=1 npx vitest run src/lib/inlineStyleGuard.test.js
 *
 * Lê a árvore de sintaxe, não o texto: conta todo atributo `style` (objeto,
 * variável ou expressão), menos o objeto que só tem chaves `"--..."`.
 */

const RAIZ = join(__dirname, "..");
const LINHA_DE_BASE = join(__dirname, "inlineStyleGuard.linhaDeBase.json");
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

describe("estilo inline não cresce (fase 5)", () => {
  const atual = contagemAtual();

  if (process.env.GERAR_LINHA_DE_BASE) {
    writeFileSync(LINHA_DE_BASE, JSON.stringify(atual, null, 2) + "\n");
  }

  const base = JSON.parse(readFileSync(LINHA_DE_BASE, "utf8"));

  it("nenhum arquivo ganha estilo inline", () => {
    const subiram = Object.entries(atual)
      .filter(([arq, n]) => n > (base[arq] ?? 0))
      .map(([arq, n]) => `${arq}: ${base[arq] ?? 0} para ${n}`);
    expect(subiram, "Estilo vai para o .css do componente, com var(--gm-*)").toEqual([]);
  });

  it("a linha de base acompanha o que já saiu (só encolhe)", () => {
    const desceram = Object.entries(base)
      .filter(([arq, n]) => (atual[arq] ?? 0) < n)
      .map(([arq, n]) => `${arq}: ${n} para ${atual[arq] ?? 0}`);
    expect(desceram, "Rode com GERAR_LINHA_DE_BASE=1 para registrar a queda").toEqual([]);
  });
});
