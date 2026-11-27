// @vitest-environment jsdom
//
// Sair do modal — e, principalmente, NÃO sair quando ninguém pediu.
//
// O defeito que este arquivo tranca: os modais fechavam no `onClick` do
// fundo, confiando num `stopPropagation` no painel. Mas o navegador
// dispara `click` no ANCESTRAL COMUM entre onde o mouse desceu e onde ele
// subiu. Arrastar para selecionar o que se digitou no campo de endereço,
// soltando o mouse um pixel fora do painel, fazia o alvo do clique virar
// o próprio fundo — o painel nem via o evento para poder detê-lo. A tela
// de entrega inteira se fechava, levando junto o que a pessoa acabara de
// escrever.
//
// jsdom não simula seleção de texto, então o gesto é reproduzido como ele
// realmente chega ao DOM: mousedown no campo, e o `click` seguinte tendo
// o FUNDO como alvo (que é exatamente o que o navegador faz quando os dois
// extremos do gesto estão em elementos diferentes).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { useSairDoModal } from "./useSairDoModal";

const sair = vi.fn();

function Modal() {
  const fundo = useSairDoModal(sair);
  return (
    <div data-testid="fundo" className="modal-fundo" {...fundo}>
      <div className="modal-painel">
        <input aria-label="Endereço" defaultValue="Rua X, 10" />
      </div>
    </div>
  );
}

const fundo = () => screen.getByTestId("fundo");
const campo = () => screen.getByLabelText("Endereço");

beforeEach(() => {
  vi.clearAllMocks();
  cleanup();
});

describe("useSairDoModal — o arrasto que fechava a tela", () => {
  it("arrastar do campo para fora NÃO fecha o modal", () => {
    render(<Modal />);

    // O gesto de quem seleciona o texto: aperta dentro, solta fora.
    fireEvent.mouseDown(campo());
    fireEvent.click(fundo());

    // Antes daqui, a tela de entrega se fechava e o endereço digitado
    // voltava para o começo.
    expect(sair).not.toHaveBeenCalled();
  });

  it("clicar de verdade no fundo fecha — a saída continua existindo", () => {
    render(<Modal />);

    fireEvent.mouseDown(fundo());
    fireEvent.click(fundo());

    expect(sair).toHaveBeenCalledTimes(1);
  });

  it("clicar dentro do painel não fecha", () => {
    render(<Modal />);

    fireEvent.mouseDown(campo());
    fireEvent.click(campo());

    expect(sair).not.toHaveBeenCalled();
  });

  it("um arrasto que não fechou não deixa o próximo clique armado", () => {
    render(<Modal />);

    fireEvent.mouseDown(campo());
    fireEvent.click(fundo());
    // Sem zerar a marca, este clique solto no fundo herdaria a decisão do
    // gesto anterior — em qualquer um dos dois sentidos.
    fireEvent.click(fundo());

    expect(sair).not.toHaveBeenCalled();
  });

  it("Esc fecha — no computador, sair não pode depender de achar o ×", () => {
    render(<Modal />);

    fireEvent.keyDown(window, { key: "Escape" });

    expect(sair).toHaveBeenCalledTimes(1);
  });

  it("o ouvinte do teclado sai junto com o modal", () => {
    const { unmount } = render(<Modal />);
    unmount();

    fireEvent.keyDown(window, { key: "Escape" });

    // Um modal desmontado que continua ouvindo Esc fecharia o de trás.
    expect(sair).not.toHaveBeenCalled();
  });
});
