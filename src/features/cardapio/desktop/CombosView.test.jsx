// @vitest-environment jsdom
//
// B2 da auditoria: ao editar um combo, a composição era recriada em chamadas
// soltas, e uma falha no meio deixava o combo com itens a mais ou a menos. A
// tarefa 1.1 do plano de refatoração moveu o salvamento para a RPC atômica
// `salvar_combo`. Junto vão os dois outros defeitos da mesma tela: falha de carga virava
// "Nenhum combo criado", e o toggle Ativo/Inativo mudava a tela sem mudar o
// banco.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/context/AppContext", async () => {
  const { ganchosDoMock } = await import("@/test/mockApp");
  return { ...ganchosDoMock, AppProvider: ({ children }) => children };
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

describe("CombosView, carga da lista", () => {
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

describe("CombosView, ligar/desligar combo", () => {
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

describe("CombosView, editar combo (B2)", () => {
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

  // Tarefa 1.1 do plano de refatoração: o salvamento virou uma chamada só à
  // RPC `salvar_combo`, que grava combo e composição na mesma transação. O
  // cenário B2 (delete falha e os inserts seguem) deixou de existir no
  // navegador: quem garante "tudo ou nada" é o banco, coberto pelo guard
  // salvarComboSqlGuard.test.js. Aqui fica o contrato da tela.

  /** Nenhuma escrita direta nas tabelas do combo: tudo passa pela RPC. */
  function escritasDiretas() {
    return mockSupabase.current.calls.filter(
      (c) => ["insert", "update", "delete", "upsert"].includes(c.method)
        && ["combos", "combo_subprodutos", "combo_produtos"].includes(c.table),
    );
  }

  it("edição bem-sucedida grava tudo numa chamada só e fecha o modal", async () => {
    await montarComCombo();
    composicaoCarregada();
    mockSupabase.current.setRpcResult("salvar_combo", { data: COMBO.id, error: null });
    const user = userEvent.setup();
    await abrirEdicao(user);

    await user.click(screen.getByRole("button", { name: /salvar alterações/i }));

    await waitFor(() => expect(screen.queryByText("Editar Combo")).not.toBeInTheDocument());
    const chamadas = mockSupabase.current.calls.filter((c) => c.rpc === "salvar_combo");
    expect(chamadas).toHaveLength(1);
    expect(chamadas[0].args[0]).toMatchObject({
      p_combo_id: COMBO.id,
      p_nome: "Combo X",
      p_item_principal_id: 7,
      p_subprodutos: [{ subproduto_id: SUB.id, quantidade: 1, preco_customizado: null }],
      p_produtos: [],
    });
    expect(escritasDiretas()).toHaveLength(0);
  });

  it("recusa do banco aparece na tela e o modal continua aberto", async () => {
    await montarComCombo();
    composicaoCarregada();
    mockSupabase.current.setRpcError("salvar_combo", {
      code: "P0002",
      message: "Este combo não existe mais, ou seu usuário não pode alterá-lo.",
    });
    const user = userEvent.setup();
    await abrirEdicao(user);

    await user.click(screen.getByRole("button", { name: /salvar alterações/i }));

    await waitFor(() => expect(screen.getByText(/este combo não existe mais/i)).toBeInTheDocument());
    expect(screen.getByText("Editar Combo")).toBeInTheDocument();
    expect(escritasDiretas()).toHaveLength(0);
  });

  it("recusa da RLS vira frase que diz o que fazer", async () => {
    await montarComCombo();
    composicaoCarregada();
    mockSupabase.current.setRpcError("salvar_combo", {
      code: "42501",
      message: 'new row violates row-level security policy for table "combos"',
    });
    const user = userEvent.setup();
    await abrirEdicao(user);

    await user.click(screen.getByRole("button", { name: /salvar alterações/i }));

    await waitFor(() => expect(screen.getByText(/peça a um gerente/i)).toBeInTheDocument());
    expect(screen.queryByText(/row-level security/i)).not.toBeInTheDocument();
  });
});
