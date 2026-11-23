// @vitest-environment jsdom
//
// Tarefa 1.3 do plano de refatoração: o celular exclui unidade pela mesma RPC
// atômica do computador. Antes rodava quatro passos soltos, e o gerente (que
// vê o botão aqui) desvinculava os produtos sem conseguir apagar a unidade.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/context/AppContext", async () => {
  const { mockUseApp } = await import("@/test/mockApp");
  return { useApp: mockUseApp, AppProvider: ({ children }) => children };
});

const { mockSupabase } = vi.hoisted(() => ({ mockSupabase: { current: null } }));
vi.mock("@/lib/supabase", async () => {
  const { createMockSupabase } = await import("@/test/mockSupabase");
  mockSupabase.current = createMockSupabase();
  return { supabase: mockSupabase.current };
});

import { setAppMock, renderWithProviders } from "@/test/mockApp";
import SecaoUnidades from "./SecaoUnidades";

const KG = { id: "u-kg", abreviacao: "kg", nome: "Quilograma", tipo: "estoque", ordem: 1 };

function escritasDiretas() {
  return mockSupabase.current.calls.filter(
    (c) => ["insert", "update", "delete", "upsert"].includes(c.method)
      && ["products", "unidades_medida"].includes(c.table),
  );
}

async function abrirConfirmacao(user) {
  mockSupabase.current.setTableResult("unidades_medida", { data: [KG], error: null });
  mockSupabase.current.setTableResult("products", {
    data: [{ id: 1, unidade_estoque: "kg", unidade_consumo: null, unidades_compra: [] }],
    error: null,
  });
  renderWithProviders(<SecaoUnidades />);
  await user.click(await screen.findByRole("button", { name: "Remover unidade Quilograma" }));
  await screen.findByText(/1 produto ficará sem essa/i);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSupabase.current?.reset?.();
  setAppMock({ currentUser: { name: "Gê", username: "ge", role: "gerente" } });
});

describe("SecaoUnidades, exclusão", () => {
  it("sucesso chama a RPC uma vez e tira a unidade da lista", async () => {
    const user = userEvent.setup();
    await abrirConfirmacao(user);

    await user.click(screen.getByRole("button", { name: /sim, excluir/i }));

    expect(await screen.findByRole("status")).toHaveTextContent('"Quilograma" removida.');
    const chamadas = mockSupabase.current.calls.filter((c) => c.rpc === "excluir_unidade_medida");
    expect(chamadas).toHaveLength(1);
    expect(chamadas[0].args[0]).toEqual({ p_unidade_id: "u-kg" });
    expect(escritasDiretas()).toHaveLength(0);
  });

  it("recusa do banco mantém a unidade e mostra o motivo, sem gravar nada", async () => {
    mockSupabase.current.setRpcError("excluir_unidade_medida", {
      code: "42501",
      message: "Seu usuário não pode excluir unidades de medida. Peça ao administrador.",
    });
    const user = userEvent.setup();
    await abrirConfirmacao(user);

    await user.click(screen.getByRole("button", { name: /sim, excluir/i }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/peça ao administrador/i));
    expect(screen.getByText(/Excluir "Quilograma"/)).toBeInTheDocument();
    expect(escritasDiretas()).toHaveLength(0);
  });
});
