// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import { Routes, Route } from "react-router-dom";

vi.mock("@/context/AppContext", async () => {
  const { mockUseApp } = await import("@/test/mockApp");
  return { useApp: mockUseApp, AppProvider: ({ children }) => children };
});

vi.mock("@/lib/supabase", () => ({ supabase: {} }));

import { setAppMock, renderWithProviders } from "@/test/mockApp";
import InicioApp from "./InicioApp";

function renderInicio(overrides = {}) {
  setAppMock({ moduloHabilitado: () => true, ...overrides });
  return renderWithProviders(
    <Routes>
      <Route path="/app" element={<InicioApp />} />
      <Route path="/app/pdv" element={<div>Frente de Caixa</div>} />
      <Route path="/app/financeiro" element={<div>Financeiro</div>} />
      <Route path="/palm" element={<div>Tela do Palm</div>} />
    </Routes>,
    { route: "/app" },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("InicioApp — índice de /app leva cada usuário à sua primeira casa", () => {
  it("no celular, quem tem Palm entra direto no Palm (não no PDV)", () => {
    renderInicio({
      isMobile: true,
      currentUser: { id: 1, name: "Garçom", permissions: { palm: true, pdv: true } },
    });

    expect(screen.getByText("Tela do Palm")).toBeInTheDocument();
    expect(screen.queryByText("Frente de Caixa")).not.toBeInTheDocument();
  });

  it("no desktop, quem tem Palm NÃO é desviado — cai na primeira rota real (PDV)", () => {
    renderInicio({
      isMobile: false,
      currentUser: { id: 1, name: "Admin", permissions: { palm: true, pdv: true } },
    });

    expect(screen.getByText("Frente de Caixa")).toBeInTheDocument();
    expect(screen.queryByText("Tela do Palm")).not.toBeInTheDocument();
  });

  it("no celular, quem NÃO tem Palm (caixa puro) segue o fluxo normal do /app", () => {
    renderInicio({
      isMobile: true,
      currentUser: { id: 2, name: "Caixa", permissions: { pdv: true } },
    });

    expect(screen.getByText("Frente de Caixa")).toBeInTheDocument();
    expect(screen.queryByText("Tela do Palm")).not.toBeInTheDocument();
  });

  it("gestor sem PDV cai na primeira rota que tem (Financeiro)", () => {
    renderInicio({
      isMobile: false,
      currentUser: { id: 3, name: "Gestor", permissions: { financeiro: true } },
    });

    expect(screen.getByText("Financeiro")).toBeInTheDocument();
  });

  it("usuário sem nenhuma permissão vê 'sem acesso' em vez de entrar em laço", () => {
    renderInicio({
      isMobile: false,
      currentUser: { id: 4, name: "Vazio", permissions: {} },
    });

    expect(screen.getByText(/ainda não tem acesso/i)).toBeInTheDocument();
  });
});
