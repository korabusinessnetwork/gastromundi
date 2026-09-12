// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

/**
 * Modal Mesa, clique no fundo e campo vazio.
 *
 * O clique no fundo deste modal CONFIRMAVA, ao contrário de todos os outros
 * overlays do PDV, e handleConfirmarMesa não validava o campo, embora ele seja
 * obrigatório, mostre "Campo obrigatório." e desabilite o botão Entrar. O
 * resultado era entrar na comanda sem mesa, e comanda sem mesa não aparece no
 * mapa do salão.
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

let notify, updatePending;

// Comanda sem mesa e sem itens: é o caso em que o PDV pede a mesa antes de entrar.
const semMesa = {
  id: "C9", comanda: "9", mesa: "", apelido: "", garcom: "Bruno",
  status: "open", items: [], total: 0, created_at: new Date().toISOString(),
};

const overlayMesa = () => document.querySelector(".pdv__mesa-overlay");
const campoMesa   = () => screen.getByPlaceholderText(/Ex: 5, Varanda/);
const entrouNaComanda = () => !!screen.queryByRole("button", { name: /Voltar/ });

beforeEach(() => {
  vi.clearAllMocks();
  notify        = vi.fn();
  updatePending = vi.fn(() => Promise.resolve({ error: null }));
  setAppMock({ caixaAberto: true, pending: [semMesa], updatePending });
  render(<MemoryRouter><PDVView notify={notify} /></MemoryRouter>);
  fireEvent.change(screen.getByPlaceholderText(/Buscar comanda/), { target: { value: "9" } });
  fireEvent.click(screen.getByRole("button", { name: /Comanda 9/ }));
});

describe("PDVView, modal Mesa", () => {
  it("clique no fundo cancela, não confirma", async () => {
    expect(overlayMesa()).toBeTruthy();

    await act(async () => {
      fireEvent.mouseDown(overlayMesa());
      fireEvent.click(overlayMesa());
    });

    expect(overlayMesa()).toBeNull();
    expect(entrouNaComanda()).toBe(false);
    expect(updatePending).not.toHaveBeenCalled();
  });

  it("confirmar com a mesa em branco não faz nada", async () => {
    await act(async () => { fireEvent.keyDown(campoMesa(), { key: "Enter" }); });

    expect(overlayMesa()).toBeTruthy();
    expect(entrouNaComanda()).toBe(false);
    expect(updatePending).not.toHaveBeenCalled();
  });

  it("com a mesa preenchida, Entrar continua funcionando", async () => {
    fireEvent.change(campoMesa(), { target: { value: "12" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Entrar na comanda/ }));
    });

    expect(overlayMesa()).toBeNull();
    expect(entrouNaComanda()).toBe(true);
    expect(updatePending).toHaveBeenCalledWith("C9", { mesa: "12", apelido: "" });
  });
});
