// @vitest-environment jsdom
//
// Editor de grupos de escolha — a ponte entre "categoria inteira" e "lista".
//
// O que este arquivo protege: quem escolheu "Categoria inteira" e depois
// quis tirar um produto ficava sem saída — a categoria é uma REGRA, não dá
// para furar item a item. O botão "Escolher quais entram" resolve trazendo
// os produtos da categoria já preenchidos numa lista editável. O teste
// garante que a conversão traz os produtos certos (só os ativos), que a
// origem realmente muda, e que a troca é oferecida só quando há categoria
// escolhida — caso contrário o botão converteria para uma lista vazia.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/context/AppContext", async () => {
  const { mockUseApp } = await import("@/test/mockApp");
  return { useApp: mockUseApp, AppProvider: ({ children }) => children };
});

import { setAppMock, renderWithProviders } from "@/test/mockApp";
import EditorGruposEscolha from "./EditorGruposEscolha";

const products = [
  { id: 1, name: "X-Burguer", price: 30, category: "Lanches", emoji: "🍔" },
  { id: 2, name: "X-Salada", price: 32, category: "Lanches", emoji: "🍔" },
  { id: 3, name: "X-Bacon (fora do cardápio)", price: 35, category: "Lanches", emoji: "🍔", active: false },
  { id: 4, name: "Coca lata", price: 8, category: "Bebidas", emoji: "🥤" },
];

const alterou = vi.fn();

function montar(grupo) {
  setAppMock({ products });
  alterou.mockClear();
  return renderWithProviders(
    <EditorGruposEscolha grupos={[{ _key: "g1", nome: "Escolha o lanche", minimo: 1, maximo: 1, itens: [], ...grupo }]} onChange={alterou} products={products} />,
  );
}

const botaoVirarLista = () => screen.queryByRole("button", { name: /Escolher quais entram/i });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("EditorGruposEscolha — de “categoria inteira” para “escolho quais entram”", () => {
  it("converte a categoria numa lista já preenchida com os produtos dela", async () => {
    montar({ origem: "categoria", categoria: "Lanches" });

    await userEvent.click(botaoVirarLista());

    expect(alterou).toHaveBeenCalledTimes(1);
    const [novo] = alterou.mock.calls[0][0];
    expect(novo.origem).toBe("lista");
    expect(novo.categoria).toBeNull();
    // Só os ativos: trazer o que está fora do cardápio faria a lista nascer
    // oferecendo o que a casa não vende.
    expect(novo.itens.map((i) => i.produtoId)).toEqual([1, 2]);
    expect(novo.itens.every((i) => i.ativo === true && i.preco === "")).toBe(true);
  });

  it("não oferece a conversão enquanto nenhuma categoria foi escolhida", () => {
    montar({ origem: "categoria", categoria: null });

    expect(botaoVirarLista()).toBeNull();
  });

  it("na origem “lista” o botão não existe — não há o que converter", () => {
    montar({ origem: "lista", itens: [{ produtoId: 1, preco: "", ativo: true }] });

    expect(botaoVirarLista()).toBeNull();
    expect(screen.getByText("X-Burguer")).toBeTruthy();
  });

  it("diz quantos produtos virão, para a troca não ser às cegas", () => {
    montar({ origem: "categoria", categoria: "Lanches" });

    expect(botaoVirarLista().textContent).toContain("os 2 produtos");
  });
});

describe("EditorGruposEscolha — máximo “sem limite”", () => {
  const menosMax = () => screen.getByRole("button", { name: "Diminuir o máximo" });
  const maisMax = () => screen.getByRole("button", { name: "Aumentar o máximo" });
  const maisMin = () => screen.getByRole("button", { name: "Aumentar o mínimo" });
  const ultimoGrupo = () => alterou.mock.calls.at(-1)[0][0];

  it("descer o máximo abaixo de 1 grava 0 e a tela diz “sem limite”", async () => {
    montar({ minimo: 1, maximo: 1 });

    await userEvent.click(menosMax());

    expect(ultimoGrupo().maximo).toBe(0);
  });

  it("com máximo 0 o contador mostra a palavra, não o número", () => {
    montar({ minimo: 0, maximo: 0 });
    expect(screen.getByText("sem limite")).toBeInTheDocument();
  });

  it("subir a partir de “sem limite” volta para 1", async () => {
    montar({ minimo: 0, maximo: 0 });
    await userEvent.click(maisMax());
    expect(ultimoGrupo().maximo).toBe(1);
  });

  it("subir o mínimo não tira o “sem limite” — ao menos N, quantas quiser", async () => {
    montar({ minimo: 1, maximo: 0 });
    await userEvent.click(maisMin());
    expect(ultimoGrupo()).toMatchObject({ minimo: 2, maximo: 0 });
  });

  it("a frase explica a regra em português, e é a mesma que o PDV mostra", () => {
    montar({ minimo: 2, maximo: 0 });
    expect(screen.getByText(/Escolha ao menos 2\./)).toBeInTheDocument();
  });

  it("na faixa comum o máximo nunca cai abaixo do mínimo", async () => {
    montar({ minimo: 3, maximo: 4 });
    await userEvent.click(menosMax());
    expect(ultimoGrupo().maximo).toBe(3);
  });
});
