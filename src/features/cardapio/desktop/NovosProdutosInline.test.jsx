// @vitest-environment jsdom
//
// Cadastro de produtos dentro do grupo de escolha.
//
// O que este arquivo protege:
//  1. Que o produto criado seja um produto DE VERDADE. É a ligação com o
//     produto que faz o estoque baixar e a margem existir — uma opção que
//     fosse só um texto solto venderia "uma cerveja qualquer" e não daria
//     baixa em nada. Por isso os testes conferem a chamada a addProduct,
//     e não só o que aparece na tela.
//  2. Que dê para cadastrar vários de uma vez (o caso real: as seis
//     cervejas da casa), e que todos entrem no grupo numa tacada.
//  3. Que produto de cardápio não nasça sem preço nem sem categoria —
//     prevenir vale mais que avisar depois (princípio nº 1).
//  4. Que uma falha no meio do lote não desfaça o que já deu certo.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/context/AppContext", async () => {
  const { mockUseApp } = await import("@/test/mockApp");
  return { useApp: mockUseApp, AppProvider: ({ children }) => children };
});

import { setAppMock, renderWithProviders } from "@/test/mockApp";
import NovosProdutosInline from "./NovosProdutosInline";

const criados = vi.fn();
const cancelou = vi.fn();

let addProduct;

function montar(props = {}) {
  addProduct = vi.fn(async ({ name }) => ({ data: { id: `id-${name}`, name }, error: null }));
  setAppMock({ addProduct });
  criados.mockClear();
  cancelou.mockClear();
  return renderWithProviders(
    <NovosProdutosInline
      nomeInicial="Heineken 600ml"
      categorias={["Bebidas", "Lanches"]}
      onCriados={criados}
      onCancelar={cancelou}
      {...props}
    />,
  );
}

const nomes = () => screen.getAllByPlaceholderText("Nome do produto");
const precos = () => screen.getAllByPlaceholderText("0,00");
const botaoCriar = () => screen.getByRole("button", { name: /^Cadastrar/ });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("NovosProdutosInline — o caminho feliz", () => {
  it("abre já com o nome que foi digitado na busca", () => {
    montar();
    expect(nomes()[0]).toHaveValue("Heineken 600ml");
  });

  it("cadastra vários de uma vez e entrega todos ao grupo numa tacada", async () => {
    montar();

    await userEvent.type(precos()[0], "12");
    await userEvent.click(screen.getByRole("button", { name: /Acrescentar linha/i }));
    await userEvent.type(nomes()[1], "Skol lata");
    await userEvent.type(precos()[1], "8");
    await userEvent.click(botaoCriar());

    await waitFor(() => expect(addProduct).toHaveBeenCalledTimes(2));
    expect(addProduct.mock.calls[0][0]).toMatchObject({ name: "Heineken 600ml", price: 12, category: "Bebidas" });
    expect(addProduct.mock.calls[1][0]).toMatchObject({ name: "Skol lata", price: 8, category: "Bebidas" });

    // Uma entrega só: duas chamadas fariam a segunda partir do grupo antigo
    // e a primeira opção se perderia.
    expect(criados).toHaveBeenCalledTimes(1);
    expect(criados.mock.calls[0][0]).toHaveLength(2);
    expect(cancelou).toHaveBeenCalledTimes(1); // fecha sozinho no sucesso
  });

  it("Enter na última linha acrescenta outra — quem cadastra seis digita, não clica", async () => {
    montar();

    await userEvent.type(nomes()[0], "{Enter}");

    expect(nomes()).toHaveLength(2);
  });
});

describe("NovosProdutosInline — vender avulso", () => {
  it("vem marcado: o produto nasce de cardápio, na categoria escolhida", async () => {
    montar();

    const avulso = screen.getByRole("checkbox", { name: /Vender também avulso/i });
    expect(avulso).toBeChecked();

    await userEvent.type(precos()[0], "12");
    await userEvent.click(botaoCriar());

    await waitFor(() => expect(addProduct).toHaveBeenCalled());
    expect(addProduct.mock.calls[0][0].category).toBe("Bebidas");
  });

  // O que só existe dentro do combo entra como Insumo — a categoria que o
  // sistema já usa para o que não é item de cardápio. Sem preço de venda,
  // porque não é vendido sozinho.
  it("desmarcado: entra como Insumo, sem preço e sem pedir categoria", async () => {
    montar();

    await userEvent.click(screen.getByRole("checkbox", { name: /Vender também avulso/i }));

    expect(screen.queryByLabelText("Categoria")).toBeNull();
    expect(screen.queryByPlaceholderText("0,00")).toBeNull();

    await userEvent.click(botaoCriar());

    await waitFor(() => expect(addProduct).toHaveBeenCalled());
    expect(addProduct.mock.calls[0][0]).toMatchObject({ name: "Heineken 600ml", price: 0, category: "Insumo" });
  });

  it("bebida de geladeira pode nascer sem passar pela cozinha", async () => {
    montar();

    await userEvent.click(screen.getByRole("checkbox", { name: /Vai para a cozinha/i }));
    await userEvent.type(precos()[0], "12");
    await userEvent.click(botaoCriar());

    await waitFor(() => expect(addProduct).toHaveBeenCalled());
    expect(addProduct.mock.calls[0][0].produzivel).toBe(false);
  });
});

describe("NovosProdutosInline — não deixa nascer torto", () => {
  it("produto de cardápio sem preço não pode ser criado", async () => {
    montar();
    await userEvent.type(screen.getByLabelText("Categoria"), "Bebidas");

    expect(botaoCriar()).toBeDisabled();

    await userEvent.type(precos()[0], "12");
    expect(botaoCriar()).toBeEnabled();
  });

  it("produto de cardápio sem categoria não pode ser criado", async () => {
    montar({ categorias: [] });
    await userEvent.type(precos()[0], "12");

    expect(botaoCriar()).toBeDisabled();

    await userEvent.type(screen.getByLabelText("Categoria"), "Bebidas");
    expect(botaoCriar()).toBeEnabled();
  });

  it("sem nome nenhum não há o que cadastrar", async () => {
    montar({ nomeInicial: "" });
    await userEvent.type(screen.getByLabelText("Categoria"), "Bebidas");

    expect(botaoCriar()).toBeDisabled();
  });
});

describe("NovosProdutosInline — quando o banco falha", () => {
  it("o que deu certo entra no grupo e só o que falhou continua na tela", async () => {
    montar();
    addProduct.mockImplementation(async ({ name }) =>
      name === "Skol lata"
        ? { data: null, error: { message: "Failed to fetch" } }
        : { data: { id: 1, name }, error: null },
    );

    await userEvent.type(precos()[0], "12");
    await userEvent.click(screen.getByRole("button", { name: /Acrescentar linha/i }));
    await userEvent.type(nomes()[1], "Skol lata");
    await userEvent.type(precos()[1], "8");
    await userEvent.click(botaoCriar());

    // A Heineken existe: refazê-la criaria produto repetido.
    await waitFor(() => expect(criados).toHaveBeenCalledTimes(1));
    expect(criados.mock.calls[0][0]).toHaveLength(1);

    expect(await screen.findByText(/Não deu para cadastrar este produto/i)).toBeInTheDocument();
    expect(nomes()).toHaveLength(1);
    expect(nomes()[0]).toHaveValue("Skol lata");
    expect(cancelou).not.toHaveBeenCalled(); // painel fica aberto para tentar de novo
  });
});
