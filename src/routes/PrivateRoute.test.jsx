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

describe("PrivateRoute — gating de módulo por plano (ADR-005, camada 1)", () => {
  it("módulo incluído no plano: renderiza o conteúdo", () => {
    renderRota({ moduloHabilitado: (m) => m === "financeiro" }, { requiredModulo: "financeiro", moduloLabel: "Financeiro" });

    expect(screen.getByText("Conteúdo protegido")).toBeInTheDocument();
  });

  it("módulo fora do plano: convida ao upgrade nomeando a tela, sem quebrar nem redirecionar", () => {
    renderRota({ moduloHabilitado: () => false }, { requiredModulo: "financeiro", moduloLabel: "Financeiro" });

    expect(screen.queryByText("Conteúdo protegido")).not.toBeInTheDocument();
    expect(screen.getByText(/Financeiro não está no seu plano atual/i)).toBeInTheDocument();
    // Redirecionar aqui geraria laço (a rota de destino pode ter o mesmo gate).
    expect(screen.queryByText("Frente de Caixa")).not.toBeInTheDocument();
  });

  it("sem rótulo, o convite fala de 'Este recurso' — nunca 'undefined' na tela", () => {
    renderRota({ moduloHabilitado: () => false }, { requiredModulo: "financeiro" });

    expect(screen.getByText(/Este recurso não está no seu plano atual/i)).toBeInTheDocument();
    expect(screen.queryByText(/undefined/i)).not.toBeInTheDocument();
  });

  it("falta de permissão é resolvida antes do plano: redireciona em vez de convidar ao upgrade", () => {
    // Ordem importa: o gerente sem a permissão da rota é levado para a casa
    // dele. Convidar ao upgrade quem nem podia entrar na tela sugeriria que
    // pagar mais resolveria — e não resolve, o que falta é permissão.
    renderRota(
      { moduloHabilitado: () => false },
      { requiredPermission: "clientes", requiredModulo: "clientes", moduloLabel: "Clientes" },
    );

    expect(screen.getByText("Frente de Caixa")).toBeInTheDocument();
    expect(screen.queryByText(/não está no seu plano/i)).not.toBeInTheDocument();
  });
});

// Rotas suficientes para observar PARA ONDE a negação de permissão redireciona.
function renderComDestinos(overrides = {}, routeProps = {}) {
  setAppMock({ currentUser: gerente, moduloHabilitado: () => true, ...overrides });
  return renderWithProviders(
    <Routes>
      <Route path="/app/clientes" element={<PrivateRoute {...routeProps}><div>Conteúdo protegido</div></PrivateRoute>} />
      <Route path="/app/pdv" element={<div>Frente de Caixa</div>} />
      <Route path="/palm" element={<div>Tela do Palm</div>} />
      <Route path="/login" element={<div>Tela de login</div>} />
    </Routes>,
    { route: "/app/clientes" },
  );
}

describe("PrivateRoute — negação de permissão manda para casa acessível (anti-laço)", () => {
  it("gerente (pdv) sem a permissão da rota vai para o PDV, sua primeira casa", () => {
    renderComDestinos({}, { requiredPermission: "clientes" });

    expect(screen.queryByText("Conteúdo protegido")).not.toBeInTheDocument();
    expect(screen.getByText("Frente de Caixa")).toBeInTheDocument();
  });

  it("garçom (palm, sem pdv) sem a permissão da rota vai para o Palm, não para o PDV (o laço antigo)", () => {
    const garcom = { id: 2, name: "Garçom", username: "garcom1", role: "garcom", permissions: { palm: true } };
    renderComDestinos({ currentUser: garcom }, { requiredPermission: "clientes" });

    expect(screen.getByText("Tela do Palm")).toBeInTheDocument();
    expect(screen.queryByText("Frente de Caixa")).not.toBeInTheDocument();
  });

  it("usuário sem nenhuma permissão de navegação vê 'sem acesso' em vez de entrar em laço de redirecionamento", () => {
    const semNada = { id: 3, name: "Sem Acesso", username: "vazio", role: "garcom", permissions: {} };
    renderComDestinos({ currentUser: semNada }, { requiredPermission: "clientes" });

    expect(screen.getByText(/ainda não tem acesso/i)).toBeInTheDocument();
    expect(screen.queryByText("Frente de Caixa")).not.toBeInTheDocument();
    expect(screen.queryByText("Tela do Palm")).not.toBeInTheDocument();
  });
});
