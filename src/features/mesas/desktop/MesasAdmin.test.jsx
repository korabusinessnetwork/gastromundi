// @vitest-environment jsdom
//
// Refatoração 3: a tela de mesas virou gancho (`useMesasAdmin`) mais as janelas
// de criar e de excluir em arquivos próprios. Ela não tinha teste nenhum; estes
// prendem o caminho que o gerente usa: abrir o mapa, criar mesa, recusar número
// repetido e excluir com confirmação.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

const banco = vi.hoisted(() => ({ mesas: [] }));
vi.mock("@/features/mesas/dados/mesas", () => ({
  listarMesas: vi.fn(() => Promise.resolve({ data: banco.mesas.map(m => ({ ...m })), error: null })),
  criarMesa: vi.fn((linha) => { banco.mesas.push(linha); return Promise.resolve({ error: null }); }),
  alterarCapacidadeMesa: vi.fn(() => Promise.resolve({ error: null })),
  excluirMesa: vi.fn((numero) => {
    banco.mesas = banco.mesas.filter(m => m.numero !== numero);
    return Promise.resolve({ error: null });
  }),
  salvarLayoutMesas: vi.fn(() => Promise.resolve({ error: null })),
}));

import { criarMesa, excluirMesa } from "@/features/mesas/dados/mesas";
import MesasAdmin from "./MesasAdmin";

const SZ = { pad: 16, gap: 12, fontSm: 12, fontMd: 14, fontLg: 18, radius: 12 };

async function montar() {
  await act(async () => { render(<MesasAdmin sz={SZ} />); });
}

const clicar = async (alvo) => { await act(async () => { fireEvent.click(alvo); }); };

beforeEach(() => {
  vi.clearAllMocks();
  banco.mesas = [{ numero: "1", capacidade: 4, posicao_x: 1, posicao_y: 1 }];
});

describe("MesasAdmin", () => {
  it("mostra as mesas cadastradas", async () => {
    await montar();
    expect(screen.queryByText("Carregando…")).toBeNull();
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("cria uma mesa pela janela e ela aparece no mapa", async () => {
    await montar();
    await clicar(screen.getByRole("button", { name: /Nova Mesa/ }));
    fireEvent.change(screen.getByPlaceholderText("Ex: 1, 2, Varanda A…"), { target: { value: "Varanda A" } });
    await clicar(screen.getByRole("button", { name: "Criar mesa" }));

    expect(criarMesa).toHaveBeenCalledWith(expect.objectContaining({ numero: "Varanda A" }));
    expect(screen.getByText("Varanda A")).toBeInTheDocument();
  });

  it("número repetido não grava e a janela explica", async () => {
    await montar();
    await clicar(screen.getByRole("button", { name: /Nova Mesa/ }));
    fireEvent.change(screen.getByPlaceholderText("Ex: 1, 2, Varanda A…"), { target: { value: "1" } });
    await clicar(screen.getByRole("button", { name: "Criar mesa" }));

    expect(criarMesa).not.toHaveBeenCalled();
    expect(screen.getByText("Já existe uma mesa com este número/nome.")).toBeInTheDocument();
  });

  it("excluir pede confirmação e só então remove", async () => {
    await montar();
    // Os botões do cartão aparecem com o mouse em cima, como no uso real.
    fireEvent.mouseEnter(screen.getByText("1").closest("[draggable]"));
    await clicar(screen.getByTitle("Remover"));
    expect(excluirMesa).not.toHaveBeenCalled();

    await clicar(screen.getByRole("button", { name: "Sim, remover" }));
    expect(excluirMesa).toHaveBeenCalledWith("1");
    expect(screen.queryByTitle("Remover")).toBeNull();
  });
});
