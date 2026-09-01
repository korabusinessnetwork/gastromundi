// @vitest-environment jsdom
//
// Cadastro de conta do site institucional.
//
// É a porta comercial da plataforma: quem chega aqui quer um KORA. O que
// precisa estar garantido: que o pedido REALMENTE sai da tela em direção
// ao banco (o formulário de agendamento passou meses jogando lead fora),
// que o endereço que a pessoa vê é o endereço que vai ser gravado, que
// endereço ocupado devolve o próximo livre a um clique, e que a
// confirmação não promete um acesso que ainda não existe — ninguém
// entrou em lugar nenhum aqui, o pedido entrou numa fila.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

const { mockRegistrar } = vi.hoisted(() => ({ mockRegistrar: vi.fn() }));

// Só a ida ao banco é dublada: `validarSolicitacao` continua real, porque é
// ela que decide o que a pessoa vê embaixo de cada campo.
vi.mock("@/lib/solicitacoes", async (importOriginal) => ({
  ...(await importOriginal()),
  registrarSolicitacaoConta: mockRegistrar,
}));

vi.mock("@/lib/supabase", async () => {
  const { createMockSupabase } = await import("@/test/mockSupabase");
  return { supabase: createMockSupabase() };
});

import ApexCriarContaPage from "./ApexCriarContaPage";

const renderizar = (rota = "/criar-conta") =>
  render(
    <MemoryRouter initialEntries={[rota]}>
      <ApexCriarContaPage />
    </MemoryRouter>
  );

const enviar = () => screen.getByRole("button", { name: /criar minha conta|enviando/i });

async function preencher(user, { estabelecimento = "Bar do Zé" } = {}) {
  await user.type(screen.getByLabelText(/seu nome/i), "Maria Silva");
  await user.type(screen.getByLabelText(/whatsapp/i), "11988887777");
  await user.type(screen.getByLabelText(/e-mail/i), "maria@bardoze.com.br");
  await user.type(screen.getByLabelText(/nome do estabelecimento/i), estabelecimento);
}

beforeEach(() => {
  mockRegistrar.mockReset();
  mockRegistrar.mockResolvedValue({ ok: true, erro: null, endereco: "bardoze" });
});

describe("ApexCriarContaPage", () => {
  it("o endereço se escreve sozinho a partir do nome do negócio", async () => {
    const user = userEvent.setup();
    renderizar();

    await user.type(screen.getByLabelText(/nome do estabelecimento/i), "Bar do Zé");

    expect(screen.getByLabelText(/endereço do seu kora/i)).toHaveValue("bardoze");
  });

  it("endereço editado à mão para de seguir o nome do negócio", async () => {
    const user = userEvent.setup();
    renderizar();

    await user.type(screen.getByLabelText(/nome do estabelecimento/i), "Bar do Zé");
    await user.clear(screen.getByLabelText(/endereço do seu kora/i));
    await user.type(screen.getByLabelText(/endereço do seu kora/i), "zebar");
    await user.type(screen.getByLabelText(/nome do estabelecimento/i), " e Cia");

    expect(screen.getByLabelText(/endereço do seu kora/i)).toHaveValue("zebar");
  });

  it("manda o pedido com o que a pessoa preencheu e o plano escolhido", async () => {
    const user = userEvent.setup();
    renderizar();

    await preencher(user);
    await user.click(screen.getByRole("radio", { name: /restaurante/i }));
    await user.click(enviar());

    await waitFor(() => expect(mockRegistrar).toHaveBeenCalled());
    const enviado = mockRegistrar.mock.calls[0][0];
    expect(enviado).toMatchObject({
      nome: "Maria Silva",
      email: "maria@bardoze.com.br",
      estabelecimento: "Bar do Zé",
      endereco: "bardoze",
    });
    expect(enviado.plano).toMatchObject({ codigo: "restaurante", nome: "Restaurante" });
    expect(enviado.plano.total).toBeGreaterThan(0);
  });

  it("aceita quem ainda não sabe o plano — decidir depois é uma resposta", async () => {
    const user = userEvent.setup();
    renderizar();

    await preencher(user);
    await user.click(enviar());

    await waitFor(() => expect(mockRegistrar).toHaveBeenCalled());
    expect(mockRegistrar.mock.calls[0][0].plano).toBeNull();
  });

  it("plano pedido pela URL já vem marcado", () => {
    renderizar("/criar-conta?plano=balcao");
    expect(screen.getByRole("radio", { name: /balcão/i })).toBeChecked();
  });

  it("campo errado avisa embaixo dele e não gasta ida ao banco", async () => {
    const user = userEvent.setup();
    renderizar();

    await user.type(screen.getByLabelText(/seu nome/i), "M");
    await user.click(enviar());

    expect(await screen.findByText(/diga como podemos te chamar/i)).toBeInTheDocument();
    expect(mockRegistrar).not.toHaveBeenCalled();
  });

  it("endereço ocupado volta colado no campo, com o próximo livre a um clique", async () => {
    mockRegistrar.mockResolvedValue({
      ok: false,
      campo: "endereco",
      sugestao: "bardoze2",
      erro: "Este endereço já está em uso. Que tal bardoze2?",
    });
    const user = userEvent.setup();
    renderizar();

    await preencher(user);
    await user.click(enviar());

    const sugestao = await screen.findByRole("button", { name: /usar bardoze2/i });
    await user.click(sugestao);

    expect(screen.getByLabelText(/endereço do seu kora/i)).toHaveValue("bardoze2");
  });

  it("falha de envio aparece uma vez, com tudo que foi digitado intacto", async () => {
    mockRegistrar.mockResolvedValue({ ok: false, erro: "Não conseguimos enviar agora." });
    const user = userEvent.setup();
    renderizar();

    await preencher(user);
    await user.click(enviar());

    expect(await screen.findByRole("alert")).toHaveTextContent(/não conseguimos enviar/i);
    expect(screen.getByLabelText(/seu nome/i)).toHaveValue("Maria Silva");
  });

  it("a confirmação diz o que REALMENTE acontece — não que a pessoa já entrou", async () => {
    const user = userEvent.setup();
    renderizar();

    await preencher(user);
    await user.click(enviar());

    expect(await screen.findByText(/pedido recebido, maria/i)).toBeInTheDocument();
    // Nada de "sua conta está pronta" ou "acesse agora": ainda não está.
    expect(document.body.textContent).toMatch(/whatsapp/i);
    expect(document.body.textContent).not.toMatch(/sua conta está pronta/i);
  });

  it("não pede senha em lugar nenhum — a credencial nasce no provisionamento", () => {
    renderizar();
    expect(document.querySelector('input[type="password"]')).toBeNull();
    expect(document.body.textContent).not.toMatch(/escolha uma senha/i);
  });
});
