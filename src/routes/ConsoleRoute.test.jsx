// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import { Routes, Route } from "react-router-dom";

/**
 * Run 5, leva 10 — a porta do Console da Plataforma, que não tinha teste.
 *
 * O Console é o painel do dono do SaaS (planos, estabelecimentos, assinaturas
 * de todos os tenants). A porta tem três degraus, e a ORDEM entre eles é o que
 * o arquivo mede:
 *
 *   1. Console em subdomínio próprio ligado e host errado → sai, antes de olhar
 *      quem é o usuário. Se este degrau escorregasse para depois do segundo, o
 *      painel abriria no endereço de um estabelecimento qualquer.
 *   2. Sem sessão → /login, guardando de onde veio.
 *   3. Logado mas não `plataforma` → volta para o app dele, sem confirmar que o
 *      Console existe.
 *
 * A fronteira REAL é do banco (`is_super_admin()` nas policies e a revalidação
 * do papel na Edge Function); isto aqui é a barreira de UX. Testar a barreira
 * ainda importa: é ela que evita mostrar o painel a quem não deveria vê-lo.
 */

vi.mock("@/context/AppContext", async () => {
  const { mockUseApp } = await import("@/test/mockApp");
  return { useApp: mockUseApp, AppProvider: ({ children }) => children };
});

vi.mock("@/lib/supabase", () => ({ supabase: {} }));

// `consoleAtivo`/`ehConsoleHost` leem VITE_ROOT_DOMAIN/VITE_CONSOLE_SUBDOMAIN,
// que não existem no ambiente de teste — sem dublê só daria para exercitar o
// caminho "console em subdomínio desligado". A lógica de host em si já tem
// teste próprio em `src/lib/host/consoleHost.test.js`.
const { mockConsoleAtivo, mockEhConsoleHost } = vi.hoisted(() => ({
  mockConsoleAtivo: vi.fn(() => false),
  mockEhConsoleHost: vi.fn(() => false),
}));

vi.mock("@/lib/host/consoleHost", () => ({
  consoleAtivo: mockConsoleAtivo,
  ehConsoleHost: mockEhConsoleHost,
}));

import { setAppMock, renderWithProviders } from "@/test/mockApp";
import ConsoleRoute from "./ConsoleRoute";

const dono     = { id: 1, name: "Dono da Plataforma", username: "plataforma", role: "plataforma", permissions: {} };
const adminLoja = { id: 2, name: "Admin da Loja", username: "admin", role: "admin", permissions: { pdv: true } };

function renderConsole(overrides = {}) {
  setAppMock({ currentUser: dono, ...overrides });
  return renderWithProviders(
    <Routes>
      <Route path="/console" element={<ConsoleRoute><div>Painel da Plataforma</div></ConsoleRoute>} />
      <Route path="/app" element={<div>App do estabelecimento</div>} />
      <Route path="/login" element={<div>Tela de login</div>} />
    </Routes>,
    { route: "/console" },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockConsoleAtivo.mockReturnValue(false);
  mockEhConsoleHost.mockReturnValue(false);
});

describe("ConsoleRoute — porta do Console da Plataforma", () => {
  it("o dono da plataforma entra no painel", () => {
    renderConsole();

    expect(screen.getByText("Painel da Plataforma")).toBeInTheDocument();
  });

  it("sem sessão vai para o login, não para o painel", () => {
    renderConsole({ currentUser: null });

    expect(screen.getByText("Tela de login")).toBeInTheDocument();
    expect(screen.queryByText("Painel da Plataforma")).not.toBeInTheDocument();
  });

  it("admin de estabelecimento que digitou a URL volta para o app dele", () => {
    renderConsole({ currentUser: adminLoja });

    expect(screen.getByText("App do estabelecimento")).toBeInTheDocument();
    expect(screen.queryByText("Painel da Plataforma")).not.toBeInTheDocument();
  });

  it("qualquer outro papel também é recusado — só 'plataforma' passa", () => {
    for (const role of ["gerente", "garcom", "caixa", "cozinha", undefined]) {
      const { unmount } = renderConsole({ currentUser: { ...adminLoja, role } });
      expect(screen.getByText("App do estabelecimento"), `role = ${role}`).toBeInTheDocument();
      unmount();
    }
  });

  it("console em subdomínio próprio: no host errado nem o dono entra", () => {
    mockConsoleAtivo.mockReturnValue(true);
    mockEhConsoleHost.mockReturnValue(false);
    renderConsole();

    expect(screen.getByText("Tela de login")).toBeInTheDocument();
    expect(screen.queryByText("Painel da Plataforma")).not.toBeInTheDocument();
  });

  it("no host errado o veredito é o mesmo para todos — o host decide antes do papel", () => {
    // A única diferença observável entre "host primeiro" e "papel primeiro" é
    // ESTE caso: com a ordem invertida, o admin da loja seria despachado pelo
    // papel (para /app) em vez de pela regra de host. O componente não é o
    // roteador do app do estabelecimento; no host errado ele desiste igual
    // para qualquer visitante, sem deixar o papel escolher o destino.
    mockConsoleAtivo.mockReturnValue(true);
    mockEhConsoleHost.mockReturnValue(false);
    renderConsole({ currentUser: adminLoja });

    expect(screen.getByText("Tela de login")).toBeInTheDocument();
    expect(screen.queryByText("App do estabelecimento")).not.toBeInTheDocument();
  });

  it("console em subdomínio próprio: no host certo o dono entra normalmente", () => {
    mockConsoleAtivo.mockReturnValue(true);
    mockEhConsoleHost.mockReturnValue(true);
    renderConsole();

    expect(screen.getByText("Painel da Plataforma")).toBeInTheDocument();
  });

  it("subdomínio do console desligado não bloqueia ninguém — o recurso é inerte por padrão", () => {
    // Sem VITE_ROOT_DOMAIN/VITE_CONSOLE_SUBDOMAIN configurados, `ehConsoleHost`
    // é falso para todo host. Se o primeiro degrau ignorasse `consoleAtivo()`,
    // o Console ficaria inacessível em toda instalação que não usa subdomínio.
    mockConsoleAtivo.mockReturnValue(false);
    mockEhConsoleHost.mockReturnValue(false);
    renderConsole();

    expect(screen.getByText("Painel da Plataforma")).toBeInTheDocument();
    expect(mockEhConsoleHost).not.toHaveBeenCalled();
  });
});
