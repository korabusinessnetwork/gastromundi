// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

/**
 * Pagamento dividido, valor negativo.
 *
 * O campo de valor de cada pedaço do split aceitava negativo: R$ 100,00 mais
 * R$ -50,00 somavam os R$ 50,00 da conta, liberavam o Confirmar Pagamento e
 * gravavam um pagamento negativo na venda e no fechamento do caixa. O campo
 * "Recebido" do mesmo arquivo já era protegido disso por `valorRecebido`.
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
vi.mock("@/hooks/useTravaComanda", () => ({ useTravaComanda: () => ({ bloqueio: null }) }));
vi.mock("@/lib/impressao/despacho", () => ({
  imprimirLancamento: vi.fn(() => Promise.resolve({ ok: true })),
}));

import { setAppMock } from "@/test/mockApp";
import PDVView from "./index";

const PRATO = { uid: "i1", id: 1, name: "Prato Feito", price: 25, qty: 2 }; // R$ 50,00

let notify;

const clicar = async (nome) => {
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: nome })); });
};

const camposValor  = () => [...document.querySelectorAll(".checkout-view__split-input")];
const itensDoSplit = () => [...document.querySelectorAll(".checkout-view__split-item")];
const botaoConfirmar = () => screen.getByRole("button", { name: /Confirmar Pagamento/ });

beforeEach(async () => {
  vi.clearAllMocks();
  notify = vi.fn();
  setAppMock({
    caixaAberto: true, products: [],
    pending: [{
      id: "ORDEM7", comanda: "7", mesa: "", garcom: "Bruno", status: "open",
      items: [PRATO], total: 50, created_at: new Date().toISOString(),
    }],
    updatePending: vi.fn(() => Promise.resolve({ error: null })),
    addPending: vi.fn(() => Promise.resolve({ error: null })),
    removePending: vi.fn(() => Promise.resolve({ error: null })),
  });
  render(<MemoryRouter><PDVView notify={notify} /></MemoryRouter>);
  fireEvent.change(screen.getByPlaceholderText(/Buscar comanda/), { target: { value: "7" } });
  fireEvent.click(screen.getByRole("button", { name: /Comanda 7/ }));
  fireEvent.click(screen.getByRole("button", { name: /Finalizar Comanda/ }));
  await clicar("Sim, finalizar");
  await clicar(/Dividir pagamento/);
  await clicar("Dividir"); // dois pedaços de R$ 25,00
});

describe("CheckoutView, valor negativo no pagamento dividido", () => {
  it("valor negativo vira zero e a conta não fecha com a soma falsa", async () => {
    const [primeiro, segundo] = itensDoSplit();
    await act(async () => { fireEvent.click(within(primeiro).getByRole("button", { name: "Pix" })); });
    await act(async () => { fireEvent.click(within(segundo).getByRole("button", { name: "Pix" })); });

    fireEvent.change(camposValor()[0], { target: { value: "100" } });
    fireEvent.change(camposValor()[1], { target: { value: "-50" } });

    // Zero aparece como campo vazio, é a mesma convenção do valor do split.
    expect(camposValor()[1]).toHaveValue(null);
    // R$ 100,00 lançados numa conta de R$ 50,00: sobra a alocar, não confirma.
    expect(botaoConfirmar()).toBeDisabled();
  });

  it("valores positivos que somam a conta continuam confirmando", async () => {
    const [primeiro, segundo] = itensDoSplit();
    await act(async () => { fireEvent.click(within(primeiro).getByRole("button", { name: "Pix" })); });
    await act(async () => { fireEvent.click(within(segundo).getByRole("button", { name: "Pix" })); });

    fireEvent.change(camposValor()[0], { target: { value: "30" } });
    fireEvent.change(camposValor()[1], { target: { value: "20" } });

    expect(camposValor()[0]).toHaveValue(30);
    expect(camposValor()[1]).toHaveValue(20);
    expect(botaoConfirmar()).toBeEnabled();
  });
});
