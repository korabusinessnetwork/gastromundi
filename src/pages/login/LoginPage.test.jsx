// @vitest-environment jsdom
//
// Run 5, leva 8 — os pips de tentativa na tela de login.
//
// Os pips são a única pista visível de que o bloqueio está chegando. Eles
// contavam em cima de um `attempts + 1` do próprio componente, o que dava duas
// mentiras:
//   1. Recarregar a página zerava os pips, embora o contador do navegador
//      seguisse em 4 — a tela dizia "nenhuma tentativa" e o clique seguinte
//      respondia "conta bloqueada".
//   2. Erro que não é de senha (link do estabelecimento torto, leva 7) acendia
//      um pip por uma tentativa que nunca foi gasta.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, act, screen } from "@testing-library/react";
import { Routes, Route } from "react-router-dom";

vi.mock("@/context/AppContext", async () => {
  const { mockUseApp } = await import("@/test/mockApp");
  return { useApp: mockUseApp, AppProvider: ({ children }) => children };
});
// A tela busca a marca do estabelecimento na abertura; sem tenant nenhum o
// login normal aparece, que é o cenário aqui.
vi.mock("@/lib/tenant/tenant", () => ({
  buscarBrandingPorSlug: vi.fn(() => Promise.resolve({ data: null, error: null })),
}));

// `consoleAtivo` lê VITE_ROOT_DOMAIN/VITE_CONSOLE_SUBDOMAIN, que não existem no
// ambiente de teste — sem dublê só daria para exercitar o caminho "console no
// mesmo host". A lógica de host em si tem teste próprio em consoleHost.test.js.
const { mockConsoleAtivo } = vi.hoisted(() => ({ mockConsoleAtivo: vi.fn(() => false) }));
vi.mock("@/lib/host/consoleHost", () => ({
  consoleAtivo: mockConsoleAtivo,
  ehConsoleHost: vi.fn(() => false),
}));

import { setAppMock, renderWithProviders } from "@/test/mockApp";
import { buscarBrandingPorSlug } from "@/lib/tenant/tenant";
import { lerBrandingCache } from "@/lib/tenant/brandingCache";
import { setAttempts, clearAttempts, MAX_ATTEMPTS } from "@/utils/session";
import LoginPage from "./LoginPage";

const pipsAcesos = () => document.querySelectorAll(".login-page__attempt-pip--usada").length;
const pipsTotais = () => document.querySelectorAll(".login-page__attempt-pip").length;

const abrir = async () => {
  await act(async () => { renderWithProviders(<LoginPage />, { route: "/login" }); });
};

const digitar = (rotulo, valor) => {
  fireEvent.change(screen.getByPlaceholderText(rotulo), { target: { value: valor } });
};

describe("LoginPage — pips de tentativa (Run 5, leva 8)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    setAppMock({ currentUser: null, login: vi.fn(() => Promise.resolve({ ok: true })) });
  });

  it("navegador limpo não mostra pip nenhum", async () => {
    await abrir();
    digitar("Digite seu usuário", "maria");
    expect(pipsTotais()).toBe(0);
  });

  it("mostra as tentativas que o navegador já contou para o usuário digitado", async () => {
    setAttempts("maria", { count: 4, lockedUntil: null });
    await abrir();

    // Só de digitar o usuário — sem clicar em Entrar — a tela já conta a
    // verdade. Antes ela abria em zero e o próximo clique bloqueava a conta.
    digitar("Digite seu usuário", "maria");

    expect(pipsTotais()).toBe(MAX_ATTEMPTS);
    expect(pipsAcesos()).toBe(4);
  });

  it("cada usuário tem os seus pips — trocar o nome troca a contagem", async () => {
    setAttempts("maria", { count: 3, lockedUntil: null });
    await abrir();

    digitar("Digite seu usuário", "maria");
    expect(pipsAcesos()).toBe(3);

    digitar("Digite seu usuário", "joao");
    expect(pipsTotais()).toBe(0);

    digitar("Digite seu usuário", "maria");
    expect(pipsAcesos()).toBe(3);
  });

  it("senha errada acende o pip que o contador do navegador registrou", async () => {
    // É o que o AppContext faz no caminho de senha errada.
    const login = vi.fn(async (u) => {
      setAttempts(u, { count: 1, lockedUntil: null });
      return { error: "Usuário ou senha incorretos. 4 tentativa(s) restante(s)." };
    });
    setAppMock({ currentUser: null, login });
    await abrir();

    digitar("Digite seu usuário", "maria");
    digitar("Digite sua senha", "chute");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Entrar" })); });

    expect(pipsAcesos()).toBe(1);
    expect(screen.getByText(/senha incorretos/i)).toBeInTheDocument();
  });

  it("erro que não gasta tentativa não acende pip — o link torto não é chute de senha", async () => {
    // Guarda da leva 7: endereço de acesso inválido nem chega à senha, então
    // não consome tentativa e não pode acender pip.
    const login = vi.fn(async () => ({ error: "Endereço de acesso inválido. Confira o link do estabelecimento." }));
    setAppMock({ currentUser: null, login });
    await abrir();

    digitar("Digite seu usuário", "maria");
    digitar("Digite sua senha", "SenhaCerta#123");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Entrar" })); });

    expect(screen.getByText(/Endereço de acesso inválido/i)).toBeInTheDocument();
    expect(pipsTotais()).toBe(0);
  });

  it("conta bloqueada abre com os cinco pips acesos, antes de qualquer clique", async () => {
    setAttempts("maria", { count: MAX_ATTEMPTS, lockedUntil: Date.now() + 60_000 });
    await abrir();

    digitar("Digite seu usuário", "maria");

    // O bloqueio veio de outra aba. A tela avisa que o limite acabou em vez de
    // deixar a pessoa clicar em Entrar para descobrir.
    expect(pipsAcesos()).toBe(MAX_ATTEMPTS);
  });

  it("contador limpo pelo login certo deixa a tela sem pip na volta", async () => {
    setAttempts("maria", { count: 4, lockedUntil: null });
    clearAttempts("maria"); // é o que o login bem-sucedido faz
    await abrir();

    digitar("Digite seu usuário", "maria");
    expect(pipsTotais()).toBe(0);
  });
});

// Run 5, leva 11 — a marca na porta de entrada.
//
// A tela de login é a primeira coisa que um estabelecimento novo vê, e ela
// abre ANTES de existir tenant carregado. Enquanto o fallback do sistema era
// a marca de um cliente específico, todo mundo lia o nome de outra empresa na
// própria porta de entrada (decisão 017).
describe("LoginPage — marca da porta de entrada (Run 5, leva 11)", () => {
  const titulo    = () => document.querySelector(".login-page__brand-title").textContent;
  const subtitulo = () => document.querySelector(".login-page__brand-subtitle").textContent;

  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    mockConsoleAtivo.mockReturnValue(false);
    // `mockImplementation` explícito em vez de reset: o dublê é criado com
    // implementação na fábrica do vi.mock, e reset a descartaria.
    buscarBrandingPorSlug.mockImplementation(() => Promise.resolve({ data: null, error: null }));
    setAppMock({ currentUser: null, login: vi.fn(() => Promise.resolve({ ok: true })) });
  });

  it("sem estabelecimento resolvido, mostra a marca da PLATAFORMA — nunca a de outro cliente", async () => {
    await abrir();

    expect(titulo()).toBe("KORA");
    expect(titulo()).not.toContain("GASTROMUNDI");
    // A tela neutra já É a plataforma; assinar de novo leria "KORA / by Kora".
    expect(subtitulo()).toBe("Acesso ao Sistema");
  });

  it("com estabelecimento resolvido, a porta de entrada é dele, assinada pela plataforma", async () => {
    // Sem `nome_exibicao` no tema: cai no nome CADASTRADO, não no fallback.
    buscarBrandingPorSlug.mockImplementation(() =>
      Promise.resolve({ data: { nome: "Casa Coffee", tema: {} }, error: null }));

    await abrir();

    expect(titulo()).toBe("CASA COFFEE");
    expect(subtitulo()).toBe("by Kora · Acesso ao Sistema");
  });

  it("estabelecimento ainda sem nome não é assinado nem gravado no cache como se fosse", async () => {
    // Contrapeso do teste acima: "não sei o nome dele" não pode virar "o nome
    // dele é Kora" — senão a próxima abertura desta origem pinta a plataforma
    // como se fosse a marca do estabelecimento.
    buscarBrandingPorSlug.mockImplementation(() =>
      Promise.resolve({ data: { nome: null, tema: {} }, error: null }));

    await abrir();

    expect(titulo()).toBe("KORA");
    expect(subtitulo()).toBe("Acesso ao Sistema");
    expect(lerBrandingCache()?.nome ?? null).toBe(null);
  });
});

// Run 5, leva 11 — a conta da plataforma batendo na porta do estabelecimento.
//
// Com o Console em endereço próprio, essa sessão é recusada. A recusa era
// SILENCIOSA: quem digitava a senha certa via o botão voltar de "Verificando..."
// para "Entrar" e mais nada — sem erro, sem tentativa gasta, sem pista.
describe("LoginPage — conta da plataforma na porta do estabelecimento (Run 5, leva 11)", () => {
  const PLATAFORMA = { id: 99, name: "Dono da Plataforma", username: "dono", role: "plataforma", permissions: {} };

  // `setAppMock` não dispara re-render, então não dá para simular a TRANSIÇÃO
  // de null para logado: monta já com a sessão de plataforma em pé, que é o
  // estado em que o efeito roda. As rotas-marcador tornam a navegação
  // observável (mesmo padrão de ConsoleRoute.test.jsx).
  const abrirComRotas = async () => {
    const appMock = setAppMock({ currentUser: PLATAFORMA, login: vi.fn(() => Promise.resolve({ ok: true })) });
    await act(async () => {
      renderWithProviders(
        <Routes>
          <Route path="/login"   element={<LoginPage />} />
          <Route path="/console" element={<div>PAINEL DA PLATAFORMA</div>} />
          <Route path="/app"     element={<div>SISTEMA DO ESTABELECIMENTO</div>} />
        </Routes>,
        { route: "/login" },
      );
    });
    return appMock;
  };

  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    buscarBrandingPorSlug.mockImplementation(() => Promise.resolve({ data: null, error: null }));
  });

  it("com Console em endereço próprio, a recusa aparece na tela e a sessão é encerrada", async () => {
    mockConsoleAtivo.mockReturnValue(true);

    const appMock = await abrirComRotas();

    expect(screen.getByText(/conta é da plataforma/i)).toBeInTheDocument();
    expect(appMock.logout).toHaveBeenCalled();
    expect(screen.queryByText("PAINEL DA PLATAFORMA")).not.toBeInTheDocument();
  });

  it("sem Console em endereço próprio, a conta da plataforma continua entrando pelo Console", async () => {
    // Contrapeso: a recusa é do cenário "Console tem endereço próprio", não da
    // conta de plataforma em si. Sem este teste, bloquear sempre passaria.
    mockConsoleAtivo.mockReturnValue(false);

    const appMock = await abrirComRotas();

    expect(screen.getByText("PAINEL DA PLATAFORMA")).toBeInTheDocument();
    expect(appMock.logout).not.toHaveBeenCalled();
  });
});
