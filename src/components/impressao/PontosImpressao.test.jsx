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
vi.mock("@/lib/impressao/impressao", () => ({
  buscarConfigImpressao: (...args) => buscarConfigImpressaoMock(...args),
  salvarConfigImpressao: (...args) => salvarConfigImpressaoMock(...args),
}));

// A Ponte não roda no ambiente de teste — o módulo precisa existir para o
// import resolver, e cada teste decide o que ela responde.
let respostaImpressoras = { data: { impressoras: [] }, error: null };
const listarImpressorasPonteMock = vi.fn(() => Promise.resolve(respostaImpressoras));
vi.mock("@/lib/impressao/ponte", () => ({
  listarImpressorasPonte: (...args) => listarImpressorasPonteMock(...args),
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
  respostaImpressoras = { data: { impressoras: [] }, error: null };
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

describe("PontosImpressao — Ponte fechada x Ponte com erro", () => {
  it("Ponte fechada mostra a orientação de abrir o KoraPonte.exe", async () => {
    // `erroAmigavelPonte` (src/lib/impressao/ponte.js) já traduziu o erro de rede para
    // português e marcou `foraDoAr`. A tela tem que ramificar por essa marca:
    // farejar "failed to fetch" na mensagem nunca acertaria.
    const fora = new Error("A Ponte KORA não está rodando neste computador. Abra a Ponte e tente imprimir de novo.");
    fora.foraDoAr = true;
    respostaImpressoras = { data: null, error: fora };
    await renderizarPronto();

    await userEvent.click(screen.getByRole("button", { name: /procurar impressoras/i }));

    await waitFor(() => expect(screen.getByText(/Dê dois cliques no KoraPonte\.exe/i)).toBeInTheDocument());
  });

  it("erro da própria Ponte mostra a mensagem dela, não a orientação", async () => {
    respostaImpressoras = { data: null, error: new Error("spooler do Windows não respondeu") };
    await renderizarPronto();

    await userEvent.click(screen.getByRole("button", { name: /procurar impressoras/i }));

    await waitFor(() => expect(screen.getByText(/spooler do Windows não respondeu/i)).toBeInTheDocument());
    expect(screen.queryByText(/Dê dois cliques no KoraPonte\.exe/i)).not.toBeInTheDocument();
  });
});
