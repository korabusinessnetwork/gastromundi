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
});
