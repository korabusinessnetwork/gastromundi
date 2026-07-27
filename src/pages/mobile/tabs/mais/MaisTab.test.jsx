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

  it('mantém o card ACESO (não apagado) quando é só "melhor no computador"', () => {
    render(
      <MaisTab
        {...baseProps}
        modulos={[
          { chave: "pdv", rotulo: "PDV", icone: "pdv", habilitado: true, melhorNoComputador: true, onClick: vi.fn() },
        ]}
      />,
    );
    const botao = screen.getByRole("button", { name: /PDV/i });
    expect(botao.className).not.toContain("mais-tab__cartao--dimmed");
    // o aviso continua visível, só não apaga o card
    expect(screen.getByText(/melhor no computador/i)).toBeInTheDocument();
  });

  it("apaga o card apenas quando o módulo está de fato desabilitado", () => {
    render(
      <MaisTab
        {...baseProps}
        modulos={[
          { chave: "financeiro", rotulo: "Financeiro", icone: "financeiro", habilitado: false, onClick: vi.fn() },
        ]}
      />,
    );
    const botao = screen.getByRole("button", { name: /Financeiro/i });
    expect(botao.className).toContain("mais-tab__cartao--dimmed");
  });
});
