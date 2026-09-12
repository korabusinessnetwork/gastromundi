// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
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
import AdminView from "./AdminView";

const FORNECEDOR = { id: "f1", nome: "Distribuidora Sul", categoria: "Bebidas", contato: "", telefone: "", email: "", cnpj: "", observacoes: "" };

function config({ erroLeitura = null, erroGravacao = null, fornecedores = [FORNECEDOR] } = {}) {
  mockSupabase.current.setTableHandler("config", ({ method }) => {
    if (method === "select") {
      return erroLeitura
        ? { data: null, error: erroLeitura }
        : { data: [{ key: "fornecedores", value: fornecedores }], error: null };
    }
    if (method === "upsert") return { data: null, error: erroGravacao };
    return undefined;
  });
}

async function abrirFornecedores(user) {
  await user.click(await screen.findByText("Fornecedores"));
  return screen.findByRole("button", { name: /novo fornecedor/i });
}

beforeEach(() => {
  mockSupabase.current.reset();
  setAppMock();
  config();
});

describe("AdminView, carga", () => {
  it("falha de leitura avisa em vez de mostrar tudo zerado em silêncio", async () => {
    config({ erroLeitura: { message: "permission denied" } });
    renderWithProviders(<AdminView />);

    expect(await screen.findByRole("alert")).toHaveTextContent(/não deu para carregar os dados do administrativo/i);
  });

  it("carga boa não mostra aviso", async () => {
    renderWithProviders(<AdminView />);

    await screen.findByText("Fornecedores");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("AdminView, salvar fornecedor", () => {
  it("gravação recusada avisa, mantém o formulário aberto e não altera a lista", async () => {
    const user = userEvent.setup();
    config({ erroGravacao: { message: "rls" } });
    renderWithProviders(<AdminView />);
    await abrirFornecedores(user);

    await user.click(screen.getByRole("button", { name: /novo fornecedor/i }));
    await user.type(screen.getByPlaceholderText("Nome do fornecedor"), "Atacadão Norte");
    await user.click(screen.getByRole("button", { name: /^salvar$/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/não deu para salvar. a alteração não foi gravada/i);
    // O que o usuário digitou continua na tela — fechar o modal aqui jogaria
    // o cadastro fora sem ter gravado nada.
    expect(screen.getByPlaceholderText("Nome do fornecedor")).toHaveValue("Atacadão Norte");
    expect(screen.queryByRole("cell", { name: "Atacadão Norte" })).not.toBeInTheDocument();
  });

  it("gravação boa fecha o formulário e mostra o fornecedor na lista", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AdminView />);
    await abrirFornecedores(user);

    await user.click(screen.getByRole("button", { name: /novo fornecedor/i }));
    await user.type(screen.getByPlaceholderText("Nome do fornecedor"), "Atacadão Norte");
    await user.click(screen.getByRole("button", { name: /^salvar$/i }));

    await waitFor(() => expect(screen.queryByPlaceholderText("Nome do fornecedor")).not.toBeInTheDocument());
    expect(screen.getByText("Atacadão Norte")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("AdminView, excluir fornecedor", () => {
  async function abrirConfirmacao(user) {
    await abrirFornecedores(user);
    const linha = screen.getByRole("cell", { name: "Distribuidora Sul" }).closest("tr");
    // A última ação da linha é a lixeira (a primeira é "Editar").
    await user.click(within(linha).getAllByRole("button").at(-1));
    return screen.findByText(/será removido permanentemente/i);
  }

  it("exclusão recusada avisa e o fornecedor continua na lista", async () => {
    const user = userEvent.setup();
    config({ erroGravacao: { message: "rls" } });
    renderWithProviders(<AdminView />);
    await abrirConfirmacao(user);

    await user.click(screen.getByRole("button", { name: /excluir/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/não deu para salvar/i);
    expect(screen.getByRole("cell", { name: "Distribuidora Sul" })).toBeInTheDocument();
    // A confirmação continua aberta: fechá-la aqui daria a entender que a
    // exclusão foi feita, quando o banco recusou.
    expect(screen.getByText(/será removido permanentemente/i)).toBeInTheDocument();
  });

  it("exclusão aceita tira o fornecedor da lista", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AdminView />);
    await abrirConfirmacao(user);

    await user.click(screen.getByRole("button", { name: /excluir/i }));

    await waitFor(() => expect(screen.queryByRole("cell", { name: "Distribuidora Sul" })).not.toBeInTheDocument());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

/**
 * Contador do card Impostos (Refino G03).
 *
 * O card abre o ImpostosAdmin, que lê `itens_fiscal`, mas o contador vinha da
 * chave `config.impostos`, abandonada com a tela antiga. O dono via
 * "0 registros" com as alíquotas todas configuradas e clicava achando que
 * nunca tinha configurado nada.
 */
/**
 * Saídas do modal de ficha técnica, fornecedor e compra (Refino G04).
 *
 * O overlay só tratava o clique no fundo: Esc não fazia nada e o Tab passeava
 * pela tela de trás. Agora são os mesmos hooks dos modais do Console.
 */
describe("AdminView, Esc e foco no modal", () => {
  it("Esc fecha o modal de fornecedor sem gravar nada", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AdminView />);
    await abrirFornecedores(user);
    await user.click(screen.getByRole("button", { name: /novo fornecedor/i }));
    await screen.findByPlaceholderText("Nome do fornecedor");

    await user.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByPlaceholderText("Nome do fornecedor")).not.toBeInTheDocument());
    const upserts = mockSupabase.current.calls.filter((c) => c.table === "config" && c.method === "upsert");
    expect(upserts).toHaveLength(0);
  });

  it("ao abrir, o foco já está no primeiro campo do modal", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AdminView />);
    await abrirFornecedores(user);

    await user.click(screen.getByRole("button", { name: /novo fornecedor/i }));

    expect(await screen.findByPlaceholderText("Nome do fornecedor")).toHaveFocus();
  });

  it("Tab no último foco volta para dentro do modal, não vaza para a tela de trás", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AdminView />);
    await abrirFornecedores(user);
    await user.click(screen.getByRole("button", { name: /novo fornecedor/i }));
    const modal = (await screen.findByPlaceholderText("Nome do fornecedor")).closest(".admin__modal");

    // Uma volta inteira pelos focáveis do modal termina de novo dentro dele.
    const focaveis = within(modal).getAllByRole("button").length + within(modal).getAllByRole("textbox").length;
    for (let i = 0; i < focaveis + 1; i++) await user.tab();

    expect(modal.contains(document.activeElement)).toBe(true);
  });
});

describe("AdminView, contador do card Impostos", () => {
  it("conta os itens com configuração fiscal, não a chave morta config.impostos", async () => {
    // A chave antiga cheia e o `itens_fiscal` com 3 itens: o card tem que
    // mostrar 3.
    mockSupabase.current.setTableHandler("config", ({ method }) => {
      if (method === "select") {
        return { data: [{ key: "impostos", value: [{ id: "i1" }, { id: "i2" }, { id: "i3" }, { id: "i4" }, { id: "i5" }] }], error: null };
      }
      return undefined;
    });
    mockSupabase.current.setTableHandler("itens_fiscal", () => ({ data: null, count: 3, error: null }));
    renderWithProviders(<AdminView />);

    const card = (await screen.findByText("Impostos")).closest("button");
    expect(within(card).getByText("3 registros")).toBeInTheDocument();
  });

  it("estabelecimento sem nenhuma configuração fiscal mostra zero", async () => {
    mockSupabase.current.setTableHandler("itens_fiscal", () => ({ data: null, count: 0, error: null }));
    renderWithProviders(<AdminView />);

    const card = (await screen.findByText("Impostos")).closest("button");
    expect(within(card).getByText("0 registros")).toBeInTheDocument();
  });
});

/**
 * Busca, recorte e corte da lista de compras (Refino G05).
 *
 * A tabela renderizava `compras.map(...)` inteira, sempre: sem busca por
 * fornecedor, sem recorte por situação e sem corte de renderização. Compra é
 * registro que só cresce, e a pergunta do dia ("o que está pendente com o
 * fornecedor X") não tinha resposta na tela.
 */
describe("AdminView, aba Compras com busca e recorte", () => {
  /** Gera `n` compras alternando fornecedor e situação. */
  const gerarCompras = (n) => Array.from({ length: n }, (_, i) => ({
    id: `c${i}`,
    fornecedor: i % 2 === 0 ? "Distribuidora Sul" : "Atacadão Norte",
    data: "2026-07-15",
    itens: [],
    total: 10,
    status: i % 3 === 0 ? "pago" : "pendente",
    observacoes: "",
  }));

  /** Carrega o config com essas compras e abre a aba. */
  async function abrirCompras(user, compras) {
    mockSupabase.current.setTableHandler("config", ({ method }) => {
      if (method === "select") return { data: [{ key: "compras", value: compras }], error: null };
      return undefined;
    });
    renderWithProviders(<AdminView />);
    await user.click(await screen.findByText("Compras"));
    return screen.findByRole("button", { name: /registrar compra/i });
  }

  const linhasFornecedor = (nome) => screen.queryAllByRole("cell", { name: nome });

  it("a busca por fornecedor deixa na tela só as compras dele", async () => {
    const user = userEvent.setup();
    await abrirCompras(user, gerarCompras(6));
    expect(linhasFornecedor("Atacadão Norte")).toHaveLength(3);

    await user.type(screen.getByRole("searchbox"), "atacadao");

    expect(linhasFornecedor("Atacadão Norte")).toHaveLength(3);
    expect(linhasFornecedor("Distribuidora Sul")).toHaveLength(0);
  });

  it("cada atalho de situação traz a contagem da base inteira e filtra ao clicar", async () => {
    const user = userEvent.setup();
    await abrirCompras(user, gerarCompras(6));

    const pendentes = screen.getByRole("button", { name: /pendentes/i });
    expect(pendentes).toHaveTextContent("4");
    expect(screen.getByRole("button", { name: /pagas/i })).toHaveTextContent("2");
    expect(screen.getByRole("button", { name: /canceladas/i })).toHaveTextContent("0");

    await user.click(pendentes);

    expect(pendentes).toHaveAttribute("aria-pressed", "true");
    expect(screen.getAllByRole("row")).toHaveLength(5); // cabeçalho + 4 pendentes
  });

  it("lista longa é cortada em blocos, com a conta do que ficou de fora", async () => {
    const user = userEvent.setup();
    await abrirCompras(user, gerarCompras(47));

    expect(screen.getAllByRole("row")).toHaveLength(21); // cabeçalho + 20
    expect(screen.getByText(/Mostrando 20 de 47 compras/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /ver mais 20 compras/i }));

    expect(screen.getAllByRole("row")).toHaveLength(41);
    expect(screen.getByText(/Mostrando 40 de 47 compras/)).toBeInTheDocument();
  });

  it("filtro que não acha nada explica o recorte e oferece ver todas", async () => {
    const user = userEvent.setup();
    await abrirCompras(user, gerarCompras(6));

    await user.type(screen.getByRole("searchbox"), "padaria");

    expect(screen.getByText(/Nenhuma compra de “padaria”/)).toBeInTheDocument();
    expect(screen.queryAllByRole("row")).toHaveLength(0);

    await user.click(screen.getByRole("button", { name: /ver todas/i }));

    expect(screen.getAllByRole("row")).toHaveLength(7);
  });

  it("trocar de recorte volta para o primeiro bloco", async () => {
    const user = userEvent.setup();
    await abrirCompras(user, gerarCompras(47));
    await user.click(screen.getByRole("button", { name: /ver mais 20 compras/i }));
    expect(screen.getAllByRole("row")).toHaveLength(41);

    await user.click(screen.getByRole("button", { name: /pagas/i }));

    // 16 pagas de 47: cabem num bloco só, então nem rodapé de "ver mais" sobra.
    expect(screen.getAllByRole("row")).toHaveLength(17);
    expect(screen.queryByText(/Mostrando/)).not.toBeInTheDocument();
  });
});

describe("AdminView, registrar compra", () => {
  it("compra aberta às 21h30 nasce com a data de hoje, não a de amanhã", async () => {
    const user = userEvent.setup();
    renderWithProviders(<AdminView />);

    await user.click(await screen.findByText("Compras"));
    const abrir = await screen.findByRole("button", { name: /registrar compra/i });

    // O relógio falso cobre só o clique (síncrono): com timers falsos ligados
    // durante as esperas do userEvent, os awaits nunca resolveriam.
    // 2026-07-16T00:30:00Z = 15/07 às 21h30 em São Paulo.
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-07-16T00:30:00.000Z"));
      fireEvent.click(abrir);
    } finally {
      vi.useRealTimers();
    }

    // O campo "Data" não tem <label for>, então localizamos pelo tipo — o
    // modal de compra é o único lugar da tela com input de data.
    expect(document.querySelector('input[type="date"]')).toHaveValue("2026-07-15");
  });
});
