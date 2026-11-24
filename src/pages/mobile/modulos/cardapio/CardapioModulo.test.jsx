// @vitest-environment jsdom
//
// Refatoração 4.9: a busca do Cardápio passou a ignorar acento, como a do Estoque
// e a da administração do delivery. O módulo não tinha teste.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("@/context/AppContext", async () => {
  const { ganchosDoMock } = await import("@/test/mockApp");
  return { ...ganchosDoMock, AppProvider: ({ children }) => children };
});

import { setAppMock } from "@/test/mockApp";
import CardapioModulo from "./CardapioModulo";

const PRODUTOS = [
  { id: 1, name: "Café expresso", price: 6, category: "Bebidas", active: true },
  { id: 2, name: "Suco de laranja", price: 9, category: "Bebidas", active: true },
];

beforeEach(() => {
  setAppMock({ products: PRODUTOS, loading: false, currentUser: { id: 1, role: "garcom", username: "bia" } });
});

describe("CardapioModulo, busca", () => {
  it("'cafe' sem acento acha o Café expresso", () => {
    render(<CardapioModulo onVoltar={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText("Buscar produto…"), { target: { value: "cafe" } });

    expect(screen.getByText("Café expresso")).toBeInTheDocument();
    expect(screen.queryByText("Suco de laranja")).toBeNull();
  });

  it("garçom só consulta: sem botão de pausar produto", () => {
    render(<CardapioModulo onVoltar={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /pausar/i })).toBeNull();
  });
});
