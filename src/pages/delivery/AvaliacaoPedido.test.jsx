// @vitest-environment jsdom
//
// Avaliação do cliente na confirmação do pedido.
//
// O que este arquivo protege é a regra que faz a avaliação existir: o
// comentário é OPCIONAL. Obrigar a escrever depois de a comida chegar é o
// jeito mais rápido de não receber avaliação nenhuma — a nota sozinha já é
// informação. E, num delivery sem salão, essa é a única leitura de
// qualidade que o estabelecimento consegue ter.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { enviarAvaliacaoCliente } = vi.hoisted(() => ({ enviarAvaliacaoCliente: vi.fn() }));
vi.mock("@/lib/feedback", async (importOriginal) => ({
  ...(await importOriginal()),
  enviarAvaliacaoCliente,
}));

import AvaliacaoPedido from "./AvaliacaoPedido";

beforeEach(() => {
  vi.clearAllMocks();
  enviarAvaliacaoCliente.mockResolvedValue({ data: "f1", error: null });
});

const montar = () => render(<AvaliacaoPedido slug="gastromundi" />);
const estrela = (n) => screen.getByRole("button", { name: new RegExp(`^${n} estrela`) });

describe("AvaliacaoPedido", () => {
  it("só pede a nota — o comentário e o enviar só aparecem depois", () => {
    montar();
    expect(screen.getByText("Como foi seu pedido?")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /enviar avaliação/i })).not.toBeInTheDocument();
  });

  it("envia só com a nota, sem escrever nada", async () => {
    const user = userEvent.setup();
    montar();

    await user.click(estrela(5));
    await user.click(screen.getByRole("button", { name: /enviar avaliação/i }));

    await waitFor(() => expect(enviarAvaliacaoCliente).toHaveBeenCalledWith(
      expect.objectContaining({ slug: "gastromundi", nota: 5, texto: "" }),
    ));
  });

  it("diz a nota por extenso — cor sozinha não é informação", async () => {
    // Quem não distingue bem as estrelas preenchidas precisa LER o que
    // escolheu antes de enviar.
    const user = userEvent.setup();
    montar();
    await user.click(estrela(3));
    expect(screen.getByText("Ok")).toBeInTheDocument();
  });

  it("leva o comentário quando a pessoa escreve", async () => {
    const user = userEvent.setup();
    montar();

    await user.click(estrela(4));
    await user.type(screen.getByLabelText(/comentário/i), "Chegou quentinho");
    await user.click(screen.getByRole("button", { name: /enviar avaliação/i }));

    await waitFor(() => expect(enviarAvaliacaoCliente).toHaveBeenCalledWith(
      expect.objectContaining({ nota: 4, texto: "Chegou quentinho" }),
    ));
  });

  it("agradece depois de enviar, em vez de deixar sem saber se foi", async () => {
    const user = userEvent.setup();
    montar();

    await user.click(estrela(5));
    await user.click(screen.getByRole("button", { name: /enviar avaliação/i }));

    await waitFor(() => expect(screen.getByText(/obrigado pela avaliação/i)).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /enviar avaliação/i })).not.toBeInTheDocument();
  });

  it("falha ao enviar avisa e deixa tentar de novo — não finge que deu certo", async () => {
    const user = userEvent.setup();
    enviarAvaliacaoCliente.mockResolvedValue({ data: null, error: { message: "boom" } });
    montar();

    await user.click(estrela(2));
    await user.click(screen.getByRole("button", { name: /enviar avaliação/i }));

    await waitFor(() => expect(screen.getByText(/não deu para enviar/i)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /enviar avaliação/i })).toBeInTheDocument();
    expect(screen.queryByText(/obrigado/i)).not.toBeInTheDocument();
  });

  it("as estrelas dizem o que significam para quem usa leitor de tela", () => {
    montar();
    expect(screen.getByRole("button", { name: /1 estrela — Ruim/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /5 estrelas — Ótimo/ })).toBeInTheDocument();
  });
});
