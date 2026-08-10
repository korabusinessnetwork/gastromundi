import { describe, it, expect } from "vitest";
import { LOCK_TTL_MS, HEARTBEAT_MS, lockAtivo, travadaPorOutro, nomeTrava } from "./comandaLock";

const AGORA = 1_800_000_000_000;

function comanda(overrides = {}) {
  return {
    id: "p1",
    comanda: "12",
    editando_por: "maria",
    editando_nome: "Maria",
    editando_desde: new Date(AGORA - 10_000).toISOString(),
    ...overrides,
  };
}

describe("comandaLock", () => {
  it("heartbeat renova pelo menos 2x dentro do TTL (trava não expira em uso)", () => {
    expect(HEARTBEAT_MS * 2).toBeLessThan(LOCK_TTL_MS);
  });

  describe("lockAtivo", () => {
    it("trava recente é ativa", () => {
      expect(lockAtivo(comanda(), AGORA)).toBe(true);
    });

    it("trava expirada (mais velha que o TTL) não é ativa", () => {
      const velha = comanda({ editando_desde: new Date(AGORA - LOCK_TTL_MS - 1).toISOString() });
      expect(lockAtivo(velha, AGORA)).toBe(false);
    });

    it("no limite exato do TTL a trava conta como expirada", () => {
      const noLimite = comanda({ editando_desde: new Date(AGORA - LOCK_TTL_MS).toISOString() });
      expect(lockAtivo(noLimite, AGORA)).toBe(false);
    });

    it("sem editando_por não há trava", () => {
      expect(lockAtivo(comanda({ editando_por: null }), AGORA)).toBe(false);
    });

    it("sem editando_desde não há trava (não fica presa pra sempre)", () => {
      expect(lockAtivo(comanda({ editando_desde: null }), AGORA)).toBe(false);
    });

    it("editando_desde inválido não trava", () => {
      expect(lockAtivo(comanda({ editando_desde: "nunca" }), AGORA)).toBe(false);
    });

    it("order null/undefined não trava", () => {
      expect(lockAtivo(null, AGORA)).toBe(false);
      expect(lockAtivo(undefined, AGORA)).toBe(false);
    });
  });

  describe("travadaPorOutro", () => {
    it("trava ativa de outra pessoa bloqueia", () => {
      expect(travadaPorOutro(comanda(), "joao", AGORA)).toBe(true);
    });

    it("minha própria trava não bloqueia", () => {
      expect(travadaPorOutro(comanda(), "maria", AGORA)).toBe(false);
    });

    it("trava expirada de outra pessoa não bloqueia", () => {
      const velha = comanda({ editando_desde: new Date(AGORA - LOCK_TTL_MS - 1).toISOString() });
      expect(travadaPorOutro(velha, "joao", AGORA)).toBe(false);
    });

    it("comanda sem trava não bloqueia", () => {
      expect(travadaPorOutro(comanda({ editando_por: null }), "joao", AGORA)).toBe(false);
      expect(travadaPorOutro(null, "joao", AGORA)).toBe(false);
    });
  });

  describe("nomeTrava", () => {
    it("prefere o nome exibível", () => {
      expect(nomeTrava(comanda())).toBe("Maria");
    });

    it("cai pro username quando não há nome", () => {
      expect(nomeTrava(comanda({ editando_nome: null }))).toBe("maria");
    });

    it("fallback genérico quando não há nada", () => {
      expect(nomeTrava(null)).toBe("outra pessoa");
      expect(nomeTrava({})).toBe("outra pessoa");
    });
  });
});
