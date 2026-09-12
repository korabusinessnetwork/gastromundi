// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

/**
 * Nova Comanda, nome repetido.
 *
 * Abrir "5" com a comanda 5 já aberta criava duas comandas com o mesmo rótulo.
 * No Palm o mapa de comandas é indexado pelo nome, então só uma das duas recebe
 * os lançamentos, e a busca da transferência sempre acha a primeira. A tela tem
 * de barrar antes de gravar.
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

import { setAppMock } from "@/test/mockApp";
import PDVView from "./index";

let notify, addPending;

const comanda5 = {
  id: "C5", comanda: "5", mesa: "3", garcom: "Bruno",
  status: "open", items: [], total: 0, created_at: new Date().toISOString(),
};

beforeEach(() => {
  vi.clearAllMocks();
  notify     = vi.fn();
  addPending = vi.fn(() => Promise.resolve({ error: null }));
  setAppMock({ caixaAberto: true, pending: [comanda5], addPending });
  render(<MemoryRouter><PDVView notify={notify} /></MemoryRouter>);
});

function abrirModalNovaComanda() {
  fireEvent.click(screen.getByRole("button", { name: /Nova Comanda/ }));
  return screen.getByPlaceholderText(/Ex: Mesa 1/);
}

describe("PDVView, nova comanda com nome já em uso", () => {
  it("nome repetido avisa na tela, trava o botão e não grava nada", async () => {
    const campo = abrirModalNovaComanda();
    fireEvent.change(campo, { target: { value: "5" } });

    expect(screen.getByRole("button", { name: /Abrir/ })).toBeDisabled();
    expect(document.body.textContent).toMatch(/Comanda 5 já está aberta/);

    // O Enter não passa pelo botão desabilitado, é o caminho que gravava.
    await act(async () => { fireEvent.keyDown(campo, { key: "Enter" }); });

    expect(addPending).not.toHaveBeenCalled();
    expect(document.body.textContent).toMatch(/já existe/);
  }, 20000);

  it("nome livre continua abrindo a comanda normalmente", async () => {
    const campo = abrirModalNovaComanda();
    fireEvent.change(campo, { target: { value: "6" } });

    const botao = screen.getByRole("button", { name: /Abrir/ });
    expect(botao).not.toBeDisabled();
    await act(async () => { fireEvent.click(botao); });

    expect(addPending).toHaveBeenCalledTimes(1);
    expect(addPending.mock.calls[0][0]).toMatchObject({ comanda: "6", status: "open" });
  }, 20000);
});
