// @vitest-environment jsdom
//
// JarvasPanel — o painel que o gestor abre justamente para saber se há algo
// errado. Dois furos que este arquivo trava:
//
//   1. A carga fazia `const { data } = await buscarInsights(...)` e gravava
//      `[]` ignorando o erro. Busca que falhou ficava IDÊNTICA a "tudo em
//      ordem por aqui": o gestor lia silêncio como boa notícia.
//   2. `mudarStatus` removia o cartão da tela e só depois chamava
//      `atualizarStatusInsight`, sem ler o retorno. Escrita recusada tirava o
//      aviso da frente do gestor e ele reaparecia na próxima carga, sem
//      explicação nenhuma.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent, act } from "@testing-library/react";

vi.mock("@/context/AppContext", async () => {
  const { mockUseApp } = await import("@/test/mockApp");
  return { useApp: mockUseApp, AppProvider: ({ children }) => children };
});

vi.mock("@/lib/supabase", async () => {
  const { createMockSupabase } = await import("@/test/mockSupabase");
  return { supabase: createMockSupabase() };
});

const { buscarInsights, atualizarStatusInsight, perguntarAoJarvas } = vi.hoisted(() => ({
  buscarInsights: vi.fn(),
  atualizarStatusInsight: vi.fn(),
  perguntarAoJarvas: vi.fn(),
}));

vi.mock("@/lib/jarvas", async (importOriginal) => ({
  ...(await importOriginal()),
  buscarInsights,
  atualizarStatusInsight,
}));

vi.mock("@/lib/jarvasAssistente", () => ({ perguntarAoJarvas }));

import { setAppMock, renderWithProviders } from "@/test/mockApp";
import JarvasPanel from "./JarvasPanel";

const INSIGHT = {
  id: "i1",
  tipo: "alerta",
  severidade: "danger",
  modulo: "Caixa",
  titulo: "Caixa aberto há 9 horas",
  descricao: "Nenhum fechamento registrado hoje.",
  acao: null,
  status: "novo",
  created_at: new Date().toISOString(),
};
const FALHA = { message: "TypeError: Failed to fetch" };

/** Abre o painel lateral pelo sino flutuante. */
async function abrirPainel() {
  await act(async () => {
    fireEvent.click(screen.getByTitle("Jarvas, insights e alertas"));
  });
}

async function montarEAbrir() {
  await act(async () => { renderWithProviders(<JarvasPanel />); });
  await abrirPainel();
}

beforeEach(() => {
  vi.clearAllMocks();
  setAppMock({ currentUser: { id: 1, name: "Gerente", username: "gerente", role: "gerente", permissions: {} } });
  atualizarStatusInsight.mockResolvedValue({ data: { id: "i1", status: "lido" }, error: null });
});

describe("JarvasPanel, falha ao buscar os insights", () => {
  it("busca que falhou não se passa por tudo em ordem", async () => {
    buscarInsights.mockResolvedValue({ data: null, error: FALHA });
    await montarEAbrir();

    expect(screen.getByText(/Não conseguimos buscar os avisos do Jarvas/)).toBeTruthy();
    expect(screen.queryByText(/Tudo em ordem por aqui/)).toBeNull();
  });

  it("busca vazia de verdade continua dizendo que está tudo em ordem", async () => {
    buscarInsights.mockResolvedValue({ data: [], error: null });
    await montarEAbrir();

    expect(screen.getByText(/Tudo em ordem por aqui/)).toBeTruthy();
    expect(screen.queryByText(/Não conseguimos buscar os avisos do Jarvas/)).toBeNull();
  });

  it("o botão Tentar de novo busca outra vez e mostra o que veio", async () => {
    buscarInsights.mockResolvedValue({ data: null, error: FALHA });
    await montarEAbrir();

    buscarInsights.mockResolvedValue({ data: [INSIGHT], error: null });
    await act(async () => { fireEvent.click(screen.getByText(/Tentar de novo/)); });

    expect(screen.getByText("Caixa aberto há 9 horas")).toBeTruthy();
    expect(screen.queryByText(/Não conseguimos buscar os avisos do Jarvas/)).toBeNull();
  });
});

describe("JarvasPanel, escrita recusada ao mudar o status", () => {
  it("descarte recusado devolve o cartão para a lista e avisa", async () => {
    buscarInsights.mockResolvedValue({ data: [INSIGHT], error: null });
    atualizarStatusInsight.mockResolvedValue({ data: null, error: FALHA });
    await montarEAbrir();
    expect(screen.getByText("Caixa aberto há 9 horas")).toBeTruthy();

    await act(async () => { fireEvent.click(screen.getByTitle("Descartar")); });

    expect(screen.getByText("Caixa aberto há 9 horas")).toBeTruthy();
    expect(screen.getByText(/Não conseguimos salvar essa mudança/)).toBeTruthy();
  });

  it("descarte aceito tira o cartão e não avisa nada", async () => {
    buscarInsights.mockResolvedValue({ data: [INSIGHT], error: null });
    atualizarStatusInsight.mockResolvedValue({ data: { id: "i1", status: "descartado" }, error: null });
    await montarEAbrir();

    await act(async () => { fireEvent.click(screen.getByTitle("Descartar")); });

    expect(screen.queryByText("Caixa aberto há 9 horas")).toBeNull();
    expect(screen.queryByText(/Não conseguimos salvar essa mudança/)).toBeNull();
  });

  it("marcar como lido recusado volta o insight ao estado de novo", async () => {
    buscarInsights.mockResolvedValue({ data: [INSIGHT], error: null });
    atualizarStatusInsight.mockResolvedValue({ data: null, error: FALHA });
    await montarEAbrir();

    await act(async () => { fireEvent.click(screen.getByTitle("Marcar como lido")); });

    expect(screen.getByText(/Não conseguimos salvar essa mudança/)).toBeTruthy();
    // O botão de "marcar como lido" só existe para insight com status "novo":
    // continuar lá é a prova de que a mudança otimista foi desfeita.
    expect(screen.getByTitle("Marcar como lido")).toBeTruthy();
  });
});
