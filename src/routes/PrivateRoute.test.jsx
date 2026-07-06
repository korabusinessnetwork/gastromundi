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
import PrivateRoute from "./PrivateRoute";

const gerente = { id: 1, name: "Gerente Teste", username: "gerente1", role: "gerente", permissions: { pdv: true, financeiro: true } };

function renderRota(overrides = {}, routeProps = {}) {
  setAppMock({ currentUser: gerente, moduloHabilitado: () => true, ...overrides });
  return renderWithProviders(
    <Routes>
      <Route path="/" element={<PrivateRoute {...routeProps}><div>Conteúdo protegido</div></PrivateRoute>} />
      <Route path="/app/pdv" element={<div>Frente de Caixa</div>} />
      <Route path="/login" element={<div>Tela de login</div>} />
    </Routes>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PrivateRoute — Fase 5 (bloqueio total por assinatura, ADR-006 §4)", () => {
  it("assinatura ativa: renderiza o conteúdo normalmente", () => {
    renderRota({ assinatura: { status: "ativo", diasParaVencer: 20 } });

    expect(screen.getByText("Conteúdo protegido")).toBeInTheDocument();
  });

  it("assinatura em carência: ainda renderiza o conteúdo (só bloqueado impede)", () => {
    renderRota({ assinatura: { status: "carencia", diasParaVencer: -1 } });

    expect(screen.getByText("Conteúdo protegido")).toBeInTheDocument();
  });

  it("assinatura bloqueada: mostra a tela de aviso em vez do conteúdo, mesmo tendo permissão/módulo", () => {
    renderRota({ assinatura: { status: "bloqueado", diasParaVencer: -10 } }, { requiredPermission: "pdv" });

    expect(screen.queryByText("Conteúdo protegido")).not.toBeInTheDocument();
    expect(screen.getByText(/sua mensalidade está atrasada/i)).toBeInTheDocument();
  });

  it("assinatura bloqueada tem prioridade sobre a checagem de módulo (não mostra convite a upgrade, mostra o bloqueio)", () => {
    renderRota(
      { assinatura: { status: "bloqueado", diasParaVencer: -10 }, moduloHabilitado: () => false },
      { requiredModulo: "financeiro", moduloLabel: "Financeiro" },
    );

    expect(screen.queryByText(/não está no seu plano/i)).not.toBeInTheDocument();
    expect(screen.getByText(/sua mensalidade está atrasada/i)).toBeInTheDocument();
  });

  it("sem tenant/assinatura carregada ainda (null): não bloqueia — evita falso positivo antes do bootstrap terminar", () => {
    renderRota({ assinatura: null });

    expect(screen.getByText("Conteúdo protegido")).toBeInTheDocument();
  });

  it("continua redirecionando para /login quando não autenticado, independente da assinatura", () => {
    renderRota({ currentUser: null, assinatura: { status: "bloqueado", diasParaVencer: -10 } });

    expect(screen.getByText("Tela de login")).toBeInTheDocument();
  });
});
