import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ supabase: {} }));

import { planejarImportacaoEstoque, paraLinhasExportEstoque, MINIMO_PADRAO } from "./estoque";

const PRODUTOS = [
  { id: 1, name: "X-Salada" },
  { id: 2, name: "Suco de Laranja 300ml" },
];

describe("planejarImportacaoEstoque (casamento por nome do cardápio)", () => {
  it("produto do cardápio sem linha de estoque: define com mínimo padrão", () => {
    const plano = planejarImportacaoEstoque(
      [{ linha: 2, produto: "x-salada", quantidade: 30, minimo: null }],
      PRODUTOS,
      []
    );
    expect(plano.definir).toEqual([
      { produto_id: 1, nome: "X-Salada", quantidade: 30, minimo: MINIMO_PADRAO },
    ]);
    expect(plano.naoEncontrados).toEqual([]);
  });

  it("mínimo vazio mantém o mínimo atual do banco", () => {
    const plano = planejarImportacaoEstoque(
      [{ linha: 2, produto: "X-Salada", quantidade: 30, minimo: null }],
      PRODUTOS,
      [{ produto_id: 1, quantidade: 5, minimo: 3 }]
    );
    expect(plano.definir[0]).toMatchObject({ quantidade: 30, minimo: 3 });
  });

  it("linha idêntica ao banco cai em iguais (rodar 2x não regrava)", () => {
    const plano = planejarImportacaoEstoque(
      [{ linha: 2, produto: "X-Salada", quantidade: 30, minimo: 10 }],
      PRODUTOS,
      [{ produto_id: 1, quantidade: 30, minimo: 10 }]
    );
    expect(plano.definir).toEqual([]);
    expect(plano.iguais).toHaveLength(1);
  });

  it("produto fora do cardápio vira erro apontado por linha, sem derrubar os demais", () => {
    const plano = planejarImportacaoEstoque(
      [
        { linha: 2, produto: "Não Existe", quantidade: 5, minimo: null },
        { linha: 3, produto: "Suco de Laranja 300ml", quantidade: 24, minimo: null },
      ],
      PRODUTOS,
      []
    );
    expect(plano.naoEncontrados).toEqual([
      { linha: 2, mensagem: '"Não Existe" não está no cardápio — importe/cadastre os produtos antes do estoque.' },
    ]);
    expect(plano.definir).toHaveLength(1);
    expect(plano.definir[0].produto_id).toBe(2);
  });
});

describe("paraLinhasExportEstoque", () => {
  it("achata o join do Supabase no shape do CSV e ignora órfãos", () => {
    expect(
      paraLinhasExportEstoque([
        { produto_id: 1, quantidade: "30", minimo: "10", products: { name: "X-Salada" } },
        { produto_id: 99, quantidade: 1, minimo: 1, products: null },
      ])
    ).toEqual([{ produto: "X-Salada", quantidade: 30, minimo: 10 }]);
  });
});
