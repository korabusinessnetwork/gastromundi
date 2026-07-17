import { describe, it, expect } from "vitest";
import { criarFila, drenarFila, CHAVE_FILA_PENDING } from "./fila";
import { isErroDeRede } from "./rede";

// Storage mínimo compatível com localStorage para os testes.
const criarStorage = () => {
  const mapa = new Map();
  return {
    getItem: (k) => (mapa.has(k) ? mapa.get(k) : null),
    setItem: (k, v) => mapa.set(k, String(v)),
    removeItem: (k) => mapa.delete(k),
  };
};

const erroRede = { message: "TypeError: Failed to fetch" };
const erroDefinitivo = { message: "new row violates row-level security policy" };

describe("criarFila", () => {
  it("começa vazia e enfileira devolvendo o novo tamanho", () => {
    const fila = criarFila({ storage: criarStorage() });
    expect(fila.tamanho()).toBe(0);
    expect(fila.enfileirar({ tipo: "insert", payload: { id: "a" } })).toBe(1);
    expect(fila.enfileirar({ tipo: "delete", id: "b" })).toBe(2);
    const ops = fila.listar();
    expect(ops).toHaveLength(2);
    expect(ops[0].uid).toBeTruthy();
    expect(ops[0].enfileiradaEm).toBeTruthy();
    expect(ops[0].uid).not.toBe(ops[1].uid);
  });

  it("persiste no storage sob a chave da fila", () => {
    const storage = criarStorage();
    const fila = criarFila({ storage });
    fila.enfileirar({ tipo: "insert", payload: { id: "a" } });
    const gravado = JSON.parse(storage.getItem(CHAVE_FILA_PENDING));
    expect(gravado).toHaveLength(1);
    // Uma nova instância sobre o mesmo storage enxerga a mesma fila.
    expect(criarFila({ storage }).tamanho()).toBe(1);
  });

  it("sobrevive a storage corrompido sem lançar", () => {
    const storage = criarStorage();
    storage.setItem(CHAVE_FILA_PENDING, "{isso não é json");
    const fila = criarFila({ storage });
    expect(fila.tamanho()).toBe(0);
    expect(fila.enfileirar({ tipo: "insert", payload: {} })).toBe(1);
  });

  it("removerPorUid tira só as informadas e limpar zera", () => {
    const fila = criarFila({ storage: criarStorage() });
    fila.enfileirar({ tipo: "insert", payload: { id: "a" } });
    fila.enfileirar({ tipo: "insert", payload: { id: "b" } });
    const [primeira] = fila.listar();
    fila.removerPorUid(new Set([primeira.uid]));
    expect(fila.listar().map((op) => op.payload.id)).toEqual(["b"]);
    fila.limpar();
    expect(fila.tamanho()).toBe(0);
  });
});

describe("drenarFila", () => {
  it("envia tudo em ordem quando não há erro", async () => {
    const fila = criarFila({ storage: criarStorage() });
    fila.enfileirar({ tipo: "insert", payload: { id: "a" } });
    fila.enfileirar({ tipo: "insert", payload: { id: "b" } });
    const enviadas = [];
    const resultado = await drenarFila({
      fila,
      isErroDeRede,
      executar: async (op) => {
        enviadas.push(op.payload.id);
        return { error: null };
      },
    });
    expect(enviadas).toEqual(["a", "b"]);
    expect(resultado).toEqual({ enviadas: 2, falhas: [], restantes: 0 });
  });

  it("para no erro de rede e mantém o restante na fila", async () => {
    const fila = criarFila({ storage: criarStorage() });
    fila.enfileirar({ tipo: "insert", payload: { id: "a" } });
    fila.enfileirar({ tipo: "insert", payload: { id: "b" } });
    fila.enfileirar({ tipo: "insert", payload: { id: "c" } });
    const resultado = await drenarFila({
      fila,
      isErroDeRede,
      executar: async (op) =>
        op.payload.id === "b" ? { error: erroRede } : { error: null },
    });
    expect(resultado.enviadas).toBe(1);
    expect(resultado.falhas).toEqual([]);
    // "b" (que falhou por rede) e "c" (nem tentada) continuam na fila.
    expect(fila.listar().map((op) => op.payload.id)).toEqual(["b", "c"]);
  });

  it("descarta erro definitivo e devolve em falhas", async () => {
    const fila = criarFila({ storage: criarStorage() });
    fila.enfileirar({ tipo: "insert", payload: { id: "a" } });
    fila.enfileirar({ tipo: "insert", payload: { id: "b" } });
    const resultado = await drenarFila({
      fila,
      isErroDeRede,
      executar: async (op) =>
        op.payload.id === "a" ? { error: erroDefinitivo } : { error: null },
    });
    expect(resultado.enviadas).toBe(1);
    expect(resultado.falhas).toHaveLength(1);
    expect(resultado.falhas[0].op.payload.id).toBe("a");
    expect(resultado.restantes).toBe(0);
  });

  it("preserva operação enfileirada durante a drenagem", async () => {
    const fila = criarFila({ storage: criarStorage() });
    fila.enfileirar({ tipo: "insert", payload: { id: "a" } });
    const resultado = await drenarFila({
      fila,
      isErroDeRede,
      executar: async () => {
        // Simula um pedido novo entrando enquanto a fila drena.
        fila.enfileirar({ tipo: "insert", payload: { id: "nova" } });
        return { error: null };
      },
    });
    expect(resultado.enviadas).toBe(1);
    expect(fila.listar().map((op) => op.payload.id)).toEqual(["nova"]);
  });
});
