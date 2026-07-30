// @vitest-environment jsdom
//
// Run 6, leva 4 — a sacola é o último lugar onde dá para consertar o
// pedido antes de o servidor recusá-lo.
//
// A sacola mora em sessionStorage e sobrevive à aba recarregada; o
// cardápio é carregado uma vez só. Quando o dono tira um produto do ar no
// meio da compra, quem contava a novidade era a RPC, no último clique,
// com um "Item indisponível." que não diz QUAL item. O cliente voltava
// para a sacola, não via nada de errado, tentava de novo e levava a mesma
// recusa — beco sem saída, só saía fechando a aba.
//
// Aqui se prova que a linha problemática se identifica, que o avanço fica
// travado enquanto ela existir, e que remover é uma saída visível.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/lib/supabase", async () => {
  const { createMockSupabase } = await import("@/test/mockSupabase");
  return { supabase: createMockSupabase() };
});

import SacolaModal from "./SacolaModal";

function linha(extra = {}) {
  return {
    _linha: "L1",
    produto_id: 7,
    nome: "Pizza Calabresa",
    preco: 25,
    qtd: 1,
    complementosEscolhidos: [],
    obs: "",
    situacao: "ok",
    ...extra,
  };
}

function abrir(props = {}) {
  const onAvancar = vi.fn();
  const onRemover = vi.fn();
  const onAlterarQtd = vi.fn();
  render(
    <SacolaModal
      itens={[linha()]}
      subtotal={25}
      pedidoMinimo={0}
      temFora={false}
      temPrecoNovo={false}
      onFechar={vi.fn()}
      onAlterarQtd={onAlterarQtd}
      onRemover={onRemover}
      onAvancar={onAvancar}
      {...props}
    />
  );
  return { onAvancar, onRemover, onAlterarQtd };
}

const botaoAvancar = () => screen.getByRole("button", { name: /Ir para a entrega/ });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SacolaModal — item que saiu do cardápio (Run 6, leva 4)", () => {
  it("a linha diz na cara o que houve com ela", () => {
    abrir({ itens: [linha({ situacao: "fora" })], temFora: true });

    expect(screen.getByText(/Saiu do cardápio/)).toBeInTheDocument();
  });

  it("mexer na quantidade de um item morto não é oferecido; remover é", () => {
    abrir({ itens: [linha({ situacao: "fora" })], temFora: true });

    expect(screen.queryByRole("button", { name: "Aumentar" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Diminuir" })).toBeNull();
    expect(screen.getByRole("button", { name: "Remover" })).toBeInTheDocument();
  });

  it("o avanço fica travado e o aviso diz o que fazer para destravar", async () => {
    const { onAvancar } = abrir({ itens: [linha({ situacao: "fora" })], temFora: true });

    expect(botaoAvancar()).toBeDisabled();
    expect(screen.getByText(/saiu do cardápio enquanto você escolhia/i)).toBeInTheDocument();
    expect(screen.getByText(/Remova o item marcado/i)).toBeInTheDocument();

    await userEvent.click(botaoAvancar());
    expect(onAvancar).not.toHaveBeenCalled();
  });

  it("remover a linha marcada chama o carrinho com a linha certa", async () => {
    const { onRemover } = abrir({
      itens: [linha({ _linha: "boa" }), linha({ _linha: "morta", situacao: "fora" })],
      temFora: true,
      subtotal: 50,
    });

    const remover = screen.getAllByRole("button", { name: "Remover" });
    await userEvent.click(remover[1]);
    expect(onRemover).toHaveBeenCalledWith("morta");
  });

  it("a linha boa ao lado da morta mantém os botões de quantidade", () => {
    abrir({
      itens: [linha({ _linha: "boa" }), linha({ _linha: "morta", situacao: "fora" })],
      temFora: true,
      subtotal: 50,
    });

    expect(screen.getAllByRole("button", { name: "Aumentar" })).toHaveLength(1);
  });
});

describe("SacolaModal — preço que mudou (Run 6, leva 4)", () => {
  it("anuncia o preço novo sem travar o pedido", () => {
    const { onAvancar } = abrir({
      itens: [linha({ situacao: "preco" })],
      temPrecoNovo: true,
    });

    expect(screen.getByText(/Preço atualizado pelo estabelecimento/)).toBeInTheDocument();
    expect(screen.getByText(/O preço de um item mudou/i)).toBeInTheDocument();
    expect(botaoAvancar()).toBeEnabled();
    expect(onAvancar).not.toHaveBeenCalled();
  });

  it("preço novo não esconde os botões de quantidade — o item ainda é pedível", () => {
    abrir({ itens: [linha({ situacao: "preco" })], temPrecoNovo: true });

    expect(screen.getByRole("button", { name: "Aumentar" })).toBeInTheDocument();
  });
});

describe("SacolaModal — sacola em ordem (Run 6, leva 4)", () => {
  it("não inventa aviso nenhum e deixa avançar", async () => {
    const { onAvancar } = abrir();

    expect(screen.queryByText(/Saiu do cardápio/)).toBeNull();
    expect(screen.queryByText(/O preço de um item mudou/i)).toBeNull();
    expect(botaoAvancar()).toBeEnabled();

    await userEvent.click(botaoAvancar());
    expect(onAvancar).toHaveBeenCalledTimes(1);
  });

  it("o pedido mínimo continua barrando (a trava antiga não se perdeu)", async () => {
    const { onAvancar } = abrir({ subtotal: 25, pedidoMinimo: 40 });

    expect(botaoAvancar()).toBeDisabled();
    expect(screen.getByText(/Pedido mínimo de R\$ 40,00/)).toBeInTheDocument();

    await userEvent.click(botaoAvancar());
    expect(onAvancar).not.toHaveBeenCalled();
  });

  it("sem receber a revisão, o modal assume que está tudo bem", async () => {
    // Quem chama sem as props novas (outra tela, um teste, um refactor)
    // não pode cair num modal travado por engano — nem, no outro extremo,
    // ganhar avisos de problema que ninguém relatou.
    const onAvancar = vi.fn();
    render(
      <SacolaModal
        itens={[linha()]}
        subtotal={25}
        pedidoMinimo={0}
        onFechar={vi.fn()}
        onAlterarQtd={vi.fn()}
        onRemover={vi.fn()}
        onAvancar={onAvancar}
      />
    );

    expect(screen.queryByText(/saiu do cardápio enquanto você escolhia/i)).toBeNull();
    expect(screen.queryByText(/O preço de um item mudou/i)).toBeNull();
    expect(botaoAvancar()).toBeEnabled();

    await userEvent.click(botaoAvancar());
    expect(onAvancar).toHaveBeenCalledTimes(1);
  });

  it("item fora do ar E abaixo do mínimo: os dois motivos aparecem", () => {
    abrir({
      itens: [linha({ situacao: "fora" })],
      temFora: true,
      subtotal: 25,
      pedidoMinimo: 40,
    });

    expect(screen.getByText(/saiu do cardápio enquanto você escolhia/i)).toBeInTheDocument();
    expect(screen.getByText(/Pedido mínimo de R\$ 40,00/)).toBeInTheDocument();
    expect(botaoAvancar()).toBeDisabled();
  });
});
