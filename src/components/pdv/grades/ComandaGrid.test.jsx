// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import ComandaGrid from "./ComandaGrid";

/**
 * Run 3 (mesas e comandas) — o valor no card da comanda é o que o caixa usa
 * para conferir a conta antes de cobrar. A soma estava reescrita à mão em dois
 * lugares aqui (lista de busca e grid numerado), sem proteção para item sem
 * `price`: um item importado do cardápio sem preço fazia o card mostrar
 * "R$ NaN" nos dois lugares. Agora as duas passam por `totalItensAtivos`.
 */

const comanda = (over = {}) => ({
  id: "o1", comanda: "7", status: "open", created_at: new Date().toISOString(), items: [], ...over,
});

const itensComUmSemPreco = [
  { id: 1, name: "Brinde da casa", qty: 2 },        // sem price (import de cardápio)
  { id: 2, name: "Cerveja", price: 16.1, qty: 3 },
];

const renderGrid = (props) =>
  render(
    <ComandaGrid
      abertas={[comanda({ items: itensComUmSemPreco })]}
      onSelect={vi.fn()}
      onOpenEmpty={vi.fn()}
      {...props}
    />,
  );

describe("ComandaGrid — total do card", () => {
  it("grid numerado: item sem preço não vira 'R$ NaN'", () => {
    renderGrid({});

    expect(screen.getByText("R$ 48.30")).toBeInTheDocument();
    expect(screen.queryByText(/R\$ NaN/)).not.toBeInTheDocument();
  });

  it("lista de busca: item sem preço não vira 'R$ NaN'", () => {
    renderGrid({ busca: "7" });

    expect(screen.getByText("R$ 48.30")).toBeInTheDocument();
    expect(screen.queryByText(/R\$ NaN/)).not.toBeInTheDocument();
  });

  it("os dois modos ignoram item cancelado no valor", () => {
    const items = [
      { id: 1, name: "Cerveja", price: 16.1, qty: 3 },
      { id: 2, name: "Rodízio", price: 99, qty: 1, cancelado: true },
    ];

    const { unmount } = renderGrid({ abertas: [comanda({ items })] });
    expect(screen.getByText("R$ 48.30")).toBeInTheDocument();
    expect(screen.queryByText("R$ 147.30")).not.toBeInTheDocument();
    unmount();

    renderGrid({ abertas: [comanda({ items })], busca: "7" });
    expect(screen.getByText("R$ 48.30")).toBeInTheDocument();
    expect(screen.queryByText("R$ 147.30")).not.toBeInTheDocument();
  });
});
