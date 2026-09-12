// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/context/AppContext", async () => {
  const { mockUseApp } = await import("@/test/mockApp");
  return { useApp: mockUseApp, AppProvider: ({ children }) => children };
});

vi.mock("@/lib/supabase", async () => {
  const { createMockSupabase } = await import("@/test/mockSupabase");
  return { supabase: createMockSupabase() };
});

vi.mock("@/lib/logger", () => ({ logAction: vi.fn() }));
vi.mock("@/lib/jarvas", () => ({
  emitirEvento: vi.fn(),
  buscarInsights: vi.fn(() => Promise.resolve({ data: [], error: null })),
  atualizarStatusInsight: vi.fn(() => Promise.resolve({ data: null, error: null })),
}));
vi.mock("@/lib/jarvasAssistente", () => ({ perguntarAoJarvas: vi.fn() }));

import { setAppMock, renderWithProviders } from "@/test/mockApp";
import { logAction } from "@/lib/logger";
import DesktopLayout from "./DesktopLayout";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("DesktopLayout, abrir e fechar caixa", () => {
  it("abrir caixa define o fundo, a sessão e caixa_aberto=true", async () => {
    const user = userEvent.setup();
    const appMock = setAppMock({ caixaAberto: false, pending: [], sales: [] });

    renderWithProviders(<DesktopLayout />);

    await user.click(screen.getByRole("button", { name: /abrir caixa/i }));
    await user.type(screen.getByPlaceholderText("0,00"), "150");
    await user.click(screen.getByRole("button", { name: /✓ abrir caixa/i }));

    expect(appMock.setFundoAtual).toHaveBeenCalledWith(150);
    expect(appMock.setSessaoAbertaEm).toHaveBeenCalledWith(expect.any(String));
    expect(appMock.setCaixaAberto).toHaveBeenCalledWith(true);
    expect(logAction).toHaveBeenCalledWith(
      "teste",
      "caixa:abrir",
      expect.objectContaining({ fundo: 150 }),
    );
  });

  it("fechar caixa grava o fechamento com totalVendas/totalConferido e define caixa_aberto=false", async () => {
    const user = userEvent.setup();
    const appMock = setAppMock({
      caixaAberto: true,
      pending: [], // nenhuma comanda aberta — obrigatório para o botão "Fechar Caixa" habilitar
      sales: [{ id: "s1", total: 100, at: new Date().toISOString(), pagamentos: [{ metodo: "dinheiro", valor: 100 }] }],
      fundoAtual: 50,
      meiosPagamento: ["dinheiro", "credito", "debito", "pix"],
    });

    renderWithProviders(<DesktopLayout />);

    await user.click(screen.getByRole("button", { name: /fechar caixa/i }));
    // Sem digitar nada, o campo "conferido" já vem pré-preenchido com o valor do sistema (dinheiro: 100 venda + 50 fundo = 150)
    await user.click(screen.getByRole("button", { name: /confirmar fechamento/i }));

    expect(appMock.addFechamento).toHaveBeenCalledWith(
      expect.objectContaining({ totalVendas: 100, totalConferido: 150 }),
    );
    expect(appMock.setCaixaAberto).toHaveBeenCalledWith(false);
    expect(logAction).toHaveBeenCalledWith(
      "teste",
      "caixa:fechar",
      expect.objectContaining({ totalVendas: 100, conferido: 150 }),
    );
  });
});

describe("DesktopLayout, marca no topo (Run 5, leva 11)", () => {
  // A barra com o nome só existe na largura de celular (< 768); useResponsive
  // lê window.innerWidth na montagem, então basta encolher a janela antes de
  // renderizar — sem dublê de hook.
  const LARGURA_ORIGINAL = window.innerWidth;
  const emCelular = () => { window.innerWidth = 480; };
  afterEach(() => { window.innerWidth = LARGURA_ORIGINAL; });

  const topo = () => document.querySelector(".desktop-layout__name-tenant").textContent;

  it("sem tema custom, mostra o nome CADASTRADO do estabelecimento", () => {
    // Antes: qualquer estabelecimento sem `nome_exibicao` via a marca de
    // OUTRO cliente escrita na própria barra do topo (decisão 017).
    emCelular();
    setAppMock({ tenant: { id: "t1", nome: "Casa Coffee", tema: {} } });

    renderWithProviders(<DesktopLayout />);

    expect(topo()).toContain("CASA COFFEE");
    expect(topo()).toContain("by Kora");
    expect(topo()).not.toContain("GASTROMUNDI");
  });

  it("sem tenant carregado, mostra só a marca da plataforma", () => {
    // Estado dos primeiros milissegundos de toda sessão (`tenant` começa
    // null) e de uma abertura offline. Nem marca alheia, nem "KORA by Kora".
    emCelular();
    setAppMock({ tenant: null });

    renderWithProviders(<DesktopLayout />);

    expect(topo().trim()).toBe("KORA");
    expect(topo()).not.toContain("GASTROMUNDI");
  });
});

/**
 * Aba do navegador por tela.
 *
 * A aba dizia "KORA" em todas as telas do estabelecimento: quem trabalha com a
 * frente de caixa, a cozinha e o relatório abertos ao mesmo tempo, que é o
 * normal no balcão, via três abas idênticas e clicava em cada uma para achar a
 * certa. E o nome do estabelecimento não aparecia ali, o que num produto
 * white-label é a marca da plataforma na aba de um cliente.
 */
describe("DesktopLayout, título da aba", () => {
  const naTela = (rota, tenant) => {
    setAppMock({ tenant, caixaAberto: true, pending: [], sales: [] });
    renderWithProviders(<DesktopLayout />, { route: rota });
  };

  it("a aba diz a tela e o estabelecimento", () => {
    naTela("/app/pdv", { id: "t1", nome: "Casa Coffee", tema: {} });

    expect(document.title).toBe("Frente de caixa, Casa Coffee");
  });

  it("cada tela abre uma aba distinguível da outra", () => {
    naTela("/app/cozinha", { id: "t1", nome: "Casa Coffee", tema: {} });

    expect(document.title).toBe("Cozinha, Casa Coffee");
  });

  it("sem estabelecimento resolvido, cai na marca da plataforma, nunca na de outro cliente", () => {
    naTela("/app/estoque", null);

    expect(document.title).toBe("Estoque, Kora");
  });
});
