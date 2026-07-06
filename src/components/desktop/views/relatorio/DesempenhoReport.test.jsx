// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { mockSupabase } = vi.hoisted(() => ({ mockSupabase: { current: null } }));
vi.mock("@/lib/supabase", async () => {
  const { createMockSupabase } = await import("@/test/mockSupabase");
  mockSupabase.current = createMockSupabase();
  return { supabase: mockSupabase.current };
});

import DesempenhoReport from "./DesempenhoReport";

beforeEach(() => {
  vi.clearAllMocks();
  mockSupabase.current.reset();
});

const RESUMO_PADRAO = {
  faturamento: 500,
  numero_vendas: 10,
  por_dia: [
    { dia: "2026-07-01", total: 200 },
    { dia: "2026-07-02", total: 300 },
  ],
  por_metodo: [
    { metodo: "pix", total: 300 },
    { metodo: "dinheiro", total: 200 },
  ],
  top_produtos: [
    { produto_id: 1, nome: "X-Burguer", unidades: 10, receita: 300 },
    { produto_id: 2, nome: "Suco", unidades: 5, receita: 50 },
  ],
};

describe("DesempenhoReport", () => {
  it("mostra estado de carregando e depois os KPIs, o gráfico de dias e a margem (quando há ficha técnica)", async () => {
    mockSupabase.current.setRpcResult("relatorio_vendas", { data: RESUMO_PADRAO, error: null });
    mockSupabase.current.setTableResult("config", {
      data: { key: "fichas_tecnicas", value: [{ produtoId: 1, rendimento: "1", ingredientes: [{ qtd: "1", custoUnit: "12" }] }] },
      error: null,
    });

    render(<DesempenhoReport />);

    expect(screen.getByText(/carregando relatório/i)).toBeInTheDocument();

    await waitFor(() => expect(screen.getByText("R$ 500.00")).toBeInTheDocument());
    expect(screen.getByText("Vendas Realizadas")).toBeInTheDocument();
    expect(screen.getByText("X-Burguer")).toBeInTheDocument();

    // margem calculada para o produto com ficha técnica (receita 300 - custo 120 = 180, 60%)
    expect(screen.getByText(/R\$ 180.00 \(60%\)/)).toBeInTheDocument();
    // produto sem ficha técnica sinaliza claramente, sem inventar número
    expect(screen.getByText(/sem custo cadastrado/i)).toBeInTheDocument();
  });

  it("mostra estado vazio explícito quando não há vendas no período", async () => {
    mockSupabase.current.setRpcResult("relatorio_vendas", {
      data: { faturamento: 0, numero_vendas: 0, por_dia: [], por_metodo: [], top_produtos: [] },
      error: null,
    });
    mockSupabase.current.setTableResult("config", { data: { key: "fichas_tecnicas", value: [] }, error: null });

    render(<DesempenhoReport />);

    await waitFor(() => expect(screen.getByText(/nenhuma venda no período selecionado/i)).toBeInTheDocument());
  });

  it("mostra erro explícito quando a RPC falha, sem quebrar a tela", async () => {
    mockSupabase.current.setRpcError("relatorio_vendas", { message: "falha de rede" });
    mockSupabase.current.setTableResult("config", { data: { key: "fichas_tecnicas", value: [] }, error: null });

    render(<DesempenhoReport />);

    await waitFor(() => expect(screen.getByText(/não foi possível carregar o relatório/i)).toBeInTheDocument());
  });

  it("período 'Período' (intervalo) exige as duas datas antes de buscar", async () => {
    const user = userEvent.setup();
    mockSupabase.current.setRpcResult("relatorio_vendas", { data: RESUMO_PADRAO, error: null });
    mockSupabase.current.setTableResult("config", { data: { key: "fichas_tecnicas", value: [] }, error: null });

    render(<DesempenhoReport />);
    await waitFor(() => expect(screen.getByText("R$ 500.00")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Período" }));

    expect(screen.getByText(/selecione as duas datas/i)).toBeInTheDocument();
  });
});
