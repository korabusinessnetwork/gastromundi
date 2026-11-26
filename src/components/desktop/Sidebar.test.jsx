// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/context/AppContext", async () => {
  const { ganchosDoMock } = await import("@/test/mockApp");
  return { ...ganchosDoMock, AppProvider: ({ children }) => children };
});

vi.mock("@/features/sessao/dados/adminAuth", () => ({
  verificarSenhaUsuario: vi.fn(() => Promise.resolve({ ok: false, erro: null })),
  verificarSenhaAdmin:   vi.fn(() => Promise.resolve({ ok: false, erro: null })),
}));
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

describe("Sidebar, gating por plano (F013/ADR-005, Fase 2)", () => {
  it("mostra todos os módulos quando o plano do tenant os inclui todos", () => {
    setup({ tenant: { planoCodigo: "avancado", modulosDisponiveis: null }, moduloHabilitado: () => true });

    // Itens acessíveis viram link de navegação (role="link" do react-router)
    expect(screen.getByRole("link", { name: /cadastro produtos/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /estoque/i })).toBeInTheDocument();
  });

  it("mostra o módulo fora do plano como bloqueado (convite a upgrade), não escondido", async () => {
    const user = userEvent.setup();
    const modulosDoPlanoBasico = ["cardapio", "pdv", "caixa"];
    setup({
      tenant: { planoCodigo: "basico", modulosDisponiveis: modulosDoPlanoBasico },
      moduloHabilitado: (m) => modulosDoPlanoBasico.includes(m),
    });

    // Continua visível... (Estoque está no plano avançado, não no básico)
    const estoqueBtn = screen.getByRole("button", { name: /estoque/i });
    expect(estoqueBtn).toBeInTheDocument();
    // ...mas não é mais um link de navegação (não navega)
    expect(screen.queryByRole("link", { name: /estoque/i })).not.toBeInTheDocument();

    await user.click(estoqueBtn);
    expect(screen.getByText(/estoque não está no seu plano/i)).toBeInTheDocument();
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

// Refatoração 3: a lógica da barra lateral foi para `useSidebar` e as janelas
// para `components/desktop/sidebar/`. O cancelamento de venda fechada tira
// dinheiro do saldo do dia e não tinha teste de tela; estes prendem o caminho
// inteiro, e a guarda de senha do relatório para o caixa.
describe("Sidebar, cancelar venda fechada", () => {
  const VENDA = {
    id: "v1", comanda: "12", total: 6, at: new Date().toISOString(), cashier: "Ana",
    items: [{ name: "Café", qty: 1, price: 6 }], payments: [{ method: "dinheiro", value: 6 }],
  };

  async function abrirCancelamento(user) {
    await user.click(screen.getByText("Comandas fechadas"));
    await user.click(screen.getByText("Comanda 12"));
    await user.click(screen.getByRole("button", { name: /Cancelar venda/ }));
    await user.type(screen.getByPlaceholderText("Ex: cobrança duplicada, pagamento não confirmado..."), "cobrança duplicada");
    await user.type(screen.getByPlaceholderText("Senha"), "1234");
    const botoes = screen.getAllByRole("button", { name: /Cancelar venda/ });
    await user.click(botoes[botoes.length - 1]);
  }

  it("com a senha de gerente, cancela a venda com o motivo informado", async () => {
    const { verificarSenhaAdmin } = await import("@/features/sessao/dados/adminAuth");
    verificarSenhaAdmin.mockResolvedValueOnce({ ok: true, erro: null });
    const cancelarVendaFechada = vi.fn(() => Promise.resolve({ error: null }));
    const user = userEvent.setup();
    setup({ sales: [VENDA], cancelarVendaFechada });

    await abrirCancelamento(user);

    expect(cancelarVendaFechada).toHaveBeenCalledWith("v1", "cobrança duplicada");
  });

  it("senha recusada não cancela nada e diz o motivo", async () => {
    const cancelarVendaFechada = vi.fn(() => Promise.resolve({ error: null }));
    const user = userEvent.setup();
    setup({ sales: [VENDA], cancelarVendaFechada });

    await abrirCancelamento(user);

    expect(cancelarVendaFechada).not.toHaveBeenCalled();
    expect(await screen.findByText(/Senha incorreta/)).toBeInTheDocument();
  });
});

describe("Sidebar, relatório pede senha para quem não tem a permissão", () => {
  it("o caixa sem permissão de relatório vê a janela de acesso restrito", async () => {
    const user = userEvent.setup();
    setup({
      currentUser: {
        id: 2, name: "Caixa Teste", username: "caixa1", role: "caixa",
        permissions: { pdv: true, relatorio: false },
      },
    });

    await user.click(screen.getByRole("button", { name: /Relat/ }));

    expect(screen.getByText("Acesso Restrito")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("nome de usuário")).toBeInTheDocument();
  });
});
