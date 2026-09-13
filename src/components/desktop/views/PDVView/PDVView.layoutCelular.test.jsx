// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

/**
 * O corpo do PDV precisa EMPILHAR no celular e no tablet.
 *
 * Nessas larguras o carrinho deixa de ser coluna fixa ao lado da grade
 * (`cartWidth === 0`) e entra a barra de abas Produtos/Carrinho, que é irmã da
 * área ativa dentro do mesmo contêiner flex. Sem empilhar, a barra vira uma
 * COLUNA à esquerda: medido no navegador a 390 px, ela ficava com 161 px de
 * largura por 600 de altura, com o rótulo centralizado no meio vertical da
 * tela, e sobravam 229 px para a comanda inteira.
 *
 * O jsdom não calcula layout, então o que dá para prender aqui é a fiação: a
 * classe que empilha existe na largura de celular e não existe na de desktop.
 * A medida de verdade foi feita no Chromium, com o CSS real, antes e depois.
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

const COMANDA = {
  id: "ORDEM7", comanda: "7", mesa: "5", garcom: "Paula", status: "open",
  items: [{ uid: "i1", id: 1, name: "Café", price: 17.5, qty: 2 }],
  total: 35, created_at: new Date().toISOString(),
};

const larguraOriginal = window.innerWidth;

function naLargura(px) {
  window.innerWidth = px;
  setAppMock({
    caixaAberto: true, pending: [COMANDA], products: [],
    updatePending: vi.fn(() => Promise.resolve({ error: null })),
    addPending: vi.fn(() => Promise.resolve({ error: null })),
    removePending: vi.fn(() => Promise.resolve({ error: null })),
  });
  render(<MemoryRouter><PDVView notify={vi.fn()} /></MemoryRouter>);
}

/** Entra na comanda, que é onde a barra de abas existe. */
async function abrirComanda() {
  fireEvent.change(screen.getByPlaceholderText(/Buscar comanda/), { target: { value: "7" } });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /Comanda 7/ }));
  });
}

const corpo = () => document.querySelector(".pdv__body");

beforeEach(() => vi.clearAllMocks());
afterEach(() => { window.innerWidth = larguraOriginal; });

describe("PDV, corpo empilhado no celular", () => {
  it("na largura de celular, o corpo empilha a barra de abas sobre a área", async () => {
    naLargura(390);
    await abrirComanda();

    expect(document.querySelector(".pdv__mobile-tabs")).not.toBeNull();
    expect(corpo().className).toContain("pdv__body--empilhado");
  });

  it("na largura de desktop, o corpo continua lado a lado, com o carrinho fixo", async () => {
    naLargura(1440);
    await abrirComanda();

    // Sem barra de abas: nesta largura a grade e o carrinho aparecem juntos.
    expect(document.querySelector(".pdv__mobile-tabs")).toBeNull();
    expect(corpo().className).not.toContain("pdv__body--empilhado");
  });
});
