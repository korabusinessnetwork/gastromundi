// @vitest-environment jsdom
//
// CONSOLE-UX 24 — as duas saídas que todo modal do Console passou a ter: a
// tecla Esc e o clique no fundo escuro.
//
// O que estes testes protegem: que o gesto chame o MESMO caminho do "X" (o
// modal decide o que fazer, o hook só entrega o gesto), que arrastar uma
// seleção de dentro para fora não feche nada — é assim que essa feature apaga
// trabalho alheio —, que durante o envio as duas saídas fiquem mudas como os
// botões, e que o ouvinte de teclado seja assinado uma vez só e removido ao
// desmontar, mesmo com a função de fechar recriada a cada render.
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { useFecharModal } from "./useFecharModal";

afterEach(cleanup);

// Casca mínima com a mesma forma dos modais do Console: um fundo escuro e uma
// caixa dentro dele.
function Modal({ aoFechar, bloqueado = false }) {
  const fundo = useFecharModal(aoFechar, bloqueado);
  const [texto, setTexto] = useState("");
  return (
    <div data-testid="fundo" {...fundo}>
      <div data-testid="caixa">
        <input aria-label="Campo" value={texto} onChange={(e) => setTexto(e.target.value)} />
      </div>
    </div>
  );
}

describe("useFecharModal", () => {
  it("Esc chama fechar uma vez", async () => {
    const user = userEvent.setup();
    const fechar = vi.fn();
    render(<Modal aoFechar={fechar} />);

    await user.keyboard("{Escape}");

    expect(fechar).toHaveBeenCalledTimes(1);
  });

  it("outra tecla não fecha", async () => {
    const user = userEvent.setup();
    const fechar = vi.fn();
    render(<Modal aoFechar={fechar} />);

    await user.keyboard("{Enter}a ");

    expect(fechar).not.toHaveBeenCalled();
  });

  it("clique no fundo escuro fecha", async () => {
    const user = userEvent.setup();
    const fechar = vi.fn();
    render(<Modal aoFechar={fechar} />);

    await user.click(screen.getByTestId("fundo"));

    expect(fechar).toHaveBeenCalledTimes(1);
  });

  it("clique dentro do modal não fecha", async () => {
    const user = userEvent.setup();
    const fechar = vi.fn();
    render(<Modal aoFechar={fechar} />);

    await user.click(screen.getByTestId("caixa"));

    expect(fechar).not.toHaveBeenCalled();
  });

  // Selecionar o texto de um campo e soltar o botão do mouse no fundo é um
  // clique que TERMINA fora — sem a memória de onde começou, o dono perderia
  // o formulário por ter arrastado o mouse.
  it("arrastar de dentro para fora não fecha", async () => {
    const user = userEvent.setup();
    const fechar = vi.fn();
    render(<Modal aoFechar={fechar} />);

    await user.pointer([
      { keys: "[MouseLeft>]", target: screen.getByTestId("caixa") },
      { keys: "[/MouseLeft]", target: screen.getByTestId("fundo") },
    ]);

    expect(fechar).not.toHaveBeenCalled();
  });

  it("durante o envio, nem Esc nem clique no fundo fazem nada", async () => {
    const user = userEvent.setup();
    const fechar = vi.fn();
    render(<Modal aoFechar={fechar} bloqueado />);

    await user.keyboard("{Escape}");
    await user.click(screen.getByTestId("fundo"));

    expect(fechar).not.toHaveBeenCalled();
  });

  it("desmontado, o Esc não chama mais nada", async () => {
    const user = userEvent.setup();
    const fechar = vi.fn();
    const { unmount } = render(<Modal aoFechar={fechar} />);

    unmount();
    await user.keyboard("{Escape}");

    expect(fechar).not.toHaveBeenCalled();
  });

  // A função de fechar é recriada a cada render do modal. Se ela entrasse nas
  // dependências do efeito, cada tecla digitada num campo sairia e voltaria a
  // assinar o ouvinte — barulho puro no `document`.
  it("digitar no formulário não re-assina o ouvinte de teclado", async () => {
    const user = userEvent.setup();
    const assinar = vi.spyOn(document, "addEventListener");
    const fechar = vi.fn();
    render(<Modal aoFechar={fechar} />);

    const antes = assinar.mock.calls.filter(([tipo]) => tipo === "keydown").length;
    await user.type(screen.getByLabelText("Campo"), "Bar do Ze");
    const depois = assinar.mock.calls.filter(([tipo]) => tipo === "keydown").length;

    expect(antes).toBe(1);
    expect(depois).toBe(1);
    assinar.mockRestore();
  });

  // O hook não guarda a função da primeira renderização: quem fecha é sempre a
  // versão mais recente. É o que faz o cadastro cair na confirmação de descarte
  // depois que ela aparece, em vez de fechar direto.
  it("Esc usa a função de fechar mais recente", async () => {
    const user = userEvent.setup();
    const primeira = vi.fn();
    const segunda = vi.fn();
    const { rerender } = render(<Modal aoFechar={primeira} />);

    rerender(<Modal aoFechar={segunda} />);
    await user.keyboard("{Escape}");

    expect(primeira).not.toHaveBeenCalled();
    expect(segunda).toHaveBeenCalledTimes(1);
  });
});
