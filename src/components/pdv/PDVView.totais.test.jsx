// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

/**
 * Run 3 (mesas e comandas) — o `total` gravado em cada caminho do PDV.
 *
 * O PDV regrava `pending.total` em oito lugares diferentes (lançar, fechar a
 * conta, cancelar item no carrinho, cancelar item no checkout, e os quatro
 * ramos da transferência). Todos passavam a soma "à mão", cada um com um
 * detalhe diferente: uns incluíam item cancelado, uns usavam `qty || 0`,
 * nenhum arredondava. Resultado prático: a mesma comanda tinha um valor no
 * card, outro no Palm e um terceiro no banco — e item que o gerente cancelou
 * voltava a ser cobrado.
 *
 * Cada teste aqui prende um desses oito lugares em um número exato. O dado é
 * escolhido para nenhum deles poder passar por acidente: três cervejas de
 * R$ 16,10 dão 48.300000000000004 sem arredondar, e sempre existe um item
 * cancelado com preço alto na comanda, que não pode aparecer na soma.
 */

vi.mock("@/context/AppContext", async () => {
  const { mockUseApp } = await import("@/test/mockApp");
  return { useApp: mockUseApp, AppProvider: ({ children }) => children };
});

vi.mock("@/lib/supabase", async () => {
  const { createMockSupabase } = await import("@/test/mockSupabase");
  return { supabase: createMockSupabase() };
});

vi.mock("@/lib/logger", () => ({ logAction: vi.fn() }));
vi.mock("@/lib/jarvas/jarvas", () => ({ emitirEvento: vi.fn() }));
vi.mock("@/hooks/useTravaComanda", () => ({
  useTravaComanda: () => ({ bloqueio: null }),
}));
vi.mock("@/lib/console/adminAuth", () => ({
  verificarSenhaAdmin: vi.fn(() => Promise.resolve({ ok: true, erro: null })),
}));
vi.mock("@/lib/impressao/despacho", () => ({
  imprimirLancamento: vi.fn(() => Promise.resolve({ ok: true })),
}));

import { setAppMock } from "@/test/mockApp";
import PDVView from "./PDVView";

const PRODUTO_CERVEJA = { id: 1, name: "Cerveja", price: 16.1, category: "Bebidas" };

const CERVEJA_3   = { uid: "i1", id: 1, name: "Cerveja", price: 16.1, qty: 3 };
const BATATA      = { uid: "i2", id: 2, name: "Batata",  price: 20,   qty: 1 };
const RODIZIO_CANCELADO = {
  uid: "i9", id: 9, name: "Rodízio", price: 99, qty: 1,
  cancelado: true, motivoCancelamento: "lançado errado", canceladoPor: "Ana",
};

let notify, updatePending, addPending, removePending;

beforeEach(() => {
  vi.clearAllMocks();
  notify        = vi.fn();
  updatePending = vi.fn(() => Promise.resolve({ error: null }));
  addPending    = vi.fn(() => Promise.resolve({ error: null }));
  removePending = vi.fn(() => Promise.resolve({ error: null }));
});

const comanda = (id, numero, items, total = 0) => ({
  id, comanda: numero, mesa: "", garcom: "Bruno", status: "open",
  items, total, created_at: new Date().toISOString(),
});

function montar(pending) {
  setAppMock({
    caixaAberto: true, pending, products: [PRODUTO_CERVEJA],
    updatePending, addPending, removePending,
  });
  render(<MemoryRouter><PDVView notify={notify} /></MemoryRouter>);
}

/** Busca a comanda 7 na grade e entra nela. */
function entrarNaComandaSete() {
  fireEvent.change(screen.getByPlaceholderText("Buscar comanda..."), { target: { value: "7" } });
  fireEvent.click(screen.getByRole("button", { name: /Comanda 7/ }));
}

/** Toca no cartão da Cerveja no cardápio (uma linha só, qty acumulada). */
function adicionarCerveja(vezes) {
  const cardapio = document.querySelector(".produto-grid__lista");
  const cartao = within(cardapio).getByRole("button", { name: /Cerveja/ });
  for (let i = 0; i < vezes; i++) fireEvent.click(cartao);
}

const clicar = async (nome) => {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: nome }));
  });
};

/** Abre a modal de transferência da comanda em que já se está. */
function abrirModalDeTransferencia() {
  fireEvent.click(screen.getByRole("button", { name: "Transferir" }));
}

const botoesTodos = () => [...document.querySelectorAll(".pdv__transfer-todos-btn")];
const confirmarTransferencia = () => clicar(/Transferindo para/);

describe("PDVView — total gravado em cada caminho", () => {
  it("lançar pedido: o total ignora o cancelado antigo e vem arredondado", async () => {
    montar([comanda("ORDEM7", "7", [RODIZIO_CANCELADO], 0)]);

    entrarNaComandaSete();
    adicionarCerveja(3);
    await clicar("Lançar Pedido");

    const [id, mudancas] = updatePending.mock.calls[0];
    expect(id).toBe("ORDEM7");
    // O Rodízio cancelado de R$ 99 continua na lista, mas não na conta.
    expect(mudancas.items).toHaveLength(2);
    expect(mudancas.total).toBe(48.3);
  });

  it("finalizar comanda: a gravação antes do checkout usa o mesmo total", async () => {
    montar([comanda("ORDEM7", "7", [RODIZIO_CANCELADO], 0)]);

    entrarNaComandaSete();
    adicionarCerveja(3);
    fireEvent.click(screen.getByRole("button", { name: /Finalizar Comanda/ }));
    await clicar("Sim, finalizar");

    const [id, mudancas] = updatePending.mock.calls[0];
    expect(id).toBe("ORDEM7");
    expect(mudancas.total).toBe(48.3);
  });

  it("cancelar item no checkout: o total desconta o item cancelado", async () => {
    montar([comanda("ORDEM7", "7", [CERVEJA_3, BATATA], 68.3)]);

    entrarNaComandaSete();
    // Carrinho vazio: finalizar vai direto para o checkout, sem gravar nada.
    fireEvent.click(screen.getByRole("button", { name: /Finalizar Comanda/ }));
    await clicar("Sim, finalizar");
    expect(updatePending).not.toHaveBeenCalled();

    await clicar("Remover item");
    await clicar("Remover Batata");
    fireEvent.change(document.querySelector(".checkout-view__remocao-motivo"), {
      target: { value: "cliente desistiu" },
    });
    fireEvent.change(screen.getByPlaceholderText("Digite a senha"), { target: { value: "1234" } });
    await clicar("Remover");

    const [id, mudancas] = updatePending.mock.calls[0];
    expect(id).toBe("ORDEM7");
    expect(mudancas.items[1]).toMatchObject({ name: "Batata", cancelado: true });
    // Sem a Batata de R$ 20 a conta é 48.30, não 68.30 nem 48.300000000000004.
    expect(mudancas.total).toBe(48.3);
  });

  it("cancelar item lançado no carrinho: o total desconta o item cancelado", async () => {
    montar([comanda("ORDEM7", "7", [CERVEJA_3, BATATA], 68.3)]);

    entrarNaComandaSete();
    // O segundo botão de lixeira é o da Batata (a lista não é reindexada).
    fireEvent.click(screen.getAllByRole("button", { name: "Cancelar item" })[1]);
    fireEvent.change(screen.getByPlaceholderText("Ex: cliente desistiu, pedido errado..."), {
      target: { value: "cliente desistiu" },
    });
    fireEvent.change(screen.getByPlaceholderText("Digite a senha..."), { target: { value: "1234" } });
    await clicar("Cancelar tudo");

    const [id, mudancas] = updatePending.mock.calls[0];
    expect(id).toBe("ORDEM7");
    expect(mudancas.items[1]).toMatchObject({ name: "Batata", cancelado: true });
    expect(mudancas.total).toBe(48.3);
  });

  it("transferir para comanda nova: a comanda criada nasce com o total arredondado", async () => {
    montar([comanda("ORDEM7", "7", [CERVEJA_3], 48.3)]);

    entrarNaComandaSete();
    abrirModalDeTransferencia();
    fireEvent.click(botoesTodos()[0]);
    fireEvent.click(screen.getByRole("button", { name: "+ Nova comanda" }));
    fireEvent.change(screen.getByPlaceholderText(/Nome ou número da nova comanda/), {
      target: { value: "99" },
    });
    await confirmarTransferencia();

    const [nova] = addPending.mock.calls[0];
    expect(nova.comanda).toBe("99");
    expect(nova.items).toEqual([{ ...CERVEJA_3, qty: 3 }]);
    expect(nova.total).toBe(48.3);
  });

  it("transferir para comanda existente: o total do destino ignora o cancelado do destino", async () => {
    montar([
      comanda("ORDEM7", "7", [CERVEJA_3], 48.3),
      comanda("ORDEM8", "8", [RODIZIO_CANCELADO], 0),
    ]);

    entrarNaComandaSete();
    abrirModalDeTransferencia();
    fireEvent.click(botoesTodos()[0]);
    fireEvent.click(screen.getByRole("button", { name: /Comanda 8/ }));
    await confirmarTransferencia();

    const [idDestino, mudancasDestino] = updatePending.mock.calls[0];
    expect(idDestino).toBe("ORDEM8");
    expect(mudancasDestino.items).toEqual([RODIZIO_CANCELADO, { ...CERVEJA_3, qty: 3 }]);
    // O Rodízio cancelado de R$ 99 que já estava no destino não entra.
    expect(mudancasDestino.total).toBe(48.3);
  });

  it("origem falha depois do destino: o destino volta ao total original", async () => {
    // O destino já tem a conta fechada em R$ 48,30 (três cervejas) mais um
    // Rodízio cancelado. Se a gravação da origem falhar depois da do destino,
    // o PDV desfaz o destino — e o total desfeito tem de ser o de antes.
    const destinoOrig = [RODIZIO_CANCELADO, CERVEJA_3];
    updatePending
      .mockResolvedValueOnce({ error: null })                      // destino
      .mockResolvedValueOnce({ error: { message: "rede caiu" } })  // origem
      .mockResolvedValueOnce({ error: null });                     // desfaz destino
    montar([
      comanda("ORDEM7", "7", [BATATA], 20),
      comanda("ORDEM8", "8", destinoOrig, 48.3),
    ]);

    entrarNaComandaSete();
    abrirModalDeTransferencia();
    fireEvent.click(botoesTodos()[0]);
    fireEvent.click(screen.getByRole("button", { name: /Comanda 8/ }));
    await confirmarTransferencia();

    expect(updatePending).toHaveBeenCalledTimes(3);
    const [idDesfaz, mudancasDesfaz] = updatePending.mock.calls[2];
    expect(idDesfaz).toBe("ORDEM8");
    expect(mudancasDesfaz.items).toEqual(destinoOrig);
    expect(mudancasDesfaz.total).toBe(48.3);
    expect(notify).toHaveBeenCalledWith(
      expect.stringContaining("Não foi possível transferir"),
      "err",
    );
  });
});
