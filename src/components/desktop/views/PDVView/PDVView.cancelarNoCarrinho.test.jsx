// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

/**
 * Cancelamento PARCIAL de item lançado, feito pelo painel do carrinho.
 *
 * O caminho do fechamento (CheckoutView) já dava `uid` próprio à metade
 * cancelada, e tem teste para isso. O caminho do carrinho não dava: a metade
 * cancelada nascia com o MESMO uid da metade que continua ativa. Como
 * `mesclarItensComanda` só preserva do banco os uids DESCONHECIDOS, o
 * cancelamento era descartado no primeiro lançamento vindo do Palm, o item
 * voltava inteiro para a conta e o cliente pagava o que foi cancelado.
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
vi.mock("@/lib/jarvas", () => ({ emitirEvento: vi.fn() }));
vi.mock("@/hooks/useTravaComanda", () => ({
  useTravaComanda: () => ({ bloqueio: null }),
}));
vi.mock("@/lib/adminAuth", () => ({
  verificarSenhaAdmin: vi.fn(() => Promise.resolve({ ok: true, erro: null })),
}));
vi.mock("@/lib/impressao/despacho", () => ({
  imprimirLancamento: vi.fn(() => Promise.resolve({ ok: true })),
}));

import { setAppMock } from "@/test/mockApp";
import { mesclarItensComanda } from "@/lib/comandaItens";
import PDVView from "./index";

const CERVEJA_3 = { uid: "i1", id: 1, name: "Cerveja", price: 16.1, qty: 3 };
const BATATA    = { uid: "i2", id: 2, name: "Batata",  price: 20,   qty: 1 };

let notify, updatePending;

beforeEach(() => {
  vi.clearAllMocks();
  notify        = vi.fn();
  updatePending = vi.fn(() => Promise.resolve({ error: null }));
});

const clicar = async (nome) => {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: nome }));
  });
};

/** Entra na comanda 7 e para no painel do carrinho, sem ir ao fechamento. */
async function irParaOCarrinho(items, total) {
  setAppMock({
    caixaAberto: true,
    pending: [{
      id: "ORDEM7", comanda: "7", mesa: "", garcom: "Bruno", status: "open",
      items, total, created_at: new Date().toISOString(),
    }],
    products: [],
    updatePending,
    addPending: vi.fn(() => Promise.resolve({ error: null })),
    removePending: vi.fn(() => Promise.resolve({ error: null })),
  });
  render(<MemoryRouter><PDVView notify={notify} /></MemoryRouter>);
  fireEvent.change(screen.getByPlaceholderText("Buscar comanda..."), { target: { value: "7" } });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /Comanda 7/ }));
  });
}

/** Cancela `quantas` unidades da cerveja pelo botão do item no carrinho. */
async function cancelarCervejaNoCarrinho(quantas) {
  // Um botão por item lançado; o primeiro é a cerveja.
  await act(async () => {
    fireEvent.click(screen.getAllByRole("button", { name: "Cancelar item" })[0]);
  });
  fireEvent.change(screen.getByPlaceholderText("Ex: cliente desistiu, pedido errado..."), {
    target: { value: "cliente desistiu de uma" },
  });
  fireEvent.change(screen.getByPlaceholderText("Digite a senha..."), { target: { value: "1234" } });
  await clicar(`Cancelar ${quantas}`);
}

describe("PDV, cancelar item lançado pelo carrinho", () => {
  it("cancelar 1 de 3 cervejas parte a linha em duas, com uids diferentes", async () => {
    await irParaOCarrinho([CERVEJA_3, BATATA], 68.3);

    await cancelarCervejaNoCarrinho(1);

    const [, mudancas] = updatePending.mock.calls[0];
    const [ativa, cancelada] = mudancas.items;

    expect(ativa).toMatchObject({ name: "Cerveja", qty: 2, uid: "i1" });
    expect(cancelada).toMatchObject({
      name: "Cerveja", qty: 1, cancelado: true, motivoCancelamento: "cliente desistiu de uma",
    });
    expect(cancelada.uid).toBeTruthy();
    expect(cancelada.uid).not.toBe(ativa.uid);
    // Duas cervejas ativas (32,20) mais a batata (20) = 52,20.
    expect(mudancas.total).toBe(52.2);
  });

  it("com uid próprio o cancelamento sobrevive ao lançamento seguinte do Palm", async () => {
    await irParaOCarrinho([CERVEJA_3, BATATA], 68.3);

    await cancelarCervejaNoCarrinho(1);
    const [, mudancas] = updatePending.mock.calls[0];

    // A cena pelo lado do PALM: o garçom lança uma porção sem saber do
    // cancelamento feito no caixa, então a base dele é a comanda inteira e o
    // banco já tem a linha cancelada.
    const PORCAO = { uid: "palm-1", id: 3, name: "Porção", price: 30, qty: 1 };
    const { items } = mesclarItensComanda({
      base:      [CERVEJA_3, BATATA],
      propostos: [CERVEJA_3, BATATA, PORCAO],
      banco:     mudancas.items,
    });

    expect(items.filter(i => i.cancelado)).toHaveLength(1);
    expect(items).toContainEqual(PORCAO);
  });
});
