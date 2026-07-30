// @vitest-environment jsdom
//
// Run 5, leva 3 — a senha era VALIDADA crua e GRAVADA sanitizada.
//
// `sanitizeInput` remove < > " ' ` e apara as pontas. A tela media a força e
// conferia a confirmação na senha do campo, mas quem ia para o Supabase Auth
// era `sanitizeInput(senha, 100)`. Então:
//   • `Ab1<<<<` aparecia como "Forte", passava no mínimo e o Auth recebia
//     `Ab1` — três caracteres, abaixo do mínimo do próprio Auth;
//   • `<<<<<<` pontuava nível 2 ("Média") e o Auth recebia string VAZIA;
//   • em ambos os casos o insert em `users` já tinha ido, então sobrava um
//     funcionário cadastrado que nunca conseguia entrar no sistema.
// Agora sanitiza primeiro e valida o que vai ser gravado.
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

const { authMock } = vi.hoisted(() => ({
  authMock: {
    criarAuthUsuario: null,
    atualizarSenhaAuth: null,
    deletarAuthUsuario: null,
  },
}));
vi.mock("@/lib/adminAuth", () => {
  authMock.criarAuthUsuario = vi.fn(() => Promise.resolve({ error: null }));
  authMock.atualizarSenhaAuth = vi.fn(() => Promise.resolve({ error: null }));
  authMock.deletarAuthUsuario = vi.fn(() => Promise.resolve({ error: null }));
  return authMock;
});

vi.mock("@/lib/logger", () => ({ logAction: vi.fn() }));
vi.mock("@/lib/jarvas", () => ({ emitirEvento: vi.fn() }));

import { setAppMock, renderWithProviders } from "@/test/mockApp";
import { UsuariosTab } from "./ConfiguracoesView";

const sz = { pad: 16, padSm: 8, fontSm: 12, fontBase: 14, fontLg: 18 };

let addUser;

/** Abre o formulário de novo usuário com nome e login já preenchidos. */
async function abrirNovo(user) {
  await user.click(screen.getByText("+ Novo Usuário"));
  await user.type(screen.getByPlaceholderText("Ex: João Silva"), "Maria Souza");
  await user.type(screen.getByPlaceholderText("Ex: joao"), "maria");
}

/** Digita a mesma coisa nos dois campos de senha do formulário. */
async function digitarSenha(user, senha, confirmacao = senha) {
  const campos = screen.getAllByPlaceholderText("••••••••");
  await user.type(campos[0], senha);
  await user.type(campos[1], confirmacao);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSupabase.current?.reset?.();
  addUser = vi.fn(() => Promise.resolve({ error: null }));
  setAppMock({
    users: [],
    currentUser: { id: 1, name: "Dona", username: "dona", role: "admin" },
    addUser,
  });
});

describe("UsuariosTab — senha validada é a senha gravada (Run 5, leva 3)", () => {
  it("senha que sanitiza para vazio é recusada e nenhum usuário é criado", async () => {
    const user = userEvent.setup();
    renderWithProviders(<UsuariosTab sz={sz} />);
    await abrirNovo(user);
    await digitarSenha(user, "<<<<<<");

    await user.click(screen.getByText("Criar Usuário"));

    await waitFor(() => expect(screen.getByText(/Informe uma senha inicial/)).toBeInTheDocument());
    expect(addUser).not.toHaveBeenCalled();
    expect(authMock.criarAuthUsuario).not.toHaveBeenCalled();
  });

  it("senha que sanitiza para 3 caracteres é recusada como fraca, mesmo parecendo forte crua", async () => {
    const user = userEvent.setup();
    renderWithProviders(<UsuariosTab sz={sz} />);
    await abrirNovo(user);
    await digitarSenha(user, "Ab1<<<<");

    await user.click(screen.getByText("Criar Usuário"));

    await waitFor(() => expect(screen.getByText(/Senha muito fraca/)).toBeInTheDocument());
    expect(addUser).not.toHaveBeenCalled();
    expect(authMock.criarAuthUsuario).not.toHaveBeenCalled();
  });

  it("senha só de espaços é recusada — o trim do sanitize a esvazia", async () => {
    const user = userEvent.setup();
    renderWithProviders(<UsuariosTab sz={sz} />);
    await abrirNovo(user);
    await digitarSenha(user, "        ");

    await user.click(screen.getByText("Criar Usuário"));

    await waitFor(() => expect(screen.getByText(/Informe uma senha inicial/)).toBeInTheDocument());
    expect(addUser).not.toHaveBeenCalled();
  });

  it("a força mostrada na tela é a da senha que vai ser gravada", async () => {
    const user = userEvent.setup();
    renderWithProviders(<UsuariosTab sz={sz} />);
    await abrirNovo(user);
    const campos = screen.getAllByPlaceholderText("••••••••");
    await user.type(campos[0], "Ab1<<<<");

    // `Ab1<<<<` cru pontuaria "Forte"; o que será gravado é `Ab1`.
    expect(screen.getByText("Muito fraca")).toBeInTheDocument();
    expect(screen.queryByText("Forte")).not.toBeInTheDocument();
    expect(screen.getByText(/não entram na senha/)).toBeInTheDocument();
  });

  it("senha boa passa e o Auth recebe exatamente a senha sanitizada", async () => {
    const user = userEvent.setup();
    renderWithProviders(<UsuariosTab sz={sz} />);
    await abrirNovo(user);
    await digitarSenha(user, "Abc12345");

    await user.click(screen.getByText("Criar Usuário"));

    await waitFor(() => expect(authMock.criarAuthUsuario).toHaveBeenCalled());
    expect(authMock.criarAuthUsuario).toHaveBeenCalledWith(
      expect.objectContaining({ username: "maria", password: "Abc12345" }),
    );
    expect(addUser).toHaveBeenCalledWith(expect.objectContaining({ username: "maria", active: true }));
  });

  it("duas senhas que só diferem nos caracteres removidos são a MESMA senha — não é divergência", async () => {
    const user = userEvent.setup();
    renderWithProviders(<UsuariosTab sz={sz} />);
    await abrirNovo(user);
    await digitarSenha(user, 'Abc12345"', "Abc12345");

    await user.click(screen.getByText("Criar Usuário"));

    await waitFor(() => expect(authMock.criarAuthUsuario).toHaveBeenCalled());
    expect(authMock.criarAuthUsuario).toHaveBeenCalledWith(
      expect.objectContaining({ password: "Abc12345" }),
    );
    expect(screen.queryByText(/não coincidem/)).not.toBeInTheDocument();
  });

  it("senhas de verdade diferentes continuam sendo recusadas", async () => {
    const user = userEvent.setup();
    renderWithProviders(<UsuariosTab sz={sz} />);
    await abrirNovo(user);
    await digitarSenha(user, "Abc12345", "Abc99999");

    await user.click(screen.getByText("Criar Usuário"));

    await waitFor(() => expect(screen.getByText(/não coincidem/)).toBeInTheDocument());
    expect(addUser).not.toHaveBeenCalled();
  });
});

describe("UsuariosTab — troca de senha na edição (Run 5, leva 3)", () => {
  const funcionario = {
    id: 9, name: "Maria Souza", username: "maria", role: "caixa",
    auth_id: "auth-9", active: true, permissoesOverride: null,
  };

  async function abrirEdicao(user) {
    setAppMock({
      users: [funcionario],
      currentUser: { id: 1, name: "Dona", username: "dona", role: "admin" },
      addUser,
      updateUser: vi.fn(() => Promise.resolve({ error: null })),
    });
    renderWithProviders(<UsuariosTab sz={sz} />);
    await user.click(screen.getByRole("button", { name: "Editar" }));
    await screen.findByText("Editar Usuário");
  }

  it("nova senha que sanitiza para 3 caracteres não é enviada ao Auth", async () => {
    const user = userEvent.setup();
    await abrirEdicao(user);
    await digitarSenha(user, "Ab1<<<<");

    await user.click(screen.getByText("Salvar Alterações"));

    await waitFor(() => expect(screen.getByText(/Senha muito fraca/)).toBeInTheDocument());
    expect(authMock.atualizarSenhaAuth).not.toHaveBeenCalled();
  });

  it("confirmação que só difere nos caracteres removidos não é tratada como divergência", async () => {
    const user = userEvent.setup();
    await abrirEdicao(user);
    await digitarSenha(user, 'Abc12345"', "Abc12345");

    await user.click(screen.getByText("Salvar Alterações"));

    await waitFor(() => expect(authMock.atualizarSenhaAuth).toHaveBeenCalledWith("auth-9", "Abc12345"));
    expect(screen.queryByText(/não coincidem/)).not.toBeInTheDocument();
  });

  it("nova senha válida chega ao Auth já sanitizada", async () => {
    const user = userEvent.setup();
    await abrirEdicao(user);
    await digitarSenha(user, 'Abc12345"');

    await user.click(screen.getByText("Salvar Alterações"));

    await waitFor(() => expect(authMock.atualizarSenhaAuth).toHaveBeenCalled());
    expect(authMock.atualizarSenhaAuth).toHaveBeenCalledWith("auth-9", "Abc12345");
  });
});

/**
 * Exclusão de funcionário (Run 5, leva 9).
 *
 * `confirmarDelete` jogava os DOIS retornos no lixo e não tinha `try/finally`.
 * Três estragos que apareciam no dia a dia:
 *
 *   1. Gerente clicando em excluir: a RLS de `users` só deixa admin remover, e o
 *      botão aparece para gerente também. O `removeUser` voltava
 *      `no_rows_deleted`, ninguém olhava, o modal fechava — e o funcionário
 *      continuava na lista, como se a exclusão não tivesse sido clicada.
 *   2. Admin excluindo com a Edge Function fora do ar: a linha de `users` já
 *      tinha ido, o acesso no Auth ficava órfão, e ninguém era avisado. Esse
 *      mesmo funcionário não pode ser recadastrado depois — o Auth recusa o
 *      login já existente — e o motivo ficava invisível.
 *   3. Qualquer rejeição no meio travava o botão em "Excluindo..." para sempre,
 *      com a linha já apagada.
 */
describe("UsuariosTab — exclusão de funcionário (Run 5, leva 9)", () => {
  const FUNCIONARIO = {
    id: 9, name: "Maria Souza", username: "maria", role: "caixa",
    auth_id: "auth-9", active: true, permissoesOverride: null,
  };

  /** Monta a lista com um funcionário e abre o modal de exclusão dele. */
  async function abrirExclusao(user, { removeUser, funcionario = FUNCIONARIO }) {
    setAppMock({
      users: [funcionario],
      currentUser: { id: 1, name: "Dona", username: "dona", role: "admin" },
      addUser,
      removeUser,
    });
    renderWithProviders(<UsuariosTab sz={sz} />);
    await user.click(screen.getByRole("button", { name: "Excluir" }));
    await screen.findByText("Excluir usuário?");
  }

  const confirmar = (user) => user.click(screen.getByText("Sim, excluir"));
  const aviso = () => screen.getByRole("alert");

  it("exclusão barrada pela permissão avisa na tela e não toca no acesso do Auth", async () => {
    const user = userEvent.setup();
    const removeUser = vi.fn(() => Promise.resolve({
      error: {
        code: "no_rows_deleted",
        message: "Nenhuma linha removida — sem permissão (apenas admin remove usuários) ou usuário inexistente.",
      },
    }));
    await abrirExclusao(user, { removeUser });

    await confirmar(user);

    await waitFor(() => expect(aviso()).toHaveTextContent(
      "Não foi possível excluir: só um administrador pode remover usuários.",
    ));
    // A linha NÃO saiu: apagar o acesso no Auth aqui deixaria o funcionário na
    // lista sem conseguir mais entrar no sistema.
    expect(authMock.deletarAuthUsuario).not.toHaveBeenCalled();
    // O modal fecha e o funcionário continua visível na lista — o aviso é a
    // única coisa que explica por quê.
    expect(screen.queryByText("Excluir usuário?")).not.toBeInTheDocument();
    expect(screen.getByText("Maria Souza")).toBeInTheDocument();
  });

  it("acesso que não cai junto com a linha vira aviso escrito, não silêncio", async () => {
    const user = userEvent.setup();
    authMock.deletarAuthUsuario.mockResolvedValueOnce({ error: "Acesso restrito a administradores." });
    await abrirExclusao(user, { removeUser: vi.fn(() => Promise.resolve({ error: null })) });

    await confirmar(user);

    await waitFor(() => expect(aviso()).toHaveTextContent("Maria Souza saiu da lista"));
    expect(aviso()).toHaveTextContent("Acesso restrito a administradores.");
    expect(aviso()).toHaveTextContent(/acesso antigo precisa ser removido primeiro/);
  });

  it("falha inesperada avisa e solta o botão em vez de travar em 'Excluindo...'", async () => {
    const user = userEvent.setup();
    const removeUser = vi.fn(() => Promise.reject(new Error("rede caiu")));
    await abrirExclusao(user, { removeUser });

    await confirmar(user);

    await waitFor(() => expect(aviso()).toHaveTextContent(
      "Não foi possível concluir a exclusão: rede caiu.",
    ));
    // Sem o try/finally o botão ficava preso em "Excluindo..." para sempre.
    expect(screen.queryByText("Excluindo...")).not.toBeInTheDocument();
    expect(screen.queryByText("Excluir usuário?")).not.toBeInTheDocument();
  });

  it("exclusão que dá certo apaga o acesso no Auth e não mostra aviso nenhum", async () => {
    const user = userEvent.setup();
    const removeUser = vi.fn(() => Promise.resolve({ error: null }));
    await abrirExclusao(user, { removeUser });

    await confirmar(user);

    await waitFor(() => expect(authMock.deletarAuthUsuario).toHaveBeenCalledWith("auth-9"));
    expect(removeUser).toHaveBeenCalledWith(9);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText("Excluir usuário?")).not.toBeInTheDocument();
  });

  it("funcionário antigo sem acesso no Auth é excluído sem chamar a Edge Function", async () => {
    const user = userEvent.setup();
    const removeUser = vi.fn(() => Promise.resolve({ error: null }));
    await abrirExclusao(user, {
      removeUser,
      funcionario: { ...FUNCIONARIO, auth_id: null },
    });

    await confirmar(user);

    await waitFor(() => expect(removeUser).toHaveBeenCalledWith(9));
    expect(authMock.deletarAuthUsuario).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
