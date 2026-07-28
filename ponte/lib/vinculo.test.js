// Testes do vínculo da Ponte KORA com o estabelecimento (Leva 14).
//
// O que estes testes protegem: a Ponte só se vincula com um tenantId que
// realmente parece um UUID (nunca aceita lixo/script no campo), o nome
// exibido no painel nunca carrega caractere de controle, e trocar de
// estabelecimento (PC do caixa mudou de dono) sempre sobrescreve limpo.
import { describe, it, expect } from "vitest";
import { validarVinculo, aplicarVinculo, resumoVinculo } from "./vinculo.js";

const AGORA = "2026-07-26T12:00:00.000Z";
const relogio = { agora: () => AGORA };
const UUID = "b3f1a2c4-5d6e-4a7b-8c9d-0e1f2a3b4c5d";

describe("validarVinculo", () => {
  it("aceita um UUID válido e devolve o vínculo pronto", () => {
    const r = validarVinculo({ tenantId: UUID, nome: "Restaurante do Zé" }, relogio);
    expect(r).toEqual({
      ok: true,
      vinculo: { tenantId: UUID, nome: "Restaurante do Zé", vinculadoEm: AGORA },
    });
  });

  it("usa new Date().toISOString() quando não recebe relógio injetado", () => {
    const r = validarVinculo({ tenantId: UUID, nome: "Loja" });
    expect(r.ok).toBe(true);
    expect(() => new Date(r.vinculo.vinculadoEm)).not.toThrow();
    expect(Number.isNaN(Date.parse(r.vinculo.vinculadoEm))).toBe(false);
  });

  it("recusa corpo ausente ou que não é objeto", () => {
    expect(validarVinculo(null).ok).toBe(false);
    expect(validarVinculo(undefined).ok).toBe(false);
    expect(validarVinculo([]).ok).toBe(false);
    expect(validarVinculo("string").ok).toBe(false);
  });

  it("recusa tenantId ausente ou vazio, com mensagem clara", () => {
    expect(validarVinculo({}, relogio).ok).toBe(false);
    expect(validarVinculo({ tenantId: "" }, relogio).ok).toBe(false);
    expect(validarVinculo({ tenantId: "   " }, relogio).ok).toBe(false);
    const r = validarVinculo({ tenantId: 12345 }, relogio);
    expect(r.ok).toBe(false);
    expect(r.erro).not.toMatch(/undefined|null|NaN/i);
  });

  it("recusa tenantId maior que 64 caracteres", () => {
    const longo = "a".repeat(65);
    const r = validarVinculo({ tenantId: longo }, relogio);
    expect(r.ok).toBe(false);
    expect(r.erro).toMatch(/grande/i);
  });

  it("aceita tenantId com exatamente 64 caracteres válidos", () => {
    const limite = "a1".repeat(32);
    expect(limite.length).toBe(64);
    const r = validarVinculo({ tenantId: limite }, relogio);
    expect(r.ok).toBe(true);
  });

  it("recusa tenantId com caracteres fora de [0-9a-fA-F-]", () => {
    expect(validarVinculo({ tenantId: "abc123; DROP TABLE" }, relogio).ok).toBe(false);
    expect(validarVinculo({ tenantId: "<script>" }, relogio).ok).toBe(false);
    expect(validarVinculo({ tenantId: "abc_123" }, relogio).ok).toBe(false);
    expect(validarVinculo({ tenantId: "abc 123" }, relogio).ok).toBe(false);
  });

  it("remove caracteres de controle do nome e corta em 80", () => {
    const comControle = `Restaurante${String.fromCharCode(7)} Bom${String.fromCharCode(27)}Prato`;
    const r = validarVinculo({ tenantId: UUID, nome: comControle }, relogio);
    expect(r.ok).toBe(true);
    expect(r.vinculo.nome).toBe("Restaurante BomPrato");

    const grande = "X".repeat(120);
    const r2 = validarVinculo({ tenantId: UUID, nome: grande }, relogio);
    expect(r2.vinculo.nome).toHaveLength(80);
  });

  it("nome ausente ou vazio vira o padrão 'Estabelecimento'", () => {
    expect(validarVinculo({ tenantId: UUID }, relogio).vinculo.nome).toBe("Estabelecimento");
    expect(validarVinculo({ tenantId: UUID, nome: "" }, relogio).vinculo.nome).toBe("Estabelecimento");
    expect(validarVinculo({ tenantId: UUID, nome: "   " }, relogio).vinculo.nome).toBe("Estabelecimento");
    expect(validarVinculo({ tenantId: UUID, nome: 123 }, relogio).vinculo.nome).toBe("Estabelecimento");
  });
});

describe("aplicarVinculo", () => {
  it("devolve um novo config com o vínculo, sem mutar o original", () => {
    const configOriginal = { token: "abc", porta: 8123 };
    const vinculo = { tenantId: UUID, nome: "Loja 1", vinculadoEm: AGORA };
    const novo = aplicarVinculo(configOriginal, vinculo);

    expect(novo).toEqual({ token: "abc", porta: 8123, estabelecimento: vinculo });
    expect(configOriginal).toEqual({ token: "abc", porta: 8123 }); // intocado
    expect(configOriginal.estabelecimento).toBeUndefined();
  });

  it("troca de estabelecimento sobrescreve o vínculo anterior (PC mudou de dono)", () => {
    const configComVinculoAntigo = {
      token: "abc",
      estabelecimento: { tenantId: "0000-antigo", nome: "Loja Antiga", vinculadoEm: "2020-01-01T00:00:00.000Z" },
    };
    const novoVinculo = { tenantId: UUID, nome: "Loja Nova", vinculadoEm: AGORA };
    const novo = aplicarVinculo(configComVinculoAntigo, novoVinculo);

    expect(novo.estabelecimento).toEqual(novoVinculo);
    expect(novo.estabelecimento.vinculadoEm).toBe(AGORA);
    // config anterior continua com o vínculo velho — não foi mutado.
    expect(configComVinculoAntigo.estabelecimento.nome).toBe("Loja Antiga");
  });

  it("tolera config ausente/inválido", () => {
    const vinculo = { tenantId: UUID, nome: "Loja", vinculadoEm: AGORA };
    expect(aplicarVinculo(null, vinculo)).toEqual({ estabelecimento: vinculo });
    expect(aplicarVinculo(undefined, vinculo)).toEqual({ estabelecimento: vinculo });
  });
});

describe("resumoVinculo", () => {
  it("sem vínculo, devolve tudo vazio/false", () => {
    expect(resumoVinculo({})).toEqual({ vinculado: false, nome: null, tenantId: null, vinculadoEm: null });
    expect(resumoVinculo({ token: "abc" })).toEqual({ vinculado: false, nome: null, tenantId: null, vinculadoEm: null });
    expect(resumoVinculo(null)).toEqual({ vinculado: false, nome: null, tenantId: null, vinculadoEm: null });
  });

  it("com vínculo, devolve os dados prontos para o painel", () => {
    const config = { estabelecimento: { tenantId: UUID, nome: "Restaurante do Zé", vinculadoEm: AGORA } };
    expect(resumoVinculo(config)).toEqual({
      vinculado: true,
      nome: "Restaurante do Zé",
      tenantId: UUID,
      vinculadoEm: AGORA,
    });
  });
});
