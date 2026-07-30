// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Run 5 leva 9 — o portão de senha de administrador.
 *
 * Este arquivo é o gate de toda ação destrutiva do sistema (cancelar venda,
 * cancelar item, liberar entrada de estoque, excluir item da comanda, ver saldo
 * do caixa) e não tinha nenhum teste. Dois estragos concretos:
 *
 *   1. `verificarSenhaAdmin` devolvia só `true`/`false`. Como TODA tela traduzia
 *      `false` em "Senha incorreta", o gerente que caía no bloqueio da RPC
 *      (5 tentativas por minuto, migration 20260802) digitava a senha CERTA e
 *      era recusado sem nenhuma pista de que bastava esperar um minuto. Sem
 *      internet, idem. Agora o contrato é `{ ok, erro }`: `erro` só existe
 *      quando não deu para comparar, e é ele que vai para a tela.
 *
 *   2. `chamarEdge` podia REJEITAR em três caminhos — `getSession()` devolvendo
 *      `{ data: null }`, `fetch` sem rede e `res.json()` num corpo que não é
 *      JSON (204 do delete, 502 do gateway em HTML). Todos os chamadores fazem
 *      `const { error } = await ...`, então a rejeição subia e travava o botão
 *      de excluir funcionário em "Excluindo..." para sempre.
 *
 * A regra que não muda: falha FECHADO. Qualquer imprevisto é `ok: false`.
 */

const { mockRpc, mockGetSession } = vi.hoisted(() => ({
  mockRpc: vi.fn(),
  mockGetSession: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: { rpc: mockRpc, auth: { getSession: mockGetSession } },
}));

import {
  verificarSenhaAdmin,
  verificarSenhaUsuario,
  criarAuthUsuario,
  atualizarSenhaAuth,
  deletarAuthUsuario,
} from "./adminAuth";

const MSG_INDISPONIVEL = "Não foi possível validar a senha agora. Tente de novo em instantes.";
const MSG_SEM_REDE     = "Sem internet: a senha de administrador só pode ser validada online.";
const MSG_RATE_LIMIT   = "Muitas tentativas de senha. Aguarde um minuto e tente novamente.";

/**
 * jsdom nasce online; quem testa o caminho sem rede troca isso na mão.
 *
 * `onLine` mora no protótipo do Navigator, não na instância: sobrescrever cria
 * uma propriedade PRÓPRIA, e o jeito de desfazer é apagá-la (o `afterEach`
 * abaixo). Guardar o descritor da instância não serve — ele vem `undefined`, e
 * o "offline" vazava para os testes seguintes.
 */
function porOffline() {
  Object.defineProperty(window.navigator, "onLine", { configurable: true, get: () => false });
}

let fetchMock;

beforeEach(() => {
  mockRpc.mockReset();
  mockGetSession.mockReset();
  mockGetSession.mockResolvedValue({ data: { session: { access_token: "TOKEN123" } } });
  fetchMock = vi.fn();
  globalThis.fetch = fetchMock;
});

afterEach(() => {
  delete window.navigator.onLine;
  expect(window.navigator.onLine).toBe(true);
});

/** Resposta de `fetch` com corpo JSON. */
const resposta = (status, corpo) => ({
  ok: status >= 200 && status < 300,
  status,
  json: () => Promise.resolve(corpo),
});

/** Resposta cujo corpo NÃO é JSON: 204 vazio, ou página de erro em HTML. */
const respostaSemJson = (status) => ({
  ok: status >= 200 && status < 300,
  status,
  json: () => Promise.reject(new SyntaxError("Unexpected token < in JSON at position 0")),
});

describe("verificarSenhaAdmin", () => {
  it("senha certa libera, sem mensagem de erro", async () => {
    mockRpc.mockResolvedValue({ data: true, error: null });

    expect(await verificarSenhaAdmin("1234")).toEqual({ ok: true, erro: null });
    expect(mockRpc).toHaveBeenCalledWith("verificar_senha_admin", { p_password: "1234" });
  });

  it("senha errada é recusa sem erro — a tela mantém o 'Senha incorreta' dela", async () => {
    mockRpc.mockResolvedValue({ data: false, error: null });

    // `erro: null` é o que faz cada tela cair no texto próprio dela pelo `||`.
    // Se aqui viesse texto, toda senha errada passaria a exibir a mensagem
    // genérica em vez de "Senha incorreta. Apenas admin ou gerente pode...".
    expect(await verificarSenhaAdmin("errada")).toEqual({ ok: false, erro: null });
  });

  it("RPC devolvendo NULL recusa (falha fechado)", async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });

    expect(await verificarSenhaAdmin("1234")).toEqual({ ok: false, erro: null });
  });

  it("bloqueio por tentativas chega à tela com o texto do aviso", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: MSG_RATE_LIMIT } });

    const r = await verificarSenhaAdmin("1234");
    expect(r.ok).toBe(false);
    // Este é o defeito da leva: antes isso virava "Senha incorreta" e o gerente
    // ficava repetindo a senha certa sem entender por que era recusada.
    expect(r.erro).toBe(MSG_RATE_LIMIT);
  });

  it("erro cru do Postgres não vaza tabela, função nem código para a tela", async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: {
        code: "42501",
        message: 'permission denied for table senha_admin_tentativas',
        details: "function public.verificar_senha_admin(text,text)",
      },
    });

    const r = await verificarSenhaAdmin("1234");
    expect(r.ok).toBe(false);
    expect(r.erro).toBe(MSG_INDISPONIVEL);
    expect(r.erro).not.toMatch(/senha_admin_tentativas|verificar_senha_admin|42501|permission/i);
  });

  it("sem internet diz que é falta de internet", async () => {
    porOffline();
    mockRpc.mockResolvedValue({ data: null, error: { message: "TypeError: Failed to fetch" } });

    expect(await verificarSenhaAdmin("1234")).toEqual({ ok: false, erro: MSG_SEM_REDE });
  });

  it("RPC que rejeita recusa em vez de estourar na tela", async () => {
    mockRpc.mockRejectedValue(new Error("socket hang up"));

    // Sem o try/catch isto seria uma exceção dentro do clique de confirmar:
    // o modal ficava travado e a ação nem negava nem passava.
    expect(await verificarSenhaAdmin("1234")).toEqual({ ok: false, erro: MSG_INDISPONIVEL });
  });
});

describe("verificarSenhaUsuario", () => {
  it("manda o usuário junto da senha", async () => {
    mockRpc.mockResolvedValue({ data: true, error: null });

    expect(await verificarSenhaUsuario("gerente1", "1234")).toEqual({ ok: true, erro: null });
    expect(mockRpc).toHaveBeenCalledWith("verificar_senha_admin", {
      p_password: "1234",
      p_username: "gerente1",
    });
  });

  it("senha errada é recusa sem erro", async () => {
    mockRpc.mockResolvedValue({ data: false, error: null });

    expect(await verificarSenhaUsuario("gerente1", "errada")).toEqual({ ok: false, erro: null });
  });

  it("bloqueio por tentativas também chega à tela aqui", async () => {
    // Este é o portão do relatório na Sidebar: é onde o gerente mais insiste.
    mockRpc.mockResolvedValue({ data: null, error: { message: MSG_RATE_LIMIT } });

    expect(await verificarSenhaUsuario("gerente1", "1234")).toEqual({
      ok: false,
      erro: MSG_RATE_LIMIT,
    });
  });

  it("RPC que rejeita recusa em vez de estourar", async () => {
    mockRpc.mockRejectedValue(new Error("socket hang up"));

    expect(await verificarSenhaUsuario("gerente1", "1234")).toEqual({
      ok: false,
      erro: MSG_INDISPONIVEL,
    });
  });
});

describe("gestão de usuários via Edge Function", () => {
  it("criar manda a ação, o corpo e o token da sessão", async () => {
    fetchMock.mockResolvedValue(resposta(200, { user: { id: "AUTH1" } }));

    const r = await criarAuthUsuario({
      username: "joao", password: "1234", name: "João", role: "garcom",
    });

    expect(r).toEqual({ data: { user: { id: "AUTH1" } } });
    const [url, opcoes] = fetchMock.mock.calls[0];
    // A URL vem de `import.meta.env` — o que importa é o caminho, não o host.
    expect(url).toMatch(/\/functions\/v1\/manage-user$/);
    expect(opcoes.method).toBe("POST");
    expect(opcoes.headers.Authorization).toBe("Bearer TOKEN123");
    expect(JSON.parse(opcoes.body)).toEqual({
      action: "create", username: "joao", password: "1234", name: "João", role: "garcom",
    });
  });

  it("trocar senha e excluir mandam a ação certa", async () => {
    fetchMock.mockResolvedValue(resposta(200, { ok: true }));

    await atualizarSenhaAuth("AUTH1", "novaSenha");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      action: "update_password", auth_id: "AUTH1", password: "novaSenha",
    });

    await deletarAuthUsuario("AUTH1");
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
      action: "delete", auth_id: "AUTH1",
    });
  });

  it("sessão ausente não estoura: chama sem token e deixa o servidor negar", async () => {
    // `getSession()` devolve `{ data: null }` quando não há sessão. O código
    // antigo desestruturava `data.session` direto e lançava TypeError aqui —
    // dentro do clique de excluir funcionário, com a linha já apagada.
    mockGetSession.mockResolvedValue({ data: null });
    fetchMock.mockResolvedValue(resposta(401, { error: "Não autenticado." }));

    expect(await deletarAuthUsuario("AUTH1")).toEqual({ error: "Não autenticado." });
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer ");
  });

  it("getSession que rejeita devolve erro em vez de rejeitar", async () => {
    mockGetSession.mockRejectedValue(new Error("storage indisponível"));

    expect(await deletarAuthUsuario("AUTH1")).toEqual({
      error: "Não foi possível falar com o servidor. Tente de novo.",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sem internet devolve erro dizendo que falta conexão", async () => {
    porOffline();
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    expect(await deletarAuthUsuario("AUTH1")).toEqual({
      error: "Sem internet: esta ação precisa de conexão.",
    });
  });

  it("fetch que falha com rede devolve erro de servidor", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    expect(await deletarAuthUsuario("AUTH1")).toEqual({
      error: "Não foi possível falar com o servidor. Tente de novo.",
    });
  });

  it("403 do servidor devolve o motivo que o servidor escreveu", async () => {
    // O gerente vê o botão de excluir, mas a Edge Function só aceita admin.
    fetchMock.mockResolvedValue(resposta(403, { error: "Acesso restrito a administradores." }));

    expect(await deletarAuthUsuario("AUTH1")).toEqual({
      error: "Acesso restrito a administradores.",
    });
  });

  it("erro sem corpo JSON (gateway em HTML) devolve o status, não uma exceção", async () => {
    fetchMock.mockResolvedValue(respostaSemJson(502));

    expect(await deletarAuthUsuario("AUTH1")).toEqual({
      error: "Erro na Edge Function (HTTP 502).",
    });
  });

  it("sucesso com corpo vazio é sucesso, não erro", async () => {
    // Um 204 sem corpo faz `res.json()` rejeitar. Antes isso virava exceção e o
    // botão travava DEPOIS de a exclusão ter dado certo no servidor.
    fetchMock.mockResolvedValue(respostaSemJson(204));

    const r = await deletarAuthUsuario("AUTH1");
    expect(r.error).toBeUndefined();
    expect(r).toEqual({ data: null });
  });
});
