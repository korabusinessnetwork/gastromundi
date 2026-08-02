// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

/**
 * Duas travas da tela de fechar a conta que faltavam.
 *
 * 1) Dinheiro abaixo do total, em pagamento ÚNICO. No split a trava sempre
 *    existiu; no pagamento único não — dava para fechar uma conta de R$ 68,30
 *    com R$ 50 na mão. A venda entrava cheia e o caixa nascia com R$ 18,30 de
 *    furo, sem nada na tela dizendo que faltou.
 *
 * 2) `uid` do pedaço cancelado numa remoção PARCIAL. O item cancelado é uma
 *    LINHA NOVA na comanda e precisa de uid próprio: herdando o uid do pedaço
 *    que continua ativo, `mesclarItensComanda` (que só preserva do banco os
 *    uids DESCONHECIDOS) descartava o cancelamento no primeiro lançamento
 *    vindo do Palm — o item voltava inteiro e o cliente pagava o cancelado.
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

const comanda = (id, numero, items, total) => ({
  id, comanda: numero, mesa: "", garcom: "Bruno", status: "open",
  items, total, created_at: new Date().toISOString(),
});

function montar(pending) {
  setAppMock({
    caixaAberto: true, pending, products: [],
    updatePending,
    addPending: vi.fn(() => Promise.resolve({ error: null })),
    removePending: vi.fn(() => Promise.resolve({ error: null })),
  });
  render(<MemoryRouter><PDVView notify={notify} /></MemoryRouter>);
}

const clicar = async (nome) => {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: nome }));
  });
};

/** Entra na comanda 7 e vai direto para a tela de pagamento. */
async function irParaOCheckout(items, total) {
  montar([comanda("ORDEM7", "7", items, total)]);
  fireEvent.change(screen.getByPlaceholderText("Buscar comanda..."), { target: { value: "7" } });
  fireEvent.click(screen.getByRole("button", { name: /Comanda 7/ }));
  fireEvent.click(screen.getByRole("button", { name: /Finalizar Comanda/ }));
  await clicar("Sim, finalizar");
}

const botaoConfirmar = () => screen.getByRole("button", { name: /Confirmar Pagamento/ });
const campoRecebido  = () => document.querySelector(".checkout-view__troco-input");

describe("CheckoutView — dinheiro abaixo do total no pagamento único", () => {
  it("R$ 50 numa conta de R$ 68,30 não confirma, e a tela diz quanto falta", async () => {
    await irParaOCheckout([CERVEJA_3, BATATA], 68.3);

    await clicar("Dinheiro");
    fireEvent.change(campoRecebido(), { target: { value: "50" } });

    expect(botaoConfirmar()).toBeDisabled();
    // O caixa vê o número, não um "selecione a forma de pagamento" enganoso.
    expect(screen.getByText(/Faltam R\$ 18,?\.?30/)).toBeInTheDocument();
    expect(screen.getByText("Falta")).toBeInTheDocument();
  });

  it("valor exato e valor a maior confirmam normalmente", async () => {
    await irParaOCheckout([CERVEJA_3, BATATA], 68.3);

    await clicar("Dinheiro");
    fireEvent.change(campoRecebido(), { target: { value: "68.30" } });
    expect(botaoConfirmar()).toBeEnabled();

    fireEvent.change(campoRecebido(), { target: { value: "100" } });
    expect(botaoConfirmar()).toBeEnabled();
    expect(screen.getByText("Troco")).toBeInTheDocument();
  });

  it("campo Recebido em branco segue valendo como valor exato", async () => {
    await irParaOCheckout([CERVEJA_3, BATATA], 68.3);

    await clicar("Dinheiro");
    expect(campoRecebido()).toHaveValue(null);
    expect(botaoConfirmar()).toBeEnabled();
  });

  it("a trava é só do dinheiro — Pix não pede valor recebido", async () => {
    await irParaOCheckout([CERVEJA_3, BATATA], 68.3);

    await clicar("Pix");
    expect(campoRecebido()).toBeNull();
    expect(botaoConfirmar()).toBeEnabled();
  });
});

describe("CheckoutView — remoção parcial gera uid próprio para o cancelado", () => {
  it("cancelar 1 de 3 cervejas parte a linha em dois itens com uids diferentes", async () => {
    await irParaOCheckout([CERVEJA_3, BATATA], 68.3);

    await clicar("Remover item");
    await clicar("Remover Cerveja");
    // O stepper nasce em 1 de 3: remoção parcial.
    fireEvent.change(document.querySelector(".checkout-view__remocao-motivo"), {
      target: { value: "cliente desistiu de uma" },
    });
    fireEvent.change(screen.getByPlaceholderText("Digite a senha"), { target: { value: "1234" } });
    await clicar("Remover 1");

    const [, mudancas] = updatePending.mock.calls[0];
    const [ativa, cancelada] = mudancas.items;

    expect(ativa).toMatchObject({ name: "Cerveja", qty: 2, uid: "i1" });
    expect(cancelada).toMatchObject({ name: "Cerveja", qty: 1, cancelado: true });
    expect(cancelada.uid).toBeTruthy();
    expect(cancelada.uid).not.toBe(ativa.uid);
    // Duas cervejas ativas (32,20) + Batata (20) = 52,20.
    expect(mudancas.total).toBe(52.2);
  });

  it("com uid próprio o cancelamento sobrevive à mesclagem com o Palm", async () => {
    await irParaOCheckout([CERVEJA_3, BATATA], 68.3);

    await clicar("Remover item");
    await clicar("Remover Cerveja");
    fireEvent.change(document.querySelector(".checkout-view__remocao-motivo"), {
      target: { value: "cliente desistiu de uma" },
    });
    fireEvent.change(screen.getByPlaceholderText("Digite a senha"), { target: { value: "1234" } });
    await clicar("Remover 1");

    const [, mudancas] = updatePending.mock.calls[0];

    // Agora a cena pelo lado do PALM, que é onde o cancelamento se perdia.
    // O garçom lança uma porção sem saber da remoção feita no caixa: a base
    // dele ainda é a comanda inteira, e o banco já tem a linha cancelada.
    const PORCAO = { uid: "palm-1", id: 3, name: "Porção", price: 30, qty: 1 };
    const { items } = mesclarItensComanda({
      base:      [CERVEJA_3, BATATA],
      propostos: [CERVEJA_3, BATATA, PORCAO],
      banco:     mudancas.items,
    });

    // Com uid herdado, a linha cancelada contava como "já conhecida" e era
    // descartada: a cerveja voltava inteira e o cliente pagava o cancelado.
    expect(items.filter(i => i.cancelado)).toHaveLength(1);
    expect(items).toContainEqual(PORCAO);
  });
});
