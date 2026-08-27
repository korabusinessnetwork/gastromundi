// @vitest-environment jsdom
//
// Construtor de plano do site institucional — a única tela do apex que
// mostra dinheiro e a única que captura cliente.
//
// O que precisa estar garantido aqui: que a soma que o visitante vê é a
// soma certa (é o número que ele leva para a demonstração), que o lead
// realmente sai da tela em direção ao banco (durante meses ele só era
// exibido e jogado fora), que o que ele montou viaja junto com o contato,
// e que a confirmação NÃO diz que ele comprou alguma coisa — ninguém
// comprou nada aqui, só pediu uma demonstração.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { mockRegistrar } = vi.hoisted(() => ({ mockRegistrar: vi.fn() }));

// Só a ida ao banco é dublada: `validarLead` continua real, porque é ela
// que decide o que o visitante vê embaixo de cada campo.
vi.mock("@/lib/leads", async (importOriginal) => ({
  ...(await importOriginal()),
  registrarLeadApex: mockRegistrar,
}));

vi.mock("@/lib/supabase", async () => {
  const { createMockSupabase } = await import("@/test/mockSupabase");
  return { supabase: createMockSupabase() };
});

import ApexPlanos from "./ApexPlanos";

const totalNaTela = () =>
  document.querySelector(".apex-construtor__resumo-total-valor").textContent;

// "Agendar demonstração" é o nome do botão do resumo E do botão de envio
// dentro da aba — com a aba aberta os dois existem, então o envio precisa
// ser buscado DENTRO do diálogo.
const abrirAba = (user) =>
  user.click(screen.getByRole("button", { name: "Agendar demonstração" }));

// O envio termina numa promessa (a ida ao banco). Sem deixá-la assentar
// dentro de act, a asserção roda enquanto a tela ainda mostra o
// formulário — o comportamento está certo, quem chega cedo é o teste.
// Vale para todo teste desta tela; junto com o `delay: null` do
// userEvent (que tira os timers dele do caminho), o resultado é estável.
const enviarFormulario = async (user) => {
  await user.click(
    within(screen.getByRole("dialog")).getByRole("button", {
      name: "Agendar demonstração",
    })
  );
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });
};

async function preencherContato(user) {
  await user.type(screen.getByLabelText("Nome"), "Maria Silva");
  await user.type(screen.getByLabelText("WhatsApp"), "11988887777");
  await user.type(screen.getByLabelText("E-mail"), "maria@bardamaria.com.br");
}

describe("ApexPlanos — a conta", () => {
  beforeEach(() => {
    mockRegistrar.mockReset();
    mockRegistrar.mockResolvedValue({ ok: true, erro: null });
  });

  it("começa no Essencial, sem nada ligado", () => {
    render(<ApexPlanos />);
    expect(totalNaTela()).toContain("149");
    expect(screen.getByText(/toque nos módulos ao lado/i)).toBeTruthy();
  });

  it("soma o módulo ligado e devolve o valor ao desligar", async () => {
    const user = userEvent.setup({ delay: null });
    render(<ApexPlanos />);

    await user.click(screen.getByRole("button", { name: /Financeiro/ }));
    expect(totalNaTela()).toContain("209"); // 149 + 60

    await user.click(screen.getByRole("button", { name: /Financeiro/ }));
    expect(totalNaTela()).toContain("149");
  });

  it("plano pronto preenche a seleção inteira de uma vez", async () => {
    const user = userEvent.setup({ delay: null });
    render(<ApexPlanos />);

    await user.click(screen.getByRole("button", { name: /Restaurante/ }));
    expect(totalNaTela()).toContain("467"); // 149 + 318

    const botao = screen.getByRole("button", { name: /Restaurante/ });
    expect(botao.getAttribute("aria-pressed")).toBe("true");
  });

  it("'Selecionar todos' liga tudo e o segundo clique limpa", async () => {
    const user = userEvent.setup({ delay: null });
    render(<ApexPlanos />);

    await user.click(screen.getByRole("button", { name: "Selecionar todos" }));
    expect(totalNaTela()).toContain("1.457"); // topo de linha, com JARVAS e fiscal

    await user.click(screen.getByRole("button", { name: "Limpar seleção" }));
    expect(totalNaTela()).toContain("149");
  });
});

describe("ApexPlanos — o lead", () => {
  beforeEach(() => {
    mockRegistrar.mockReset();
    mockRegistrar.mockResolvedValue({ ok: true, erro: null });
  });

  it("grava o contato COM o plano que a pessoa montou", async () => {
    const user = userEvent.setup({ delay: null });
    render(<ApexPlanos />);

    await user.click(screen.getByRole("button", { name: /Cozinha \(KDS\)/ }));
    await user.click(screen.getByRole("button", { name: /^TEF/ }));
    await abrirAba(user);
    await preencherContato(user);
    await enviarFormulario(user);

    expect(mockRegistrar).toHaveBeenCalledTimes(1);
    const enviado = mockRegistrar.mock.calls[0][0];
    expect(enviado.nome).toBe("Maria Silva");
    expect(enviado.total).toBe(249); // 149 + 40 + 60
    expect(enviado.itens).toEqual(["Cozinha (KDS)", "TEF"]);
  });

  it("confirma o contato recebido, sem dizer que houve compra", async () => {
    const user = userEvent.setup({ delay: null });
    render(<ApexPlanos />);

    await abrirAba(user);
    await preencherContato(user);
    await enviarFormulario(user);

    expect(screen.getByText(/contato recebido/i)).toBeTruthy();
    expect(screen.queryByText(/adquirir|parabéns pela compra|bem-vindo ao kora/i)).toBeNull();
  });

  it("não chama o banco enquanto os campos estiverem errados", async () => {
    const user = userEvent.setup({ delay: null });
    render(<ApexPlanos />);

    await abrirAba(user);
    await user.type(screen.getByLabelText("Nome"), "M");
    await enviarFormulario(user);

    expect(mockRegistrar).not.toHaveBeenCalled();
    expect(screen.getByText(/diga como podemos te chamar/i)).toBeTruthy();
  });

  it("falha de envio aparece na tela e deixa tentar de novo sem redigitar", async () => {
    const user = userEvent.setup({ delay: null });
    mockRegistrar.mockResolvedValueOnce({ ok: false, erro: "Não conseguimos enviar agora." });
    render(<ApexPlanos />);

    await abrirAba(user);
    await preencherContato(user);
    await enviarFormulario(user);

    expect(screen.getByRole("alert")).toHaveTextContent(/não conseguimos enviar/i);
    // O que foi digitado continua lá.
    expect(screen.getByLabelText("Nome").value).toBe("Maria Silva");

    mockRegistrar.mockResolvedValueOnce({ ok: true, erro: null });
    await enviarFormulario(user);
    expect(screen.getByText(/contato recebido/i)).toBeTruthy();
  });
});
