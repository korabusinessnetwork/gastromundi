// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import MaisTab from "./MaisTab";

const baseProps = {
  tenantNome: "Restaurante Teste",
  usuarioNome: "Ana",
  usuarioIniciais: "AN",
  caixa: { aberto: true, desde: "14:30" },
  modulos: [
    { chave: "pdv", rotulo: "PDV", descricao: "Caixa", icone: "pdv", onClick: vi.fn() },
    { chave: "cozinha", rotulo: "Cozinha", descricao: "Produção", icone: "cozinha", onClick: vi.fn() },
  ],
};

describe("MaisTab — hub de módulos do Palm", () => {
  it("lista os módulos recebidos do shell (já filtrados por permissão/plano)", () => {
    render(<MaisTab {...baseProps} onConfiguracoes={vi.fn()} />);
    expect(screen.getByText("PDV")).toBeInTheDocument();
    expect(screen.getByText("Cozinha")).toBeInTheDocument();
  });

  it("mostra Configurações quando o shell passa o handler (usuário com permissão)", async () => {
    const onConfiguracoes = vi.fn();
    render(<MaisTab {...baseProps} onConfiguracoes={onConfiguracoes} />);

    const botao = screen.getByRole("button", { name: /configurações/i });
    expect(botao).toBeInTheDocument();
    await userEvent.click(botao);
    expect(onConfiguracoes).toHaveBeenCalledTimes(1);
  });

  it("esconde Configurações quando não há handler (usuário sem permissão)", () => {
    render(<MaisTab {...baseProps} onConfiguracoes={undefined} />);
    expect(screen.queryByRole("button", { name: /configurações/i })).toBeNull();
  });
});
