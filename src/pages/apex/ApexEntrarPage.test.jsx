// @vitest-environment jsdom
//
// Porta de entrada do site da plataforma.
//
// O defeito que esta tela conserta: o "Entrar" do apex mandava para
// `/login`, que no domínio nu resolve o estabelecimento de FALLBACK — a
// porta da plataforma abria o login de UM cliente, com a marca dele, e
// quem é cliente de outro nem conseguia entrar (a credencial dele vive
// no namespace do endereço dele). O que precisa estar garantido aqui:
// que a tela leva a pessoa ao endereço DELA, que endereço inexistente
// recebe resposta em vez de um login errado, e que quem ainda não é
// cliente encontra a porta de cadastro sem procurar.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

const { mockBranding } = vi.hoisted(() => ({ mockBranding: vi.fn() }));

vi.mock("@/lib/tenant", async (importOriginal) => ({
  ...(await importOriginal()),
  buscarBrandingPorSlug: mockBranding,
}));

vi.mock("@/lib/supabase", async () => {
  const { createMockSupabase } = await import("@/test/mockSupabase");
  return { supabase: createMockSupabase() };
});

import ApexEntrarPage from "./ApexEntrarPage";

const renderizar = () =>
  render(
    <MemoryRouter>
      <ApexEntrarPage />
    </MemoryRouter>
  );

const campo = () => screen.getByLabelText(/endereço do seu estabelecimento/i);
const entrar = () => screen.getByRole("button", { name: /entrar|procurando/i });

let irPara;

beforeEach(() => {
  mockBranding.mockReset();
  mockBranding.mockResolvedValue({ data: { nome: "Bar do Zé", tema: {} }, error: null });
  irPara = vi.fn();
  // `window.location.assign` não existe de verdade no jsdom; trocamos o
  // objeto inteiro para poder afirmar PARA ONDE a tela mandou a pessoa.
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { assign: irPara, origin: "https://kora.codes", hostname: "kora.codes" },
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("ApexEntrarPage", () => {
  it("leva a pessoa ao login do endereço que ela digitou", async () => {
    const user = userEvent.setup();
    renderizar();

    await user.type(campo(), "bardoze");
    await user.click(entrar());

    await waitFor(() => expect(irPara).toHaveBeenCalled());
    expect(mockBranding).toHaveBeenCalledWith("bardoze");
    expect(irPara.mock.calls[0][0]).toMatch(/\/login$/);
  });

  it("normaliza o que foi digitado como o banco faria (acento, espaço, maiúscula)", async () => {
    const user = userEvent.setup();
    renderizar();

    await user.type(campo(), "Bar do Zé");
    await user.click(entrar());

    await waitFor(() => expect(mockBranding).toHaveBeenCalledWith("bardoze"));
  });

  it("endereço que não existe recebe resposta — e ninguém é jogado num login errado", async () => {
    mockBranding.mockResolvedValue({ data: null, error: null });
    const user = userEvent.setup();
    renderizar();

    await user.type(campo(), "naoexiste");
    await user.click(entrar());

    expect(await screen.findByRole("alert")).toHaveTextContent(/não encontramos/i);
    expect(irPara).not.toHaveBeenCalled();
  });

  it("campo vazio avisa antes de gastar uma ida ao banco", async () => {
    const user = userEvent.setup();
    renderizar();

    await user.click(entrar());

    expect(await screen.findByRole("alert")).toHaveTextContent(/digite o endereço/i);
    expect(mockBranding).not.toHaveBeenCalled();
  });

  it("falha de rede não prende ninguém aqui: segue para o endereço", async () => {
    // Fail-open de propósito — o login do estabelecimento pode estar no ar;
    // quem sabe dizer se o endereço existe é a tela de lá.
    mockBranding.mockResolvedValue({ data: null, error: { message: "network" } });
    const user = userEvent.setup();
    renderizar();

    await user.type(campo(), "bardoze");
    await user.click(entrar());

    await waitFor(() => expect(irPara).toHaveBeenCalled());
  });

  it("quem ainda não é cliente encontra a porta de cadastro na mesma tela", () => {
    renderizar();
    const cadastro = screen.getByRole("link", { name: /criar minha conta/i });
    expect(cadastro).toHaveAttribute("href", "/criar-conta");
  });

  it("não mostra marca de estabelecimento nenhum — é a porta da plataforma", () => {
    renderizar();
    // A tela é da KORA; nome de cliente aqui seria o defeito que ela conserta.
    expect(document.body.textContent).not.toMatch(/gastromundi/i);
    expect(screen.getByText("KORA")).toBeInTheDocument();
  });
});
