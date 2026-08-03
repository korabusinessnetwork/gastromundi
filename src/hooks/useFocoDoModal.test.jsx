// @vitest-environment jsdom
//
// CONSOLE-UX 25 — o foco dentro dos modais do Console.
//
// O que estes testes protegem: que o modal abra com o cursor no primeiro campo
// (e nunca no "X", que é o primeiro focável do DOM), que o Tab circule dentro
// da caixa em vez de passear pela página que está por baixo do fundo escuro,
// que a lista de focáveis seja recalculada a cada Tab — o conteúdo do modal
// muda embaixo do dono — e que ao fechar o foco volte para o botão que abriu o
// modal, sem quebrar quando esse botão já saiu da página.
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { useFocoDoModal } from "./useFocoDoModal";

afterEach(cleanup);

// Casca mínima com a mesma forma dos modais do Console: o "X" primeiro no DOM,
// campos no corpo e os botões no rodapé.
function Modal({ comCampos = true, desabilitado = false, aoFechar = () => {} }) {
  const caixa = useFocoDoModal();
  const [nome, setNome] = useState("");
  return (
    <div data-testid="fundo">
      <div data-testid="caixa" ref={caixa} tabIndex={-1}>
        <button aria-label="Fechar" onClick={aoFechar}>×</button>
        {comCampos && (
          <input
            aria-label="Nome"
            value={nome}
            disabled={desabilitado}
            onChange={(e) => setNome(e.target.value)}
          />
        )}
        <button disabled={desabilitado}>Salvar</button>
      </div>
    </div>
  );
}

// Simula a página do Console: o botão da linha da tabela abre o modal e
// continua ali atrás — é ele que recebe o foco de volta quando o modal fecha.
// Com `sumirComOBotao`, a linha some enquanto o modal está aberto, que é o que
// acontece quando a lista recarrega depois de criar ou renovar.
function Pagina({ sumirComOBotao = false }) {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      {!(aberto && sumirComOBotao) && (
        <button onClick={() => setAberto(true)}>Abrir</button>
      )}
      <button>Outro</button>
      {aberto && <Modal aoFechar={() => setAberto(false)} />}
    </>
  );
}

describe("useFocoDoModal", () => {
  it("ao abrir, o foco vai para o primeiro campo — não para o X", () => {
    render(<Modal />);

    expect(screen.getByLabelText("Nome")).toHaveFocus();
  });

  it("sem campo nenhum, o foco vai para a caixa do modal", () => {
    render(<Modal comCampos={false} />);

    expect(screen.getByTestId("caixa")).toHaveFocus();
  });

  it("campo desabilitado não recebe o foco inicial", () => {
    render(<Modal desabilitado />);

    expect(screen.getByTestId("caixa")).toHaveFocus();
  });

  it("Tab no último elemento volta para o primeiro", async () => {
    const user = userEvent.setup();
    render(<Modal />);

    screen.getByRole("button", { name: "Salvar" }).focus();
    await user.tab();

    expect(screen.getByLabelText("Fechar")).toHaveFocus();
  });

  it("Shift+Tab no primeiro elemento vai para o último", async () => {
    const user = userEvent.setup();
    render(<Modal />);

    screen.getByLabelText("Fechar").focus();
    await user.tab({ shift: true });

    expect(screen.getByRole("button", { name: "Salvar" })).toHaveFocus();
  });

  it("Shift+Tab com o foco na caixa vai para o último elemento", async () => {
    const user = userEvent.setup();
    render(<Modal comCampos={false} />);

    await user.tab({ shift: true });

    expect(screen.getByRole("button", { name: "Salvar" })).toHaveFocus();
  });

  // A lista de focáveis é lida a cada Tab: com o rodapé desabilitado durante o
  // envio, o ciclo encolhe sozinho em vez de mandar o foco para um botão morto.
  it("elemento desabilitado fica fora do ciclo do Tab", async () => {
    const user = userEvent.setup();
    render(<Modal desabilitado />);

    screen.getByLabelText("Fechar").focus();
    await user.tab();

    expect(screen.getByLabelText("Fechar")).toHaveFocus();
  });

  it("ao fechar, o foco volta para quem abriu o modal", async () => {
    const user = userEvent.setup();
    render(<Pagina />);

    await user.click(screen.getByRole("button", { name: "Abrir" }));
    expect(screen.getByLabelText("Nome")).toHaveFocus();

    await user.click(screen.getByLabelText("Fechar"));

    expect(screen.getByRole("button", { name: "Abrir" })).toHaveFocus();
  });

  it("com o botão que abriu fora da página, o desmonte não quebra", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<Pagina sumirComOBotao />);

    await user.click(screen.getByRole("button", { name: "Abrir" }));
    expect(screen.queryByRole("button", { name: "Abrir" })).toBeNull();

    expect(() => unmount()).not.toThrow();
  });

  it("desmontado, o Tab não é mais interceptado", async () => {
    const user = userEvent.setup();
    render(
      <>
        <button>Antes</button>
        <button>Depois</button>
      </>
    );
    const { unmount } = render(<Modal />);
    unmount();

    screen.getByRole("button", { name: "Antes" }).focus();
    await user.tab();

    expect(screen.getByRole("button", { name: "Depois" })).toHaveFocus();
  });
});
