import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative } from "path";
import { describe, it, expect } from "vitest";

/**
 * Tarefas 2.8 e 2.10 do plano de refatoração: a fachada `useApp()` não existe.
 *
 * Ela entregava o contexto inteiro, recriado a cada render: tela que a usava
 * era redesenhada a cada mudança do app, inclusive o PDV no meio da venda. As
 * telas leem pelos ganchos de cada assunto (`useSessao`, `useCaixa`...), e os
 * testes do próprio contexto usam `useContextoCompleto()`, que só existe em
 * `src/test/`.
 */

const SRC = join(process.cwd(), "src");
const ESTE_ARQUIVO = "src/context/telasSemUseApp.test.js";

function listar(dir) {
  return readdirSync(dir).flatMap((nome) => {
    const caminho = join(dir, nome);
    return statSync(caminho).isDirectory() ? listar(caminho) : [caminho];
  });
}

describe("a fachada useApp não existe (tarefas 2.8 e 2.10)", () => {
  it("nenhum arquivo do app, nem de teste, chama ou declara useApp", () => {
    const usando = listar(SRC)
      .filter((f) => /\.(js|jsx)$/.test(f))
      .map((f) => relative(process.cwd(), f))
      .filter((f) => f !== ESTE_ARQUIVO)
      .filter((f) => /\buseApp\b/.test(
        // Comentários citam o nome; só código conta.
        readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, ""),
      ));
    expect(usando).toEqual([]);
  });

  it("o AppContext não exporta mais a fachada", async () => {
    const modulo = await import("@/context/AppContext");
    expect(modulo.useApp).toBeUndefined();
  });
});
