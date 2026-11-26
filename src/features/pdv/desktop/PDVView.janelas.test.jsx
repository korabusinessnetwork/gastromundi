// @vitest-environment jsdom
//
// Refatoração 3: a lógica do PDV foi para `usePdv` e cada janela para
// `PDVView/pdv/`. Estas janelas não tinham teste de tela; os testes prendem o
// caminho do operador em cada uma: a mesa pedida ao abrir comanda vazia e o
// cancelamento da comanda inteira, com senha e motivo.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/context/AppContext", async () => {
  const { ganchosDoMock } = await import("@/test/mockApp");
  return { ...ganchosDoMock, AppProvider: ({ children }) => children };
});
vi.mock("@/lib/supabase", async () => {
  const { createMockSupabase } = await import("@/test/mockSupabase");
  return { supabase: createMockSupabase() };
});
vi.mock("@/lib/logger", () => ({ logAction: vi.fn() }));
vi.mock("@/features/jarvas/dados/jarvas", () => ({ emitirEvento: vi.fn() }));
vi.mock("@/hooks/useTravaComanda", () => ({ useTravaComanda: () => ({ bloqueio: null }) }));
vi.mock("@/features/sessao/dados/adminAuth", () => ({
  verificarSenhaAdmin: vi.fn(() => Promise.resolve({ ok: true, erro: null })),
}));
vi.mock("@/features/impressao/regras/despacho", () => ({ imprimirLancamento: vi.fn(() => Promise.resolve({ ok: true })) }));

import { setAppMock } from "@/test/mockApp";
import { verificarSenhaAdmin } from "@/features/sessao/dados/adminAuth";
import PDVView from "./index";

let notify, updatePending, removePending;

beforeEach(() => {
  vi.clearAllMocks();
  notify        = vi.fn();
  updatePending = vi.fn(() => Promise.resolve({ error: null }));
  removePending = vi.fn(() => Promise.resolve({ error: null }));
});

const comanda = (id, numero, items, total, mesa = "") => ({
  id, comanda: numero, mesa, garcom: "Bruno", status: "open",
  items, total, created_at: new Date().toISOString(),
});

function montar(pending) {
  setAppMock({
    caixaAberto: true, pending, products: [],
    currentUser: { id: 1, name: "Gerente", username: "gerente1", role: "gerente", permissions: { pdv: true } },
    updatePending, removePending,
    addPending: vi.fn(() => Promise.resolve({ error: null })),
  });
  render(<MemoryRouter><PDVView notify={notify} /></MemoryRouter>);
}

const clicar = async (alvo) => { await act(async () => { fireEvent.click(alvo); }); };

async function abrirComanda(numero) {
  fireEvent.change(screen.getByPlaceholderText("Buscar comanda..."), { target: { value: numero } });
  await clicar(screen.getByRole("button", { name: new RegExp(`Comanda ${numero}`) }));
}

describe("PDV, mesa pedida ao abrir comanda vazia", () => {
  it("comanda vazia sem mesa pede a mesa e grava antes de entrar", async () => {
    montar([comanda("ORDEM9", "9", [], 0)]);
    await abrirComanda("9");

    expect(screen.getByText("Informe a mesa antes de continuar")).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText("Ex: 5, Varanda, Salão 2..."), { target: { value: "5" } });
    await clicar(screen.getByRole("button", { name: /Entrar na comanda/ }));

    expect(updatePending).toHaveBeenCalledWith("ORDEM9", expect.objectContaining({ mesa: "5" }));
    expect(screen.queryByText("Informe a mesa antes de continuar")).toBeNull();
  });

  it("comanda que já tem mesa entra direto, sem perguntar", async () => {
    montar([comanda("ORDEM8", "8", [], 0, "3")]);
    await abrirComanda("8");
    expect(screen.queryByText("Informe a mesa antes de continuar")).toBeNull();
  });
});

describe("PDV, cancelar a comanda inteira", () => {
  const CAFE = { uid: "i1", id: 1, name: "Café", price: 6, qty: 2 };

  async function cancelarComSenha() {
    montar([comanda("ORDEM7", "7", [CAFE], 12, "2")]);
    await abrirComanda("7");
    await clicar(screen.getByRole("button", { name: /Cancelar Comanda/ }));
    fireEvent.change(screen.getByPlaceholderText("Senha de admin ou gerente"), { target: { value: "1234" } });
    await clicar(screen.getByRole("button", { name: /Verificar Senha/ }));
  }

  it("com senha e motivo, a comanda sai da lista", async () => {
    await cancelarComSenha();
    fireEvent.change(screen.getByPlaceholderText("Ex: cliente desistiu, erro no pedido..."), { target: { value: "cliente desistiu" } });
    await clicar(screen.getByRole("button", { name: /Confirmar Cancelamento/ }));

    expect(removePending).toHaveBeenCalledWith("ORDEM7");
  });

  it("senha recusada não libera o cancelamento", async () => {
    verificarSenhaAdmin.mockResolvedValueOnce({ ok: false, erro: null });
    await cancelarComSenha();

    expect(screen.queryByPlaceholderText("Ex: cliente desistiu, erro no pedido...")).toBeNull();
    expect(removePending).not.toHaveBeenCalled();
  });
});
