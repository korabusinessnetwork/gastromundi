// @vitest-environment jsdom
//
// PautaCard — os três atalhos de situação (P / E / F) no rodapé do card.
//
// O furo: `await onMudarStatus?.(pauta.id, status)` descartava o { error } que
// o contexto devolve. Falhando a escrita, o botão voltava ao normal, o card não
// saía da coluna e nada era dito: o sócio concluía que o clique não pegou e
// clicava de novo. O formulário da mesma tela já tratava certo (PautaForm, com
// role="alert"), e o card não.
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import PautaCard from "./PautaCard";

const PAUTA = {
  id: "p1",
  titulo: "Fila de pedidos offline no PDV",
  intuito: "Não perder venda quando a internet cai.",
  contexto: "",
  envolvidos: [],
  status: "pendente",
  created_at: "2026-08-17T12:00:00.000Z",
};

const montar = (onMudarStatus) =>
  render(<PautaCard pauta={PAUTA} pessoas={[]} onMudarStatus={onMudarStatus} onEditar={vi.fn()} />);

/** O atalho "E" (em progresso), o destino mais comum de um card pendente. */
const clicarEmProgresso = async () => {
  await act(async () => { fireEvent.click(screen.getByLabelText("Mudar para em progresso")); });
};

describe("PautaCard, mudança de situação recusada", () => {
  it("escrita recusada avisa em vez de ficar calada", async () => {
    montar(vi.fn(() => Promise.resolve({ data: null, error: { message: "new row violates row-level security policy" } })));
    await clicarEmProgresso();

    expect(screen.getByRole("alert").textContent).toContain("Não conseguimos salvar. Tente de novo.");
  });

  it("escrita aceita não mostra aviso nenhum", async () => {
    montar(vi.fn(() => Promise.resolve({ data: { ...PAUTA, status: "em_progresso" }, error: null })));
    await clicarEmProgresso();

    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("nova tentativa limpa o aviso anterior quando dá certo", async () => {
    const onMudarStatus = vi.fn()
      .mockResolvedValueOnce({ data: null, error: { message: "TypeError: Failed to fetch" } })
      .mockResolvedValueOnce({ data: { ...PAUTA, status: "em_progresso" }, error: null });
    montar(onMudarStatus);

    await clicarEmProgresso();
    expect(screen.getByRole("alert")).toBeTruthy();

    await clicarEmProgresso();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(onMudarStatus).toHaveBeenCalledTimes(2);
  });
});
