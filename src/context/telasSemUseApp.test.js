import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative } from "path";
import { describe, it, expect } from "vitest";

/**
 * Tarefa 2.8 do plano de refatoração: nenhuma tela lê pela fachada `useApp()`.
 *
 * `useApp()` entrega o contexto inteiro, recriado a cada render: tela que o usa
 * é redesenhada a cada mudança do app, inclusive o PDV no meio da venda. As
 * telas leem pelos ganchos de cada assunto (`useSessao`, `useCaixa`...). A
 * fachada continua existindo só para os testes do próprio contexto, até a
 * tarefa 2.9 mover o estado para os provedores.
 */

const SRC = join(process.cwd(), "src");

function listar(dir) {
  return readdirSync(dir).flatMap((nome) => {
    const caminho = join(dir, nome);
    return statSync(caminho).isDirectory() ? listar(caminho) : [caminho];
  });
}

describe("telas sem useApp (tarefa 2.8)", () => {
  it("nenhum arquivo fora do contexto e dos testes chama useApp()", () => {
    const usando = listar(SRC)
      .filter((f) => /\.(js|jsx)$/.test(f) && !/\.test\.(js|jsx)$/.test(f))
      .map((f) => relative(process.cwd(), f))
      .filter((f) => !f.startsWith("src/context/") && !f.startsWith("src/test/"))
      .filter((f) => /\buseApp\s*\(/.test(
        // Comentários citam o nome; só código conta.
        readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, ""),
      ));
    expect(usando).toEqual([]);
  });
});
