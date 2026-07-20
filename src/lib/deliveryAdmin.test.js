import { describe, it, expect, vi } from "vitest";

// A camada importa o client Supabase (que exige VITE_* no import). Só
// testamos as funções PURAS aqui — o client é mockado para não exigir env.
vi.mock("./supabase", async () => {
  const { createMockSupabase } = await import("@/test/mockSupabase");
  return { supabase: createMockSupabase() };
});

import {
  produtosParaImportar,
  filtrarProdutos,
  filtrarItensDelivery,
  alternarProdutoId,
  normalizarFaixaTaxa,
  validarFaixa,
  faixaResumo,
  sanitizarConfig,
  formatarCep,
  formatarReais,
  formatarKm,
  distanciaKm,
  selecionarFaixaKm,
  temFaixasKm,
} from "./deliveryAdmin";

describe("produtosParaImportar", () => {
  it("traz só os produtos ativos que ainda não estão no delivery", () => {
    const products = [
      { id: 1, active: true },
      { id: 2, active: true },
      { id: 3, active: true },
    ];
    const jaPublicados = [{ produto_id: 2 }];
    const faltantes = produtosParaImportar(products, jaPublicados);
    expect(faltantes.map((p) => p.id)).toEqual([1, 3]);
  });

  it("compara id por string (id number x produto_id string do jsonb/uuid)", () => {
    const products = [{ id: 10 }, { id: 20 }];
    const jaPublicados = [{ produto_id: "10" }];
    expect(produtosParaImportar(products, jaPublicados).map((p) => p.id)).toEqual([20]);
  });

  it("ignora produtos inativos (active === false)", () => {
    const products = [
      { id: 1, active: false },
      { id: 2, active: true },
    ];
    expect(produtosParaImportar(products, []).map((p) => p.id)).toEqual([2]);
  });

  it("trata active ausente como ativo", () => {
    const products = [{ id: 1 }, { id: 2 }];
    expect(produtosParaImportar(products, []).map((p) => p.id)).toEqual([1, 2]);
  });

  it("é robusto a entradas não-array", () => {
    expect(produtosParaImportar(null, null)).toEqual([]);
    expect(produtosParaImportar(undefined, undefined)).toEqual([]);
  });

  it("nada a importar quando tudo já foi publicado", () => {
    const products = [{ id: 1 }, { id: 2 }];
    const jaPublicados = [{ produto_id: 1 }, { produto_id: 2 }];
    expect(produtosParaImportar(products, jaPublicados)).toEqual([]);
  });
});

describe("filtrarProdutos", () => {
  const produtos = [
    { id: 1, name: "Bacon", active: true },
    { id: 2, name: "Batata Frita", active: true },
    { id: 3, name: "Pão de Queijo", active: true },
    { id: 4, name: "Bacon Extra", active: false },
  ];

  it("casa pelo nome sem acento e sem caixa", () => {
    expect(filtrarProdutos(produtos, "pao").map((p) => p.id)).toEqual([3]);
    expect(filtrarProdutos(produtos, "BATA").map((p) => p.id)).toEqual([2]);
  });

  it("termo vazio lista todos os ativos, ordenados por nome", () => {
    expect(filtrarProdutos(produtos, "").map((p) => p.id)).toEqual([1, 2, 3]);
  });

  it("ignora produtos inativos (active === false)", () => {
    expect(filtrarProdutos(produtos, "bacon").map((p) => p.id)).toEqual([1]);
  });

  it("exclui os produto_id já presentes no grupo", () => {
    expect(filtrarProdutos(produtos, "", [2]).map((p) => p.id)).toEqual([1, 3]);
    // compara por string (id number x produto_id string do banco)
    expect(filtrarProdutos(produtos, "", ["1"]).map((p) => p.id)).toEqual([2, 3]);
  });

  it("respeita o limite de resultados", () => {
    expect(filtrarProdutos(produtos, "", [], 1).map((p) => p.id)).toEqual([1]);
  });

  it("é robusto a entradas não-array", () => {
    expect(filtrarProdutos(null, "x")).toEqual([]);
    expect(filtrarProdutos(undefined, "")).toEqual([]);
  });
});

describe("filtrarItensDelivery", () => {
  const itens = [
    { produto_id: 1, produto: { name: "Bacon" } },
    { produto_id: 2, produto: { name: "Batata Frita" } },
    { produto_id: 3, produto: { name: "Pão de Queijo" } },
  ];

  it("casa pelo nome do produto sem acento e sem caixa", () => {
    expect(filtrarItensDelivery(itens, "pao").map((i) => i.produto_id)).toEqual([3]);
    expect(filtrarItensDelivery(itens, "BATA").map((i) => i.produto_id)).toEqual([2]);
  });

  it("termo vazio lista todos, ordenados por nome", () => {
    expect(filtrarItensDelivery(itens, "").map((i) => i.produto_id)).toEqual([1, 2, 3]);
  });

  it("exclui os produto_id já vinculados ao grupo", () => {
    expect(filtrarItensDelivery(itens, "", [2]).map((i) => i.produto_id)).toEqual([1, 3]);
    // compara por string (produto_id number x uuid/string do banco)
    expect(filtrarItensDelivery(itens, "", ["1"]).map((i) => i.produto_id)).toEqual([2, 3]);
  });

  it("respeita o limite de resultados", () => {
    expect(filtrarItensDelivery(itens, "", [], 1).map((i) => i.produto_id)).toEqual([1]);
  });

  it("é robusto a item sem produto/nome e a entrada não-array", () => {
    expect(filtrarItensDelivery([{ produto_id: 9 }], "x")).toEqual([]);
    expect(filtrarItensDelivery([{ produto_id: 9 }], "").map((i) => i.produto_id)).toEqual([9]);
    expect(filtrarItensDelivery(null, "x")).toEqual([]);
    expect(filtrarItensDelivery(undefined, "")).toEqual([]);
  });
});

describe("normalizarFaixaTaxa", () => {
  it("bairro: apara o nome e normaliza a taxa", () => {
    expect(normalizarFaixaTaxa({ tipo: "bairro", bairro: "  Centro  ", taxa: "5" })).toEqual({
      tipo: "bairro",
      bairro: "Centro",
      taxa: 5,
    });
  });

  it("cep: mantém só dígitos e corta em 8", () => {
    expect(
      normalizarFaixaTaxa({ tipo: "cep", cep_ini: "90.000-000", cep_fim: "90999999999", taxa: 8 })
    ).toEqual({ tipo: "cep", cep_ini: "90000000", cep_fim: "90999999", taxa: 8 });
  });

  it("taxa nunca fica negativa e default é bairro", () => {
    expect(normalizarFaixaTaxa({ taxa: -3 })).toEqual({ tipo: "bairro", bairro: "", taxa: 0 });
  });

  it("tipo desconhecido cai para bairro", () => {
    expect(normalizarFaixaTaxa({ tipo: "xpto", bairro: "X" }).tipo).toBe("bairro");
  });
});

describe("validarFaixa", () => {
  it("bairro válido precisa de nome", () => {
    expect(validarFaixa({ tipo: "bairro", bairro: "Centro", taxa: 5 })).toBe(true);
    expect(validarFaixa({ tipo: "bairro", bairro: "   ", taxa: 5 })).toBe(false);
  });

  it("cep exige 8 dígitos em cada ponta e ini <= fim", () => {
    expect(validarFaixa({ tipo: "cep", cep_ini: "90000000", cep_fim: "90999999", taxa: 5 })).toBe(true);
    expect(validarFaixa({ tipo: "cep", cep_ini: "9000000", cep_fim: "90999999", taxa: 5 })).toBe(false);
    expect(validarFaixa({ tipo: "cep", cep_ini: "90999999", cep_fim: "90000000", taxa: 5 })).toBe(false);
  });

  it("taxa 0 é válida (entrega grátis)", () => {
    expect(validarFaixa({ tipo: "bairro", bairro: "Centro", taxa: 0 })).toBe(true);
  });
});

describe("faixaResumo", () => {
  it("bairro com taxa", () => {
    expect(faixaResumo({ tipo: "bairro", bairro: "Centro", taxa: 5 })).toBe("Centro — R$ 5,00");
  });

  it("taxa 0 aparece como Grátis", () => {
    expect(faixaResumo({ tipo: "bairro", bairro: "Centro", taxa: 0 })).toBe("Centro — Grátis");
  });

  it("cep formata as duas pontas", () => {
    expect(faixaResumo({ tipo: "cep", cep_ini: "90000000", cep_fim: "90999999", taxa: 8 })).toBe(
      "CEP 90000-000 a 90999-999 — R$ 8,00"
    );
  });
});

describe("sanitizarConfig", () => {
  it("normaliza tipos e números não-negativos", () => {
    const out = sanitizarConfig({
      aberto: 1,
      pedido_minimo: "20",
      tempo_preparo_min: "35.6",
      horario: { seg: "18-23" },
      faixas_taxa: [
        { tipo: "bairro", bairro: "Centro", taxa: 5 },
        { tipo: "bairro", bairro: "", taxa: 5 }, // inválida, cai fora
      ],
    });
    expect(out.aberto).toBe(true);
    expect(out.pedido_minimo).toBe(20);
    expect(out.tempo_preparo_min).toBe(36);
    expect(out.horario).toEqual({ seg: "18-23" });
    expect(out.faixas_taxa).toEqual([{ tipo: "bairro", bairro: "Centro", taxa: 5 }]);
  });

  it("defaults seguros quando vem vazio/undefined", () => {
    const out = sanitizarConfig(undefined);
    expect(out).toEqual({
      aberto: false,
      pedido_minimo: 0,
      tempo_preparo_min: 0,
      horario: {},
      faixas_taxa: [],
      origem_lat: null,
      origem_lng: null,
      endereco_origem: null,
    });
  });

  it("horario inválido vira objeto vazio", () => {
    expect(sanitizarConfig({ horario: "qualquer coisa" }).horario).toEqual({});
  });

  it("guarda coordenadas de origem só quando são válidas", () => {
    expect(sanitizarConfig({ origem_lat: -30.03, origem_lng: -51.23 }).origem_lat).toBe(-30.03);
    expect(sanitizarConfig({ origem_lat: -30.03, origem_lng: -51.23 }).origem_lng).toBe(-51.23);
    // fora do intervalo ou não-numérico → null
    expect(sanitizarConfig({ origem_lat: 200, origem_lng: -51 }).origem_lat).toBe(null);
    expect(sanitizarConfig({ origem_lat: "x", origem_lng: "y" }).origem_lat).toBe(null);
  });

  it("guarda o endereço de origem em texto (trim) ou null", () => {
    expect(sanitizarConfig({ endereco_origem: "  Rua A, 10  " }).endereco_origem).toBe("Rua A, 10");
    expect(sanitizarConfig({ endereco_origem: "   " }).endereco_origem).toBe(null);
    expect(sanitizarConfig({ endereco_origem: 123 }).endereco_origem).toBe(null);
    expect(sanitizarConfig({}).endereco_origem).toBe(null);
  });

  it("ordena as faixas km do menor anel para o maior", () => {
    const out = sanitizarConfig({
      faixas_taxa: [
        { tipo: "km", km_ate: 8, taxa: 12 },
        { tipo: "km", km_ate: 2, taxa: 5 },
        { tipo: "km", km_ate: 5, taxa: 8 },
      ],
    });
    expect(out.faixas_taxa.map((f) => f.km_ate)).toEqual([2, 5, 8]);
  });
});

describe("faixa por km — normalizar/validar/resumo", () => {
  it("normaliza km_ate e taxa não-negativos", () => {
    expect(normalizarFaixaTaxa({ tipo: "km", km_ate: "3", taxa: "5,5" })).toEqual({
      tipo: "km",
      km_ate: 3,
      taxa: 0, // "5,5" não é número → 0 (a UI já converte vírgula antes)
    });
    expect(normalizarFaixaTaxa({ tipo: "km", km_ate: -2, taxa: 5 })).toEqual({
      tipo: "km",
      km_ate: 0,
      taxa: 5,
    });
  });

  it("faixa km só vale com raio > 0", () => {
    expect(validarFaixa({ tipo: "km", km_ate: 3, taxa: 8 })).toBe(true);
    expect(validarFaixa({ tipo: "km", km_ate: 0, taxa: 8 })).toBe(false);
  });

  it("resumo humano do anel", () => {
    expect(faixaResumo({ tipo: "km", km_ate: 3, taxa: 8 })).toBe("Até 3 km — R$ 8,00");
    expect(faixaResumo({ tipo: "km", km_ate: 2.5, taxa: 0 })).toBe("Até 2,5 km — Grátis");
  });
});

describe("formatarKm", () => {
  it("inteiro sem casas, fração com uma casa e vírgula", () => {
    expect(formatarKm(3)).toBe("3");
    expect(formatarKm(2.5)).toBe("2,5");
    expect(formatarKm(-1)).toBe("0");
  });
});

describe("distanciaKm (haversine)", () => {
  it("mesmo ponto → 0", () => {
    expect(distanciaKm(-30, -51, -30, -51)).toBe(0);
  });

  it("aproxima uma distância conhecida (~1,11 km por 0,01° de latitude)", () => {
    const d = distanciaKm(-30.0, -51.0, -30.01, -51.0);
    expect(d).toBeGreaterThan(1.0);
    expect(d).toBeLessThan(1.2);
  });

  it("coordenada inválida → null", () => {
    expect(distanciaKm("x", -51, -30, -51)).toBe(null);
    expect(distanciaKm(undefined, undefined, undefined, undefined)).toBe(null);
  });
});

describe("selecionarFaixaKm", () => {
  const aneis = [
    { tipo: "km", km_ate: 2, taxa: 5 },
    { tipo: "km", km_ate: 5, taxa: 8 },
    { tipo: "km", km_ate: 8, taxa: 12 },
  ];

  it("pega o menor anel que cobre a distância", () => {
    expect(selecionarFaixaKm(aneis, 1.5)).toEqual({ tipo: "km", km_ate: 2, taxa: 5 });
    expect(selecionarFaixaKm(aneis, 3)).toEqual({ tipo: "km", km_ate: 5, taxa: 8 });
    expect(selecionarFaixaKm(aneis, 5)).toEqual({ tipo: "km", km_ate: 5, taxa: 8 });
  });

  it("fora de todos os anéis → null (fora da área)", () => {
    expect(selecionarFaixaKm(aneis, 9)).toBe(null);
  });

  it("ignora faixas que não são km e ordena mesmo fora de ordem", () => {
    const mistura = [
      { tipo: "bairro", bairro: "Centro", taxa: 3 },
      { tipo: "km", km_ate: 5, taxa: 8 },
      { tipo: "km", km_ate: 2, taxa: 5 },
    ];
    expect(selecionarFaixaKm(mistura, 1)).toEqual({ tipo: "km", km_ate: 2, taxa: 5 });
  });

  it("distância inválida → null", () => {
    expect(selecionarFaixaKm(aneis, "abc")).toBe(null);
  });
});

describe("temFaixasKm", () => {
  it("detecta se há ao menos um anel km", () => {
    expect(temFaixasKm([{ tipo: "km", km_ate: 3, taxa: 5 }])).toBe(true);
    expect(temFaixasKm([{ tipo: "bairro", bairro: "Centro", taxa: 5 }])).toBe(false);
    expect(temFaixasKm([])).toBe(false);
  });
});

describe("formatarCep", () => {
  it("insere hífen só depois do 5º dígito", () => {
    expect(formatarCep("90000")).toBe("90000");
    expect(formatarCep("900000")).toBe("90000-0");
    expect(formatarCep("90.000-000")).toBe("90000-000");
  });
});

describe("formatarReais", () => {
  it("formata em pt-BR com R$ e vírgula", () => {
    expect(formatarReais(5)).toBe("R$ 5,00");
    expect(formatarReais(12.5)).toBe("R$ 12,50");
    expect(formatarReais("nan")).toBe("R$ 0,00");
  });
});

describe("alternarProdutoId", () => {
  it("adiciona o produto quando ainda não está vinculado", () => {
    expect(alternarProdutoId([1, 2], 3)).toEqual([1, 2, 3]);
  });

  it("remove o produto quando já está vinculado", () => {
    expect(alternarProdutoId([1, 2, 3], 2)).toEqual([1, 3]);
  });

  it("compara por String (bigint do banco vs. number da UI)", () => {
    expect(alternarProdutoId(["10", "20"], 10)).toEqual(["20"]);
    expect(alternarProdutoId([10, 20], "10")).toEqual([20]);
  });

  it("não muta a lista original", () => {
    const ids = [1, 2];
    const fora = alternarProdutoId(ids, 3);
    expect(ids).toEqual([1, 2]);
    expect(fora).not.toBe(ids);
  });

  it("trata entrada não-array como lista vazia", () => {
    expect(alternarProdutoId(undefined, 5)).toEqual([5]);
    expect(alternarProdutoId(null, 5)).toEqual([5]);
  });
});
