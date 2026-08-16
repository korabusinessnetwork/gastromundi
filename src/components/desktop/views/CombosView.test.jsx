// @vitest-environment jsdom
//
// Combo flexível (grupos de escolha). Três garantias da tela:
//  1. Carga: falha ao ler os combos OU os grupos avisa, em vez de dizer
//     "Nenhum combo criado" — senão o usuário recria o que já existe.
//  2. Toggle Ativo/Inativo é otimista com desfazer: erro no banco volta a
//     chave e avisa.
//  3. B2 — ao editar, a composição é recriada apagando os grupos antigos
//     antes de inserir os novos. O delete é conferido: se ele falha, o
//     salvamento para (sem inserir), senão o combo ficaria com os grupos
//     antigos somados aos novos (cliente escolheria duas vezes).
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
import CombosView from "./CombosView";

const sz = { pad: 16, padSm: 8, fontSm: 12, fontBase: 14, fontLg: 18 };

const PRODUTO = { id: 7, name: "X-Burguer", price: 20, emoji: "🍔", category: "Lanches" };

// Linha de combos.select(...)
const COMBO = { id: 1, nome: "Combo X", preco_total: 28, ativo: true, created_at: "2026-01-01" };

// Linha de grupos_escolha.select(SEL_GRUPO) — um grupo "lista" com uma opção.
const GRUPO_ROW = {
  id: "g1",
  produto_id: null,
  combo_id: 1,
  nome: "Escolha o hambúrguer",
  minimo: 1,
  maximo: 1,
  origem: "lista",
  categoria: null,
  ordem: 0,
  grupo_escolha_itens: [{ id: "i1", produto_id: 7, preco_customizado: null, ordem: 0 }],
};

/** Deixa a lista carregada com um combo e seu grupo de escolha. */
async function montarComCombo() {
  mockSupabase.current.setTableResult("combos", { data: [COMBO], error: null });
  mockSupabase.current.setTableResult("grupos_escolha", { data: [GRUPO_ROW], error: null });
  renderWithProviders(<CombosView sz={sz} />);
  await waitFor(() => expect(screen.getByText("Combo X")).toBeInTheDocument());
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSupabase.current?.reset?.();
  setAppMock({ products: [PRODUTO] });
});

describe("CombosView — carga da lista", () => {
  it("falha ao carregar os combos avisa, em vez de dizer que não há combos", async () => {
    mockSupabase.current.setTableError("combos", { message: "network error" });

    renderWithProviders(<CombosView sz={sz} />);

    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent(/não deu para carregar os combos/i);
    expect(screen.queryByText("Nenhum combo criado")).not.toBeInTheDocument();
  });

  it("falha só na carga dos grupos de escolha também avisa", async () => {
    mockSupabase.current.setTableResult("combos", { data: [COMBO], error: null });
    mockSupabase.current.setTableError("grupos_escolha", { message: "network error" });

    renderWithProviders(<CombosView sz={sz} />);

    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent(/não deu para carregar os combos/i);
  });

  it("carga com sucesso lista o combo sem aviso", async () => {
    await montarComCombo();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    // A composição vem da contagem de grupos de escolha.
    expect(screen.getByText("1 grupo de escolha")).toBeInTheDocument();
  });
});

describe("CombosView — ligar/desligar combo", () => {
  it("erro no banco desfaz a mudança e avisa", async () => {
    await montarComCombo();
    mockSupabase.current.setTableHandler("combos", ({ method }) =>
      method === "update" ? { data: null, error: { message: "permission denied" } } : undefined);
    const user = userEvent.setup();

    await user.click(screen.getByText("Ativo"));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/não deu para mudar a situação do combo/i));
    // O combo continua ativo no banco — a tela precisa voltar a dizer "Ativo".
    expect(screen.getByText("Ativo")).toBeInTheDocument();
    expect(screen.queryByText("Inativo")).not.toBeInTheDocument();
  });

  it("sucesso mantém a mudança e não avisa nada", async () => {
    await montarComCombo();
    const user = userEvent.setup();

    await user.click(screen.getByText("Ativo"));

    await waitFor(() => expect(screen.getByText("Inativo")).toBeInTheDocument());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("CombosView — editar combo (B2)", () => {
  /** Abre o modal de edição já com os grupos carregados. */
  async function abrirEdicao(user) {
    await user.click(screen.getByTitle("Editar combo"));
    await screen.findByText("Editar Combo");
    // Espera o editor de grupos renderizar (sai do "Carregando grupos…").
    await screen.findByText(/adicionar grupo de escolha/i);
  }

  it("falha ao apagar os grupos antigos interrompe o salvamento (sem duplicar a composição)", async () => {
    await montarComCombo();
    const user = userEvent.setup();
    await abrirEdicao(user);

    mockSupabase.current.setTableHandler("grupos_escolha", ({ method }) =>
      method === "delete" ? { data: null, error: { message: "permission denied" } } : undefined);

    await user.click(screen.getByRole("button", { name: /salvar alterações/i }));

    await waitFor(() => expect(screen.getByText(/permission denied/i)).toBeInTheDocument());
    // Nenhum insert: senão o combo ficaria com os grupos antigos + os novos.
    const inserts = mockSupabase.current.calls.filter(
      (c) => c.method === "insert" && (c.table === "grupos_escolha" || c.table === "grupo_escolha_itens"),
    );
    expect(inserts).toHaveLength(0);
    // Modal continua aberto — o salvamento não terminou.
    expect(screen.getByText("Editar Combo")).toBeInTheDocument();
  });

  it("edição bem-sucedida apaga antes de inserir e fecha o modal", async () => {
    await montarComCombo();
    const user = userEvent.setup();
    await abrirEdicao(user);

    await user.click(screen.getByRole("button", { name: /salvar alterações/i }));

    await waitFor(() => expect(screen.queryByText("Editar Combo")).not.toBeInTheDocument());
    const ordem = mockSupabase.current.calls
      .filter(c => c.table === "grupos_escolha" && (c.method === "delete" || c.method === "insert"))
      .map(c => c.method);
    expect(ordem).toEqual(["delete", "insert"]);
  });
});
