import { describe, it, expect } from "vitest";
import { salvarSnapshot, lerSnapshot, CHAVE_SNAPSHOT } from "./snapshot";

// Storage mínimo compatível com localStorage para os testes.
const criarStorage = () => {
  const mapa = new Map();
  return {
    getItem: (k) => (mapa.has(k) ? mapa.get(k) : null),
    setItem: (k, v) => mapa.set(k, String(v)),
    removeItem: (k) => mapa.delete(k),
  };
};

describe("salvarSnapshot / lerSnapshot", () => {
  it("faz round-trip e carimba salvoEm", () => {
    const s = criarStorage();
    expect(salvarSnapshot(s, { produtos: [{ id: 1 }] })).toBe(true);
    const lido = lerSnapshot(s);
    expect(lido.produtos).toEqual([{ id: 1 }]);
    expect(lido.salvoEm).toBeTruthy();
    expect(lido.__tenant).toBeNull();
  });

  it("retorna null quando não há snapshot ou JSON corrompido", () => {
    const s = criarStorage();
    expect(lerSnapshot(s)).toBeNull();
    s.setItem(CHAVE_SNAPSHOT, "{não é json");
    expect(lerSnapshot(s)).toBeNull();
  });

  it("nunca lança com storage quebrado (grava/lê viram false/null)", () => {
    const quebrado = {
      getItem: () => { throw new Error("boom"); },
      setItem: () => { throw new Error("boom"); },
    };
    expect(salvarSnapshot(quebrado, { a: 1 })).toBe(false);
    expect(lerSnapshot(quebrado)).toBeNull();
  });

  it("carimba o tenant e só devolve o snapshot para o MESMO tenant", () => {
    const s = criarStorage();
    salvarSnapshot(s, { produtos: [{ id: 1 }] }, "T1");
    // Tenant certo: hidrata.
    expect(lerSnapshot(s, "T1").produtos).toEqual([{ id: 1 }]);
    // Outro tenant: DESCARTA (fail-closed, sem vazar dados de outro estabelecimento).
    expect(lerSnapshot(s, "T2")).toBeNull();
  });

  it("sem tenantId na leitura (undefined) não valida — retrocompat/uso puro", () => {
    const s = criarStorage();
    salvarSnapshot(s, { produtos: [] }, "T1");
    expect(lerSnapshot(s)).not.toBeNull();
  });

  it("snapshot legado sem __tenant só bate com tenant null/undefined", () => {
    const s = criarStorage();
    // Simula um snapshot gravado antes do carimbo (sem __tenant).
    s.setItem(CHAVE_SNAPSHOT, JSON.stringify({ produtos: [], salvoEm: "x" }));
    expect(lerSnapshot(s, "T1")).toBeNull(); // tenant real não bate com null
    expect(lerSnapshot(s, null)).not.toBeNull(); // sessão sem tenant lê legado
    expect(lerSnapshot(s)).not.toBeNull(); // uso puro
  });
});
