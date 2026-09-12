// @vitest-environment jsdom
//
// Refino: o Palm que fica no dia em que foi aberto.
//
// O intervalo era resolvido uma vez (`useMemo` dependendo só da chave do chip)
// e a busca dependia só dessa mesma chave. Com a tela aberta atravessando a
// meia-noite, o chip "Hoje" continuava pedindo o dia anterior, sem nada na tela
// dizendo isso. Gravidade menor que no computador porque o Palm desmonta o
// módulo ao voltar para o menu, mas o número errado é igualmente errado.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";

const { mockSupabase } = vi.hoisted(() => ({ mockSupabase: { current: null } }));
vi.mock("@/lib/supabase", async () => {
  const { createMockSupabase } = await import("@/test/mockSupabase");
  mockSupabase.current = createMockSupabase();
  return { supabase: mockSupabase.current };
});

import RelatoriosModulo from "./RelatoriosModulo";

const RESUMO = {
  faturamento: 500,
  numero_vendas: 10,
  por_dia: [],
  por_metodo: [],
  top_produtos: [{ produto_id: 1, nome: "X-Burguer", unidades: 10, receita: 300 }],
};

/** Os `p_inicio` pedidos à RPC, na ordem em que saíram. */
const iniciosLidos = () =>
  mockSupabase.current.calls.filter((c) => c.rpc === "relatorio_vendas").map((c) => c.args[0].p_inicio);

beforeEach(() => {
  vi.clearAllMocks();
  mockSupabase.current.reset();
});

afterEach(() => { vi.useRealTimers(); });

describe("RelatoriosModulo, virada do dia com a tela aberta (refino)", () => {
  it("o chip Hoje passa a pedir o dia novo depois da meia-noite", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(2026, 8, 11, 23, 50));
    mockSupabase.current.setRpcResult("relatorio_vendas", { data: RESUMO, error: null });

    render(<RelatoriosModulo onVoltar={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("X-Burguer")).toBeInTheDocument());

    // 23h50 do dia 11: "Hoje" começa à meia-noite do dia 11.
    expect(iniciosLidos()[0]).toBe(new Date(2026, 8, 11, 0, 0, 0, 0).toISOString());

    mockSupabase.current.calls.length = 0;
    await act(async () => {
      vi.setSystemTime(new Date(2026, 8, 12, 0, 5));
      vi.advanceTimersByTime(30000);
    });

    // Antes: nenhuma leitura nova, e o número do dia 11 seguia como "Hoje".
    await waitFor(() => expect(iniciosLidos().length).toBeGreaterThan(0));
    expect(iniciosLidos()[0]).toBe(new Date(2026, 8, 12, 0, 0, 0, 0).toISOString());
  });
});
