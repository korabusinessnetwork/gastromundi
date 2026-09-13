// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

/**
 * Reimpressão da via de produção (comanda da cozinha) a partir do PDV.
 * O que importa: dispara `enviarViaProducao` com a comanda aberta (mesmo
 * caminho do lançamento, então roteamento por ponto e formato idênticos),
 * dá feedback de sucesso, e um erro não quebra a comanda — mostra a
 * mensagem ao lado.
 */

const enviarViaProducao = vi.fn(() => Promise.resolve({ error: null }));
vi.mock("@/lib/impressao/despacho", () => ({
  enviarViaProducao: (...a) => enviarViaProducao(...a),
}));

import BotaoReimprimirVia from "./BotaoReimprimirVia";

const PEDIDO = {
  id: "ORDEM7", comanda: "7", garcom: "Bruno",
  items: [{ id: 1, name: "Cerveja", qty: 3, category: "bebida" }],
};

beforeEach(() => vi.clearAllMocks());

const clicar = async (nome) => {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: nome }));
  });
};

describe("BotaoReimprimirVia", () => {
  it("reimprime a via da comanda aberta e mostra sucesso", async () => {
    render(<BotaoReimprimirVia pedido={PEDIDO} />);

    await clicar(/Reimprimir comanda/);

    expect(enviarViaProducao).toHaveBeenCalledWith(PEDIDO);
    expect(await screen.findByText(/Enviado para a cozinha/)).toBeInTheDocument();
  });

  it("erro de impressão aparece na tela sem quebrar", async () => {
    enviarViaProducao.mockResolvedValueOnce({ error: { message: "Sem papel na cozinha" } });
    render(<BotaoReimprimirVia pedido={PEDIDO} />);

    await clicar(/Reimprimir comanda/);

    expect(await screen.findByText(/Sem papel na cozinha/)).toBeInTheDocument();
  });
});
