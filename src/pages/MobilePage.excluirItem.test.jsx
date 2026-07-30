// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

/**
 * Run 3 (mesas e comandas) — exclusão de item já lançado pelo Palm.
 *
 * O garçom cancela um item com motivo + senha de gerente. O item não sai da
 * lista: fica cancelado para a trilha de auditoria. O `total` regravado é o que
 * o caixa vai cobrar, então ele precisa somar SÓ os itens ativos e vir
 * arredondado — se somasse o cancelado, o cliente pagaria por um item que o
 * gerente autorizou tirar da conta.
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
vi.mock("@/lib/adminAuth", () => ({
  verificarSenhaAdmin: vi.fn(() => Promise.resolve({ ok: true, erro: null })),
}));

import { setAppMock } from "@/test/mockApp";
import MobilePage from "./MobilePage";

const CERVEJA = { uid: "i1", id: 1, name: "Cerveja", price: 16.1, qty: 3 };
const BATATA  = { uid: "i2", id: 2, name: "Batata",  price: 20,   qty: 1 };

let updatePending;

beforeEach(() => {
  vi.clearAllMocks();
  updatePending = vi.fn(() => Promise.resolve({ error: null }));
});

afterEach(() => {
  vi.restoreAllMocks();
});

function montar() {
  setAppMock({
    caixaAberto: true,
    loading: false,
    products: [],
    sales: [],
    pending: [{
      id: "ORDEM7", comanda: "7", mesa: "", apelido: null, status: "open",
      items: [CERVEJA, BATATA], total: 68.3, garcom: "Bruno",
      created_at: new Date().toISOString(),
    }],
    updatePending,
  });
  render(<MemoryRouter><MobilePage /></MemoryRouter>);
}

/** Abre a folha de detalhe da comanda 7 pela aba Comandas. */
function abrirDetalheDaComandaSete() {
  fireEvent.click(screen.getByRole("tab", { name: /Comandas/ }));
  fireEvent.change(screen.getByPlaceholderText(/Buscar comanda/), { target: { value: "7" } });
  fireEvent.click(screen.getByRole("button", { name: /Comanda 7/ }));
}

/** Preenche motivo + senha e confirma o pop-up de exclusão. */
async function confirmarExclusao() {
  fireEvent.change(screen.getByLabelText("Motivo *"), { target: { value: "pedido errado" } });
  fireEvent.change(screen.getByLabelText(/Senha do administrador/), { target: { value: "1234" } });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Excluir item" }));
  });
}

describe("MobilePage — excluir item da comanda", () => {
  it("o total regravado soma só os itens ativos e vem arredondado", async () => {
    montar();
    abrirDetalheDaComandaSete();

    fireEvent.click(screen.getByRole("button", { name: "Excluir Batata" }));
    await confirmarExclusao();

    const [id, mudancas] = updatePending.mock.calls[0];
    expect(id).toBe("ORDEM7");
    // A Batata continua na lista, marcada como cancelada (auditoria).
    expect(mudancas.items).toHaveLength(2);
    expect(mudancas.items[1]).toMatchObject({
      name: "Batata", cancelado: true, motivoCancelamento: "pedido errado",
    });
    // Sobram três cervejas de R$ 16,10: 48.300000000000004 sem arredondar, e
    // R$ 68,30 se a Batata cancelada ainda entrasse na soma.
    expect(mudancas.total).toBe(48.3);
    expect(screen.getByText("Item excluído da comanda.")).toBeInTheDocument();
  });

  it("gravação que falha avisa o erro em vez de dizer que excluiu", async () => {
    updatePending = vi.fn(() => Promise.resolve({ error: { message: "rede caiu" } }));
    montar();
    abrirDetalheDaComandaSete();

    fireEvent.click(screen.getByRole("button", { name: "Excluir Batata" }));
    await confirmarExclusao();

    expect(screen.getByText("Não foi possível excluir o item. Tente de novo."))
      .toBeInTheDocument();
    expect(screen.queryByText("Item excluído da comanda.")).not.toBeInTheDocument();
  });
});
