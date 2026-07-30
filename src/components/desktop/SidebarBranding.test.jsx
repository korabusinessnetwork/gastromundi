// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/context/AppContext", async () => {
  const { mockUseApp } = await import("@/test/mockApp");
  return { useApp: mockUseApp, AppProvider: ({ children }) => children };
});

import { setAppMock } from "@/test/mockApp";
import SidebarBranding from "./SidebarBranding";

// Texto INTEIRO do bloco de marca (nome + assinatura). `getByText` casa só
// com os nós de texto diretos, então ele sozinho não enxerga um "by Kora"
// sobrando embaixo de "KORA" — e é justamente isso que precisa ser medido.
const blocoDeMarca = () => document.querySelector(".sidebar-branding__nome").textContent;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SidebarBranding — Fase 6 (white-label, ADR-007)", () => {
  it("sem tema custom, mostra o nome CADASTRADO do estabelecimento com o tagline 'by Kora'", () => {
    // Run 5, leva 11: o teste antigo usava um tenant chamado "GastroMundi",
    // que era exatamente o fallback hardcodado — passava com e sem o defeito.
    // Com um nome diferente, ele mede o que interessa: a sidebar mostra o
    // nome DESTE estabelecimento, não a marca de outro.
    setAppMock({ tenant: { id: "t1", nome: "Casa Coffee", tema: {} } });

    render(<SidebarBranding />);

    expect(screen.getByText("CASA COFFEE")).toBeInTheDocument();
    expect(screen.getByText("by Kora")).toBeInTheDocument();
    expect(screen.queryByText("GASTROMUNDI")).not.toBeInTheDocument();
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

  it("sem tenant carregado ainda (bootstrap em andamento): cai na marca da PLATAFORMA", () => {
    // Este é o estado dos primeiros milissegundos de TODA sessão: `tenant`
    // começa null. Enquanto o fallback era a marca de um cliente, todo
    // estabelecimento piscava o nome de outro na própria sidebar.
    setAppMock({ tenant: null });

    render(<SidebarBranding />);

    expect(screen.getByText("KORA")).toBeInTheDocument();
    expect(screen.queryByText("GASTROMUNDI")).not.toBeInTheDocument();
    // O que está na tela JÁ é a plataforma — assinar embaixo leria
    // "KORA / by Kora".
    expect(blocoDeMarca()).toBe("KORA");
  });

  it("tenant sem nome_exibicao E sem nome cadastrado também não herda marca de cliente", () => {
    setAppMock({ tenant: { id: "t4", nome: null, tema: {} } });

    render(<SidebarBranding />);

    expect(screen.getByText("KORA")).toBeInTheDocument();
    expect(screen.queryByText("GASTROMUNDI")).not.toBeInTheDocument();
    expect(blocoDeMarca()).toBe("KORA");
  });
});
