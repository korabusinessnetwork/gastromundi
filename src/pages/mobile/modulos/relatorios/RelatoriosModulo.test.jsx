// @vitest-environment jsdom
//
// Refatoração 4.7: o ticket médio passou a ser uma conta só (`ticketMedio`, em
// lib/vendas.js) para os relatórios do computador, este resumo do celular e a
// tela do garçom. O módulo não tinha teste.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const { buscarRelatorioVendas } = vi.hoisted(() => ({ buscarRelatorioVendas: vi.fn() }));
vi.mock("@/features/relatorios/dados/relatorios", async (importOriginal) => ({
  ...(await importOriginal()),
  buscarRelatorioVendas,
}));
vi.mock("@/lib/supabase", async () => {
  const { createMockSupabase } = await import("@/test/mockSupabase");
  return { supabase: createMockSupabase() };
});

import RelatoriosModulo from "./RelatoriosModulo";

beforeEach(() => {
  vi.clearAllMocks();
  buscarRelatorioVendas.mockResolvedValue({
    data: { faturamento: 150, numero_vendas: 3, top_produtos: [] },
    error: null,
  });
});

describe("RelatoriosModulo, resumo de vendas", () => {
  it("R$ 150 em 3 vendas mostra ticket médio de R$ 50", async () => {
    render(<RelatoriosModulo onVoltar={vi.fn()} />);
    const ticket = await screen.findByText(/Ticket médio/i);
    expect(ticket.closest("div").textContent).toMatch(/50[,.]00/);
  });
});
