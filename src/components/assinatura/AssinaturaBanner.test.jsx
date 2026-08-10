// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/context/AppContext", async () => {
  const { mockUseApp } = await import("@/test/mockApp");
  return { useApp: mockUseApp, AppProvider: ({ children }) => children };
});

import { setAppMock } from "@/test/mockApp";
import AssinaturaBanner from "./AssinaturaBanner";

beforeEach(() => {
  vi.clearAllMocks();
});

const gerente = { id: 1, name: "Gerente Teste", username: "gerente1", role: "gerente" };
const caixa = { id: 2, name: "Caixa Teste", username: "caixa1", role: "caixa" };

describe("AssinaturaBanner — Fase 4 (só exibição, sem bloqueio)", () => {
  it("não mostra nada quando ativa e o vencimento está longe", () => {
    setAppMock({ currentUser: gerente, assinatura: { status: "ativo", diasParaVencer: 20, carenciaDias: 3 } });

    const { container } = render(<AssinaturaBanner />);

    expect(container).toBeEmptyDOMElement();
  });

  it("mostra aviso pré-vencimento quando está perto (ainda ativa)", () => {
    setAppMock({ currentUser: gerente, assinatura: { status: "ativo", diasParaVencer: 3, carenciaDias: 3 } });

    render(<AssinaturaBanner />);

    expect(screen.getByText(/vence em 3 dias/i)).toBeInTheDocument();
  });

  it("mostra aviso de carência com os dias restantes corretos", () => {
    setAppMock({ currentUser: gerente, assinatura: { status: "carencia", diasParaVencer: -1, carenciaDias: 3 } });

    render(<AssinaturaBanner />);

    expect(screen.getByText(/atrasada.*2 dias/i)).toBeInTheDocument();
  });

  it("mostra o aviso de bloqueado (mas o componente em si nunca impede nada — só texto)", () => {
    setAppMock({ currentUser: gerente, assinatura: { status: "bloqueado", diasParaVencer: -10, carenciaDias: 3 } });

    render(<AssinaturaBanner />);

    expect(screen.getByText(/regularize para continuar usando/i)).toBeInTheDocument();
  });

  it("não mostra nada para papéis operacionais (caixa) — evita jargão de faturamento no balcão", () => {
    setAppMock({ currentUser: caixa, assinatura: { status: "bloqueado", diasParaVencer: -10, carenciaDias: 3 } });

    const { container } = render(<AssinaturaBanner />);

    expect(container).toBeEmptyDOMElement();
  });

  it("nunca lança quando assinatura é null (tenant sem linha de assinatura ainda)", () => {
    setAppMock({ currentUser: gerente, assinatura: null });

    const { container } = render(<AssinaturaBanner />);

    expect(container).toBeEmptyDOMElement();
  });
});
