// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { useCor } from "./useCorHook";

// Mock do AppContext para controlar tenant.tema nos testes
let temaMock = null;
vi.mock("@/context/AppContext", () => ({
  useApp: () => ({ tenant: { tema: temaMock } }),
}));

// Componente de teste que expõe a cor resolvida pelo hook
function Sonda({ token }) {
  const cor = useCor(token);
  return <span data-testid="cor">{cor}</span>;
}

describe("useCor (hook reativo — recolore quando tenant.tema muda)", () => {
  beforeEach(() => {
    temaMock = null;
    document.documentElement.style.removeProperty("--gm-accent");
  });

  it("resolve a cor default do token no primeiro render", () => {
    document.documentElement.style.setProperty("--gm-accent", "#7c3aed");
    render(<Sonda token="--gm-accent" />);
    expect(screen.getByTestId("cor").textContent).toBe("#7c3aed");
  });

  it("cai no fallback documentado quando a var não está definida", () => {
    render(<Sonda token="--gm-accent" />);
    // FALLBACK_DEFAULTS['--gm-accent'] === '#7c3aed'
    expect(screen.getByTestId("cor").textContent).toBe("#7c3aed");
  });

  it("re-resolve a cor quando tenant.tema muda (recoloração por tenant)", () => {
    // tema default aplicado
    document.documentElement.style.setProperty("--gm-accent", "#7c3aed");
    const { rerender } = render(<Sonda token="--gm-accent" />);
    expect(screen.getByTestId("cor").textContent).toBe("#7c3aed");

    // simula troca de tenant: aplicarVariaveisTema sobrescreveu a var + tema mudou
    act(() => {
      document.documentElement.style.setProperty("--gm-accent", "#0ea5e9");
      temaMock = { accent: "#0ea5e9" };
    });
    rerender(<Sonda token="--gm-accent" />);

    // o hook deve ter re-resolvido para a nova cor do tenant
    expect(screen.getByTestId("cor").textContent).toBe("#0ea5e9");
  });
});
