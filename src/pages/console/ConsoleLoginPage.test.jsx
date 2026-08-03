// @vitest-environment jsdom
//
// CONSOLE-UX 31 — a porta de entrada da plataforma entra na rede de testes.
//
// Esta tela é a barreira de UX do Console (a fronteira REAL é o banco: RLS +
// SECURITY DEFINER). O que estes testes protegem é o contrato da porta: só o
// papel `plataforma` atravessa para /console; qualquer outra sessão é
// deslogada com aviso e NÃO navega; e o envio valida usuário/senha antes de
// gastar uma chamada de `login`.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Routes, Route } from "react-router-dom";

vi.mock("@/context/AppContext", async () => {
  const { mockUseApp } = await import("@/test/mockApp");
  return { useApp: mockUseApp, AppProvider: ({ children }) => children };
});

import { setAppMock, renderWithProviders } from "@/test/mockApp";
import ConsoleLoginPage from "./ConsoleLoginPage";

// `setAppMock` não dispara re-render, então os cenários de sessão já ativa
// (plataforma / recusa) montam com o estado final. As rotas-marcador tornam a
// navegação observável (mesmo padrão de LoginPage.test.jsx).
const abrir = async () => {
  await act(async () => {
    renderWithProviders(
      <Routes>
        <Route path="/entrar"  element={<ConsoleLoginPage />} />
        <Route path="/console" element={<div>PAINEL DA PLATAFORMA</div>} />
      </Routes>,
      { route: "/entrar" }
    );
  });
};

const entrar = () => screen.getByRole("button", { name: /Entrar|Verificando|Conectando/i });

describe("ConsoleLoginPage — quem atravessa a porta", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it("sessão de plataforma já ativa navega para /console, sem erro", async () => {
    setAppMock({ currentUser: { id: 1, role: "plataforma", permissions: {} } });
    await abrir();

    expect(screen.getByText("PAINEL DA PLATAFORMA")).toBeInTheDocument();
    expect(screen.queryByText(/não tem acesso ao Console/i)).not.toBeInTheDocument();
  });

  it("sessão de outro papel é deslogada e avisada, sem navegar", async () => {
    const appMock = setAppMock({ currentUser: { id: 2, role: "admin", permissions: {} } });
    await abrir();

    expect(appMock.logout).toHaveBeenCalled();
    expect(screen.getByText(/Esta conta não tem acesso ao Console/i)).toBeInTheDocument();
    expect(screen.queryByText("PAINEL DA PLATAFORMA")).not.toBeInTheDocument();
  });

  it("usuário ou senha vazios: avisa e não chama login", async () => {
    const login = vi.fn(() => Promise.resolve({ ok: true }));
    setAppMock({ currentUser: null, login });
    await abrir();

    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText("Digite seu usuário"), "dono");
    await user.click(entrar());

    expect(screen.getByText(/Preencha usuário e senha/i)).toBeInTheDocument();
    expect(login).not.toHaveBeenCalled();
  });

  it("envio válido chama login com o que foi digitado", async () => {
    const login = vi.fn(() => Promise.resolve({ ok: true }));
    setAppMock({ currentUser: null, login });
    await abrir();

    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText("Digite seu usuário"), "dono");
    await user.type(screen.getByPlaceholderText("Digite sua senha"), "SenhaCerta#123");
    await user.click(entrar());

    expect(login).toHaveBeenCalledWith("dono", "SenhaCerta#123");
  });

  it("erro devolvido por login aparece na tela", async () => {
    const login = vi.fn(() => Promise.resolve({ error: "Usuário ou senha incorretos." }));
    setAppMock({ currentUser: null, login });
    await abrir();

    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText("Digite seu usuário"), "dono");
    await user.type(screen.getByPlaceholderText("Digite sua senha"), "errada");
    await user.click(entrar());

    expect(await screen.findByText(/Usuário ou senha incorretos/i)).toBeInTheDocument();
  });
});
