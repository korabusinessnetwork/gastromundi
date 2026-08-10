// @vitest-environment jsdom
//
// Run 1 da auditoria — abertura de caixa.
//
// O defeito: `salvando` ficava true para sempre depois de uma falha de
// gravação. Quem chama (DesktopLayout) avisa "não foi possível abrir o caixa —
// tente novamente" e MANTÉM o modal aberto de propósito, para o operador saber
// que o caixa não abriu. Sem liberar o botão, o "tente novamente" era
// impossível de seguir: o botão travava em "Abrindo..." e a única saída era
// fechar o modal e começar de novo.
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

import AberturaCaixaModal from "./AberturaCaixaModal";

const campo = () => document.querySelector(".abertura-caixa__input");
const botao = () => document.querySelector(".abertura-caixa__botao-confirmar");

function montar(props = {}) {
  return render(
    <AberturaCaixaModal
      onConfirm={vi.fn(() => Promise.resolve())}
      onClose={vi.fn()}
      {...props}
    />,
  );
}

describe("AberturaCaixaModal — botão depois de uma falha (Run 1)", () => {
  it("falha ao abrir libera o botão para tentar de novo", async () => {
    const onConfirm = vi.fn(() => Promise.resolve());
    montar({ onConfirm });

    fireEvent.change(campo(), { target: { value: "100" } });
    await act(async () => { fireEvent.click(botao()); });

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(botao()).not.toBeDisabled();
    expect(botao().textContent).toContain("Abrir Caixa");
    expect(screen.queryByText("Abrindo...")).not.toBeInTheDocument();

    // A segunda tentativa tem que chegar ao contexto — é o que o aviso pede.
    await act(async () => { fireEvent.click(botao()); });
    expect(onConfirm).toHaveBeenCalledTimes(2);
  });

  it("não abre dois caixas no clique duplo", async () => {
    let liberar;
    const onConfirm = vi.fn(() => new Promise((resolve) => { liberar = resolve; }));
    montar({ onConfirm });

    fireEvent.change(campo(), { target: { value: "100" } });
    fireEvent.click(botao());
    fireEvent.click(botao());

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(botao().textContent).toContain("Abrindo...");

    await act(async () => { liberar(); });
  });
});

describe("AberturaCaixaModal — valor do fundo (Run 1)", () => {
  it("campo vazio não abre caixa (nem pelo Enter)", () => {
    const onConfirm = vi.fn(() => Promise.resolve());
    montar({ onConfirm });

    expect(botao()).toBeDisabled();
    fireEvent.keyDown(campo(), { key: "Enter" });
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("zero é um fundo válido — caixa sem troco abre", async () => {
    const onConfirm = vi.fn(() => Promise.resolve());
    montar({ onConfirm });

    fireEvent.change(campo(), { target: { value: "0" } });
    expect(botao()).not.toBeDisabled();

    await act(async () => { fireEvent.click(botao()); });
    expect(onConfirm).toHaveBeenCalledWith(0);
  });

  it("centavos chegam como número, não como texto", async () => {
    const onConfirm = vi.fn(() => Promise.resolve());
    montar({ onConfirm });

    fireEvent.change(campo(), { target: { value: "150.50" } });
    await act(async () => { fireEvent.click(botao()); });

    expect(onConfirm).toHaveBeenCalledWith(150.5);
  });
});
