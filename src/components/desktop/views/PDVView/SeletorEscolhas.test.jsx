// @vitest-environment jsdom
//
// SeletorEscolhas — a tela onde o operador monta um combo ou um produto
// com seleção.
//
// O que este arquivo protege:
//  1. Que dê para pedir a MESMA opção mais de uma vez ("double cheddar").
//     Antes a escolha era marcado/desmarcado e o pedido não tinha como
//     ser lançado; o carrinho e a baixa de estoque já sabiam somar `qtd`.
//  2. Que o teto do grupo conte UNIDADES, não opções diferentes — senão
//     "até 2" aceitaria dois cheddar E mais dois bacon.
//  3. Que "escolha 1" continue trocando de opção em vez de somar.
//  4. Que o acréscimo seja cobrado por unidade.
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SeletorEscolhas from "./SeletorEscolhas";

const PRODUTOS = [
  { id: 1, name: "Cheddar", price: 0, emoji: "🧀", category: "Adicionais" },
  { id: 2, name: "Bacon", price: 0, emoji: "🥓", category: "Adicionais" },
];

const grupo = (over = {}) => ({
  id: "g1",
  nome: "Adicionais",
  minimo: 0,
  maximo: 2,
  origem: "lista",
  itens: [
    { produtoId: 1, preco: 3 },
    { produtoId: 2, preco: 5 },
  ],
  ...over,
});

function montar(grupos, onConfirmar = vi.fn()) {
  render(
    <SeletorEscolhas
      titulo="X-Burguer"
      precoBase={20}
      grupos={grupos}
      products={PRODUTOS}
      onConfirmar={onConfirmar}
      onClose={vi.fn()}
    />,
  );
  return onConfirmar;
}

const cartao = (nome) => screen.getByRole("button", { name: new RegExp(nome) });
// O rótulo do botão muda conforme falta escolha obrigatória ("Faça as
// escolhas obrigatórias"), então o teste o encontra pelo papel na tela,
// não pelo texto.
const confirmar = () => document.querySelector(".seletor-escolhas__confirmar");
const total = () => document.querySelector(".seletor-escolhas__total-valor").textContent;

describe("SeletorEscolhas — a mesma opção mais de uma vez", () => {
  it("dois cheddar viram uma escolha com qtd 2, não duas escolhas", async () => {
    const onConfirmar = montar([grupo()]);

    await userEvent.click(cartao("Somar um Cheddar"));
    await userEvent.click(cartao("Somar um Cheddar"));
    await userEvent.click(confirmar());

    expect(onConfirmar).toHaveBeenCalledTimes(1);
    expect(onConfirmar.mock.calls[0][0]).toEqual([
      { produtoId: 1, nome: "Cheddar", qtd: 2, preco: 3 },
    ]);
  });

  it("o acréscimo é cobrado por unidade", async () => {
    montar([grupo()]);

    expect(total()).toBe("R$ 20.00");
    await userEvent.click(cartao("Somar um Cheddar"));
    expect(total()).toBe("R$ 23.00");
    await userEvent.click(cartao("Somar um Cheddar"));
    expect(total()).toBe("R$ 26.00");
  });

  it("o “−” tira uma unidade de cada vez e some quando zera", async () => {
    montar([grupo()]);

    await userEvent.click(cartao("Somar um Cheddar"));
    await userEvent.click(cartao("Somar um Cheddar"));
    await userEvent.click(screen.getByRole("button", { name: "Tirar um Cheddar" }));

    expect(total()).toBe("R$ 23.00");
    await userEvent.click(screen.getByRole("button", { name: "Tirar um Cheddar" }));
    expect(total()).toBe("R$ 20.00");
    expect(screen.queryByRole("button", { name: "Tirar um Cheddar" })).toBeNull();
  });
});

describe("SeletorEscolhas — o teto conta unidades", () => {
  it("dois cheddar já enchem um grupo de até 2, e o bacon fica bloqueado", async () => {
    montar([grupo()]);

    await userEvent.click(cartao("Somar um Cheddar"));
    await userEvent.click(cartao("Somar um Cheddar"));

    expect(cartao("Somar um Bacon")).toBeDisabled();
    // E somar um terceiro cheddar também não passa.
    expect(cartao("Somar um Cheddar")).toBeDisabled();
    expect(total()).toBe("R$ 26.00");
  });

  it("liberando uma unidade, o que estava bloqueado volta", async () => {
    montar([grupo()]);

    await userEvent.click(cartao("Somar um Cheddar"));
    await userEvent.click(cartao("Somar um Cheddar"));
    await userEvent.click(screen.getByRole("button", { name: "Tirar um Cheddar" }));

    expect(cartao("Somar um Bacon")).toBeEnabled();
  });
});

describe("SeletorEscolhas — escolha única continua trocando", () => {
  it("com máximo 1, clicar no outro substitui em vez de somar", async () => {
    const onConfirmar = montar([grupo({ nome: "Qual hambúrguer?", minimo: 1, maximo: 1 })]);

    await userEvent.click(cartao("Cheddar"));
    await userEvent.click(cartao("Bacon"));
    await userEvent.click(confirmar());

    expect(onConfirmar.mock.calls[0][0]).toEqual([
      { produtoId: 2, nome: "Bacon", qtd: 1, preco: 5 },
    ]);
  });

  it("com máximo 1 não existe o botão de tirar — clicar de novo já desmarca", async () => {
    montar([grupo({ minimo: 1, maximo: 1 })]);

    await userEvent.click(cartao("Cheddar"));
    expect(screen.queryByRole("button", { name: "Tirar um Cheddar" })).toBeNull();

    await userEvent.click(cartao("Cheddar"));
    expect(total()).toBe("R$ 20.00");
  });
});

describe("SeletorEscolhas — obrigatoriedade", () => {
  it("o mínimo conta unidades: duas do mesmo item satisfazem 'escolha 2'", async () => {
    montar([grupo({ minimo: 2, maximo: 2 })]);

    expect(confirmar()).toBeDisabled();
    await userEvent.click(cartao("Somar um Cheddar"));
    expect(confirmar()).toBeDisabled();
    await userEvent.click(cartao("Somar um Cheddar"));
    expect(confirmar()).toBeEnabled();
  });

  it("grupo sem opção disponível avisa em vez de ficar vazio", () => {
    montar([grupo({ itens: [{ produtoId: 999, preco: 0 }] })]);

    expect(screen.getByText("Nenhuma opção disponível.")).toBeInTheDocument();
  });

  // Opção desligada no cadastro não chega aqui — quem filtra é
  // resolverOpcoes, e é assim que o "acabou hoje" some da tela do operador.
  it("opção desligada não aparece para escolher", () => {
    montar([grupo({ itens: [{ produtoId: 1, preco: 3, ativo: false }, { produtoId: 2, preco: 5 }] })]);

    const lista = document.querySelector(".seletor-escolhas__opcoes");
    expect(within(lista).queryByText("Cheddar")).toBeNull();
    expect(within(lista).getByText("Bacon")).toBeInTheDocument();
  });
});

describe("SeletorEscolhas — máximo 0 é sem limite", () => {
  // "Escolha quantos sabores quiser": o grupo é cadastrado com máximo 0 e
  // aqui não pode existir teto nenhum. Antes o 0 caía em `g.maximo ?? 1`
  // como zero literal e a primeira escolha já enchia a cota — o operador
  // não conseguia lançar nem uma unidade.
  it("nada bloqueia, por mais que se some", async () => {
    montar([grupo({ nome: "Sabores", minimo: 0, maximo: 0 })]);

    for (let i = 0; i < 5; i++) await userEvent.click(cartao("Somar um Cheddar"));
    await userEvent.click(cartao("Somar um Bacon"));

    expect(cartao("Somar um Cheddar")).toBeEnabled();
    expect(cartao("Somar um Bacon")).toBeEnabled();
    expect(total()).toBe("R$ 40.00"); // 20 + 5×3 + 1×5
  });

  it("o grupo continua repetível — tem o botão de tirar um", async () => {
    montar([grupo({ minimo: 0, maximo: 0 })]);
    await userEvent.click(cartao("Somar um Cheddar"));
    expect(screen.getByRole("button", { name: "Tirar um Cheddar" })).toBeInTheDocument();
  });

  it("o mínimo continua valendo com máximo 0", async () => {
    montar([grupo({ minimo: 2, maximo: 0 })]);

    expect(screen.getByText("Escolha ao menos 2")).toBeInTheDocument();
    expect(confirmar()).toBeDisabled();
    await userEvent.click(cartao("Somar um Cheddar"));
    await userEvent.click(cartao("Somar um Bacon"));
    expect(confirmar()).toBeEnabled();
  });

  it("a instrução diz 'quantas quiser', não 'até 0'", () => {
    montar([grupo({ minimo: 0, maximo: 0 })]);
    expect(screen.getByText("Opcional — escolha quantas quiser")).toBeInTheDocument();
  });
});
