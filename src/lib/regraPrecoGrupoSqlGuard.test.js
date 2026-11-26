import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { MIGRATIONS_DIR } from "@/test/migracoes";
import { REGRAS_PRECO, regraValida } from "./gruposEscolha";
import { precoDasEscolhas } from "./combos";

/**
 * Guard de 20261008_regra_preco_grupo.sql.
 *
 * O preço de um item com escolhas era sempre a SOMA das opções. Para
 * extras está certo; para sabores de pizza, não: quatro sabores de R$ 40
 * saíam por R$ 160 — quatro pizzas.
 *
 * O que este arquivo prende é o acordo entre os dois lados. A regra vive
 * numa coluna do banco e a CONTA vive no JS: se o banco passar a aceitar
 * uma regra que a conta não conhece, o preço cai calado em "soma" e o
 * dono descobre pelo caixa no fim do dia.
 */
const MIGRACAO = "20261008_regra_preco_grupo.sql";
const sql = readFileSync(join(MIGRATIONS_DIR, MIGRACAO), "utf8");

describe("a coluna existe e nasce somando", () => {
  it("entra com IF NOT EXISTS — reaplicar não recria nem zera nada", () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS regra_preco text NOT NULL DEFAULT 'soma'/);
  });

  it("o default é 'soma', que é o que o sistema fazia antes", () => {
    // Qualquer outro default mudaria o preço de todo cadastro existente no
    // instante em que a migração fosse aplicada.
    expect(sql).toContain("DEFAULT 'soma'");
    expect(sql).not.toMatch(/DEFAULT '(maior|media)'/);
  });
});

describe("banco e JS conhecem exatamente as mesmas regras", () => {
  const noCheck = sql.match(/CHECK \(regra_preco IN \(([^)]*)\)\)/);

  it("o CHECK está lá", () => {
    expect(noCheck).not.toBeNull();
  });

  it("as regras do CHECK são as mesmas que a tela oferece", () => {
    const doBanco = [...noCheck[1].matchAll(/'([a-z]+)'/g)].map((m) => m[1]).sort();
    const doApp = REGRAS_PRECO.map((r) => r.id).sort();
    expect(doBanco).toEqual(doApp);
  });

  it("toda regra que o banco aceita a conta do carrinho sabe aplicar", () => {
    // Uma regra aceita pelo banco e desconhecida pela conta viraria soma
    // silenciosa — o pior tipo de erro de preço, porque não aparece.
    const doBanco = [...noCheck[1].matchAll(/'([a-z]+)'/g)].map((m) => m[1]);
    for (const regra of doBanco) {
      expect(regraValida(regra)).toBe(regra);
    }
  });

  it("a conta de 'maior' é mesmo a mais cara, não a soma", () => {
    const escolha = (preco) => ({ produtoId: preco, preco, qtd: 1, grupoId: "g", regra: "maior" });
    expect(precoDasEscolhas([escolha(40), escolha(60)])).toBe(60);
  });
});

describe("a migração se confere sozinha", () => {
  it("prova que grupo novo nasce somando", () => {
    expect(sql).toMatch(/IF v_regra <> 'soma' THEN/);
    expect(sql).toMatch(/RAISE EXCEPTION 'Regra de preço: grupo novo nasceu/);
  });

  it("prova que o banco RECUSA regra desconhecida", () => {
    // Sem esta parte, o CHECK poderia estar ausente e a conferência passar.
    expect(sql).toMatch(/regra_preco = 'metade'/);
    expect(sql).toMatch(/EXCEPTION WHEN check_violation/);
  });

  it("limpa o que criou — a conferência não deixa estabelecimento fantasma", () => {
    expect(sql).toMatch(/DELETE FROM public\.grupos_escolha\s+WHERE tenant_id = v_tenant/);
    expect(sql).toMatch(/DELETE FROM public\.combos\s+WHERE tenant_id = v_tenant/);
    expect(sql).toMatch(/DELETE FROM public\.tenants\s+WHERE id = v_tenant/);
  });
});
