// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

/**
 * Run 3 (mesas e comandas) — lançamento pelo Palm (celular do garçom).
 *
 * Dois furos fechados aqui:
 *  - a gravação dos itens não checava `error`: o garçom via "Pedido enviado com
 *    sucesso", o carrinho era limpo e a cozinha nunca recebia o papel. Na fila
 *    de esperas era pior: a espera saía da fila como enviada, para sempre.
 *  - o total era somado inline com `qty || 0` e sem excluir item cancelado: a
 *    mesma comanda tinha um total no celular e outro no PDV.
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
vi.mock("@/hooks/useTravaComanda", () => ({
  useTravaComanda: () => ({ bloqueio: null }),
}));

import { setAppMock } from "@/test/mockApp";
import MobilePage from "./MobilePage";

const CERVEJA = { id: 1, name: "Cerveja", price: 16.1, category: "Bebidas" };
const RODIZIO_CANCELADO = {
  uid: "u9", id: 9, name: "Rodízio", price: 99, qty: 1,
  cancelado: true, motivoCancelamento: "erro do garçom", canceladoPor: "Ana",
};

let updatePending, addPending, addLancada;

beforeEach(() => {
  vi.clearAllMocks();
  // O caminho de erro loga com console.error de propósito; só não polui a saída.
  vi.spyOn(console, "error").mockImplementation(() => {});
  updatePending = vi.fn(() => Promise.resolve({ error: null }));
  addPending    = vi.fn(() => Promise.resolve({ error: null }));
  addLancada    = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
});

const comandaSete = (items) => ({
  id: "ORDEM7", comanda: "7", mesa: "", apelido: null, status: "open",
  items, total: 0, garcom: "Bruno", created_at: new Date().toISOString(),
});

function montar(pending) {
  setAppMock({
    caixaAberto: true, loading: false, pending, products: [CERVEJA], sales: [],
    updatePending, addPending, addLancada,
  });
  render(<MemoryRouter><MobilePage /></MemoryRouter>);
}

/** Toca no cartão do produto `vezes` vezes (uma linha só, qty acumulada). */
function adicionarAoCarrinho(vezes) {
  const cartao = screen.getByRole("button", { name: /Cerveja/ });
  for (let i = 0; i < vezes; i++) fireEvent.click(cartao);
}

/** Abre o carrinho e vai para a folha de lançamento. */
function abrirLancamento() {
  fireEvent.click(screen.getByRole("button", { name: "Abrir carrinho do pedido" }));
  fireEvent.click(screen.getByRole("button", { name: "Lançar pedido" }));
}

/** Digita o número no teclado da comanda. */
function digitarComanda(numero) {
  const teclado = screen.getByRole("group", { name: "Teclado numérico da comanda" });
  for (const d of String(numero)) {
    fireEvent.click(within(teclado).getByRole("button", { name: d }));
  }
}

const clicar = async (nome) => {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: nome }));
  });
};

describe("MobilePage — lançamento pelo Palm", () => {
  it("lançamento que falha avisa o erro e não diz que foi enviado", async () => {
    updatePending.mockResolvedValue({ error: { message: "rede caiu" } });
    montar([comandaSete([])]);

    adicionarAoCarrinho(1);
    abrirLancamento();
    digitarComanda("7");
    await clicar("Adicionar à Comanda");

    expect(screen.getByRole("alert")).toHaveTextContent("Erro ao lançar. Tente de novo.");
    expect(screen.queryByText(/Pedido enviado com sucesso/)).not.toBeInTheDocument();
    // O carrinho continua cheio: o garçom pode tentar de novo sem redigitar.
    expect(screen.getByRole("button", { name: "Abrir carrinho do pedido" }))
      .toHaveTextContent("1 item");
    // E a comanda não entra na lista de "já lançadas" da grade.
    expect(addLancada).not.toHaveBeenCalled();
  });

  it("espera que falha continua na fila com o erro, em vez de sair como enviada", async () => {
    updatePending.mockResolvedValue({ error: { message: "rede caiu" } });
    montar([comandaSete([])]);

    adicionarAoCarrinho(1);
    abrirLancamento();
    digitarComanda("7");
    fireEvent.click(screen.getByRole("button", { name: /Deixar em espera/ }));

    fireEvent.click(screen.getByRole("button", { name: /1 pedido em espera/ }));
    await clicar(/Enviar todos/);

    expect(screen.getByText("Erro ao enviar. Tente de novo.")).toBeInTheDocument();
    expect(screen.queryByText(/comanda\(s\) enviada\(s\)/)).not.toBeInTheDocument();
  });

  it("o total gravado ignora item cancelado e vem arredondado", async () => {
    montar([comandaSete([RODIZIO_CANCELADO])]);

    adicionarAoCarrinho(3);
    abrirLancamento();
    digitarComanda("7");
    await clicar("Adicionar à Comanda");

    const [id, mudancas] = updatePending.mock.calls[0];
    expect(id).toBe("ORDEM7");
    expect(mudancas.items).toHaveLength(2);
    // 16.1 × 3 = 48.300000000000004 sem arredondar; o Rodízio cancelado de
    // R$ 99 não entra; e `qty` sempre vale ao menos 1.
    expect(mudancas.total).toBe(48.3);
  });
});
