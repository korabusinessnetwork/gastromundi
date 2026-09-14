// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

vi.mock("@/context/AppContext", async () => {
  const { mockUseApp } = await import("@/test/mockApp");
  return { useApp: mockUseApp, AppProvider: ({ children }) => children };
});

const logActionMock = vi.fn();
vi.mock("@/lib/logger", () => ({ logAction: (...args) => logActionMock(...args) }));

const emitirEventoMock = vi.fn();
vi.mock("@/lib/jarvas", () => ({ emitirEvento: (...args) => emitirEventoMock(...args) }));

import { setAppMock } from "@/test/mockApp";
import { useCancelarComanda } from "./useCancelarComanda";

const selectedComanda = {
  id: "pend-1",
  comanda: "5",
  items: [
    { id: 1, name: "Hambúrguer", price: 30, qty: 1 },
    { id: 2, name: "Já cancelado antes", price: 10, qty: 1, cancelado: true, motivoCancelamento: "outro motivo" },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
});

function setup(overrides = {}) {
  const appMock = setAppMock({
    removePending: vi.fn(() => Promise.resolve({ error: null })),
    updatePending: vi.fn(() => Promise.resolve({ error: null })),
    currentUser: { name: "Maria", username: "maria", role: "gerente" },
    ...overrides,
  });
  const { result } = renderHook(() => useCancelarComanda());
  return { appMock, cancelarComanda: result.current.cancelarComanda };
}

describe("useCancelarComanda", () => {
  it("remove a pending, registra o log e emite o evento com o motivo", async () => {
    const { appMock, cancelarComanda } = setup();

    await cancelarComanda(selectedComanda, "  Cliente desistiu  ");

    expect(appMock.removePending).toHaveBeenCalledWith("pend-1");

    expect(logActionMock).toHaveBeenCalledWith(
      "maria",
      "comanda:cancelar",
      expect.objectContaining({ comanda: "5", motivo: "Cliente desistiu" }),
    );

    expect(emitirEventoMock).toHaveBeenCalledWith(
      "pedido.cancelado",
      "pedidos",
      { pedido_id: "pend-1", comanda: "5", motivo: "Cliente desistiu", itens: 2 },
      "maria",
    );
  });

  it("marca todos os itens ainda ativos como cancelados, preservando os já cancelados", async () => {
    const { cancelarComanda } = setup();

    const novosItens = await cancelarComanda(selectedComanda, "Motivo qualquer");

    expect(novosItens).toEqual([
      { id: 1, name: "Hambúrguer", price: 30, qty: 1, cancelado: true, motivoCancelamento: "Motivo qualquer", canceladoPor: "Maria" },
      { id: 2, name: "Já cancelado antes", price: 10, qty: 1, cancelado: true, motivoCancelamento: "outro motivo" },
    ]);
  });

  // ── Integridade e rastreabilidade ────────────────────────────────
  // O que o cliente pediu não pode sumir. Antes, os itens cancelados eram
  // montados aqui e a comanda era apagada em seguida SEM nunca receber a
  // marcação — o único rastro era o payload de um log fire-and-forget.
  describe("o cancelamento fica registrado antes de a comanda sair", () => {
    it("grava motivo e responsável na comanda antes de removê-la", async () => {
      const { appMock, cancelarComanda } = setup();

      await cancelarComanda(selectedComanda, "Cliente desistiu");

      expect(appMock.updatePending).toHaveBeenCalledWith(
        "pend-1",
        expect.objectContaining({
          status: "cancelada",
          note: "Cancelada: Cliente desistiu",
          items: expect.arrayContaining([
            expect.objectContaining({ cancelado: true, motivoCancelamento: "Cliente desistiu", canceladoPor: "Maria" }),
          ]),
        }),
        expect.objectContaining({ baseItems: selectedComanda.items }),
      );
    });

    it("a ordem importa: grava PRIMEIRO, remove depois", async () => {
      // Invertido, o gatilho arquivaria a comanda sem o porquê — e o
      // porquê é justamente o que se quer guardar de um cancelamento.
      const ordem = [];
      const { cancelarComanda } = setup({
        updatePending: vi.fn(() => { ordem.push("gravou"); return Promise.resolve({ error: null }); }),
        removePending: vi.fn(() => { ordem.push("removeu"); return Promise.resolve({ error: null }); }),
      });

      await cancelarComanda(selectedComanda, "Cliente desistiu");

      expect(ordem).toEqual(["gravou", "removeu"]);
    });

    it("se a marcação falhar, o cancelamento segue — a comanda não fica cobrável na grade", async () => {
      // Perder detalhe do arquivo é ruim; deixar uma comanda cancelada
      // aberta e cobrável é pior. O gatilho arquiva a linha de qualquer jeito.
      const { appMock, cancelarComanda } = setup({
        updatePending: vi.fn(() => Promise.resolve({ error: new Error("sem rede") })),
      });

      await expect(cancelarComanda(selectedComanda, "Cliente desistiu")).resolves.toBeDefined();
      expect(appMock.removePending).toHaveBeenCalledWith("pend-1");
    });

    it("se a remoção falhar, não registra um cancelamento que não aconteceu", async () => {
      const { cancelarComanda } = setup({
        removePending: vi.fn(() => Promise.resolve({ error: new Error("sem rede") })),
      });

      await expect(cancelarComanda(selectedComanda, "Cliente desistiu")).rejects.toThrow(/não foi possível/i);
      expect(logActionMock).not.toHaveBeenCalled();
      expect(emitirEventoMock).not.toHaveBeenCalled();
    });
  });
});
