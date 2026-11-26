// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ModalCpfNota from "./ModalCpfNota";

// CPF/CNPJ válidos (dígito verificador correto) reutilizados dos testes fiscais.
const CPF_VALIDO = "52998224725";
const CNPJ_VALIDO = "11222333000181";

describe("ModalCpfNota", () => {
  it("sem documento: botão diz 'Emitir sem CPF' e confirma com dest null (nota anônima)", async () => {
    const user = userEvent.setup();
    const onConfirmar = vi.fn();
    render(<ModalCpfNota total={30} onConfirmar={onConfirmar} onCancelar={() => {}} />);

    const botao = screen.getByRole("button", { name: /Emitir sem CPF/ });
    expect(botao).toBeEnabled();
    await user.click(botao);

    expect(onConfirmar).toHaveBeenCalledTimes(1);
    expect(onConfirmar).toHaveBeenCalledWith(null);
  });

  it("CPF válido digitado: botão vira 'Emitir com CPF' e confirma com o dest do documento", async () => {
    const user = userEvent.setup();
    const onConfirmar = vi.fn();
    render(<ModalCpfNota total={30} onConfirmar={onConfirmar} onCancelar={() => {}} />);

    await user.type(screen.getByPlaceholderText("000.000.000-00"), CPF_VALIDO);

    const botao = screen.getByRole("button", { name: /Emitir com CPF/ });
    expect(botao).toBeEnabled();
    await user.click(botao);

    expect(onConfirmar).toHaveBeenCalledTimes(1);
    expect(onConfirmar).toHaveBeenCalledWith({ cpf: CPF_VALIDO });
  });

  it("documento incompleto/ inválido: botão de emitir fica desabilitado (prevenção > erro)", async () => {
    const user = userEvent.setup();
    const onConfirmar = vi.fn();
    render(<ModalCpfNota total={30} onConfirmar={onConfirmar} onCancelar={() => {}} />);

    await user.type(screen.getByPlaceholderText("000.000.000-00"), "123456");

    // Preenchido e inválido → não dá pra emitir com esse documento.
    expect(screen.getByRole("button", { name: /Emitir/ })).toBeDisabled();
    expect(screen.getByText(/CPF incompleto ou inválido/)).toBeInTheDocument();
  });

  it("cliente vinculado com documento: campo já vem preenchido e a nota leva o nome do cliente", async () => {
    const user = userEvent.setup();
    const onConfirmar = vi.fn();
    const cliente = { documento: CPF_VALIDO, documento_tipo: "cpf", nome: "João Silva" };
    render(<ModalCpfNota total={30} cliente={cliente} onConfirmar={onConfirmar} onCancelar={() => {}} />);

    // Pré-preenchido e mascarado.
    expect(screen.getByPlaceholderText("000.000.000-00")).toHaveValue("529.982.247-25");

    await user.click(screen.getByRole("button", { name: /Emitir com CPF/ }));
    expect(onConfirmar).toHaveBeenCalledWith({ cpf: CPF_VALIDO, xNome: "João Silva" });
  });

  it("toggle CNPJ: aceita CNPJ válido e confirma com o dest correspondente", async () => {
    const user = userEvent.setup();
    const onConfirmar = vi.fn();
    render(<ModalCpfNota total={30} onConfirmar={onConfirmar} onCancelar={() => {}} />);

    await user.click(screen.getByRole("button", { name: "CNPJ" }));
    await user.type(screen.getByPlaceholderText("00.000.000/0000-00"), CNPJ_VALIDO);

    await user.click(screen.getByRole("button", { name: /Emitir com CNPJ/ }));
    expect(onConfirmar).toHaveBeenCalledWith({ cnpj: CNPJ_VALIDO });
  });

  it("botão 'Voltar' cancela sem emitir", async () => {
    const user = userEvent.setup();
    const onCancelar = vi.fn();
    const onConfirmar = vi.fn();
    render(<ModalCpfNota total={30} onConfirmar={onConfirmar} onCancelar={onCancelar} />);

    // Há dois controles de cancelar (o X do header e o botão do rodapé), ambos
    // rotulados "Voltar"; o do rodapé é o único com texto visível.
    const voltar = screen
      .getAllByRole("button", { name: "Voltar" })
      .find((b) => b.textContent.trim() === "Voltar");
    await user.click(voltar);
    expect(onCancelar).toHaveBeenCalledTimes(1);
    expect(onConfirmar).not.toHaveBeenCalled();
  });
});
