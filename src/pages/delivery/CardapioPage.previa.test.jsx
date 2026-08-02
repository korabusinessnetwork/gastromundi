// @vitest-environment jsdom
//
// Rodada 4 — a prévia "Ver cardápio do cliente" abrindo a loja CERTA.
//
// Enquanto não há subdomínio por estabelecimento no ar, a vitrine resolvia o
// slug pelo fallback: o dono da Casa Coffee clicava em "Ver cardápio do
// cliente" e via a marca, as categorias e os preços da GastroMundi — violação
// direta da decisão 017 numa tela feita justamente para conferir o próprio
// cadastro. Aqui se prova que o `?loja=` endereça a loja certa E que a prévia
// não contamina o cache de marca da origem, que é compartilhada com o login.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

const { vitrine, mockCarregarCardapio, mockBuscarBranding, mockLerCache, mockSalvarCache } =
  vi.hoisted(() => ({
    vitrine: { current: { slug: "casacoffee", origem: "query" } },
    mockCarregarCardapio: vi.fn(),
    mockBuscarBranding: vi.fn(),
    mockLerCache: vi.fn(),
    mockSalvarCache: vi.fn(),
  }));

vi.mock("@/lib/supabase", async () => {
  const { createMockSupabase } = await import("@/test/mockSupabase");
  return { supabase: createMockSupabase() };
});

vi.mock("@/lib/tenantSlug", () => ({
  slugDaVitrine: () => vitrine.current,
  slugDaQuery: () => null,
  slugDoSubdominio: () => null,
  resolverSlugTenant: () => "gastromundi",
}));

vi.mock("@/lib/tenant", () => ({ buscarBrandingPorSlug: mockBuscarBranding }));

vi.mock("@/lib/brandingCache", () => ({
  lerBrandingCache: mockLerCache,
  salvarBrandingCache: mockSalvarCache,
}));

// Só a ida ao servidor vira dublê; as funções puras da sacola ficam reais.
vi.mock("@/lib/delivery", async () => {
  const real = await vi.importActual("@/lib/delivery");
  return { ...real, carregarCardapio: mockCarregarCardapio };
});

import CardapioPage from "./CardapioPage";

const CARDAPIO = {
  aberto: true,
  pedido_minimo: 0,
  tempo_preparo_min: 30,
  produtos: [{ produto_id: 7, nome: "Café Coado", preco: 8, categoria: "Cafés", grupos: [] }],
  combos: [],
};

const ITEM_NA_SACOLA = {
  _linha: "linha-1",
  produto_id: 7,
  nome: "Café Coado",
  preco: 8,
  qtd: 1,
  complementosEscolhidos: [],
  obs: "",
};

/** Espera a vitrine sair do "Carregando o cardápio…". */
const esperarVitrine = () => screen.findByText("Casa Coffee");

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  vitrine.current = { slug: "casacoffee", origem: "query" };
  mockCarregarCardapio.mockResolvedValue({ data: CARDAPIO, error: null });
  mockBuscarBranding.mockResolvedValue({
    data: { nome: "Casa Coffee", tema: {} },
    error: null,
  });
  // Cache da ORIGEM (o estabelecimento do endereço), não o da prévia.
  mockLerCache.mockReturnValue({ nome: "GastroMundi", logo: null, variaveis: {} });
});

afterEach(() => {
  cleanup();
});

describe("CardapioPage aberta como prévia (?loja=)", () => {
  it("pede branding e cardápio do slug da query, não do fallback", async () => {
    render(<CardapioPage />);
    await esperarVitrine();

    expect(mockBuscarBranding).toHaveBeenCalledWith("casacoffee");
    expect(mockCarregarCardapio).toHaveBeenCalledWith("casacoffee");
  });

  it("não grava o cache de marca da origem — senão a marca vaza para o login alheio", async () => {
    render(<CardapioPage />);
    await esperarVitrine();

    expect(mockSalvarCache).not.toHaveBeenCalled();
  });

  it("não pinta a tela inicial com a marca da origem", async () => {
    render(<CardapioPage />);

    expect(mockLerCache).not.toHaveBeenCalled();
    expect(screen.queryByText("GastroMundi")).not.toBeInTheDocument();

    await esperarVitrine();
  });

  it("a sacola continua isolada por estabelecimento (chave do slug resolvido)", async () => {
    sessionStorage.setItem("kora.delivery.sacola.casacoffee", JSON.stringify([ITEM_NA_SACOLA]));

    render(<CardapioPage />);
    await esperarVitrine();

    expect(screen.getByRole("button", { name: "Ver a sacola" })).toBeInTheDocument();
  });
});

describe("CardapioPage no endereço da própria loja (sem prévia)", () => {
  beforeEach(() => {
    vitrine.current = { slug: "casacoffee", origem: "subdominio" };
  });

  it("continua usando o cache de marca da origem, como antes", async () => {
    render(<CardapioPage />);
    await esperarVitrine();

    expect(mockLerCache).toHaveBeenCalled();
    expect(mockSalvarCache).toHaveBeenCalledWith(
      expect.objectContaining({ nome: "Casa Coffee" }),
    );
  });
});
