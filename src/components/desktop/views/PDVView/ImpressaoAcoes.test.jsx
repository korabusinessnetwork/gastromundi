// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/context/AppContext", async () => {
  const { mockUseApp } = await import("@/test/mockApp");
  return { useApp: mockUseApp, AppProvider: ({ children }) => children };
});

const buscarConfigImpressaoMock = vi.fn(() => Promise.resolve({ data: {}, error: null }));
vi.mock("@/lib/impressao", () => ({
  montarComprovantePagamento: vi.fn((args) => ({ tipo: "comprovante", ...args })),
  montarCupomPreNota: vi.fn((args) => ({ tipo: "cupom_pre_nota", ...args })),
  buscarConfigImpressao: (...args) => buscarConfigImpressaoMock(...args),
}));

const abrirJanelaImpressaoMock = vi.fn(() => ({ error: null }));
vi.mock("@/lib/impressao/renderizar", () => ({
  renderizarRecibo: vi.fn(() => "<html></html>"),
  abrirJanelaImpressao: (...args) => abrirJanelaImpressaoMock(...args),
}));

import { setAppMock } from "@/test/mockApp";
import ImpressaoAcoes from "./ImpressaoAcoes";

beforeEach(() => {
  vi.clearAllMocks();
  setAppMock({ tenant: { id: "t1", tema: {} } });
});

describe("ImpressaoAcoes — F015 (1 clique, estados visíveis)", () => {
  it("mostra os dois templates sempre visíveis (nada escondido)", () => {
    render(<ImpressaoAcoes montarVenda={() => ({})} />);

    expect(screen.getByRole("button", { name: /comprovante/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /pré-nota/i })).toBeInTheDocument();
  });

  it("clicar em 'Comprovante' monta e abre a janela de impressão, mostrando sucesso", async () => {
    const user = userEvent.setup();
    const montarVenda = vi.fn(() => ({ total: 30 }));

    render(<ImpressaoAcoes montarVenda={montarVenda} />);
    await user.click(screen.getByRole("button", { name: /comprovante/i }));

    await waitFor(() => expect(abrirJanelaImpressaoMock).toHaveBeenCalledTimes(1));
    expect(montarVenda).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/enviado para impressão/i)).toBeInTheDocument();
  });

  it("clicar em 'Pré-nota' usa o template de cupom, não o comprovante", async () => {
    const user = userEvent.setup();
    const { montarCupomPreNota, montarComprovantePagamento } = await import("@/lib/impressao");

    render(<ImpressaoAcoes montarVenda={() => ({})} />);
    await user.click(screen.getByRole("button", { name: /pré-nota/i }));

    await waitFor(() => expect(montarCupomPreNota).toHaveBeenCalledTimes(1));
    expect(montarComprovantePagamento).not.toHaveBeenCalled();
  });

  it("mostra o erro quando a janela de impressão não pode ser aberta (ex.: pop-up bloqueado)", async () => {
    const user = userEvent.setup();
    abrirJanelaImpressaoMock.mockReturnValueOnce({ error: { message: "Pop-up bloqueado pelo navegador." } });

    render(<ImpressaoAcoes montarVenda={() => ({})} />);
    await user.click(screen.getByRole("button", { name: /comprovante/i }));

    await waitFor(() => expect(screen.getByText(/pop-up bloqueado/i)).toBeInTheDocument());
  });
});
