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

describe("ProductGrid, produto desabilitado no cadastro", () => {
  // O catálogo do AppContext traz os desabilitados junto de propósito —
  // senão eles sumiriam da tela de cadastro e não haveria como religá-los.
  // O corte é aqui, na tela que vende: se esta filtragem cair, o item
  // "acabou hoje" volta a ser vendido no balcão.
  const PARADO = { id: 2, name: "Chopp", price: 12, category: "Bebidas", active: false };

  it("não é oferecido para venda", () => {
    render(<ProductGrid products={[PRODUTO, PARADO]} onAdd={vi.fn()} />);
    expect(screen.getByText("Café")).toBeInTheDocument();
    expect(screen.queryByText("Chopp")).not.toBeInTheDocument();
  });

  it("uma categoria só de desabilitados não vira aba vazia", () => {
    const soParado = { id: 3, name: "Vinho", price: 60, category: "Vinhos", active: false };
    render(<ProductGrid products={[PRODUTO, soParado]} onAdd={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Bebidas" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Vinhos" })).not.toBeInTheDocument();
  });

  it("catálogo inteiro desabilitado orienta o cadastro, não diz 'categoria vazia'", () => {
    // Sem isto a tela mostraria a barra de categorias e um vazio de filtro,
    // como se fosse só a aba errada — e o dono não saberia o que houve.
    render(<ProductGrid products={[PARADO]} onAdd={vi.fn()} />);
    expect(screen.getByText("Seu cardápio ainda está vazio")).toBeInTheDocument();
  });

  it("produto sem o campo `active` continua à venda (cadastro antigo)", () => {
    render(<ProductGrid products={[PRODUTO]} onAdd={vi.fn()} />);
    expect(screen.getByText("Café")).toBeInTheDocument();
  });
});
