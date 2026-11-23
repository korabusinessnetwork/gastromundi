// @vitest-environment jsdom
//
// Tarefa 2.1 do plano de refatoração: prova de redesenho desnecessário.
//
// O `AppContext` entrega cerca de 80 itens num único objeto, criado de novo a
// cada render e sem memorização. Qualquer mudança de estado (aqui, a taxa de
// serviço) redesenha TODA tela que usa `useApp()`, mesmo a que só lê o usuário
// logado. No PDV, isso é a tela inteira sendo refeita no meio da venda.
//
// O teste descreve o comportamento DESEJADO e está marcado com `it.fails`:
// hoje ele passa porque falha. Quando a fase 2 dividir o contexto e a tarefa
// 2.8 trocar o `useApp()` da sonda pelo hook específico (`useSessao`), ele
// passa a falhar de verdade, e aí vira um `it` comum. É de propósito: a
// suíte avisa no dia em que o problema estiver resolvido.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, act } from "@testing-library/react";

const mockSupabase = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(() => Promise.resolve({ data: null, error: null })),
  channel: vi.fn(() => {
    const ch = { on: vi.fn(() => ch), subscribe: vi.fn(() => ch) };
    return ch;
  }),
  removeChannel: vi.fn(),
  auth: {
    getSession: vi.fn(() => Promise.resolve({ data: { session: null } })),
    signOut: vi.fn(() => Promise.resolve({ error: null })),
    signInWithPassword: vi.fn(() => Promise.resolve({ data: null, error: { message: "nao usado" } })),
    onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
  },
}));

vi.mock("@/lib/supabase", () => ({ supabase: mockSupabase }));
vi.mock("@/lib/jarvas", () => ({ emitirEvento: vi.fn() }));
vi.mock("@/lib/jarvasEngine", () => ({ executarAnaliseJarvas: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logAction: vi.fn() }));
vi.mock("@/lib/observabilidade", () => ({
  reportarFalha: vi.fn(),
  reportarInconsistencia: vi.fn(),
  setTenantObservabilidade: vi.fn(),
}));
vi.mock("@/components/shared/IndicadorRede", () => ({ default: () => null }));
vi.mock("@/components/shared/PonteLocalBridge", () => ({ default: () => null }));
vi.mock("@/components/shared/ImpressaoLancamentosBridge", () => ({ default: () => null }));
vi.mock("@/lib/tenant", () => ({
  buscarBootstrapTenant: vi.fn(() => Promise.resolve({ data: null, error: null })),
  moduloHabilitado: () => true,
  addonHabilitado: () => false,
}));

import { AppProvider, useApp } from "./AppContext";
import { useSessao } from "./SessaoContext";
import { useOffline } from "./OfflineContext";
import { useConfig } from "./ConfigContext";
import { useCatalogo } from "./CatalogoContext";
import { useComandas } from "./ComandasContext";

beforeEach(() => {
  mockSupabase.from.mockImplementation(() => {
    const builder = {};
    for (const m of ["select", "eq", "neq", "order", "limit", "in", "single", "maybeSingle", "gte", "lte", "not", "or"]) {
      builder[m] = vi.fn(() => builder);
    }
    builder.then = (ok, falha) => Promise.resolve({ data: [], error: null }).then(ok, falha);
    const api = {};
    for (const m of ["select", "insert", "update", "delete", "upsert"]) api[m] = vi.fn(() => builder);
    return api;
  });
});

describe("redesenho do contexto (tarefa 2.1)", () => {
  it.fails("tela que só lê o usuário logado não redesenha quando a taxa de serviço muda", async () => {
    const app = { current: null };
    let rendersDoLeitor = 0;

    function Sonda() {
      app.current = useApp();
      return null;
    }
    // Só lê `currentUser`. Na tarefa 2.8, troca `useApp()` por `useSessao()`.
    function LeitorDoUsuario() {
      const { currentUser } = useApp();
      rendersDoLeitor += 1;
      return currentUser ? currentUser.name : null;
    }

    render(<AppProvider><Sonda /><LeitorDoUsuario /></AppProvider>);
    await act(async () => {});

    const antes = rendersDoLeitor;
    await act(async () => { await app.current.setTaxaServico(true); });

    expect(app.current.taxaServico).toBe(true);
    expect(rendersDoLeitor).toBe(antes);
  });

  // Tarefas 2.2 em diante: cada fatia, lida pelo próprio gancho, não é
  // redesenhada por mudança de outro assunto, e as ações dela têm identidade
  // fixa entre renders. Uma linha por fatia; a 2.4 em diante acrescenta a sua.
  const FATIAS = [
    {
      nome: "sessão", gancho: useSessao, campo: "currentUser",
      acoes: ["login", "logout", "addUser", "updateUser", "removeUser", "salvarPermissoesCargo", "moduloHabilitado", "addonHabilitado"],
      mudarOutroAssunto: (app) => app.setTaxaServico(true),
    },
    {
      nome: "offline", gancho: useOffline, campo: "pendenciasOffline",
      acoes: ["enfileirarOffline", "recarregarDadosDoEstabelecimento"],
      mudarOutroAssunto: (app) => app.setTaxaServico(true),
    },
    {
      nome: "configuração", gancho: useConfig, campo: "taxaServico",
      acoes: ["setMeiosPagamento", "setMetodosCustom", "setMetodosTef", "setTaxaServico",
        "setPonteEndereco", "setPonteLocalAtiva", "setDiasAlertaValidade", "setLimiteSangria"],
      // Comanda marcada como lançada: assunto das comandas, não da configuração.
      mudarOutroAssunto: (app) => app.addLancada("comanda-teste"),
    },
    {
      nome: "catálogo", gancho: useCatalogo, campo: "products",
      acoes: ["addProduct", "updateProduct", "removeProduct", "recarregarProdutos", "updateEstoque",
        "baixarEstoque", "entradaEstoque", "baixarEstoqueSubproduto", "setMinimoEstoque",
        "recarregarEstoque", "setCategoriaGrupo"],
      mudarOutroAssunto: (app) => app.setTaxaServico(true),
    },
    {
      nome: "comandas", gancho: useComandas, campo: "pending",
      acoes: ["addPending", "removePending", "updatePending", "adquirirTrava", "liberarTrava", "renovarTrava", "addLancada"],
      mudarOutroAssunto: (app) => app.setTaxaServico(true),
    },
  ];

  describe.each(FATIAS)("fatia $nome", ({ gancho, campo, acoes, mudarOutroAssunto }) => {
    it("tela que lê pelo gancho não redesenha quando outro assunto muda", async () => {
      const app = { current: null };
      let renders = 0;
      let rendersDaSonda = 0;
      function Sonda() {
        app.current = useApp();
        rendersDaSonda += 1;
        return null;
      }
      function Leitor() {
        const fatia = gancho();
        renders += 1;
        return String(fatia[campo] ?? "");
      }

      render(<AppProvider><Sonda /><Leitor /></AppProvider>);
      await act(async () => {});
      const antes = renders;
      const sondaAntes = rendersDaSonda;
      await act(async () => { await mudarOutroAssunto(app.current); });

      // A mudança aconteceu de verdade: quem lê pela fachada foi redesenhado.
      expect(rendersDaSonda).toBeGreaterThan(sondaAntes);
      expect(renders).toBe(antes);
    });

    it("as ações têm a mesma identidade entre renders", async () => {
      const app = { current: null };
      const valores = [];
      function Sonda() {
        app.current = useApp();
        valores.push(gancho());
        return null;
      }

      render(<AppProvider><Sonda /></AppProvider>);
      await act(async () => {});
      await act(async () => { await mudarOutroAssunto(app.current); });

      expect(valores.length).toBeGreaterThan(1);
      for (const acao of acoes) {
        expect(typeof valores.at(-1)[acao], acao).toBe("function");
        expect(valores.at(-1)[acao], acao).toBe(valores[0][acao]);
        // A fachada entrega a mesma ação, para nenhuma tela mudar de comportamento.
        expect(typeof app.current[acao], acao).toBe("function");
      }
    });
  });

  it.each([["useSessao", useSessao], ["useOffline", useOffline], ["useConfig", useConfig], ["useCatalogo", useCatalogo], ["useComandas", useComandas]])("%s fora do AppProvider avisa em vez de devolver vazio", (nome, gancho) => {
    function SemProvider() {
      gancho();
      return null;
    }
    const erroConsole = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<SemProvider />)).toThrow(new RegExp(`${nome} deve ser usado dentro de <AppProvider>`));
    erroConsole.mockRestore();
  });
});
