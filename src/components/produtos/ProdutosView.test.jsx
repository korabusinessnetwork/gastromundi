// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/context/AppContext", async () => {
  const { mockUseApp } = await import("@/test/mockApp");
  return { useApp: mockUseApp, AppProvider: ({ children }) => children };
});

const { mockSupabase } = vi.hoisted(() => ({ mockSupabase: { current: null } }));

vi.mock("@/lib/supabase", async () => {
  const { createMockSupabase } = await import("@/test/mockSupabase");
  mockSupabase.current = createMockSupabase();
  return { supabase: mockSupabase.current };
});

vi.mock("@/lib/logger", () => ({ logAction: vi.fn() }));

import { setAppMock } from "@/test/mockApp";
import ProdutosView from "./ProdutosView";

const PRODUTO = { id: 1, name: "X-Burguer", price: 20, category: "Lanches", emoji: "🍔" };

/** Responde a leitura de `config` (categorias extras) e trava/libera o upsert. */
function configuracao({ extras = ["Lanches"], erroLeitura = null, erroGravacao = null } = {}) {
  mockSupabase.current.setTableHandler("config", ({ method }) => {
    if (method === "select") {
      return erroLeitura
        ? { data: null, error: erroLeitura }
        : { data: { value: extras }, error: null };
    }
    if (method === "upsert") {
      return { data: null, error: erroGravacao };
    }
    return undefined;
  });
}

async function abrirCategorias(user) {
  await user.click(screen.getByRole("button", { name: /categorias/i }));
  return screen.findByText("Nova Categoria");
}

let updateProduct;

beforeEach(() => {
  mockSupabase.current.reset();
  updateProduct = vi.fn(() => Promise.resolve({ error: null }));
  setAppMock({ products: [PRODUTO], updateProduct });
  configuracao();
});

describe("ProdutosView — categorias com leitura falha", () => {
  it("avisa e trava a edição quando não deu para ler as categorias", async () => {
    const user = userEvent.setup();
    configuracao({ erroLeitura: { message: "permission denied", code: "42501" } });
    render(<ProdutosView />);
    await abrirCategorias(user);

    expect(screen.getByRole("alert")).toHaveTextContent(/não deu para carregar as categorias personalizadas/i);
    await user.type(screen.getByPlaceholderText(/ex: bebidas/i), "Sobremesas");
    expect(screen.getByRole("button", { name: "Adicionar" })).toBeDisabled();
  });

  it("linha sem resultado (PGRST116) é lista vazia, não falha", async () => {
    const user = userEvent.setup();
    configuracao({ erroLeitura: { message: "no rows", code: "PGRST116" } });
    render(<ProdutosView />);
    await abrirCategorias(user);

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await user.type(screen.getByPlaceholderText(/ex: bebidas/i), "Sobremesas");
    expect(screen.getByRole("button", { name: "Adicionar" })).toBeEnabled();
  });
});

describe("ProdutosView — criar categoria", () => {
  it("gravação recusada desfaz a categoria e avisa", async () => {
    const user = userEvent.setup();
    configuracao({ erroGravacao: { message: "rls" } });
    render(<ProdutosView />);
    await abrirCategorias(user);

    await user.type(screen.getByPlaceholderText(/ex: bebidas/i), "Sobremesas");
    await user.click(screen.getByRole("button", { name: "Adicionar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/não deu para criar a categoria "sobremesas"/i);
    const lista = document.querySelector(".produtos-view__cat-lista");
    expect(within(lista).queryByText("Sobremesas")).not.toBeInTheDocument();
  });

  it("gravação boa cria a categoria e limpa o campo", async () => {
    const user = userEvent.setup();
    render(<ProdutosView />);
    await abrirCategorias(user);

    await user.type(screen.getByPlaceholderText(/ex: bebidas/i), "Sobremesas");
    await user.click(screen.getByRole("button", { name: "Adicionar" }));

    const lista = document.querySelector(".produtos-view__cat-lista");
    await waitFor(() => expect(within(lista).getByText("Sobremesas")).toBeInTheDocument());
    expect(screen.getByPlaceholderText(/ex: bebidas/i)).toHaveValue("");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("ProdutosView — excluir categoria", () => {
  async function abrirConfirmacaoDeExcluir(user) {
    await abrirCategorias(user);
    const lista = document.querySelector(".produtos-view__cat-lista");
    const linha = within(lista).getByText("Lanches").closest(".produtos-view__cat-item");
    await user.click(within(linha).getAllByRole("button").at(-1)); // lixeira
    return screen.findByText("Excluir categoria?");
  }

  it("gravação recusada não mexe em produto nenhum", async () => {
    const user = userEvent.setup();
    configuracao({ erroGravacao: { message: "rls" } });
    render(<ProdutosView />);
    await abrirConfirmacaoDeExcluir(user);

    await user.click(screen.getByRole("button", { name: /mover e excluir/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/não deu para excluir "lanches". nada foi alterado/i);
    // O produto NÃO pode ter sido jogado em "Sem Categoria" antes de a lista
    // ser gravada: essa era a perda silenciosa da ordem antiga.
    expect(updateProduct).not.toHaveBeenCalled();
    const lista = document.querySelector(".produtos-view__cat-lista");
    expect(within(lista).getByText("Lanches")).toBeInTheDocument();
  });

  it("gravação boa move os produtos para Sem Categoria", async () => {
    const user = userEvent.setup();
    render(<ProdutosView />);
    await abrirConfirmacaoDeExcluir(user);

    await user.click(screen.getByRole("button", { name: /mover e excluir/i }));

    await waitFor(() => expect(updateProduct).toHaveBeenCalledWith(1, { category: "Sem Categoria" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("produto que não aceitou a troca vira aviso", async () => {
    const user = userEvent.setup();
    updateProduct.mockResolvedValue({ error: { message: "rls" } });
    render(<ProdutosView />);
    await abrirConfirmacaoDeExcluir(user);

    await user.click(screen.getByRole("button", { name: /mover e excluir/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/1 produto continuou em "lanches"/i);
  });
});

describe("ProdutosView — renomear categoria", () => {
  async function abrirEdicao(user) {
    await abrirCategorias(user);
    const lista = document.querySelector(".produtos-view__cat-lista");
    const linha = within(lista).getByText("Lanches").closest(".produtos-view__cat-item");
    const botoes = within(linha).getAllByRole("button");
    await user.click(botoes[0]); // lápis
    return within(lista).getByDisplayValue("Lanches");
  }

  it("gravação recusada não renomeia nem mexe nos produtos", async () => {
    const user = userEvent.setup();
    configuracao({ erroGravacao: { message: "rls" } });
    render(<ProdutosView />);
    const input = await abrirEdicao(user);

    await user.clear(input);
    await user.type(input, "Sanduíches{Enter}");

    expect(await screen.findByRole("alert")).toHaveTextContent(/não deu para renomear "lanches". nada foi alterado/i);
    expect(updateProduct).not.toHaveBeenCalled();
  });

  it("gravação boa renomeia e move os produtos", async () => {
    const user = userEvent.setup();
    render(<ProdutosView />);
    const input = await abrirEdicao(user);

    await user.clear(input);
    await user.type(input, "Sanduíches{Enter}");

    await waitFor(() => expect(updateProduct).toHaveBeenCalledWith(1, { category: "Sanduíches" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
