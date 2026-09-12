// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

/**
 * Palm, aviso de excluir item que não some sozinho.
 *
 * As duas mensagens da exclusão chamavam setToast sem agendar a limpeza, e o
 * Toast só esconde quando a mensagem vira vazia: o aviso ficava colado no topo
 * da tela até outro toast aparecer. Todas as outras mensagens do arquivo já
 * pareiam setToast com setTimeout de 3 segundos.
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
vi.mock("@/lib/adminAuth", () => ({
  verificarSenhaAdmin: vi.fn(() => Promise.resolve({ ok: true, erro: null })),
}));

import { setAppMock } from "@/test/mockApp";
import MobilePage from "./MobilePage";

const CERVEJA = { uid: "i1", id: 1, name: "Cerveja", price: 16.1, qty: 3 };
const BATATA  = { uid: "i2", id: 2, name: "Batata",  price: 20,   qty: 1 };

// O texto continua no DOM depois de sumir (o Toast mantém a última mensagem
// durante o fade), então o que vale é a classe de visível.
const toastVisivel = () => !!document.querySelector(".toast.toast--visible");

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
});

function montar(updatePending) {
  setAppMock({
    caixaAberto: true, loading: false, products: [], sales: [],
    pending: [{
      id: "ORDEM7", comanda: "7", mesa: "", apelido: null, status: "open",
      items: [CERVEJA, BATATA], total: 68.3, garcom: "Bruno",
      created_at: new Date().toISOString(),
    }],
    updatePending,
  });
  render(<MemoryRouter><MobilePage /></MemoryRouter>);
  fireEvent.click(screen.getByRole("tab", { name: /Comandas/ }));
  fireEvent.change(screen.getByPlaceholderText(/Buscar comanda/), { target: { value: "7" } });
  fireEvent.click(screen.getByRole("button", { name: /Comanda 7/ }));
}

async function excluirBatata() {
  fireEvent.click(screen.getByRole("button", { name: "Excluir Batata" }));
  fireEvent.change(screen.getByLabelText("Motivo *"), { target: { value: "pedido errado" } });
  fireEvent.change(screen.getByLabelText(/Senha do administrador/), { target: { value: "1234" } });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Excluir item" }));
  });
}

/** 3s da mensagem + 400ms do fade do Toast. */
const esperarOToastSumir = async () => {
  await act(async () => { vi.advanceTimersByTime(3000); });  // limpa a mensagem
  await act(async () => { vi.advanceTimersByTime(400); });   // fade do Toast
};

describe("MobilePage, o aviso de excluir item some sozinho", () => {
  it("aviso de sucesso some depois de alguns segundos", async () => {
    montar(vi.fn(() => Promise.resolve({ error: null })));
    await excluirBatata();

    expect(screen.getByText("Item excluído da comanda.")).toBeInTheDocument();
    expect(toastVisivel()).toBe(true);

    await esperarOToastSumir();
    expect(toastVisivel()).toBe(false);
  });

  it("aviso de falha na gravação também some sozinho", async () => {
    montar(vi.fn(() => Promise.resolve({ error: { message: "rede caiu" } })));
    await excluirBatata();

    expect(screen.getByText("Não foi possível excluir o item. Tente de novo.")).toBeInTheDocument();
    expect(toastVisivel()).toBe(true);

    await esperarOToastSumir();
    expect(toastVisivel()).toBe(false);
  });
});
