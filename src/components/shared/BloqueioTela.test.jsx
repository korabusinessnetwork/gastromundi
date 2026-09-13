// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * O cadeado que substituiu o logout por tempo.
 *
 * O PDV não fecha nunca, e deslogar desmonta a árvore do app: o carrinho
 * montado e ainda não lançado ia junto, sem trilha. Aqui nada é desmontado, a
 * comanda continua atrás, e quem volta digita a senha e segue.
 */

const { destravar } = vi.hoisted(() => ({ destravar: vi.fn() }));
vi.mock("@/lib/bloqueioTela", async (orig) => ({
  ...(await orig()),
  destravarComSenha: destravar,
}));

import BloqueioTela from "./BloqueioTela";

const OPERADOR = { username: "ana", name: "Ana" };

const campo = () => screen.getByLabelText("Senha");
const botao = () => screen.getByRole("button", { name: /destravar|conferindo/i });

beforeEach(() => vi.clearAllMocks());

describe("BloqueioTela", () => {
  it("diz que o caixa continua aberto e nomeia quem precisa destravar", () => {
    render(<BloqueioTela operador={OPERADOR} />);

    expect(screen.getByRole("dialog")).toHaveTextContent(/caixa continua aberto/i);
    expect(screen.getByRole("dialog")).toHaveTextContent(/senha de Ana/);
  });

  it("o foco já está na senha, para quem voltou ao balcão digitar direto", () => {
    render(<BloqueioTela operador={OPERADOR} />);

    expect(campo()).toHaveFocus();
  });

  it("senha certa destrava, dizendo que foi verificada", async () => {
    destravar.mockResolvedValue({ ok: true, verificado: true, erro: null });
    const aoDestravar = vi.fn();
    render(<BloqueioTela operador={OPERADOR} aoDestravar={aoDestravar} />);

    await userEvent.type(campo(), "segredo");
    await userEvent.click(botao());

    expect(destravar).toHaveBeenCalledWith("ana", "segredo");
    expect(aoDestravar).toHaveBeenCalledWith({ verificado: true });
  });

  it("sem internet destrava avisando que não deu para verificar, e quem registra é o chamador", async () => {
    destravar.mockResolvedValue({ ok: true, verificado: false, erro: null });
    const aoDestravar = vi.fn();
    render(<BloqueioTela operador={OPERADOR} aoDestravar={aoDestravar} />);

    await userEvent.type(campo(), "qualquer");
    await userEvent.click(botao());

    expect(aoDestravar).toHaveBeenCalledWith({ verificado: false });
  });

  it("senha errada mostra o motivo, limpa o campo e a tela continua trancada", async () => {
    destravar.mockResolvedValue({ ok: false, verificado: false, erro: "Senha incorreta." });
    const aoDestravar = vi.fn();
    render(<BloqueioTela operador={OPERADOR} aoDestravar={aoDestravar} />);

    await userEvent.type(campo(), "chute");
    await userEvent.click(botao());

    expect(await screen.findByRole("alert")).toHaveTextContent("Senha incorreta.");
    expect(campo()).toHaveValue("");
    expect(aoDestravar).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("trocar de operador é a saída para a troca de turno", async () => {
    const aoTrocar = vi.fn();
    render(<BloqueioTela operador={OPERADOR} aoTrocarOperador={aoTrocar} />);

    await userEvent.click(screen.getByRole("button", { name: /trocar de operador/i }));

    expect(aoTrocar).toHaveBeenCalled();
  });

  it("enquanto confere, não dá para enviar duas vezes", async () => {
    let liberar;
    destravar.mockReturnValue(new Promise((r) => { liberar = r; }));
    render(<BloqueioTela operador={OPERADOR} />);

    await userEvent.type(campo(), "segredo");
    await userEvent.click(botao());
    await userEvent.click(botao());

    expect(destravar).toHaveBeenCalledTimes(1);
    liberar({ ok: true, verificado: true, erro: null });
  });

  it("é modal de verdade: nada atrás dele deve ser alcançável", () => {
    render(<BloqueioTela operador={OPERADOR} />);

    expect(screen.getByRole("dialog")).toHaveAttribute("aria-modal", "true");
  });
});
