import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync, writeFileSync } from "fs";
import { join, relative, sep } from "path";
import { contarEmoji } from "../../scripts/contarEmoji.mjs";

/**
 * Guard da regra do dono: **o sistema não tem emoji.** Pedido de 2026-11-25:
 * "não vamos ter emotes dentro do sistema".
 *
 * Vale para o que o código escreve na tela, no cupom e na planilha: rótulo,
 * aviso, ícone de reserva ("📦" quando falta ícone), dado de demonstração.
 * Ícone de interface é componente de ícone (`react-icons/lu`), que segue a cor
 * do tema; emoji não segue tema, muda de desenho de aparelho para aparelho e
 * vira quadrado na impressora térmica.
 *
 * Como funciona: o mesmo molde do `inlineStyleGuard`. A contagem de cada
 * arquivo está em `emojiGuard.linhaDeBase.json`. O teste falha se um arquivo
 * SOBE, se um arquivo novo aparece com emoji, e se um arquivo DESCE sem a linha
 * de base acompanhar: assim ela só encolhe, até zerar. Para registrar a queda:
 *
 *   GERAR_LINHA_DE_BASE=1 npx vitest run src/lib/emojiGuard.test.js
 *
 * Lê a árvore de sintaxe, não o texto: conta emoji em texto JSX, string e
 * pedaço de template. Comentário fica de fora, como no guard do travessão.
 */

const RAIZ = join(__dirname, "..");
const LINHA_DE_BASE = join(__dirname, "emojiGuard.linhaDeBase.json");
const IGNORAR = [/\.test\.(jsx|js)$/, /[/\\]test[/\\]/];

function arquivos(dir, saida = []) {
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) arquivos(caminho, saida);
    else if (/\.(jsx|js)$/.test(nome) && !IGNORAR.some((r) => r.test(caminho))) saida.push(caminho);
  }
  return saida;
}

function contagemAtual() {
  const mapa = {};
  for (const caminho of arquivos(RAIZ)) {
    const n = contarEmoji(readFileSync(caminho, "utf8"));
    if (n > 0) mapa[relative(RAIZ, caminho).split(sep).join("/")] = n;
  }
  return Object.fromEntries(Object.entries(mapa).sort(([a], [b]) => a.localeCompare(b)));
}

describe("contarEmoji", () => {
  it("conta emoji em texto JSX, string e template", () => {
    expect(contarEmoji("const a = <div>🧾 Recibo</div>;")).toBe(1);
    expect(contarEmoji('const a = p.emoji || "📦";')).toBe(1);
    expect(contarEmoji("const a = `⚠️ ${erro}`;")).toBe(1);
  });

  it("não conta comentário nem texto sem emoji", () => {
    expect(contarEmoji("// 🧾 recibo\nconst a = <div>Recibo</div>;")).toBe(0);
    expect(contarEmoji("const a = <div>Total → R$ 5,00 ✓</div>;")).toBe(0);
  });
});

describe("emoji não cresce no sistema", () => {
  const atual = contagemAtual();

  if (process.env.GERAR_LINHA_DE_BASE) {
    writeFileSync(LINHA_DE_BASE, JSON.stringify(atual, null, 2) + "\n");
  }

  const base = JSON.parse(readFileSync(LINHA_DE_BASE, "utf8"));

  it("nenhum arquivo ganha emoji", () => {
    const subiram = Object.entries(atual)
      .filter(([arq, n]) => n > (base[arq] ?? 0))
      .map(([arq, n]) => `${arq}: ${base[arq] ?? 0} para ${n}`);
    expect(subiram, "O sistema não tem emoji. Ícone de tela vem de react-icons/lu").toEqual([]);
  });

  it("a linha de base acompanha o que já saiu (só encolhe)", () => {
    const desceram = Object.entries(base)
      .filter(([arq, n]) => (atual[arq] ?? 0) < n)
      .map(([arq, n]) => `${arq}: ${n} para ${atual[arq] ?? 0}`);
    expect(desceram, "Rode com GERAR_LINHA_DE_BASE=1 para registrar a queda").toEqual([]);
  });
});
