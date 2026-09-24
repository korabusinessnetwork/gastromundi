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
//  5. Que um grupo de SABORES cobre a opção mais cara, e não a soma —
//     somando, uma pizza de quatro sabores saía por quatro pizzas.
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
    // grupoId/regra viajam com a escolha para o carrinho saber COMO
    // cobrar aquele grupo (ver precoDasEscolhas em src/lib/combos.js).
    expect(onConfirmar.mock.calls[0][0]).toEqual([
      { produtoId: 1, nome: "Cheddar", qtd: 2, preco: 3, grupoId: "g1", regra: "soma" },
    ]);
  });

  it("o acréscimo é cobrado por unidade", async () => {
    montar([grupo()]);

    expect(total()).toBe("R$ 20,00");
    await userEvent.click(cartao("Somar um Cheddar"));
    expect(total()).toBe("R$ 23,00");
    await userEvent.click(cartao("Somar um Cheddar"));
    expect(total()).toBe("R$ 26,00");
  });

  it("o “−” tira uma unidade de cada vez e some quando zera", async () => {
    montar([grupo()]);

    await userEvent.click(cartao("Somar um Cheddar"));
    await userEvent.click(cartao("Somar um Cheddar"));
    await userEvent.click(screen.getByRole("button", { name: "Tirar um Cheddar" }));

    expect(total()).toBe("R$ 23,00");
    await userEvent.click(screen.getByRole("button", { name: "Tirar um Cheddar" }));
    expect(total()).toBe("R$ 20,00");
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
    expect(total()).toBe("R$ 26,00");
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
      { produtoId: 2, nome: "Bacon", qtd: 1, preco: 5, grupoId: "g1", regra: "soma" },
    ]);
  });

  it("com máximo 1 não existe o botão de tirar — clicar de novo já desmarca", async () => {
    montar([grupo({ minimo: 1, maximo: 1 })]);

    await userEvent.click(cartao("Cheddar"));
    expect(screen.queryByRole("button", { name: "Tirar um Cheddar" })).toBeNull();

    await userEvent.click(cartao("Cheddar"));
    expect(total()).toBe("R$ 20,00");
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
    expect(total()).toBe("R$ 40,00"); // 20 + 5×3 + 1×5
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
    expect(screen.getByText("Opcional, escolha quantas quiser")).toBeInTheDocument();
  });
});

describe("SeletorEscolhas, o cartão da opção não se sobrepõe", () => {
  // Nome e acréscimo eram irmãos na mesma linha do flex. Num cartão
  // estreito a caixa do nome era espremida até 0px e o texto vazava por
  // cima do preço: os dois saíam impressos um sobre o outro e ilegíveis.
  // O layout em si só se prova no navegador (jsdom não tem motor de
  // layout); o que este teste tranca é a ESTRUTURA que o impede de voltar.
  it("nome e acréscimo vivem dentro do mesmo bloco de texto, empilhados", () => {
    montar([grupo()]);

    const bloco = document.querySelector(".seletor-escolhas__opcao-texto");
    expect(bloco).not.toBeNull();
    expect(bloco.querySelector(".seletor-escolhas__opcao-nome")).toHaveTextContent("Cheddar");
    expect(bloco.querySelector(".seletor-escolhas__opcao-acrescimo")).toHaveTextContent("R$ 3,00");
  });

  it("o acréscimo nunca é irmão direto do cartão", () => {
    // Ser irmão direto é exatamente o arranjo que colidia.
    montar([grupo()]);
    for (const acr of document.querySelectorAll(".seletor-escolhas__opcao-acrescimo")) {
      expect(acr.parentElement.className).toContain("seletor-escolhas__opcao-texto");
    }
  });

  it("opção sem acréscimo não cria o rótulo de preço", () => {
    montar([grupo({ itens: [{ produtoId: 1, preco: 0 }] })]);
    expect(document.querySelector(".seletor-escolhas__opcao-acrescimo")).toBeNull();
  });
});

// ── Pizzaria: o grupo cobra o sabor mais caro, não a conta de todos ──
const PIZZAS = [
  { id: 10, name: "Calabresa", price: 40, emoji: "🍕", category: "Pizzas" },
  { id: 11, name: "Portuguesa", price: 60, emoji: "🍕", category: "Pizzas" },
];

function montarPizza(over = {}, onConfirmar = vi.fn()) {
  render(
    <SeletorEscolhas
      titulo="Pizza Grande"
      precoBase={0}
      grupos={[{
        id: "sabores",
        nome: "Sabores",
        minimo: 2,
        maximo: 2,
        origem: "lista",
        regraPreco: "maior",
        itens: [{ produtoId: 10, preco: 0 }, { produtoId: 11, preco: 0 }],
        ...over,
      }]}
      products={PIZZAS}
      onConfirmar={onConfirmar}
      onClose={vi.fn()}
    />,
  );
  return onConfirmar;
}

describe("SeletorEscolhas — sabores cobram a opção mais cara", () => {
  it("meio a meio custa o meio mais caro, não a soma dos dois", async () => {
    montarPizza();

    await userEvent.click(cartao("Calabresa"));
    await userEvent.click(cartao("Portuguesa"));

    // 40 + 60 = 100 seria o comportamento antigo; a pizza custa 60.
    expect(total()).toContain("60,00");
  });

  it("dois pedaços do mesmo sabor não dobram o preço", async () => {
    montarPizza();

    await userEvent.click(cartao("Somar um Calabresa"));
    await userEvent.click(cartao("Somar um Calabresa"));

    expect(total()).toContain("40,00");
  });

  it("o preço da opção sai do cadastro do produto quando o grupo não define", async () => {
    // O dono não digitou preço nenhum no grupo: "Calabresa" vale os R$ 40
    // que ela já vale no catálogo.
    montarPizza();
    await userEvent.click(cartao("Calabresa"));
    expect(total()).toContain("40,00");
  });

  it("a tela diz por que a conta não é a soma", async () => {
    montarPizza();
    expect(screen.getByText(/vale a opção mais cara/i)).toBeInTheDocument();
  });

  it("no grupo de extras esse aviso não aparece — seria ruído", async () => {
    montar([grupo()]);
    expect(screen.queryByText(/vale a opção mais cara/i)).not.toBeInTheDocument();
  });

  it("a escolha leva a regra do grupo para o carrinho", async () => {
    const onConfirmar = montarPizza();

    await userEvent.click(cartao("Calabresa"));
    await userEvent.click(cartao("Portuguesa"));
    await userEvent.click(confirmar());

    expect(onConfirmar.mock.calls[0][0]).toEqual([
      { produtoId: 10, nome: "Calabresa", qtd: 1, preco: 40, grupoId: "sabores", regra: "maior" },
      { produtoId: 11, nome: "Portuguesa", qtd: 1, preco: 60, grupoId: "sabores", regra: "maior" },
    ]);
  });

  it("média cobra o meio-termo", async () => {
    montarPizza({ regraPreco: "media" });

    await userEvent.click(cartao("Calabresa"));
    await userEvent.click(cartao("Portuguesa"));

    expect(total()).toContain("50,00");
  });
});

// ── O que o combo já inclui ─────────────────────────────────────────
describe("SeletorEscolhas — itens fixos do combo", () => {
  const FIXOS = [
    { produtoId: 9, nome: "Batata frita", qtd: 1, preco: 0, grupoId: "fixos", regra: "soma", fixo: true },
  ];

  function montarComFixos(escolhasFixas) {
    render(
      <SeletorEscolhas
        titulo="Combo Lanche"
        precoBase={35}
        grupos={[grupo()]}
        products={PRODUTOS}
        escolhasFixas={escolhasFixas}
        onConfirmar={vi.fn()}
        onClose={vi.fn()}
      />,
    );
  }

  it("diz o que já vem junto, para o operador não oferecer de novo", () => {
    montarComFixos(FIXOS);
    expect(screen.getByText("Já vem com")).toBeInTheDocument();
    expect(screen.getByText("Batata frita")).toBeInTheDocument();
  });

  it("dois itens saem numa frase, não numa lista solta", () => {
    montarComFixos([...FIXOS, { produtoId: 10, nome: "Refri", qtd: 1, preco: 0 }]);
    expect(screen.getByText("Batata frita e Refri")).toBeInTheDocument();
  });

  it("o item fixo NÃO vira cartão clicável — não é escolha", () => {
    montarComFixos(FIXOS);
    expect(screen.queryByRole("button", { name: /Somar um Batata frita/ })).not.toBeInTheDocument();
  });

  it("sem itens fixos o bloco nem aparece — rótulo solto é ruído", () => {
    montarComFixos([]);
    expect(screen.queryByText("Já vem com")).not.toBeInTheDocument();
  });

  it("os fixos não entram no total do modal (já estão no preço do combo)", () => {
    montarComFixos(FIXOS);
    expect(total()).toContain("35,00");
  });
});
