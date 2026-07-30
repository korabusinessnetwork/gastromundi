// @vitest-environment jsdom
//
// Run 6, leva 9 — DL29: a foto que não carrega na primeira tela do cliente.
//
// O card já tinha um azulejo de emoji de reserva, mas ele só entrava quando
// o produto NÃO tinha foto. Quando tinha uma foto que falha ao carregar —
// arquivo apagado do bucket, permissão do Storage, link velho de um tenant
// migrado — o navegador desenhava o ícone de imagem quebrada. É a vitrine:
// a primeira coisa que um cliente anônimo vê do estabelecimento.
//
// Este arquivo não existia: CardapioLista.jsx era o outro arquivo da vitrine
// pública sem teste nenhum.
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// formatarPreco vem de @/lib/delivery, que importa o client (exige VITE_*).
vi.mock("@/lib/supabase", async () => {
  const { createMockSupabase } = await import("@/test/mockSupabase");
  return { supabase: createMockSupabase() };
});

import CardapioLista from "./CardapioLista";

const produto = (extra = {}) => ({
  produto_id: 1,
  nome: "Pizza Calabresa",
  preco: 25,
  categoria: "Pizzas",
  ...extra,
});

function montar(cardapio, onAbrir = vi.fn()) {
  const r = render(<CardapioLista cardapio={cardapio} onAbrirProduto={onAbrir} />);
  return { ...r, onAbrir };
}

const azulejoEmoji = (raiz = document.body) =>
  raiz.querySelector(".card-produto__foto--emoji");

describe("CardapioLista — foto que não carrega cai no emoji, não no ícone quebrado", () => {
  it("a falha da imagem troca a foto pelo azulejo de emoji", () => {
    const { container } = montar({
      produtos: [produto({ foto_url: "https://bucket/apagada.jpg", emoji: "🍕" })],
    });

    const img = screen.getByAltText("Pizza Calabresa");
    expect(azulejoEmoji(container)).toBeNull();

    fireEvent.error(img);

    expect(screen.queryByAltText("Pizza Calabresa")).not.toBeInTheDocument();
    expect(azulejoEmoji(container)).toBeInTheDocument();
    expect(screen.getByText("🍕")).toBeInTheDocument();
  });

  it("sem emoji próprio, a reserva é o prato genérico", () => {
    montar({ produtos: [produto({ foto_url: "https://bucket/x.jpg" })] });

    fireEvent.error(screen.getByAltText("Pizza Calabresa"));

    expect(screen.getByText("🍽️")).toBeInTheDocument();
  });

  it("foto que carrega bem continua na tela", () => {
    const { container } = montar({
      produtos: [produto({ foto_url: "https://bucket/ok.jpg", emoji: "🍕" })],
    });

    expect(screen.getByAltText("Pizza Calabresa")).toBeInTheDocument();
    expect(azulejoEmoji(container)).toBeNull();
  });

  it("produto sem foto nenhuma já nasce com o emoji", () => {
    const { container } = montar({ produtos: [produto({ emoji: "🍕" })] });

    expect(screen.queryByAltText("Pizza Calabresa")).not.toBeInTheDocument();
    expect(azulejoEmoji(container)).toBeInTheDocument();
  });

  it("a falha de um card não derruba a foto do vizinho", () => {
    montar({
      produtos: [
        produto({ produto_id: 1, nome: "Pizza Calabresa", foto_url: "https://bucket/ruim.jpg" }),
        produto({ produto_id: 2, nome: "Pizza Marguerita", foto_url: "https://bucket/boa.jpg" }),
      ],
    });

    fireEvent.error(screen.getByAltText("Pizza Calabresa"));

    expect(screen.queryByAltText("Pizza Calabresa")).not.toBeInTheDocument();
    expect(screen.getByAltText("Pizza Marguerita")).toBeInTheDocument();
  });

  it("o card com foto quebrada continua clicável e abre o produto certo", async () => {
    const user = userEvent.setup();
    const { onAbrir } = montar({
      produtos: [produto({ foto_url: "https://bucket/ruim.jpg" })],
    });

    fireEvent.error(screen.getByAltText("Pizza Calabresa"));
    await user.click(screen.getByRole("button", { name: /pizza calabresa/i }));

    expect(onAbrir).toHaveBeenCalledTimes(1);
    expect(onAbrir.mock.calls[0][0].produto_id).toBe(1);
  });

  it("o azulejo de emoji não é anunciado como conteúdo para leitor de tela", () => {
    const { container } = montar({ produtos: [produto({ emoji: "🍕" })] });

    expect(azulejoEmoji(container)).toHaveAttribute("aria-hidden", "true");
  });
});

describe("CardapioLista — o que a vitrine mostra", () => {
  it("agrupa por categoria preservando a ordem que veio do servidor", () => {
    const { container } = montar({
      produtos: [
        produto({ produto_id: 1, nome: "Pizza", categoria: "Pizzas" }),
        produto({ produto_id: 2, nome: "Coca", categoria: "Bebidas" }),
        produto({ produto_id: 3, nome: "Fanta", categoria: "Bebidas" }),
      ],
    });

    const titulos = [...container.querySelectorAll(".vitrine__categoria")].map(
      (h) => h.textContent
    );
    expect(titulos).toEqual(["Pizzas", "Bebidas"]);

    const bebidas = container.querySelectorAll("section")[1];
    expect(within(bebidas).getByText("Coca")).toBeInTheDocument();
    expect(within(bebidas).getByText("Fanta")).toBeInTheDocument();
  });

  it("produto sem categoria cai em 'Itens' em vez de sumir", () => {
    montar({ produtos: [produto({ categoria: null })] });

    expect(screen.getByText("Itens")).toBeInTheDocument();
    expect(screen.getByText("Pizza Calabresa")).toBeInTheDocument();
  });

  it("combos aparecem na própria seção e são clicáveis", async () => {
    const user = userEvent.setup();
    const { onAbrir } = montar({
      produtos: [],
      combos: [{ combo_id: "c1", nome: "Combo Casal", preco: 60 }],
    });

    expect(screen.getByText("Monte seu combo")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /combo casal/i }));

    expect(onAbrir.mock.calls[0][0].combo_id).toBe("c1");
  });

  it("cardápio vazio convida a voltar em vez de mostrar tela em branco", () => {
    montar({ produtos: [], combos: [] });

    expect(screen.getByText(/cardápio ainda sendo preparado/i)).toBeInTheDocument();
  });

  it("cardápio nulo não quebra a página", () => {
    montar(null);

    expect(screen.getByText(/cardápio ainda sendo preparado/i)).toBeInTheDocument();
  });

  it("a descrição só ocupa espaço quando existe", () => {
    const { container } = montar({
      produtos: [
        produto({ produto_id: 1, nome: "Com desc", descricao: "massa fina" }),
        produto({ produto_id: 2, nome: "Sem desc" }),
      ],
    });

    expect(screen.getByText("massa fina")).toBeInTheDocument();
    expect(container.querySelectorAll(".card-produto__desc")).toHaveLength(1);
  });

  it("o preço sai formatado em reais", () => {
    montar({ produtos: [produto({ preco: 25.5 })] });

    expect(screen.getByText("R$ 25,50")).toBeInTheDocument();
  });
});
