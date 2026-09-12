// @vitest-environment jsdom
//
// Refino, robustez do Financeiro.
//
// R01: a receita do card Lucro vem de `sales`, que o bootstrap carrega só dos
// últimos 90 dias (AppContext.jsx:340), enquanto as despesas vêm de
// `lancamentos`, sem recorte. Escolhendo um mês mais antigo que isso, a receita
// entrava como zero, o custo como zero, e as despesas pagas daquele mês
// continuavam sendo subtraídas: prejuízo inventado, em vermelho, num mês que
// pode ter sido o melhor do ano.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const { mockSupabase } = vi.hoisted(() => ({ mockSupabase: { current: null } }));
vi.mock("@/lib/supabase", async () => {
  const { createMockSupabase } = await import("@/test/mockSupabase");
  mockSupabase.current = createMockSupabase();
  return { supabase: mockSupabase.current };
});

const { contexto } = vi.hoisted(() => ({ contexto: { current: {} } }));
vi.mock("@/context/AppContext", () => ({ useApp: () => contexto.current }));

import FinanceiroView from "./FinanceiroView";
import { intervaloDoMes } from "@/lib/periodos";

/** Dia de calendário local, n dias atrás, no formato do <input type="date">. */
function diasAtras(n) {
  const d = new Date(Date.now() - n * 24 * 60 * 60 * 1000);
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mes}-${dia}`;
}

const DIA_ANTIGO = diasAtras(200); // bem antes da janela de 90 dias

/** Uma despesa já paga, subtraída do lucro do período em que cai. */
const despesaPaga = (competencia) => ({
  id: "l1",
  tipo: "despesa",
  categoria: "Fornecedor",
  descricao: "Hortifruti",
  valor: 30,
  competencia,
  vencimento: competencia,
  status: "pago",
  origem: "manual",
});

/** Uma venda de hoje, dentro da janela carregada pelo bootstrap. */
const vendaDeHoje = {
  id: "v1",
  at: new Date().toISOString(),
  total: 100,
  items: [{ uid: "i1", name: "Prato", price: 100, qty: 1 }],
};

function montar({ lancamentos = [], sales = [] } = {}) {
  mockSupabase.current.setTableResult("lancamentos", { data: lancamentos, error: null });
  contexto.current = { currentUser: { username: "ana", role: "gerente" }, sales };
  return render(<FinanceiroView />);
}

const inputAte = () => screen.getByLabelText("Data final do período");

beforeEach(() => {
  vi.clearAllMocks();
  mockSupabase.current.reset();
});

describe("FinanceiroView, lucro de período fora da janela de vendas carregada (R01)", () => {
  it("dentro da janela, o card segue calculando o lucro normalmente", async () => {
    montar({ lancamentos: [despesaPaga(intervaloDoMes(new Date()).de)], sales: [vendaDeHoje] });

    // 100 de venda, sem ficha técnica cadastrada, menos 30 de despesa paga.
    expect(await screen.findByText("R$ 70.00")).toBeInTheDocument();
    expect(screen.queryByText("Não disponível")).not.toBeInTheDocument();
  });

  it("período que começa antes da janela, o card diz que o lucro não está disponível", async () => {
    montar({ lancamentos: [despesaPaga(DIA_ANTIGO)], sales: [vendaDeHoje] });
    await screen.findByText("Novo lançamento");

    // Puxar o "Até" para trás arrasta o "De" junto: o período inteiro fica
    // antes da janela de vendas carregada.
    fireEvent.change(inputAte(), { target: { value: DIA_ANTIGO } });

    expect(await screen.findByText("Não disponível")).toBeInTheDocument();
    expect(
      screen.getByText(/as vendas carregadas cobrem os últimos 90 dias/),
    ).toBeInTheDocument();
    // Antes aparecia "R$ -30.00" como lucro: só a despesa paga, sem nenhuma
    // receita para comparar. Hoje o único card com esse valor é o Saldo.
    expect(screen.queryAllByText("R$ -30.00")).toHaveLength(1);
  });
});
