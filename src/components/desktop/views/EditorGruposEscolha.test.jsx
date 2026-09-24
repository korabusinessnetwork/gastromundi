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

// ── Modelos e regra de preço ────────────────────────────────────────
// O editor tinha só mínimo e máximo, e o preço era SEMPRE a soma. Isso
// serve extras e quebra pizzaria: quatro sabores de R$ 40 saíam por
// R$ 160. Os modelos são o atalho que faz o mesmo editor servir os dois
// ramos sem o dono raciocinar campo a campo.
describe("modelos de grupo", () => {
  const ultimoGrupo = () => alterou.mock.calls.at(-1)[0][0];

  it("“Extras” deixa sem obrigatoriedade, sem teto e somando", async () => {
    montar({ minimo: 1, maximo: 1 });

    await userEvent.click(screen.getByRole("button", { name: /Extras/ }));

    expect(ultimoGrupo()).toMatchObject({ minimo: 0, maximo: 0, regraPreco: "soma" });
  });

  it("“Sabores” põe a regra de cobrar a mais cara", async () => {
    montar({ minimo: 0, maximo: 0 });

    await userEvent.click(screen.getByRole("button", { name: /Sabores/ }));

    expect(ultimoGrupo()).toMatchObject({ minimo: 2, maximo: 2, regraPreco: "maior" });
  });

  it("“Escolha obrigatória” trava em exatamente uma", async () => {
    montar({ minimo: 0, maximo: 0 });

    await userEvent.click(screen.getByRole("button", { name: /Escolha obrigatória/ }));

    expect(ultimoGrupo()).toMatchObject({ minimo: 1, maximo: 1, regraPreco: "soma" });
  });

  it("o modelo em uso aparece marcado", () => {
    montar({ minimo: 2, maximo: 2, regraPreco: "maior" });

    const sabores = screen.getByRole("button", { name: /Sabores/ });
    expect(sabores).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /Extras/ })).toHaveAttribute("aria-pressed", "false");
  });

  it("faixa ajustada à mão não marca modelo nenhum, e isso não trava nada", () => {
    montar({ minimo: 1, maximo: 3, regraPreco: "soma" });

    for (const nome of [/Extras/, /Escolha obrigatória/, /Sabores/]) {
      expect(screen.getByRole("button", { name: nome })).toHaveAttribute("aria-pressed", "false");
    }
  });
});

describe("regra de preço", () => {
  const ultimoGrupo = () => alterou.mock.calls.at(-1)[0][0];

  it("dá para trocar como o grupo cobra", async () => {
    montar({ regraPreco: "soma" });

    await userEvent.click(screen.getByRole("button", { name: "Cobrar a mais cara" }));

    expect(ultimoGrupo()).toMatchObject({ regraPreco: "maior" });
  });

  it("a tela explica a regra escolhida em português", () => {
    montar({ regraPreco: "maior" });
    expect(screen.getByText(/cobra só a opção mais cara/i)).toBeInTheDocument();
  });

  it("em regra de sabor o campo da opção vira PREÇO, não acréscimo", () => {
    // É a diferença que faz o dono digitar 40 e não 40 de acréscimo em
    // cima de um preço base que ele não sabe qual é.
    montar({ regraPreco: "maior", itens: [{ produtoId: 1, preco: "" }] });

    expect(screen.getByText("Preço")).toBeInTheDocument();
    expect(screen.queryByText("Acréscimo")).not.toBeInTheDocument();
  });

  it("no grupo de extras continua sendo acréscimo", () => {
    montar({ regraPreco: "soma", itens: [{ produtoId: 1, preco: "" }] });

    expect(screen.getByText("Acréscimo")).toBeInTheDocument();
    expect(screen.queryByText("Preço")).not.toBeInTheDocument();
  });

  it("opção sem valor mostra o preço do catálogo como sugestão", () => {
    montar({ regraPreco: "maior", itens: [{ produtoId: 1, preco: "" }] });

    // X-Burguer custa 30 no cadastro: é o que a opção vale se ficar vazia.
    expect(document.querySelector(".editor-grupos__acrescimo-input")).toHaveAttribute("placeholder", "30.00");
  });
});
