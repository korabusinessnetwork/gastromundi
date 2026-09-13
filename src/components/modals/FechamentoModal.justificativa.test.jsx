// @vitest-environment jsdom
//
// Justificativa obrigatória quando o caixa fecha com diferença.
//
// A regra de negócio (docs/03_REGRAS_DE_NEGOCIO/CAIXA.md) diz que divergência
// acima do limite tolerado exige justificativa, mas a tela chamava o campo de
// "Observação (opcional)" e só travava o botão enquanto salvava: dava para
// fechar o caixa com falta de R$ 80,00 gravando observacao: null, e depois
// ninguém sabia o porquê da falta.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

vi.mock("@/context/AppContext", async () => {
  const { mockUseApp } = await import("@/test/mockApp");
  return { useApp: mockUseApp, AppProvider: ({ children }) => children };
});

import { setAppMock } from "@/test/mockApp";
import FechamentoModal from "./FechamentoModal";

const venda = (id, pagamentos) => ({
  id,
  at: new Date().toISOString(),
  total: pagamentos.reduce((s, p) => s + p.valor, 0),
  pagamentos,
});

const inputConferido = (i = 0) =>
  document.querySelectorAll(".fechamento-modal__input-conferido")[i];

const botaoConfirmar = () => screen.getByText("Confirmar Fechamento").closest("button");
const campoObservacao = () => document.querySelector(".fechamento-modal__obs-textarea");

function montar(props = {}) {
  return render(
    <FechamentoModal
      sales={[venda(1, [{ metodo: "dinheiro", valor: 100 }])]}
      fundoAtual={0}
      sessaoAbertaEm={null}
      onConfirm={vi.fn(() => Promise.resolve())}
      onClose={vi.fn()}
      {...props}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  setAppMock({ meiosPagamento: ["dinheiro", "credito", "debito", "pix"] });
});

describe("FechamentoModal, justificativa da diferença", () => {
  it("com falta no caixa o botão trava, o motivo aparece e nada é gravado sem justificativa", async () => {
    const onConfirm = vi.fn(() => Promise.resolve());
    montar({ onConfirm });

    // Contou R$ 20,00 numa gaveta que devia ter R$ 100,00: falta de R$ 80,00.
    fireEvent.change(inputConferido(0), { target: { value: "20.00" } });

    expect(screen.getByText("Falta no Caixa")).toBeInTheDocument();
    expect(screen.getByText("Justificativa da diferença (obrigatória)")).toBeInTheDocument();
    expect(screen.queryByText("Observação (opcional)")).not.toBeInTheDocument();
    expect(botaoConfirmar()).toBeDisabled();
    expect(screen.getByRole("alert").textContent).toMatch(/justificativa da diferença/i);

    await act(async () => { fireEvent.click(botaoConfirmar()); });
    expect(onConfirm).not.toHaveBeenCalled();

    // Escrita a justificativa, o fechamento volta a ser possível e ela é gravada.
    fireEvent.change(campoObservacao(), { target: { value: "Cliente levou troco a mais" } });
    expect(botaoConfirmar()).not.toBeDisabled();

    await act(async () => { fireEvent.click(botaoConfirmar()); });
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({
      totalConferido: 20,
      observacao: "Cliente levou troco a mais",
    }));
  });

  it("com caixa conferido nada muda, a observação segue opcional", async () => {
    const onConfirm = vi.fn(() => Promise.resolve());
    montar({ onConfirm });

    expect(screen.getByText("Caixa Conferido")).toBeInTheDocument();
    expect(screen.getByText("Observação (opcional)")).toBeInTheDocument();
    expect(botaoConfirmar()).not.toBeDisabled();

    await act(async () => { fireEvent.click(botaoConfirmar()); });
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({
      totalConferido: 100,
      observacao: null,
    }));
  });
});
