// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

/**
 * Palm, fila de pedidos em espera que sobrevive ao recarregar.
 *
 * A fila vivia só em useState: recarregar a tela, a aba ser descartada pelo
 * sistema, ou tocar em "Sem internet, lançar pelo Wi-Fi do caixa" (que troca a
 * página inteira) apagava os pedidos acumulados de várias mesas sem aviso, e
 * nada tinha ido ao servidor. Agora a fila é gravada no aparelho e relida ao
 * montar, e o que volta é validado: dado corrompido não derruba a tela.
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
vi.mock("@/hooks/useTravaComanda", () => ({ useTravaComanda: () => ({ bloqueio: null }) }));

import { setAppMock } from "@/test/mockApp";
import { CHAVE_ESPERAS } from "@/pages/mobile/esperasStorage";
import MobilePage from "./MobilePage";

const CERVEJA = { id: 1, name: "Cerveja", price: 16.1, category: "Bebidas" };

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function montar() {
  setAppMock({
    caixaAberto: true, loading: false, sales: [], products: [CERVEJA],
    pending: [{
      id: "ORDEM7", comanda: "7", mesa: "", apelido: null, status: "open",
      items: [], total: 0, garcom: "Bruno", created_at: new Date().toISOString(),
    }],
    currentUser: { username: "bruno", name: "Bruno", role: "garcom" },
    updatePending: vi.fn(() => Promise.resolve({ error: null })),
    addPending: vi.fn(() => Promise.resolve({ error: null })),
    addLancada: vi.fn(),
  });
  return render(<MemoryRouter><MobilePage /></MemoryRouter>);
}

/** Monta um pedido da comanda 7 e deixa em espera. */
function deixarEmEspera() {
  fireEvent.click(screen.getByRole("button", { name: /Cerveja/ }));
  fireEvent.click(screen.getByRole("button", { name: "Abrir carrinho do pedido" }));
  fireEvent.click(screen.getByRole("button", { name: "Lançar pedido" }));
  const teclado = screen.getByRole("group", { name: "Teclado numérico da comanda" });
  fireEvent.click(within(teclado).getByRole("button", { name: "7" }));
  fireEvent.click(screen.getByRole("button", { name: /Deixar em espera/ }));
}

const barraDeEspera = () => screen.queryByRole("button", { name: /pedido(s)? em espera/ });

describe("MobilePage, fila em espera guardada no aparelho", () => {
  it("a fila sobrevive a recarregar a tela", () => {
    const { unmount } = montar();
    deixarEmEspera();
    expect(barraDeEspera()).toHaveTextContent("1 pedido em espera");

    // Recarregar, a aba ser descartada, ou ir para a ponte do caixa: a tela
    // monta do zero e a fila precisa voltar.
    unmount();
    montar();

    expect(barraDeEspera()).toHaveTextContent("1 pedido em espera");
    fireEvent.click(barraDeEspera());
    expect(screen.getByText(/1× Cerveja/)).toBeInTheDocument();
  }, 15000); // monta a tela do Palm duas vezes

  it("fila guardada corrompida não derruba a tela, ela abre vazia", () => {
    window.localStorage.setItem(CHAVE_ESPERAS, "[{\"comanda\": quebrado");

    montar();

    expect(barraDeEspera()).toBeNull();
    expect(screen.getByRole("button", { name: "Abrir carrinho do pedido" })).toBeInTheDocument();
    expect(window.localStorage.getItem(CHAVE_ESPERAS)).toBeNull();
  });

  it("entrada sem itens guardada por engano é ignorada", () => {
    window.localStorage.setItem(CHAVE_ESPERAS, JSON.stringify([{ comanda: "7", items: [] }]));

    montar();

    expect(barraDeEspera()).toBeNull();
  });
});
