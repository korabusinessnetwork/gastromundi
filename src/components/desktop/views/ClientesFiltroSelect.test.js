import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * Guard do `<select>` de mês de aniversário, na tela de Clientes.
 *
 * O defeito: a lista de meses abria com fundo BRANCO e o texto claro por
 * cima — ilegível. Não era falta de estilo, era estilo demais. A baseline
 * de inputs (src/styles/inputs.css) já pinta todo `select` com
 * `--gm-input-bg` e aplica `color-scheme`, mas com especificidade (0,0,1);
 * a classe da tela, com (0,1,0), ganhava dela e zerava o fundo com
 * `background: none`. Controle transparente faz o popup NATIVO cair para o
 * branco do sistema, e o texto continua claro porque a cor é herdada.
 *
 * Isso mora em CSS e não aparece em teste de componente: jsdom não faz
 * layout nem desenha popup nativo. Daí o guard ler o arquivo.
 */

const RAIZ = join(__dirname, "..", "..", "..", "..");
const ler = (...p) => readFileSync(join(RAIZ, ...p), "utf8");

/** Sem comentários: o comentário que EXPLICA o bug cita a linha do bug. */
const semComentarios = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");

/** Corpo da regra `seletor { ... }`, já sem comentários. */
function blocoDe(cssBruto, seletor) {
  const css = semComentarios(cssBruto);
  const i = css.indexOf(`${seletor} {`);
  if (i === -1) return "";
  return css.slice(i, css.indexOf("}", i));
}

const css = ler("src", "components", "desktop", "views", "ClientesView.css");
const baseline = ler("src", "styles", "inputs.css");

describe("o filtro de mês fica legível no tema escuro", () => {
  it("a classe do select NÃO zera o fundo", () => {
    // É a linha exata que causou o bug. Sem fundo próprio, quem pinta é a
    // baseline — e aí o popup nativo segue o tema.
    const bloco = blocoDe(css, ".clientes-view__select");
    expect(bloco).not.toMatch(/background\s*:\s*(none|transparent)/);
  });

  it("a baseline continua pintando todo select e aplicando color-scheme", () => {
    // Se alguém tirar isto de inputs.css, o select volta a depender da
    // classe da tela — que agora, de propósito, não define fundo nenhum.
    expect(baseline).toMatch(/background-color:\s*var\(--gm-input-bg\)/);
    expect(baseline).toMatch(/color-scheme:\s*var\(--gm-color-scheme\)/);
  });

  it("a própria opção é pintada, para o navegador que ignora color-scheme", () => {
    const bloco = blocoDe(css, ".clientes-view__select option");
    expect(bloco).toMatch(/background:\s*var\(--gm-/);
    expect(bloco).toMatch(/color:\s*var\(--gm-/);
  });
});
