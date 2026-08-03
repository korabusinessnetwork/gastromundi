// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import VendaPage from "./VendaPage";

describe("VendaPage", () => {
  it("renderiza a página sem erros", () => {
    render(<VendaPage />);
    expect(screen.getByText("PDV")).toBeInTheDocument();
  });

  it("mostra lista de itens", () => {
    render(<VendaPage />);
    expect(screen.getByText("Água")).toBeInTheDocument();
    expect(screen.getByText("Refrigerante")).toBeInTheDocument();
  });

  it("calcula o total corretamente", () => {
    render(<VendaPage />);
    // Água (500) + Refrigerante (800) = 1300 centavos = 13,00
    expect(screen.getByText("R$ 13,00")).toBeInTheDocument();
  });

  it("botão de finalizar fica habilitado com itens", () => {
    render(<VendaPage />);
    const btn = screen.getByRole("button", { name: /finalizar/i });
    expect(btn).not.toBeDisabled();
  });
});
