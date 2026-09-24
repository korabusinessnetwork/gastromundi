// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

/**
 * Reimpressão do comprovante no histórico de vendas. O que importa:
 * (1) usa a MESMA montadora do fechamento (`montarComprovantePagamento`)
 *     com a venda daquela linha — o papel sai idêntico ao original;
 * (2) despacha para a impressora e dá feedback visível de sucesso;
 * (3) erro de impressão não quebra a tela — mostra a mensagem ao lado.
 */

vi.mock("@/context/AppContext", async () => {
  const { mockUseApp } = await import("@/test/mockApp");
  return { useApp: mockUseApp, AppProvider: ({ children }) => children };
});

const buscarConfigImpressao = vi.fn(() =>
  Promise.resolve({ data: { perfilImpressora: { modo: "navegador" } } })
);
const montarComprovantePagamento = vi.fn((args) => ({ tipo: "comprovante", _args: args }));
vi.mock("@/lib/impressao", () => ({
  buscarConfigImpressao: (...a) => buscarConfigImpressao(...a),
  montarComprovantePagamento: (...a) => montarComprovantePagamento(...a),
}));

const imprimirDocumento = vi.fn(() => Promise.resolve({ error: null }));
vi.mock("@/lib/impressao/drivers", () => ({
  imprimirDocumento: (...a) => imprimirDocumento(...a),
}));

import { setAppMock } from "@/test/mockApp";
import BotaoReimprimirComprovante from "./BotaoReimprimirComprovante";

const VENDA = { id: "v1", comanda: "7", total: 68.3, items: [{ name: "Cerveja", price: 16.1, qty: 3 }] };

beforeEach(() => {
  vi.clearAllMocks();
  setAppMock({});
});

const clicar = async (nome) => {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: nome }));
  });
};

describe("BotaoReimprimirComprovante", () => {
  it("reimprime com a mesma montadora do fechamento e mostra sucesso", async () => {
    render(<BotaoReimprimirComprovante venda={VENDA} />);

    await clicar(/Reimprimir comprovante/);

    expect(montarComprovantePagamento).toHaveBeenCalledTimes(1);
    expect(montarComprovantePagamento.mock.calls[0][0].venda).toBe(VENDA);
    expect(imprimirDocumento).toHaveBeenCalledWith(
      { tipo: "comprovante", _args: expect.any(Object) },
      { modo: "navegador" }
    );
    expect(await screen.findByText(/Enviado para impressão/)).toBeInTheDocument();
  });

  it("erro de impressão aparece na tela sem quebrar", async () => {
    imprimirDocumento.mockResolvedValueOnce({ error: { message: "Impressora offline" } });
    render(<BotaoReimprimirComprovante venda={VENDA} />);

    await clicar(/Reimprimir comprovante/);

    expect(await screen.findByText(/Impressora offline/)).toBeInTheDocument();
  });
});
