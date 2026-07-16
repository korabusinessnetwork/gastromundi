// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/context/AppContext", async () => {
  const { mockUseApp } = await import("@/test/mockApp");
  return { useApp: mockUseApp, AppProvider: ({ children }) => children };
});

import { setAppMock } from "@/test/mockApp";
import SidebarBranding from "./SidebarBranding";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SidebarBranding — Fase 6 (white-label, ADR-007)", () => {
  it("sem tema custom (tenant atual): mostra 'GASTROMUNDI' com o tagline 'by Kora'", () => {
    setAppMock({ tenant: { id: "t1", nome: "GastroMundi", tema: {} } });

    render(<SidebarBranding />);

    expect(screen.getByText("GASTROMUNDI")).toBeInTheDocument();
    expect(screen.getByText("by Kora")).toBeInTheDocument();
  });

  it("com nome_exibicao customizado: mostra o nome do tenant COM o tagline 'by Kora' (assinatura da plataforma)", () => {
    setAppMock({ tenant: { id: "t2", nome: "Pizzaria do João", tema: { nome_exibicao: "Pizzaria do João" } } });

    render(<SidebarBranding />);

    expect(screen.getByText("PIZZARIA DO JOÃO")).toBeInTheDocument();
    expect(screen.getByText("by Kora")).toBeInTheDocument();
  });

  it("com logo_url customizado: mostra a imagem em vez do nome em texto", () => {
    setAppMock({ tenant: { id: "t3", tema: { logo_url: "https://cdn.exemplo.com/logo.png", nome_exibicao: "Pizzaria do João" } } });

    render(<SidebarBranding />);

    const img = screen.getByRole("img", { name: "Pizzaria do João" });
    expect(img).toHaveAttribute("src", "https://cdn.exemplo.com/logo.png");
    expect(screen.queryByText("PIZZARIA DO JOÃO")).not.toBeInTheDocument();
  });

  it("sem tenant carregado ainda (bootstrap em andamento): cai no fallback, não quebra", () => {
    setAppMock({ tenant: null });

    render(<SidebarBranding />);

    expect(screen.getByText("GASTROMUNDI")).toBeInTheDocument();
  });
});
