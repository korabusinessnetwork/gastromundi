import { describe, it, expect, vi, beforeEach } from "vitest";

// roteador importa montarViaProducao de ../impressao, que importa supabase.
const { mockSupabase } = vi.hoisted(() => ({ mockSupabase: { current: null } }));
vi.mock("../supabase", async () => {
  const { createMockSupabase } = await import("@/test/mockSupabase");
  mockSupabase.current = createMockSupabase();
  return { supabase: mockSupabase.current };
});

import { rotearPedidoPorLocal } from "./roteador";

beforeEach(() => {
  vi.clearAllMocks();
  mockSupabase.current?.reset?.();
});

const LOCAIS = [
  { id: "loc-cozinha", nome: "Cozinha" },
  { id: "loc-bar", nome: "Bar" },
];
// Bebidas → Bar; Comidas → Cozinha; "Sobremesas" mapeada para "" (não imprimir)
const ROTEAMENTO = { Bebidas: "loc-bar", Comidas: "loc-cozinha", Sobremesas: "" };

describe("rotearPedidoPorLocal (Fase 1 — via de produção por local)", () => {
  it("agrupa itens por local conforme categoria → roteamento", () => {
    const pedido = {
      comanda: "12",
      items: [
        { name: "Hambúrguer", qty: 1, category: "Comidas" },
        { name: "Cerveja", qty: 2, category: "Bebidas" },
        { name: "Fritas", qty: 1, category: "Comidas" },
      ],
    };

    const rotas = rotearPedidoPorLocal(pedido, { roteamento: ROTEAMENTO, locais: LOCAIS });

    expect(rotas).toHaveLength(2);
    // Ordem determinística: Comidas apareceu primeiro nos itens.
    expect(rotas[0]).toMatchObject({ local_impressao_id: "loc-cozinha", local_nome: "Cozinha" });
    expect(rotas[0].documento.tipo).toBe("via_producao");
    expect(rotas[0].documento.itens.map((i) => i.nome)).toEqual(["Hambúrguer", "Fritas"]);
    expect(rotas[1]).toMatchObject({ local_impressao_id: "loc-bar", local_nome: "Bar" });
    expect(rotas[1].documento.itens.map((i) => i.nome)).toEqual(["Cerveja"]);
    // A via carrega os dados de cabeçalho do pedido.
    expect(rotas[0].documento.comanda).toBe("12");
  });

  it("pula itens sem rota: categoria não mapeada ou mapeada para '' (não imprimir)", () => {
    const pedido = {
      items: [
        { name: "Sorvete", qty: 1, category: "Sobremesas" }, // "" → não imprime
        { name: "Água", qty: 1, category: "SemCategoriaConhecida" }, // não mapeada
        { name: "Suco", qty: 1 }, // sem category
        { name: "Cerveja", qty: 1, category: "Bebidas" },
      ],
    };

    const rotas = rotearPedidoPorLocal(pedido, { roteamento: ROTEAMENTO, locais: LOCAIS });

    expect(rotas).toHaveLength(1);
    expect(rotas[0].local_impressao_id).toBe("loc-bar");
    expect(rotas[0].documento.itens.map((i) => i.nome)).toEqual(["Cerveja"]);
  });

  it("não emite via para local cujo grupo ficou sem item produzível (cancelado/não-produzível)", () => {
    const pedido = {
      items: [
        { name: "Cerveja", qty: 1, category: "Bebidas", cancelado: true },
        { name: "Taxa", qty: 1, category: "Comidas", produzivel: false },
      ],
    };

    const rotas = rotearPedidoPorLocal(pedido, { roteamento: ROTEAMENTO, locais: LOCAIS });

    expect(rotas).toHaveLength(0);
  });

  it("sem roteamento configurado → nenhuma rota (chamador cai no fallback global)", () => {
    const pedido = { items: [{ name: "Cerveja", qty: 1, category: "Bebidas" }] };

    expect(rotearPedidoPorLocal(pedido, { roteamento: {}, locais: LOCAIS })).toEqual([]);
    expect(rotearPedidoPorLocal(pedido, {})).toEqual([]);
  });

  it("local sem nome cadastrado → local_nome null, mas ainda roteia", () => {
    const pedido = { items: [{ name: "Cerveja", qty: 1, category: "Bebidas" }] };

    const rotas = rotearPedidoPorLocal(pedido, { roteamento: ROTEAMENTO, locais: [] });

    expect(rotas).toHaveLength(1);
    expect(rotas[0].local_nome).toBeNull();
  });

  it("pedido sem itens → []", () => {
    expect(rotearPedidoPorLocal({}, { roteamento: ROTEAMENTO, locais: LOCAIS })).toEqual([]);
    expect(rotearPedidoPorLocal(null, { roteamento: ROTEAMENTO, locais: LOCAIS })).toEqual([]);
  });
});
