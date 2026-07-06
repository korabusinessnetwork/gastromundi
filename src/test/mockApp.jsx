import { vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { render } from "@testing-library/react";

/**
 * Helper de render para testes de componente do PDV/DesktopLayout.
 *
 * Escolha de design: contexto FAKE em vez do AppProvider real.
 *
 * O AppProvider real dispara side effects pesados no mount (sessão do
 * Supabase Auth, 3 canais Realtime, bootstrap com ~7 queries em
 * paralelo) que não interessam a estes testes e tornariam a suíte
 * lenta e instável (setup assíncrono, timing de useEffect). Como os
 * componentes só consomem o *shape* de `useApp()`, substituir o
 * módulo inteiro (`vi.mock("@/context/AppContext", ...)`) por um
 * `useApp()` que devolve um objeto controlado pelo teste é mais
 * simples e determinístico — e ainda exercita o código real dos
 * componentes/hooks do PDV, que é o que importa para essas suítes.
 *
 * Uso (cada arquivo de teste precisa chamar vi.mock, pois o mock é
 * por módulo e hoisted pelo Vitest):
 *
 *   vi.mock("@/context/AppContext", async () => {
 *     const { mockUseApp } = await import("@/test/mockApp");
 *     return { useApp: mockUseApp, AppProvider: ({ children }) => children };
 *   });
 *
 *   import { setAppMock } from "@/test/mockApp";
 *   setAppMock({ currentUser: {...}, addSale: vi.fn(), ... });
 */

let currentMock = null;

export function mockUseApp() {
  if (!currentMock) {
    throw new Error("setAppMock(...) precisa ser chamado antes de renderizar (veja src/test/mockApp.jsx)");
  }
  return currentMock;
}

/** Valores/spies padrão — suficiente para a maioria dos testes; sobrescreva o que precisar. */
export function createAppMockValue(overrides = {}) {
  return {
    loading: false,
    products: [],
    pending: [],
    sales: [],
    users: [],
    fechamentos: [],
    fundoAtual: 0,
    caixaAberto: true,
    sessaoAbertaEm: null,
    meiosPagamento: ["dinheiro", "credito", "debito", "pix"],
    // Fase 2 — camada de comercialização: por padrão nos testes, todos os
    // módulos habilitados (equivalente ao tenant real hoje, plano avançado)
    // — sobrescreva `tenant`/`moduloHabilitado` nos testes de gating.
    tenant: { id: "t1", nome: "GastroMundi", tema: {}, planoCodigo: "avancado", modulosDisponiveis: null },
    moduloHabilitado: () => true,
    estoque: {},
    estoqueMinimos: {},
    currentUser: { id: 1, name: "Operador Teste", username: "teste", role: "admin", permissions: {} },
    isMobile: false,
    mobileChoice: null,
    setMobileChoice: vi.fn(),
    lancadas: new Set(),
    addLancada: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
    addPending: vi.fn(),
    removePending: vi.fn(),
    updatePending: vi.fn(),
    addProduct: vi.fn(),
    updateProduct: vi.fn(),
    removeProduct: vi.fn(),
    addSale: vi.fn(),
    addUser: vi.fn(),
    updateUser: vi.fn(),
    removeUser: vi.fn(),
    addFechamento: vi.fn(),
    setFundoAtual: vi.fn(),
    setCaixaAberto: vi.fn(),
    setSessaoAbertaEm: vi.fn(),
    setMeiosPagamento: vi.fn(),
    updateEstoque: vi.fn(),
    bulkSetEstoque: vi.fn(),
    baixarEstoque: vi.fn(),
    setMinimoEstoque: vi.fn(),
    taxaServico: false,
    setTaxaServico: vi.fn(),
    metodosCustom: [],
    setMetodosCustom: vi.fn(),
    ...overrides,
  };
}

/** Define (ou redefine) o valor que `useApp()` devolve neste teste. */
export function setAppMock(overrides = {}) {
  currentMock = createAppMockValue(overrides);
  return currentMock;
}

export function renderWithProviders(ui, { route = "/" } = {}) {
  return render(<MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>);
}
