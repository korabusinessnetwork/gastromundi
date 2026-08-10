// @vitest-environment jsdom
//
// Run 6, leva 2 — a escolha de complementos na vitrine pública.
//
// Dois jeitos de a tela mandar o cliente fazer o impossível:
//
// 1. Grupo obrigatório sem nenhuma opção. A RPC do cardápio esconde o
//    complemento marcado como indisponível, mas manda o min_escolhas do
//    grupo cru. O dono marca "acabou o bacon" na última opção e o produto
//    chega como { min: 1, itens: [] }: o botão trava em "Escolha os
//    obrigatórios" para sempre, e o clique rola até um grupo vazio. O
//    servidor recusaria de qualquer forma (criar_pedido_delivery cobra o
//    mínimo do grupo), então insistir só gasta o tempo do cliente.
//
// 2. Grupo no máximo. Ao tentar a 4ª opção de um grupo "até 3", o toque
//    simplesmente não fazia nada: sem aviso, sem estado, sem aparência
//    de bloqueado. O cliente batia de novo achando que a tela travou.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// A camada de delivery importa o client Supabase no topo (exige VITE_*).
vi.mock("@/lib/supabase", async () => {
  const { createMockSupabase } = await import("@/test/mockSupabase");
  return { supabase: createMockSupabase() };
});

import ProdutoModal from "./ProdutoModal";

const opcao = (id, nome, preco = 0) => ({ id, nome, preco });

function abrir(produto, props = {}) {
  const onAdicionar = vi.fn();
  const onFechar = vi.fn();
  const user = userEvent.setup();
  render(
    <ProdutoModal
      produto={produto}
      onFechar={onFechar}
      onAdicionar={onAdicionar}
      {...props}
    />,
  );
  return { user, onAdicionar, onFechar };
}

/** O botão grande do rodapé (o texto dele carrega o preço junto). */
const cta = () => document.querySelector(".modal-rodape .btn--primario");

/** O selo de regra do grupo de índice `i` (o "Escolha 1", "✓ pronto"…). */
const selo = (i = 0) => document.querySelectorAll(".grupo__regra")[i];

const opcaoBotao = (nome) => screen.getByRole("button", { name: new RegExp(nome) });

beforeEach(() => {
  vi.clearAllMocks();
  // jsdom não implementa rolagem; o CTA chama scrollIntoView ao guiar.
  Element.prototype.scrollIntoView = vi.fn();
});

describe("ProdutoModal — grupo obrigatório que ficou sem opção (Run 6, leva 2)", () => {
  const PRODUTO_TRAVADO = {
    produto_id: 7,
    nome: "X-Bacon",
    preco: 30,
    grupos: [{ id: "g1", nome: "Escolha o ponto", min: 1, max: 1, itens: [] }],
  };

  it("diz que está indisponível em vez de pedir uma escolha que não existe", () => {
    abrir(PRODUTO_TRAVADO);

    expect(selo()).toHaveTextContent("Indisponível no momento");
    expect(cta()).toHaveTextContent("Indisponível no momento");
    expect(cta()).not.toHaveTextContent("Escolha os obrigatórios");
  });

  it("o botão continua bloqueado e nada entra na sacola", async () => {
    const { user, onAdicionar } = abrir(PRODUTO_TRAVADO);

    expect(cta()).toHaveAttribute("aria-disabled", "true");
    await user.click(cta());

    expect(onAdicionar).not.toHaveBeenCalled();
  });

  it("regra que se contradiz (mínimo 2, máximo 1) também aparece como indisponível", () => {
    abrir({
      produto_id: 8,
      nome: "Combo Duplo",
      preco: 40,
      grupos: [
        {
          id: "g1",
          nome: "Escolha os acompanhamentos",
          min: 2,
          max: 1,
          itens: [opcao("a", "Fritas"), opcao("b", "Onion rings")],
        },
      ],
    });

    expect(selo()).toHaveTextContent("Indisponível no momento");
    expect(cta()).toHaveTextContent("Indisponível no momento");
  });

  it("subgrupo obrigatório vazio derruba o produto mesmo com o pai em ordem", () => {
    abrir({
      produto_id: 9,
      nome: "Pizza Meio a Meio",
      preco: 55,
      grupos: [
        {
          id: "g1",
          nome: "1º sabor",
          min: 1,
          max: 1,
          itens: [opcao("a", "Calabresa")],
          subgrupos: [{ id: "g1sub", nome: "Borda", min: 1, max: 1, itens: [] }],
        },
      ],
    });

    expect(selo(0)).toHaveTextContent("Escolha 1");
    expect(selo(1)).toHaveTextContent("Indisponível no momento");
    expect(cta()).toHaveTextContent("Indisponível no momento");
  });

  it("com opção disponível, o produto obrigatório normal continua funcionando", async () => {
    const produto = {
      produto_id: 7,
      nome: "X-Bacon",
      preco: 30,
      grupos: [
        {
          id: "g1",
          nome: "Escolha o ponto",
          min: 1,
          max: 1,
          itens: [opcao("a", "Ao ponto"), opcao("b", "Bem passado")],
        },
      ],
    };
    const { user, onAdicionar } = abrir(produto);

    expect(selo()).toHaveTextContent("Escolha 1");
    expect(cta()).toHaveTextContent("Escolha os obrigatórios");

    await user.click(opcaoBotao("Ao ponto"));

    expect(selo()).toHaveTextContent("✓ pronto");
    expect(cta()).toHaveTextContent("Adicionar");

    await user.click(cta());

    expect(onAdicionar).toHaveBeenCalledTimes(1);
    expect(onAdicionar.mock.calls[0][0]).toMatchObject({
      produto_id: 7,
      qtd: 1,
      complementosEscolhidos: [{ id: "a", nome: "Ao ponto", preco: 0 }],
    });
  });
});

describe("ProdutoModal — grupo no máximo (Run 6, leva 2)", () => {
  const ATE_TRES = {
    produto_id: 12,
    nome: "Açaí 500ml",
    preco: 20,
    grupos: [
      {
        id: "g1",
        nome: "Acompanhamentos",
        min: 0,
        max: 3,
        itens: [
          opcao("a", "Granola"),
          opcao("b", "Leite condensado", 2),
          opcao("c", "Banana"),
          opcao("d", "Morango", 3),
        ],
      },
    ],
  };

  it("a 4ª opção fica visivelmente fora de alcance, e o selo diz como trocar", async () => {
    const { user } = abrir(ATE_TRES);

    expect(selo()).toHaveTextContent("Opcional · até 3");
    expect(opcaoBotao("Morango")).toBeEnabled();

    await user.click(opcaoBotao("Granola"));
    await user.click(opcaoBotao("Leite condensado"));
    await user.click(opcaoBotao("Banana"));

    expect(selo()).toHaveTextContent("Máximo 3 — desmarque para trocar");
    expect(opcaoBotao("Morango")).toBeDisabled();
    expect(opcaoBotao("Morango")).toHaveClass("opcao--bloqueada");
  });

  it("as opções já escolhidas continuam clicáveis — é assim que o cliente troca", async () => {
    const { user } = abrir(ATE_TRES);

    await user.click(opcaoBotao("Granola"));
    await user.click(opcaoBotao("Leite condensado"));
    await user.click(opcaoBotao("Banana"));

    expect(opcaoBotao("Granola")).toBeEnabled();
    expect(opcaoBotao("Granola")).not.toHaveClass("opcao--bloqueada");

    await user.click(opcaoBotao("Granola")); // desmarca

    expect(selo()).toHaveTextContent("Opcional · até 3");
    expect(opcaoBotao("Morango")).toBeEnabled();

    await user.click(opcaoBotao("Morango"));

    expect(opcaoBotao("Morango")).toHaveAttribute("aria-pressed", "true");
    expect(cta()).toHaveTextContent("R$ 25,00"); // 20 + 2 (leite) + 3 (morango)
  });

  it("abaixo do máximo nada fica bloqueado", async () => {
    const { user } = abrir(ATE_TRES);

    await user.click(opcaoBotao("Granola"));
    await user.click(opcaoBotao("Banana"));

    expect(document.querySelectorAll(".opcao--bloqueada")).toHaveLength(0);
    expect(selo()).toHaveTextContent("Opcional · até 3");
  });

  it("grupo de escolha única não bloqueia nada — tocar em outra opção troca", async () => {
    const { user } = abrir({
      produto_id: 13,
      nome: "Refrigerante",
      preco: 8,
      grupos: [
        {
          id: "g1",
          nome: "Sabor",
          min: 1,
          max: 1,
          itens: [opcao("a", "Guaraná"), opcao("b", "Cola")],
        },
      ],
    });

    await user.click(opcaoBotao("Guaraná"));

    expect(opcaoBotao("Cola")).toBeEnabled();
    expect(document.querySelectorAll(".opcao--bloqueada")).toHaveLength(0);

    await user.click(opcaoBotao("Cola"));

    expect(opcaoBotao("Cola")).toHaveAttribute("aria-pressed", "true");
    expect(opcaoBotao("Guaraná")).toHaveAttribute("aria-pressed", "false");
  });

  it("o máximo de um grupo não contamina o outro", async () => {
    const { user } = abrir({
      produto_id: 14,
      nome: "Marmita",
      preco: 25,
      grupos: [
        {
          id: "g1",
          nome: "Acompanhamentos",
          min: 0,
          max: 2,
          itens: [opcao("a", "Arroz"), opcao("b", "Feijão"), opcao("c", "Farofa")],
        },
        {
          id: "g2",
          nome: "Saladas",
          min: 0,
          max: 2,
          itens: [opcao("d", "Alface"), opcao("e", "Tomate"), opcao("f", "Beterraba")],
        },
      ],
    });

    await user.click(opcaoBotao("Arroz"));
    await user.click(opcaoBotao("Feijão"));

    expect(opcaoBotao("Farofa")).toBeDisabled();
    expect(opcaoBotao("Beterraba")).toBeEnabled();
    expect(selo(0)).toHaveTextContent("Máximo 2 — desmarque para trocar");
    expect(selo(1)).toHaveTextContent("Opcional · até 2");

    const saladas = within(document.querySelectorAll(".grupo")[1]);
    expect(saladas.getByRole("button", { name: /Alface/ })).toBeEnabled();
  });
});

// Run 6, leva 3 — fora do horário de funcionamento a barra da sacola não é
// renderizada (ela depende de `aberto`). O "Adicionar" do produto, porém,
// continuava valendo: o item entrava numa sacola invisível, o modal fechava
// e a tela ficava EXATAMENTE igual à de antes do toque. Sem nenhum sinal de
// que algo aconteceu, o cliente tocava de novo, e de novo — e reencontrava a
// pilha de repetidos quando a loja abrisse.
describe("ProdutoModal — loja fechada (Run 6, leva 3)", () => {
  const REFRI = {
    produto_id: 20,
    nome: "Refrigerante lata",
    preco: 8,
    grupos: [],
  };

  const COM_OBRIGATORIO = {
    produto_id: 21,
    nome: "X-Salada",
    preco: 28,
    grupos: [
      {
        id: "g1",
        nome: "Ponto da carne",
        min: 1,
        max: 1,
        itens: [opcao("a", "Ao ponto"), opcao("b", "Bem passado")],
      },
    ],
  };

  it("o CTA diz que está fechado em vez de convidar a adicionar", () => {
    abrir(REFRI, { lojaAberta: false });

    expect(cta()).toHaveTextContent("Fechado no momento");
    expect(cta()).not.toHaveTextContent("Adicionar");
    expect(cta()).toHaveAttribute("aria-disabled", "true");
    expect(cta()).toHaveClass("btn--bloqueado");
  });

  it("tocar no CTA não joga nada na sacola invisível", async () => {
    const { user, onAdicionar, onFechar } = abrir(REFRI, { lojaAberta: false });

    await user.click(cta());
    await user.click(cta()); // o cliente insiste, achando que travou

    expect(onAdicionar).not.toHaveBeenCalled();
    expect(onFechar).not.toHaveBeenCalled();
  });

  it("completar os obrigatórios não destrava o pedido com a loja fechada", async () => {
    const { user, onAdicionar } = abrir(COM_OBRIGATORIO, { lojaAberta: false });

    await user.click(opcaoBotao("Ao ponto"));

    expect(selo()).toHaveTextContent("✓ pronto");
    expect(cta()).toHaveTextContent("Fechado no momento");
    expect(cta()).toHaveAttribute("aria-disabled", "true");

    await user.click(cta());

    expect(onAdicionar).not.toHaveBeenCalled();
  });

  it("o preço continua visível — o cliente pode namorar o cardápio", () => {
    abrir(REFRI, { lojaAberta: false });

    expect(cta()).toHaveTextContent("R$ 8,00");
  });

  it("com a loja aberta o mesmo produto adiciona normalmente", async () => {
    const { user, onAdicionar } = abrir(REFRI, { lojaAberta: true });

    expect(cta()).toHaveTextContent("Adicionar");
    expect(cta()).toHaveAttribute("aria-disabled", "false");

    await user.click(cta());

    expect(onAdicionar).toHaveBeenCalledTimes(1);
    expect(onAdicionar.mock.calls[0][0]).toMatchObject({ produto_id: 20, qtd: 1 });
  });
});
