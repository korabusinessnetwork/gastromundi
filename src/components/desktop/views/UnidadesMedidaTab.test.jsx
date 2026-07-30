// @vitest-environment jsdom
//
// B1 da auditoria — a exclusão de uma unidade de medida roda uma cascata de
// quatro comandos destrutivos sobre `products`. Nenhum deles era conferido:
// a unidade sumia da tela mesmo quando o banco recusava, e a contagem de
// "produtos afetados" mostrada na confirmação vinha de uma consulta cujo erro
// também era descartado (falha de leitura virava "Nenhum produto utiliza
// essa unidade" — e o usuário confirmava a cascata achando que era inócua).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
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

vi.mock("@/lib/logger", () => ({ logAction: vi.fn() }));
vi.mock("@/lib/jarvas", () => ({ emitirEvento: vi.fn() }));

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

describe("UnidadesMedidaTab — carga da lista", () => {
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

describe("UnidadesMedidaTab — contagem antes de excluir (B1)", () => {
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

describe("UnidadesMedidaTab — cascata de exclusão (B1)", () => {
  /**
   * Faz a cascata falhar exatamente no passo escolhido. Os quatro passos são,
   * em ordem: update de unidade_estoque, update de unidade_consumo, leitura de
   * unidades_compra e delete da própria unidade.
   */
  function falharNoPasso(passo) {
    const erro = { message: "permission denied" };
    mockSupabase.current.setTableHandler("products", ({ method, args }) => {
      if (method === "select") {
        // A contagem inicial (3 colunas) sempre funciona; a leitura de
        // unidades_compra é a do passo 3.
        const colunas = String(args?.[0] ?? "");
        if (colunas.includes("unidade_estoque")) return { data: [produtoQueUsaKg], error: null };
        return passo === 3 ? { data: null, error: erro } : { data: [], error: null };
      }
      if (method === "update") {
        const payload = args?.[0] ?? {};
        if (passo === 1 && "unidade_estoque" in payload) return { data: null, error: erro };
        if (passo === 2 && "unidade_consumo" in payload) return { data: null, error: erro };
        return { data: null, error: null };
      }
      return undefined;
    });
    if (passo === 4) mockSupabase.current.setTableHandler("unidades_medida", ({ method }) =>
      method === "delete" ? { data: null, error: erro } : undefined);
  }

  it.each([
    [1, /não deu para desvincular a unidade de estoque/i],
    [2, /não deu para limpar a unidade de consumo/i],
    [3, /não deu para ler as unidades de compra/i],
    [4, /a unidade não pôde ser excluída/i],
  ])("falha no passo %i interrompe a cascata e mantém a unidade na tela", async (passo, mensagem) => {
    await montarComKg();
    falharNoPasso(passo);
    const user = userEvent.setup();
    await abrirExclusao(user);

    await user.click(screen.getByRole("button", { name: /sim, excluir/i }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(mensagem));
    // A unidade continua existindo no banco — precisa continuar na tela.
    expect(screen.getByText("Quilograma")).toBeInTheDocument();
    // E o diálogo continua aberto: a ação não terminou.
    expect(screen.getByText("Excluir unidade")).toBeInTheDocument();
  });

  it("falha no passo 1 não chega a apagar a unidade no banco", async () => {
    await montarComKg();
    falharNoPasso(1);
    const user = userEvent.setup();
    await abrirExclusao(user);

    await user.click(screen.getByRole("button", { name: /sim, excluir/i }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());

    const deletes = mockSupabase.current.calls.filter(
      (c) => c.table === "unidades_medida" && c.method === "delete",
    );
    expect(deletes).toHaveLength(0);
  });

  it("cascata inteira bem-sucedida remove a unidade e fecha o diálogo", async () => {
    await montarComKg();
    mockSupabase.current.setTableResult("products", { data: [produtoQueUsaKg], error: null });
    const user = userEvent.setup();
    await abrirExclusao(user);

    await user.click(screen.getByRole("button", { name: /sim, excluir/i }));

    await waitFor(() => expect(screen.queryByText("Excluir unidade")).not.toBeInTheDocument());
    expect(screen.queryByText("Quilograma")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    const deletes = mockSupabase.current.calls.filter(
      (c) => c.table === "unidades_medida" && c.method === "delete",
    );
    expect(deletes).toHaveLength(1);
  });
});

describe("UnidadesMedidaTab — adicionar", () => {
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
