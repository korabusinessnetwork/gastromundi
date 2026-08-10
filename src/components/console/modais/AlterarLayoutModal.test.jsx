// @vitest-environment jsdom
//
// CONSOLE-UX 31 — o modal de trocar layout entra na rede de testes.
//
// Trocar o layout muda a aparência do estabelecimento na hora, para todos os
// usuários dele. O que estes testes protegem é a prevenção de erro da tela: o
// "Salvar" nasce travado enquanto a escolha ainda é o layout atual (nada a
// fazer), a gravação manda exatamente o código escolhido, e uma recusa do
// servidor aparece na tela em vez de sumir — sem nunca chamar `onAlterado`
// como se tivesse dado certo.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/lib/supabase", async () => {
  const { createMockSupabase } = await import("@/test/mockSupabase");
  return { supabase: createMockSupabase() };
});

// `mensagemDeErroDoConsole` fica REAL (é o que decide o texto do erro); o
// catálogo `@/layouts` também é real (lista fechada, sem I/O). Só a escrita é
// dublada.
const { mockAlterarLayout } = vi.hoisted(() => ({ mockAlterarLayout: vi.fn() }));
vi.mock("@/lib/console/console", async () => {
  const real = await vi.importActual("@/lib/console/console");
  return { ...real, alterarLayout: mockAlterarLayout };
});

import AlterarLayoutModal from "./AlterarLayoutModal";

// Layout inicial vem de `layoutDoTema(tema)`; com `layout: "padrao"` o estado
// inicial é determinístico e "sem mudança".
const TENANT = { id: "t1", nome: "Café Central", tema: { layout: "padrao" } };

const salvar = () => screen.getByRole("button", { name: /Salvar layout|Salvando/i });
const seletor = () => screen.getByRole("combobox");

function montar(props = {}) {
  const onAlterado = vi.fn();
  const onFechar = vi.fn();
  render(
    <AlterarLayoutModal
      tenant={TENANT}
      onFechar={onFechar}
      onAlterado={onAlterado}
      {...props}
    />
  );
  return { onAlterado, onFechar };
}

describe("AlterarLayoutModal — a troca de layout de um estabelecimento", () => {
  beforeEach(() => {
    mockAlterarLayout.mockReset();
    mockAlterarLayout.mockResolvedValue({
      data: { id: "t1", tema: { layout: "claro" } },
      error: null,
    });
  });

  it("abre com o salvar travado enquanto a escolha ainda é o layout atual", () => {
    montar();
    expect(salvar()).toBeDisabled();
  });

  it("escolher outro layout libera o salvar", async () => {
    const user = userEvent.setup();
    montar();
    await user.selectOptions(seletor(), "claro");
    expect(salvar()).toBeEnabled();
  });

  it("mostra a descrição do layout escolhido antes de salvar", async () => {
    const user = userEvent.setup();
    montar();
    await user.selectOptions(seletor(), "claro");
    expect(screen.getByText(/Neutro funcional claro/i)).toBeInTheDocument();
  });

  it("salvar manda o código escolhido e repassa o retorno para onAlterado", async () => {
    const user = userEvent.setup();
    const { onAlterado } = montar();
    await user.selectOptions(seletor(), "claro");
    await user.click(salvar());

    await waitFor(() => expect(mockAlterarLayout).toHaveBeenCalledWith("t1", "claro"));
    expect(onAlterado).toHaveBeenCalledWith({ id: "t1", tema: { layout: "claro" } });
  });

  it("erro do servidor aparece na tela e não chama onAlterado", async () => {
    mockAlterarLayout.mockResolvedValue({
      data: null,
      error: { message: "Apenas a plataforma pode alterar o layout." },
    });
    const user = userEvent.setup();
    const { onAlterado } = montar();
    await user.selectOptions(seletor(), "claro");
    await user.click(salvar());

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /Apenas a plataforma pode alterar o layout/i
    );
    expect(onAlterado).not.toHaveBeenCalled();
  });

  it("voltar ao layout atual volta a travar o salvar", async () => {
    const user = userEvent.setup();
    montar();
    await user.selectOptions(seletor(), "claro");
    expect(salvar()).toBeEnabled();

    await user.selectOptions(seletor(), "padrao");
    expect(salvar()).toBeDisabled();
  });
});

// ── CONSOLE-UX 24 — Esc fecha ──
//
// Modal de um campo só: o gesto de sair é o mesmo do "X", reabrir custa um
// clique e não há o que confirmar.
describe("AlterarLayoutModal — Esc fecha", () => {
  it("Esc chama onFechar", async () => {
    const user = userEvent.setup();
    const onFechar = vi.fn();
    render(<AlterarLayoutModal tenant={TENANT} onFechar={onFechar} onAlterado={vi.fn()} />);

    await user.keyboard("{Escape}");

    expect(onFechar).toHaveBeenCalledTimes(1);
  });
});
