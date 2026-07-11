// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/context/AppContext", async () => {
  const { mockUseApp } = await import("@/test/mockApp");
  return { useApp: mockUseApp, AppProvider: ({ children }) => children };
});

vi.mock("@/lib/adminAuth", () => ({ verificarSenhaUsuario: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: {} }));

import { setAppMock, renderWithProviders } from "@/test/mockApp";
import Sidebar from "./Sidebar";

function setup(overrides = {}) {
  setAppMock({
    currentUser: {
      id: 1, name: "Gerente Teste", username: "gerente1", role: "gerente",
      permissions: { pdv: true, produtos: true, relatorio: true, estoque: true, financeiro: true, cozinha: true, clientes: true },
    },
    pending: [],
    sales: [],
    users: [],
    ...overrides,
  });
  return renderWithProviders(<Sidebar caixaAberto={true} onFechamento={vi.fn()} onAbertura={vi.fn()} onLogout={vi.fn()} />);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Sidebar — gating por plano (F013/ADR-005, Fase 2)", () => {
  it("mostra todos os módulos quando o plano do tenant os inclui todos", () => {
    setup({ tenant: { planoCodigo: "avancado", modulosDisponiveis: null }, moduloHabilitado: () => true });

    // Itens acessíveis viram link de navegação (role="link" do react-router)
    expect(screen.getByRole("link", { name: /financeiro/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /estoque/i })).toBeInTheDocument();
  });

  it("mostra o módulo fora do plano como bloqueado (convite a upgrade), não escondido", async () => {
    const user = userEvent.setup();
    const modulosDoPlanoBasico = ["cardapio", "pdv", "caixa"];
    setup({
      tenant: { planoCodigo: "basico", modulosDisponiveis: modulosDoPlanoBasico },
      moduloHabilitado: (m) => modulosDoPlanoBasico.includes(m),
    });

    // Continua visível...
    const financeiroBtn = screen.getByRole("button", { name: /financeiro/i });
    expect(financeiroBtn).toBeInTheDocument();
    // ...mas não é mais um link de navegação (não navega)
    expect(screen.queryByRole("link", { name: /financeiro/i })).not.toBeInTheDocument();

    await user.click(financeiroBtn);
    expect(screen.getByText(/financeiro não está no seu plano/i)).toBeInTheDocument();
  });

  it("não bloqueia módulos que o plano básico já inclui (PDV)", () => {
    const modulosDoPlanoBasico = ["cardapio", "pdv", "caixa"];
    setup({
      tenant: { planoCodigo: "basico", modulosDisponiveis: modulosDoPlanoBasico },
      moduloHabilitado: (m) => modulosDoPlanoBasico.includes(m),
    });

    expect(screen.getByRole("link", { name: /frente de caixa/i })).toBeInTheDocument();
  });
});
