// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

/**
 * Run 3 (mesas e comandas) — transferência de itens entre comandas.
 *
 * Transferir reescreve o `items` inteiro das DUAS comandas, uma depois da
 * outra. É a operação mais perigosa do PDV: cada furo aqui é item cobrado duas
 * vezes, item que desaparece da conta, ou item cancelado que volta a ser
 * cobrável. Os três testes abaixo cobrem os três furos fechados nesta run.
 */

// A trava real bate no Supabase. O que importa aqui é o estado "outro aparelho
// ganhou a corrida da trava", que o hook entrega como `bloqueio`. O objeto é
// estável entre renders de propósito: é exatamente assim que o bug acontece na
// prática — o efeito que expulsa da comanda depende de `[bloqueio]`, então um
// bloqueio que já existia antes de entrar na comanda nunca o dispara.
const { trava } = vi.hoisted(() => ({ trava: { bloqueio: null } }));

vi.mock("@/context/AppContext", async () => {
  const { mockUseApp } = await import("@/test/mockApp");
  return { useApp: mockUseApp, AppProvider: ({ children }) => children };
});

vi.mock("@/lib/supabase", async () => {
  const { createMockSupabase } = await import("@/test/mockSupabase");
  return { supabase: createMockSupabase() };
});

vi.mock("@/lib/logger", () => ({ logAction: vi.fn() }));
vi.mock("@/lib/jarvas/jarvas", () => ({ emitirEvento: vi.fn() }));
vi.mock("@/hooks/useTravaComanda", () => ({
  useTravaComanda: () => ({ bloqueio: trava.bloqueio }),
}));

import { setAppMock } from "@/test/mockApp";
import PDVView from "./PDVView";

const CERVEJA_CANCELADA = {
  uid: "i1", id: 1, name: "Cerveja", price: 16.1, qty: 2,
  cancelado: true, motivoCancelamento: "cliente desistiu", canceladoPor: "Bruno",
};
const BATATA        = { uid: "i2", id: 2, name: "Batata", price: 20, qty: 1 };
const CERVEJA_ATIVA = { uid: "i3", id: 1, name: "Cerveja", price: 16.1, qty: 1 };

let notify, updatePending, removePending, addPending;

beforeEach(() => {
  vi.clearAllMocks();
  trava.bloqueio = null;
  notify         = vi.fn();
  updatePending  = vi.fn(() => Promise.resolve({ error: null }));
  removePending  = vi.fn(() => Promise.resolve({ error: null }));
  addPending     = vi.fn(() => Promise.resolve({ error: null }));
});

const origemCom = (items) => ({
  id: "ORIGEM", comanda: "7", mesa: "1", garcom: "Bruno",
  status: "open", items, total: 0, created_at: new Date().toISOString(),
});

const destinoCom = (items, total = 0) => ({
  id: "DESTINO", comanda: "8", mesa: "2", garcom: "Ana",
  status: "open", items, total, created_at: new Date().toISOString(),
});

function montar(pending) {
  const app = () => setAppMock({ caixaAberto: true, pending, updatePending, removePending, addPending });
  app();
  const arvore = () => <MemoryRouter><PDVView notify={notify} /></MemoryRouter>;
  const { rerender } = render(arvore());
  return {
    /** Simula o que outro aparelho mudou no banco enquanto a modal está aberta. */
    sincronizar(novoPending) {
      pending = novoPending;
      app();
      act(() => { rerender(arvore()); });
    },
  };
}

/** Entra na comanda 7 e abre a modal de transferência. */
function abrirModalDeTransferencia() {
  fireEvent.change(screen.getByPlaceholderText("Buscar comanda..."), { target: { value: "7" } });
  fireEvent.click(screen.getByRole("button", { name: /Comanda 7/ }));
  fireEvent.click(screen.getByRole("button", { name: "Transferir" }));
}

const itensDaModal   = () => [...document.querySelectorAll(".pdv__transfer-item-nome")].map(n => n.textContent);
const botoesTodos    = () => [...document.querySelectorAll(".pdv__transfer-todos-btn")];
const confirmar      = async () => {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /Transferindo para/ }));
  });
};

describe("PDVView — transferência de itens", () => {
  it("item cancelado não aparece na lista de itens a transferir", () => {
    montar([origemCom([CERVEJA_CANCELADA, BATATA]), destinoCom([])]);

    abrirModalDeTransferencia();

    expect(itensDaModal()).toEqual(["Batata"]);
  });

  it("o cancelado não ressuscita cobrável no destino (o índice sobrevive ao filtro)", async () => {
    // O cancelado é o PRIMEIRO da lista de origem, e o destino já tem uma linha
    // ATIVA do mesmo produto. Se o filtro da modal reindexasse os itens,
    // `transQtds[0]` apontaria para a Cerveja cancelada: ela se fundiria com a
    // linha ativa do destino (mesmoItemDeVenda) e voltaria a ser cobrada.
    montar([
      origemCom([CERVEJA_CANCELADA, BATATA]),
      destinoCom([CERVEJA_ATIVA], 16.1),
    ]);

    abrirModalDeTransferencia();
    fireEvent.click(botoesTodos()[0]);                                   // "Todos" da Batata
    fireEvent.click(screen.getByRole("button", { name: /Comanda 8/ }));  // destino
    await confirmar();

    // 1ª gravação: o destino recebe a Batata e mantém a Cerveja em qty 1.
    const [idDestino, mudancasDestino] = updatePending.mock.calls[0];
    expect(idDestino).toBe("DESTINO");
    expect(mudancasDestino.items).toEqual([CERVEJA_ATIVA, BATATA]);
    expect(mudancasDestino.total).toBe(36.1);

    // 2ª gravação: a origem fica só com o cancelado (que não vale nada).
    const [idOrigem, mudancasOrigem] = updatePending.mock.calls[1];
    expect(idOrigem).toBe("ORIGEM");
    expect(mudancasOrigem.items).toEqual([CERVEJA_CANCELADA]);
    expect(mudancasOrigem.total).toBe(0);

    // Sem item ativo restante, a origem é encerrada.
    expect(removePending).toHaveBeenCalledWith("ORIGEM");
  });

  it("destino fechado em outro aparelho durante a modal: avisa e não grava nada", async () => {
    const origem = origemCom([BATATA]);
    const { sincronizar } = montar([origem, destinoCom([])]);

    abrirModalDeTransferencia();
    fireEvent.click(botoesTodos()[0]);
    fireEvent.click(screen.getByRole("button", { name: /Comanda 8/ }));

    // O caixa fechou a comanda 8 em outro aparelho. O botão continua habilitado
    // (só depende do id escolhido), então o clique chega em handleTransferir.
    sincronizar([origem]);
    await confirmar();

    expect(notify).toHaveBeenCalledWith(
      expect.stringContaining("A comanda de destino não está mais aberta"),
      "err",
    );
    expect(updatePending).not.toHaveBeenCalled();
    expect(removePending).not.toHaveBeenCalled();
  });

  it("comanda em uso por outro aparelho: transferir avisa e não grava nada", async () => {
    trava.bloqueio = { nome: "Ana", username: "ana" };
    montar([origemCom([BATATA]), destinoCom([])]);

    abrirModalDeTransferencia();
    fireEvent.click(botoesTodos()[0]);
    fireEvent.click(screen.getByRole("button", { name: /Comanda 8/ }));
    await confirmar();

    expect(notify).toHaveBeenCalledWith("Comanda 7 está em uso por Ana.", "err");
    expect(updatePending).not.toHaveBeenCalled();
    expect(removePending).not.toHaveBeenCalled();
  });
});
