// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/context/AppContext", async () => {
  const { mockUseApp } = await import("@/test/mockApp");
  return { useApp: mockUseApp, AppProvider: ({ children }) => children };
});

let configNoBanco = {};
const buscarConfigImpressaoMock = vi.fn(() => Promise.resolve({ data: configNoBanco, error: null }));
const salvarConfigImpressaoMock = vi.fn(() => Promise.resolve({ error: null }));
vi.mock("@/lib/impressao", () => ({
  buscarConfigImpressao: (...args) => buscarConfigImpressaoMock(...args),
  salvarConfigImpressao: (...args) => salvarConfigImpressaoMock(...args),
}));

// A Ponte não roda no ambiente de teste — o botão "Procurar impressoras"
// não é o assunto aqui, mas o módulo precisa existir para o import resolver.
vi.mock("@/lib/ponte", () => ({
  listarImpressorasPonte: vi.fn(() => Promise.resolve({ data: [], error: null })),
}));

import { setAppMock } from "@/test/mockApp";
import PontosImpressao from "./PontosImpressao";

const DOIS_PONTOS_SALVOS = [
  { id: "p1", nome: "Cozinha", impressora: { tipo: "windows", nome: "EPSON" }, padrao: true },
  { id: "p2", nome: "Bar", impressora: { tipo: "windows", nome: "BEMATECH" }, padrao: false },
];

beforeEach(() => {
  vi.clearAllMocks();
  configNoBanco = {};
  setAppMock({
    products: [
      { id: 1, name: "Picanha", category: "Pratos" },
      { id: 2, name: "Chopp", category: "Bebidas" },
    ],
  });
});

async function renderizarPronto() {
  render(<PontosImpressao />);
  await waitFor(() => expect(screen.queryByText("Carregando…")).not.toBeInTheDocument());
}

describe("PontosImpressao — aviso de ponto ainda não salvo", () => {
  it("não avisa quando todos os pontos exibidos já estão salvos", async () => {
    configNoBanco = { pontosImpressao: DOIS_PONTOS_SALVOS };
    await renderizarPronto();

    // A seção de roteamento está de pé (2 pontos), mas nada está pendente.
    expect(screen.getByText(/Escolha o ponto de cada categoria/i)).toBeInTheDocument();
    expect(screen.queryByText(/ainda não foi salvo/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/ainda não foram salvos/i)).not.toBeInTheDocument();
  });

  it("não dá alarme falso com o ponto padrão sintetizado (instalação que nunca salvou pontos)", async () => {
    // Sem `pontosImpressao` no banco, a tela sintetiza "Cozinha" (p1). Ele
    // resolve de volta na leitura mesmo sem estar gravado, então não é
    // pendência. Um segundo ponto é preciso só pra seção de roteamento
    // aparecer — e esse sim tem que ser o único apontado.
    configNoBanco = { perfilImpressora: { impressora: { tipo: "windows", nome: "EPSON" } } };
    await renderizarPronto();

    await userEvent.click(screen.getByRole("button", { name: /adicionar ponto/i }));

    expect(screen.getByText(/O ponto "Ponto 2" ainda não foi salvo/i)).toBeInTheDocument();
    expect(screen.queryByText(/Cozinha.*ainda não foi salvo/i)).not.toBeInTheDocument();
  });

  it("avisa, com o nome do ponto, ao rotear para um ponto recém-criado e não salvo", async () => {
    configNoBanco = { pontosImpressao: DOIS_PONTOS_SALVOS };
    await renderizarPronto();

    await userEvent.click(screen.getByRole("button", { name: /adicionar ponto/i }));

    expect(screen.getByText(/O ponto "Ponto 3" ainda não foi salvo/i)).toBeInTheDocument();
    expect(screen.getByText(/sai no ponto padrão/i)).toBeInTheDocument();
  });

  it("some com o aviso depois que a seção de pontos é salva", async () => {
    configNoBanco = { pontosImpressao: DOIS_PONTOS_SALVOS };
    await renderizarPronto();

    await userEvent.click(screen.getByRole("button", { name: /adicionar ponto/i }));
    expect(screen.getByText(/ainda não foi salvo/i)).toBeInTheDocument();

    // O primeiro "Salvar" da tela é o da seção de pontos (a de cima).
    const [salvarPontos] = screen.getAllByRole("button", { name: /^salvar$/i });
    await userEvent.click(salvarPontos);

    await waitFor(() => expect(screen.queryByText(/ainda não foi salvo/i)).not.toBeInTheDocument());
    expect(salvarConfigImpressaoMock).toHaveBeenCalledTimes(1);
    expect(salvarConfigImpressaoMock.mock.calls[0][0].pontosImpressao).toHaveLength(3);
  });

  it("lista os nomes no plural quando há mais de um ponto pendente", async () => {
    configNoBanco = { pontosImpressao: DOIS_PONTOS_SALVOS };
    await renderizarPronto();

    const adicionar = screen.getByRole("button", { name: /adicionar ponto/i });
    await userEvent.click(adicionar);
    await userEvent.click(adicionar);

    expect(screen.getByText(/Estes pontos ainda não foram salvos: Ponto 3, Ponto 4/i)).toBeInTheDocument();
  });
});
