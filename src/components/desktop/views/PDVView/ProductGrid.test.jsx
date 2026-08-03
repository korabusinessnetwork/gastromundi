// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import ProductGrid from "./ProductGrid";

/**
 * O PDV do primeiro dia.
 *
 * Estabelecimento recém-provisionado abre o PDV com zero produto. Até aqui a
 * tela dizia "Nenhum produto nesta categoria" — uma frase que mente (não há
 * categoria nenhuma) e não diz o que fazer. É a primeira tela que o cliente
 * comprado vê, e ela precisa apontar o próximo passo sozinha
 * (CLAUDE.md, princípio nº 1).
 *
 * Os dois vazios são coisas diferentes e não podem voltar a se confundir:
 * catálogo vazio orienta o cadastro; categoria vazia é só filtro sem
 * resultado.
 */

const PRODUTO = { id: 1, name: "Café", price: 5, category: "Bebidas" };

describe("ProductGrid — catálogo vazio (estabelecimento novo)", () => {
  it("explica o vazio e aponta onde cadastrar", () => {
    render(<ProductGrid products={[]} onAdd={vi.fn()} />);

    expect(screen.getByText("Seu cardápio ainda está vazio")).toBeInTheDocument();
    expect(screen.getByText(/Cadastro Produtos/)).toBeInTheDocument();
    expect(screen.queryByText("Nenhum produto nesta categoria")).not.toBeInTheDocument();
  });

  it("não mostra a barra de categorias com o chip 'Todos' sozinho", () => {
    // Chip que não filtra nada só disputa atenção com a orientação.
    render(<ProductGrid products={[]} onAdd={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Todos" })).not.toBeInTheDocument();
  });
});

describe("ProductGrid — categoria vazia (catálogo com itens)", () => {
  it("mantém a mensagem de filtro e a barra de categorias", () => {
    // Com produto cadastrado a barra existe e nenhuma categoria fica vazia
    // por padrão — o que importa aqui é que o texto de catálogo vazio NÃO
    // aparece quando há cardápio.
    render(<ProductGrid products={[PRODUTO]} onAdd={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Todos" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bebidas" })).toBeInTheDocument();
    expect(screen.queryByText("Seu cardápio ainda está vazio")).not.toBeInTheDocument();
  });
});
