// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { mockSupabase } = vi.hoisted(() => ({ mockSupabase: { current: null } }));

vi.mock("@/lib/supabase", async () => {
  const { createMockSupabase } = await import("@/test/mockSupabase");
  mockSupabase.current = createMockSupabase();
  return { supabase: mockSupabase.current };
});

import SubprodutosView from "./SubprodutosView";

const SZ = { pad: 16, padSm: 10 };

const BATATA = {
  id: 1,
  nome: "Batata média",
  categoria: "Acompanhamentos",
  preco: 8,
  unidade_medida: "Porção",
  controla_estoque: false,
  ativo: true,
  estoque_subprodutos: null,
};

function respostas({ subprodutos, erroSubprodutos, usos, erroUsos }) {
  mockSupabase.current.setTableHandler("subprodutos", ({ method }) =>
    method === "select"
      ? { data: erroSubprodutos ? null : subprodutos, error: erroSubprodutos ?? null }
      : undefined,
  );
  mockSupabase.current.setTableHandler("combo_subprodutos", ({ method }) =>
    method === "select"
      ? { data: erroUsos ? null : usos, error: erroUsos ?? null }
      : undefined,
  );
}

beforeEach(() => {
  mockSupabase.current.reset();
  respostas({ subprodutos: [BATATA], usos: [] });
});

describe("SubprodutosView — carga", () => {
  it("falha ao ler subprodutos avisa e não diz que a lista está vazia", async () => {
    respostas({ subprodutos: null, erroSubprodutos: { message: "permission denied" }, usos: [] });
    render(<SubprodutosView sz={SZ} />);

    expect(await screen.findByRole("alert")).toHaveTextContent(/não deu para carregar os subprodutos/i);
    expect(screen.queryByText(/nenhum subproduto cadastrado/i)).not.toBeInTheDocument();
  });

  it("falha ao ler o uso em combos avisa", async () => {
    respostas({ subprodutos: [BATATA], usos: null, erroUsos: { message: "permission denied" } });
    render(<SubprodutosView sz={SZ} />);

    expect(await screen.findByRole("alert")).toHaveTextContent(/não deu para verificar quais subprodutos estão em combos/i);
  });

  it("carga boa não mostra aviso nenhum", async () => {
    render(<SubprodutosView sz={SZ} />);

    expect(await screen.findByText("Batata média")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("SubprodutosView — ativar/desativar", () => {
  it("falha na gravação volta o status e avisa", async () => {
    const user = userEvent.setup();
    render(<SubprodutosView sz={SZ} />);
    await screen.findByText("Batata média");

    mockSupabase.current.setTableHandler("subprodutos", ({ method }) =>
      method === "update" ? { data: null, error: { message: "rls" } } : undefined,
    );
    mockSupabase.current.setTableResult("subprodutos", { data: [BATATA], error: null });

    await user.click(screen.getByRole("button", { name: "Ativo" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/não deu para desativar "batata média"/i);
    expect(screen.getByRole("button", { name: "Ativo" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Inativo" })).not.toBeInTheDocument();
  });

  it("gravação boa deixa Inativo e não avisa", async () => {
    const user = userEvent.setup();
    render(<SubprodutosView sz={SZ} />);
    await screen.findByText("Batata média");

    await user.click(screen.getByRole("button", { name: "Ativo" }));

    expect(await screen.findByRole("button", { name: "Inativo" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("SubprodutosView — exclusão", () => {
  it("sem saber o uso em combos, a exclusão fica bloqueada", async () => {
    const user = userEvent.setup();
    respostas({ subprodutos: [BATATA], usos: null, erroUsos: { message: "permission denied" } });
    render(<SubprodutosView sz={SZ} />);
    await screen.findByText("Batata média");

    await user.click(screen.getByTitle("Excluir subproduto"));

    expect(await screen.findByText("Não dá para excluir agora")).toBeInTheDocument();
    expect(screen.getByText(/não conseguimos verificar se este subproduto está em algum combo/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /sim, excluir/i })).not.toBeInTheDocument();
  });

  it("com o uso conhecido e zerado, a exclusão é liberada", async () => {
    const user = userEvent.setup();
    render(<SubprodutosView sz={SZ} />);
    await screen.findByText("Batata média");

    await user.click(screen.getByTitle("Excluir subproduto"));

    expect(await screen.findByText("Excluir subproduto?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sim, excluir/i })).toBeInTheDocument();
  });

  it("subproduto em combo continua bloqueado pelo motivo certo", async () => {
    const user = userEvent.setup();
    respostas({ subprodutos: [BATATA], usos: [{ subproduto_id: 1 }, { subproduto_id: 1 }] });
    render(<SubprodutosView sz={SZ} />);
    await screen.findByText("Batata média");

    await user.click(screen.getByTitle("Excluir subproduto"));

    expect(await screen.findByText("Não dá para excluir")).toBeInTheDocument();
    expect(screen.getByText(/2 combos/i)).toBeInTheDocument();
  });

  it("delete recusado pelo banco mantém o subproduto na lista", async () => {
    const user = userEvent.setup();
    render(<SubprodutosView sz={SZ} />);
    await screen.findByText("Batata média");

    await user.click(screen.getByTitle("Excluir subproduto"));
    await screen.findByText("Excluir subproduto?");

    mockSupabase.current.setTableHandler("subprodutos", ({ method }) =>
      method === "delete" ? { data: null, error: { message: "FK em uso" } } : undefined,
    );
    mockSupabase.current.setTableResult("subprodutos", { data: [BATATA], error: null });

    await user.click(screen.getByRole("button", { name: /sim, excluir/i }));

    await waitFor(() => expect(screen.getByText(/FK em uso/)).toBeInTheDocument());
    // A linha da tabela continua lá (o nome também aparece no diálogo, por isso
    // a busca é pela célula).
    expect(screen.getByRole("cell", { name: "Batata média" })).toBeInTheDocument();
  });
});
