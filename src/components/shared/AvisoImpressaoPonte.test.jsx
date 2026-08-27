// @vitest-environment jsdom
//
// A Ponte tem fila de impressão em disco e desiste depois de algumas
// tentativas, mas isso nunca chegava à tela: papel travado por uma hora e o
// caixa continuava verde. Estes testes seguram o combinado — o aviso só
// existe quando há algo a dizer, o que ele diz é entendível no balcão, e o
// que ele manda fazer resolve de verdade o problema.
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import AvisoImpressaoPonte from "./AvisoImpressaoPonte";

const MINUTO = 60 * 1000;
const O_QUE_FAZER = "Veja se a impressora está ligada e com papel e reimprima o pedido pela tela da Cozinha.";

describe("AvisoImpressaoPonte", () => {
  it("some da tela quando não há impressão parada e a Ponte responde", () => {
    const { container } = render(<AvisoImpressaoPonte impressoes={0} onConferir={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("uma impressão parada fala no singular e diz o que fazer", () => {
    render(<AvisoImpressaoPonte impressoes={1} />);
    expect(screen.getByText("1 impressão não saiu na impressora")).toBeInTheDocument();
    expect(screen.getByText(O_QUE_FAZER)).toBeInTheDocument();
  });

  it("conta impressões, não comandas: um pedido em três pontos são três papéis", () => {
    // A fila da Ponte mistura via de produção fatiada por ponto de impressão,
    // comprovante de pagamento e pré-nota. Chamar tudo de "comanda" era número
    // errado na cara do operador.
    render(<AvisoImpressaoPonte impressoes={3} esperaMs={7 * MINUTO} />);
    expect(screen.getByText("3 impressões não saíram na impressora")).toBeInTheDocument();
    expect(screen.getByText(`A primeira está esperando há 7 minutos. ${O_QUE_FAZER}`)).toBeInTheDocument();
  });

  it("diz para reimprimir pela Cozinha, que é onde a reimpressão de um clique existe", () => {
    render(<AvisoImpressaoPonte impressoes={1} />);
    expect(screen.getByText(/reimprima o pedido pela tela da Cozinha/)).toBeInTheDocument();
  });

  it("um minuto no singular, e menos de um minuto não vira texto", () => {
    const { unmount } = render(<AvisoImpressaoPonte impressoes={1} esperaMs={MINUTO} />);
    expect(screen.getByText(`A primeira está esperando há 1 minuto. ${O_QUE_FAZER}`)).toBeInTheDocument();
    unmount();

    render(<AvisoImpressaoPonte impressoes={1} esperaMs={30 * 1000} />);
    expect(screen.getByText(O_QUE_FAZER)).toBeInTheDocument();
  });

  it("espera longa vira hora, para ninguém contar 90 minutos de cabeça", () => {
    render(<AvisoImpressaoPonte impressoes={2} esperaMs={125 * MINUTO} />);
    expect(screen.getByText(`A primeira está esperando há 2 horas. ${O_QUE_FAZER}`)).toBeInTheDocument();
  });

  it("é anunciado por leitor de tela sem roubar o foco de quem está lançando", () => {
    render(<AvisoImpressaoPonte impressoes={1} />);
    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
  });

  it("o botão de conferir de novo chama o callback", () => {
    const onConferir = vi.fn();
    render(<AvisoImpressaoPonte impressoes={2} onConferir={onConferir} />);
    fireEvent.click(screen.getByRole("button", { name: "Conferir de novo" }));
    expect(onConferir).toHaveBeenCalledTimes(1);
  });

  it("sem callback não oferece botão que não faz nada", () => {
    render(<AvisoImpressaoPonte impressoes={1} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("enquanto está lendo a fila, o botão mostra que está trabalhando e não aceita mais cliques", () => {
    const onConferir = vi.fn();
    render(<AvisoImpressaoPonte impressoes={1} conferindo onConferir={onConferir} />);
    const botao = screen.getByRole("button", { name: "Conferindo…" });
    expect(botao).toBeDisabled();
    fireEvent.click(botao);
    expect(onConferir).not.toHaveBeenCalled();
  });

  it("quando não deu para conferir, o aviso continua na tela e admite que não conferiu", () => {
    render(<AvisoImpressaoPonte impressoes={2} falhaAoConferir onConferir={vi.fn()} />);
    expect(screen.getByText("2 impressões não saíram na impressora")).toBeInTheDocument();
    expect(screen.getByText("Não consegui conferir agora. Tente daqui a pouco.")).toBeInTheDocument();
  });

  it("com a Ponte muda, o aviso aparece mesmo sem impressão conhecida parada", () => {
    // Ponte fora do ar = nada é impresso neste computador. Tela verde aqui é
    // a mentira mais cara que este aviso pode contar.
    render(<AvisoImpressaoPonte impressoes={0} ponteSemResposta onConferir={vi.fn()} />);
    expect(
      screen.getByText("Não estou conseguindo falar com a impressora deste computador")
    ).toBeInTheDocument();
    expect(screen.getByText(/Enquanto isso, nada é impresso neste computador/)).toBeInTheDocument();
  });

  it("com a Ponte muda, não manda reimprimir (não sairia) e lembra o que ficou esperando", () => {
    render(<AvisoImpressaoPonte impressoes={2} ponteSemResposta onConferir={vi.fn()} />);
    expect(
      screen.getByText("Havia 2 impressões esperando. Veja se a Ponte KORA está aberta e se a impressora está ligada e com papel.")
    ).toBeInTheDocument();
    expect(screen.queryByText(/reimprima o pedido pela tela da Cozinha/)).not.toBeInTheDocument();
  });
});
