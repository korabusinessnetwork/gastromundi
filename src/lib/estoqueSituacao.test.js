import { describe, it, expect } from "vitest";
import {
  situacaoEstoque,
  classificarEstoque,
  controlaEstoque,
  MINIMO_PADRAO,
} from "./estoqueSituacao";

const produtos = [
  { id: 1, name: "Coca-Cola" },      // controla, zerado
  { id: 2, name: "Água" },           // controla, baixo
  { id: 3, name: "Cerveja" },        // controla, folgado
  { id: 4, name: "Prato do dia" },   // NÃO controla (sem linha em estoque)
  { id: 5, name: "Descontinuado", active: false },
];
const estoque = { 1: 0, 2: 3, 3: 200, 5: 0 };
const minimos = { 2: 5 };

describe("situacaoEstoque", () => {
  it("produto sem linha de estoque não é ruptura — ele não controla estoque", () => {
    // Era exatamente isto que inflava o aviso do PDV: cada prato do cardápio
    // contava como "sem estoque".
    expect(controlaEstoque(estoque, 4)).toBe(false);
    expect(situacaoEstoque(4, estoque, minimos)).toBe("nao_controlado");
  });

  it("saldo zero em produto controlado é ruptura", () => {
    expect(situacaoEstoque(1, estoque, minimos)).toBe("sem_estoque");
  });

  it("usa o mínimo cadastrado do produto, não um número fixo", () => {
    // Saldo 3 com mínimo 5 é baixo. Com o mínimo fixo de 10 que o PDV usava,
    // um produto de mínimo 2 e saldo 8 aparecia como baixo sem motivo.
    expect(situacaoEstoque(2, estoque, minimos)).toBe("baixo");
    expect(situacaoEstoque(2, estoque, { 2: 1 })).toBe("ok");
  });

  it("sem mínimo cadastrado, cai no padrão", () => {
    expect(situacaoEstoque(2, estoque, {})).toBe("baixo");   // 3 <= 10
    expect(situacaoEstoque(3, estoque, {})).toBe("ok");      // 200 > 10
    expect(MINIMO_PADRAO).toBe(10);
  });
});

describe("classificarEstoque", () => {
  it("as duas telas passam a contar a mesma coisa", () => {
    const { semEstoque, baixos } = classificarEstoque(produtos, estoque, minimos);
    expect(semEstoque.map(p => p.id)).toEqual([1]);
    expect(baixos.map(p => p.id)).toEqual([2]);
  });

  it("produto inativo não entra na conta", () => {
    // Zerado, mas fora do cardápio — avisar sobre ele é ruído.
    const { semEstoque } = classificarEstoque(produtos, estoque, minimos);
    expect(semEstoque.some(p => p.id === 5)).toBe(false);
  });

  it("aguenta lista e mapas vazios", () => {
    expect(classificarEstoque(undefined, undefined, undefined)).toEqual({ semEstoque: [], baixos: [] });
  });
});
