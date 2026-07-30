// @vitest-environment jsdom
//
// B2 da auditoria — ao editar um combo, a composição é recriada: apaga as
// junções e insere as novas. Os dois deletes não eram conferidos, então uma
// falha de permissão deixava a composição antiga somada à nova — o combo
// passava a levar o dobro dos itens (e a baixar o dobro do estoque).
// Junto vão os dois outros defeitos da mesma tela: falha de carga virava
// "Nenhum combo criado", e o toggle Ativo/Inativo mudava a tela sem mudar o
// banco.
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
const SUB = { id: 3, nome: "Batata média", preco: 8, categoria: "Acompanhamento", ativo: true };
const COMBO = {
  id: 1,
  nome: "Combo X",
  item_principal_id: 7,
  modo: "combo",
  preco_total: 28,
  ativo: true,
  combo_subprodutos: [{ quantidade: 1, subprodutos: { nome: SUB.nome, preco: SUB.preco } }],
  combo_produtos: [],
};

/** Deixa a lista carregada com um combo. */
async function montarComCombo() {
  mockSupabase.current.setTableResult("combos", { data: [COMBO], error: null });
  mockSupabase.current.setTableResult("subprodutos", { data: [SUB], error: null });
  renderWithProviders(<CombosView sz={sz} />);
  await waitFor(() => expect(screen.getByText("Combo X")).toBeInTheDocument());
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSupabase.current?.reset?.();
  setAppMock({ products: [PRODUTO] });
});

describe("CombosView — carga da lista", () => {
  it("falha ao carregar avisa, em vez de dizer que não há combos", async () => {
    mockSupabase.current.setTableError("combos", { message: "network error" });

    renderWithProviders(<CombosView sz={sz} />);

    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent(/não deu para carregar os combos/i);
    expect(screen.queryByText("Nenhum combo criado")).not.toBeInTheDocument();
  });

  it("falha só na carga dos subprodutos também avisa", async () => {
    mockSupabase.current.setTableResult("combos", { data: [COMBO], error: null });
    mockSupabase.current.setTableError("subprodutos", { message: "network error" });

    renderWithProviders(<CombosView sz={sz} />);

    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent(/não deu para carregar os combos/i);
  });

  it("carga com sucesso lista o combo sem aviso", async () => {
    await montarComCombo();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
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
  /** Abre o modal de edição já com a composição carregada. */
  async function abrirEdicao(user) {
    await user.click(screen.getByTitle("Editar combo"));
    await screen.findByText("Editar Combo");
    // A composição vem de combo_subprodutos; espera ela aparecer no modal.
    await screen.findByText(SUB.nome);
  }

  function composicaoCarregada() {
    mockSupabase.current.setTableHandler("combo_subprodutos", ({ method }) =>
      method === "select"
        ? { data: [{ id: 11, quantidade: 1, preco_customizado: null, subprodutos: SUB }], error: null }
        : undefined);
    mockSupabase.current.setTableHandler("combo_produtos", ({ method }) =>
      method === "select" ? { data: [], error: null } : undefined);
  }

  it("falha ao apagar os subprodutos antigos interrompe o salvamento (sem duplicar a composição)", async () => {
    await montarComCombo();
    composicaoCarregada();
    const user = userEvent.setup();
    await abrirEdicao(user);

    mockSupabase.current.setTableHandler("combo_subprodutos", ({ method }) =>
      method === "delete" ? { data: null, error: { message: "permission denied" } } : undefined);

    await user.click(screen.getByRole("button", { name: /salvar alterações/i }));

    await waitFor(() => expect(screen.getByText(/permission denied/i)).toBeInTheDocument());
    // Nenhum insert: senão o combo ficaria com a composição antiga + a nova.
    const inserts = mockSupabase.current.calls.filter(
      (c) => c.method === "insert" && (c.table === "combo_subprodutos" || c.table === "combo_produtos"),
    );
    expect(inserts).toHaveLength(0);
    // Modal continua aberto — o salvamento não terminou.
    expect(screen.getByText("Editar Combo")).toBeInTheDocument();
  });

  it("falha ao apagar os produtos antigos interrompe o salvamento", async () => {
    await montarComCombo();
    composicaoCarregada();
    const user = userEvent.setup();
    await abrirEdicao(user);

    mockSupabase.current.setTableHandler("combo_produtos", ({ method }) =>
      method === "delete" ? { data: null, error: { message: "delete recusado" } } : undefined);

    await user.click(screen.getByRole("button", { name: /salvar alterações/i }));

    await waitFor(() => expect(screen.getByText(/delete recusado/i)).toBeInTheDocument());
    const inserts = mockSupabase.current.calls.filter(
      (c) => c.method === "insert" && (c.table === "combo_subprodutos" || c.table === "combo_produtos"),
    );
    expect(inserts).toHaveLength(0);
  });

  it("edição bem-sucedida apaga antes de inserir e fecha o modal", async () => {
    await montarComCombo();
    composicaoCarregada();
    const user = userEvent.setup();
    await abrirEdicao(user);

    await user.click(screen.getByRole("button", { name: /salvar alterações/i }));

    await waitFor(() => expect(screen.queryByText("Editar Combo")).not.toBeInTheDocument());
    const ordem = mockSupabase.current.calls
      .filter(c => c.table === "combo_subprodutos" && (c.method === "delete" || c.method === "insert"))
      .map(c => c.method);
    expect(ordem).toEqual(["delete", "insert"]);
  });
});
