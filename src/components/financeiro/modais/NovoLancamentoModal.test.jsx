// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

vi.mock("@/lib/financeiro/financeiro", () => ({
  criarLancamento: vi.fn(() => Promise.resolve({ data: {}, error: null })),
}));

import NovoLancamentoModal from "./NovoLancamentoModal";
import { criarLancamento } from "@/lib/financeiro/financeiro";

// 2026-07-16T00:30:00Z = 15/07 às 21h30 em São Paulo — o dia UTC já virou,
// o dia do restaurante não.
const NOITE = new Date("2026-07-16T00:30:00.000Z");

describe("NovoLancamentoModal — competência pré-preenchida", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("aberto às 21h30 sugere o dia de hoje, não o de amanhã", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOITE);

    render(<NovoLancamentoModal usuario={{ id: 1 }} onCreated={vi.fn()} onClose={vi.fn()} />);

    // Com o dia UTC, a despesa lançada depois das 21h caía na competência do
    // dia seguinte — e, no fim do mês, no mês seguinte.
    expect(screen.getByLabelText("Competência")).toHaveValue("2026-07-15");
  });
});

describe("NovoLancamentoModal — duplo clique em Salvar (Run 2)", () => {
  beforeEach(() => {
    criarLancamento.mockReset();
  });

  /** Preenche o mínimo para um lançamento válido já pago (sem vencimento). */
  function preencherDespesaPaga() {
    fireEvent.change(screen.getByLabelText("Valor (R$)"), { target: { value: "250" } });
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "pago" } });
  }

  it("não grava a despesa duas vezes quando o dono clica duas vezes", async () => {
    // O gravar é lento na loja (3G do salão). Sem a trava, os dois cliques
    // viram dois lançamentos de R$ 250 e a despesa aparece dobrada no mês.
    let liberar;
    criarLancamento.mockImplementation(
      () => new Promise((resolve) => { liberar = () => resolve({ data: { id: 1 }, error: null }); }),
    );
    const onCreated = vi.fn();
    render(<NovoLancamentoModal usuario={{ id: 1 }} onCreated={onCreated} onClose={vi.fn()} />);
    preencherDespesaPaga();

    const salvar = screen.getByText("Salvar Lançamento");
    fireEvent.click(salvar);
    // Enquanto a primeira gravação está no ar, o botão precisa estar travado.
    const emAndamento = screen.getByText("Salvando...");
    expect(emAndamento).toBeDisabled();
    fireEvent.click(emAndamento);

    expect(criarLancamento).toHaveBeenCalledTimes(1);

    await act(async () => { liberar(); });
    expect(criarLancamento).toHaveBeenCalledTimes(1);
    expect(onCreated).toHaveBeenCalledTimes(1);
  });

  it("libera o botão de novo quando a gravação falha, para o dono poder tentar", async () => {
    criarLancamento.mockResolvedValue({ data: null, error: { message: "Sem conexão." } });
    render(<NovoLancamentoModal usuario={{ id: 1 }} onCreated={vi.fn()} onClose={vi.fn()} />);
    preencherDespesaPaga();

    await act(async () => { fireEvent.click(screen.getByText("Salvar Lançamento")); });

    expect(screen.getByText("Sem conexão.")).toBeInTheDocument();
    expect(screen.getByText("Salvar Lançamento")).not.toBeDisabled();
  });
});
