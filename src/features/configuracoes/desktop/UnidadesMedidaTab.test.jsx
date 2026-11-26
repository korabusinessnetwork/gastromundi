// @vitest-environment jsdom
//
// B1 da auditoria: a exclusão de uma unidade de medida rodava uma cascata de
// quatro comandos destrutivos sobre `products`, sem conferir nenhum. Desde a
// tarefa 1.3 do plano de refatoração ela é uma RPC atômica. A contagem de
// "produtos afetados" mostrada na confirmação vinha de uma consulta cujo erro
// também era descartado (falha de leitura virava "Nenhum produto utiliza
// essa unidade" — e o usuário confirmava a cascata achando que era inócua).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
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

vi.mock("@/lib/logger", () => ({ logAction: vi.fn() }));
vi.mock("@/features/jarvas/dados/jarvas", () => ({ emitirEvento: vi.fn() }));

import { setAppMock, renderWithProviders } from "@/test/mockApp";
import { UnidadesMedidaTab } from "./ConfiguracoesView";

const sz = { pad: 16, padSm: 8, fontSm: 12, fontBase: 14, fontLg: 18 };

const KG = { id: 1, abreviacao: "kg", nome: "Quilograma", tipo: "estoque", ordem: 1 };

const produtoQueUsaKg = {
  id: 10,
  unidade_estoque: "kg",
  unidade_consumo: null,
  unidades_compra: [],
};

/** Deixa a aba montada e a lista carregada com a unidade "kg". */
async function montarComKg() {
  mockSupabase.current.setTableResult("unidades_medida", { data: [KG], error: null });
  renderWithProviders(<UnidadesMedidaTab sz={sz} />);
  await waitFor(() => expect(screen.getByText("Quilograma")).toBeInTheDocument());
}

/** Abre o diálogo de exclusão da unidade "kg". */
async function abrirExclusao(user) {
  await user.click(screen.getByTitle("Remover"));
  return screen.findByText("Excluir unidade");
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSupabase.current?.reset?.();
  setAppMock({ currentUser: { name: "Dona", username: "dona", role: "admin" } });
});

describe("UnidadesMedidaTab, carga da lista", () => {
  it("falha ao carregar avisa, em vez de dizer que não há unidades", async () => {
    mockSupabase.current.setTableError("unidades_medida", { message: "network error" });

    renderWithProviders(<UnidadesMedidaTab sz={sz} />);

    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent(/não deu para carregar as unidades/i);
  });

  it("carga com sucesso lista as unidades sem aviso", async () => {
    await montarComKg();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("UnidadesMedidaTab, quem pode editar", () => {
  it("gerente vê as unidades em modo leitura, sem remover nem adicionar", async () => {
    setAppMock({ currentUser: { name: "Gê", username: "ge", role: "gerente" } });
    await montarComKg();

    expect(screen.getByText(/só o administrador pode adicionar ou remover/i)).toBeInTheDocument();
    expect(screen.queryByTitle("Remover")).not.toBeInTheDocument();
    expect(screen.queryAllByPlaceholderText("abrev.")).toHaveLength(0);
  });

  it("admin vê remover e adicionar, sem o aviso de leitura", async () => {
    await montarComKg();

    expect(screen.getByTitle("Remover")).toBeInTheDocument();
    expect(screen.getAllByPlaceholderText("abrev.").length).toBeGreaterThan(0);
    expect(screen.queryByText(/só o administrador pode adicionar ou remover/i)).not.toBeInTheDocument();
  });
});

describe("UnidadesMedidaTab, contagem antes de excluir (B1)", () => {
  it("não abre a confirmação se não deu para contar os produtos afetados", async () => {
    await montarComKg();
    mockSupabase.current.setTableError("products", { message: "permission denied" });
    const user = userEvent.setup();

    await user.click(screen.getByTitle("Remover"));

    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent(/não deu para verificar quais produtos usam esta unidade/i);
    // O diálogo mentiria "Nenhum produto utiliza essa unidade" — não abre.
    expect(screen.queryByText("Excluir unidade")).not.toBeInTheDocument();
  });

  it("conta certo os produtos afetados quando a consulta funciona", async () => {
    await montarComKg();
    mockSupabase.current.setTableResult("products", { data: [produtoQueUsaKg], error: null });
    const user = userEvent.setup();

    await abrirExclusao(user);

    expect(screen.getByText(/1 produto ficará sem essa unidade/i)).toBeInTheDocument();
  });
});

// Tarefa 1.3 do plano de refatoração: a cascata virou a RPC atômica
// `excluir_unidade_medida`. Os quatro passos soltos (e o teste de cada um)
// deixaram de existir no navegador; o "tudo ou nada" é do banco, provado em
// supabase/tests/excluir_unidade_medida_cenarios.sql. Aqui fica o contrato.
describe("UnidadesMedidaTab, exclusão (B1)", () => {
  /** Nenhuma escrita direta: tudo passa pela RPC. */
  function escritasDiretas() {
    return mockSupabase.current.calls.filter(
      (c) => ["insert", "update", "delete", "upsert"].includes(c.method)
        && ["products", "unidades_medida"].includes(c.table),
    );
  }

  it("exclusão bem-sucedida chama a RPC uma vez, tira a unidade da tela e fecha o diálogo", async () => {
    await montarComKg();
    mockSupabase.current.setTableResult("products", { data: [produtoQueUsaKg], error: null });
    const user = userEvent.setup();
    await abrirExclusao(user);

    await user.click(screen.getByRole("button", { name: /sim, excluir/i }));

    await waitFor(() => expect(screen.queryByText("Excluir unidade")).not.toBeInTheDocument());
    expect(screen.queryByText("Quilograma")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    const chamadas = mockSupabase.current.calls.filter((c) => c.rpc === "excluir_unidade_medida");
    expect(chamadas).toHaveLength(1);
    expect(chamadas[0].args[0]).toEqual({ p_unidade_id: KG.id });
    expect(escritasDiretas()).toHaveLength(0);
  });

  it("recusa do banco mantém a unidade na tela, o diálogo aberto, e diz o motivo", async () => {
    await montarComKg();
    mockSupabase.current.setTableResult("products", { data: [produtoQueUsaKg], error: null });
    // Frase e código como a migration 20261125 levanta para quem não é admin.
    mockSupabase.current.setRpcError("excluir_unidade_medida", {
      code: "42501",
      message: "Seu usuário não pode excluir unidades de medida. Peça ao administrador.",
    });
    const user = userEvent.setup();
    await abrirExclusao(user);

    await user.click(screen.getByRole("button", { name: /sim, excluir/i }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/peça ao administrador/i));
    expect(screen.getByText("Quilograma")).toBeInTheDocument();
    expect(screen.getByText("Excluir unidade")).toBeInTheDocument();
    expect(escritasDiretas()).toHaveLength(0);
  });
});

describe("UnidadesMedidaTab, adicionar", () => {
  it("erro ao adicionar avisa e não insere a unidade na lista", async () => {
    await montarComKg();
    mockSupabase.current.setTableHandler("unidades_medida", ({ method }) =>
      method === "insert" ? { data: null, error: { message: "duplicate key" } } : undefined);
    const user = userEvent.setup();

    const grupoEstoque = screen.getByText("Unidade de estoque").closest(".unidades-medida-tab__grupo");
    await user.type(within(grupoEstoque).getByPlaceholderText("abrev."), "g");
    await user.type(within(grupoEstoque).getByPlaceholderText("Nome completo"), "Grama");
    await user.click(within(grupoEstoque).getByRole("button", { name: /adicionar/i }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/não deu para adicionar a unidade/i));
    expect(screen.queryByText("Grama")).not.toBeInTheDocument();
  });
});
