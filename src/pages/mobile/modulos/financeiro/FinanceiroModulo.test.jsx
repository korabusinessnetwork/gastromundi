// @vitest-environment jsdom
//
// Refatoração 4.6: o painel financeiro do celular só buscava contas `previsto`.
// Quando o Financeiro do computador marca as atrasadas como `vencido` no banco
// (`processarVencidos`), elas sumiam daqui, e o celular dizia que não havia nada
// vencido justamente quando havia.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const { listarLancamentos } = vi.hoisted(() => ({ listarLancamentos: vi.fn() }));
vi.mock("@/features/financeiro/dados/financeiro", async (importOriginal) => ({
  ...(await importOriginal()),
  listarLancamentos,
}));
vi.mock("@/lib/supabase", async () => {
  const { createMockSupabase } = await import("@/test/mockSupabase");
  return { supabase: createMockSupabase() };
});

import FinanceiroModulo from "./FinanceiroModulo";

const CONTA_JA_MARCADA_VENCIDA = {
  id: "l1", tipo: "despesa", descricao: "Aluguel", valor: 1200,
  status: "vencido", vencimento: "2026-01-10", competencia: "2026-01-10",
};

beforeEach(() => {
  vi.clearAllMocks();
  listarLancamentos.mockImplementation(({ status } = {}) =>
    Promise.resolve({ data: status ? [CONTA_JA_MARCADA_VENCIDA] : [], error: null })
  );
});

describe("FinanceiroModulo, contas vencidas", () => {
  it("busca as contas em aberto, inclusive as já marcadas vencido", async () => {
    render(<FinanceiroModulo onVoltar={vi.fn()} />);
    await screen.findAllByText("Vencidos");

    expect(listarLancamentos).toHaveBeenCalledWith({ status: ["previsto", "vencido"] });
  });

  it("conta já marcada vencido pelo computador aparece em Vencidos", async () => {
    render(<FinanceiroModulo onVoltar={vi.fn()} />);

    expect(await screen.findByText("1 conta")).toBeInTheDocument();
  });
});
