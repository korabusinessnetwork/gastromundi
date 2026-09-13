// @vitest-environment jsdom
//
// Refino: o Palm que fica no dia em que foi aberto.
//
// O intervalo era resolvido uma vez (`useMemo` dependendo só da chave do chip),
// então a tela aberta atravessando a meia-noite continuava consultando o dia
// anterior. Gravidade menor que no computador porque o Palm desmonta o módulo
// ao voltar para o menu, mas o recorte errado é igualmente errado.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act, fireEvent } from "@testing-library/react";

const { mockSupabase } = vi.hoisted(() => ({ mockSupabase: { current: null } }));
vi.mock("@/lib/supabase", async () => {
  const { createMockSupabase } = await import("@/test/mockSupabase");
  mockSupabase.current = createMockSupabase();
  return { supabase: mockSupabase.current };
});

import FinanceiroModulo from "./FinanceiroModulo";

/** As competências pedidas ao banco como início do recorte. */
const desdeConsultado = () =>
  mockSupabase.current.calls
    .filter((c) => c.table === "lancamentos" && c.method === "gte" && c.args[0] === "competencia")
    .map((c) => c.args[1]);

beforeEach(() => {
  vi.clearAllMocks();
  mockSupabase.current.reset();
});

afterEach(() => { vi.useRealTimers(); });

describe("FinanceiroModulo, virada do dia com a tela aberta (refino)", () => {
  it("o chip Hoje passa a consultar o dia novo depois da meia-noite", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(2026, 8, 11, 23, 50));
    mockSupabase.current.setTableResult("lancamentos", { data: [], error: null });

    render(<FinanceiroModulo onVoltar={vi.fn()} />);
    await waitFor(() => expect(screen.queryByText("Carregando financeiro…")).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole("tab", { name: "Hoje" }));
    await waitFor(() => expect(desdeConsultado()).toContain("2026-09-11"));

    mockSupabase.current.calls.length = 0;
    await act(async () => {
      vi.setSystemTime(new Date(2026, 8, 12, 0, 5));
      vi.advanceTimersByTime(30000);
    });

    // Antes: nenhuma consulta nova, a tela seguia no resumo do dia 11.
    await waitFor(() => expect(desdeConsultado()).toContain("2026-09-12"));
    expect(desdeConsultado()).not.toContain("2026-09-11");
  });
});
