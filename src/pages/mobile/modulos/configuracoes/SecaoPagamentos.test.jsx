// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/context/AppContext", async () => {
  const { mockUseApp } = await import("@/test/mockApp");
  return { useApp: mockUseApp, AppProvider: ({ children }) => children };
});

import { setAppMock } from "@/test/mockApp";
import SecaoPagamentos from "./SecaoPagamentos";

const CUSTOM = { id: "custom_vale_1", label: "Vale-refeição" };

let setMeiosPagamento, setMetodosCustom, setMetodosTef;

function montar({ falha = {}, metodosCustom = [] } = {}) {
  setMeiosPagamento = vi.fn(() => Promise.resolve({ error: falha.meios ?? null }));
  setMetodosCustom = vi.fn(() => Promise.resolve({ error: falha.custom ?? null }));
  setMetodosTef = vi.fn(() => Promise.resolve({ error: falha.tef ?? null }));
  setAppMock({
    meiosPagamento: ["dinheiro", "credito", ...metodosCustom.map(m => m.id)],
    metodosCustom,
    metodosTef: ["credito"],
    setMeiosPagamento,
    setMetodosCustom,
    setMetodosTef,
  });
  render(<SecaoPagamentos />);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SecaoPagamentos — salvar", () => {
  it("gravação recusada avisa e não diz que salvou", async () => {
    const user = userEvent.setup();
    montar({ falha: { meios: { message: "rls" } } });

    await user.click(screen.getByRole("button", { name: /ativar débito/i }));
    await user.click(screen.getByRole("button", { name: /salvar configurações/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/não deu para salvar os meios de pagamento/i);
    expect(screen.queryByText(/configurações salvas/i)).not.toBeInTheDocument();
  });

  it("gravação boa confirma o salvamento", async () => {
    const user = userEvent.setup();
    montar();

    await user.click(screen.getByRole("button", { name: /ativar débito/i }));
    await user.click(screen.getByRole("button", { name: /salvar configurações/i }));

    expect(await screen.findByText(/configurações salvas/i)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("SecaoPagamentos — maquininha (TEF)", () => {
  it("gravação recusada avisa", async () => {
    const user = userEvent.setup();
    montar({ falha: { tef: { message: "rls" } } });

    await user.click(screen.getByRole("button", { name: /^débito$/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/não deu para mudar quais métodos passam pela maquininha/i);
  });

  it("gravação boa não avisa nada", async () => {
    const user = userEvent.setup();
    montar();

    await user.click(screen.getByRole("button", { name: /^débito$/i }));

    await waitFor(() => expect(setMetodosTef).toHaveBeenCalledWith(["credito", "debito"]));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("SecaoPagamentos — criar forma personalizada", () => {
  async function preencher(user) {
    await user.click(screen.getByRole("button", { name: /adicionar/i }));
    await user.type(screen.getByLabelText(/nome da nova forma de pagamento/i), "Vale-refeição");
    await user.click(screen.getByRole("button", { name: /confirmar/i }));
  }

  it("falha ao criar avisa e mantém o formulário aberto", async () => {
    const user = userEvent.setup();
    montar({ falha: { custom: { message: "rls" } } });
    await preencher(user);

    expect(await screen.findByRole("alert")).toHaveTextContent(/não deu para criar a forma de pagamento/i);
    // O formulário fica aberto com o nome digitado: fechá-lo daria a
    // entender que a forma foi criada.
    expect(screen.getByLabelText(/nome da nova forma de pagamento/i)).toHaveValue("Vale-refeição");
    expect(setMeiosPagamento).not.toHaveBeenCalled();
  });

  it("criada mas não ativada avisa exatamente isso, para não duplicarem o método", async () => {
    const user = userEvent.setup();
    montar({ falha: { meios: { message: "rls" } } });
    await preencher(user);

    expect(await screen.findByRole("alert")).toHaveTextContent(/"vale-refeição" foi criada, mas não deu para ativá-la/i);
  });

  it("criação boa fecha o formulário", async () => {
    const user = userEvent.setup();
    montar();
    await preencher(user);

    await waitFor(() => expect(screen.queryByLabelText(/nome da nova forma de pagamento/i)).not.toBeInTheDocument());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("SecaoPagamentos — remover forma personalizada", () => {
  async function confirmarRemocao(user) {
    await user.click(screen.getByRole("button", { name: /remover vale-refeição/i }));
    await user.click(await screen.findByRole("button", { name: /^remover$/i }));
  }

  it("falha ao remover avisa e a forma continua na lista", async () => {
    const user = userEvent.setup();
    montar({ metodosCustom: [CUSTOM], falha: { custom: { message: "rls" } } });
    await confirmarRemocao(user);

    expect(await screen.findByRole("alert")).toHaveTextContent(/não deu para remover a forma de pagamento/i);
    expect(screen.getByText("Vale-refeição")).toBeInTheDocument();
    expect(setMeiosPagamento).not.toHaveBeenCalled();
  });

  it("removida mas sem atualizar os ativos avisa para salvar de novo", async () => {
    const user = userEvent.setup();
    montar({ metodosCustom: [CUSTOM], falha: { meios: { message: "rls" } } });
    await confirmarRemocao(user);

    expect(await screen.findByRole("alert")).toHaveTextContent(/não deu para atualizar a lista de ativos/i);
  });

  it("remoção boa fecha a confirmação", async () => {
    const user = userEvent.setup();
    montar({ metodosCustom: [CUSTOM] });
    await confirmarRemocao(user);

    await waitFor(() => expect(screen.queryByText(/remover "vale-refeição"\?/i)).not.toBeInTheDocument());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
