import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

import { VERSAO_LEGAL } from "../legal/versaoLegal";

/**
 * Guard do ACEITE DE TERMOS (20260921) — pré-venda §1.5.
 *
 * O que este arquivo protege, e por quê:
 *
 *   (a) a migração existe e cria as duas colunas em `tenants`. Sem elas, o
 *       Termo publicado em /termos é texto no site: não há registro de que
 *       alguém aceitou;
 *   (b) as colunas nascem SEM default e ganham o default num segundo
 *       comando. Essa ordem é o coração da migração: `ADD COLUMN ... DEFAULT`
 *       no Postgres 11+ preenche as linhas antigas, e isso carimbaria nos
 *       estabelecimentos anteriores aos Termos um aceite que nunca houve —
 *       prova fabricada. Uma edição futura que "simplifique" juntando os dois
 *       comandos reintroduz exatamente esse defeito, em silêncio;
 *   (c) o default de `termos_versao` é a MESMA versão que o front publica
 *       (`VERSAO_LEGAL`). É o pino que impede a situação mais traiçoeira do
 *       conjunto: o cliente lê a redação 2 na tela e o banco grava que ele
 *       aceitou a 1 — um registro de aceite apontando para o texto errado é
 *       pior do que não ter registro nenhum;
 *   (d) `termos_aceitos_em` carimba a hora do servidor (`now()`), não uma
 *       data vinda do navegador do vendedor;
 *   (e) a migração NÃO cria policy de escrita em `tenants` (ADR-005/008 §7 —
 *       escrita só por RPC SECURITY DEFINER).
 *
 * Não existe Postgres no CI: o que se confere aqui é o TEXTO da migração
 * (mesmo instrumento de isencaoSqlGuard/mensalidadeSqlGuard). A garantia de
 * que a PRODUÇÃO ficou correta é o bloco DO $conf$ no fim da migração, que
 * consulta pg_attribute/pg_attrdef/pg_policies ao vivo.
 */
const MIGRATIONS_DIR = join(__dirname, "../../../supabase/migrations");
const SCHEMA_SQL = join(__dirname, "../../../supabase/schema.sql");
const MIGRACAO = "20260921_aceite_termos_tenant.sql";

/** Linhas de SQL ativo — o comentário explica o bug e não pode ser lido como código. */
function semComentarios(conteudo) {
  return conteudo
    .split(/\r?\n/)
    .filter((linha) => !linha.trim().startsWith("--"))
    .join("\n");
}

const bruto = readFileSync(join(MIGRATIONS_DIR, MIGRACAO), "utf8");
const sql = semComentarios(bruto);
const schema = semComentarios(readFileSync(SCHEMA_SQL, "utf8"));

describe("20260921 — aceite dos Termos de Uso no provisionamento", () => {
  it("cria as duas colunas em tenants", () => {
    expect(sql).toMatch(/ALTER TABLE\s+public\.tenants/i);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS\s+termos_versao\s+text/i);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS\s+termos_aceitos_em\s+timestamptz/i);
  });

  it("não carimba aceite em quem já existe (ADD COLUMN sem DEFAULT)", () => {
    // Recorta cada ADD COLUMN até o fim da declaração daquela coluna: um
    // DEFAULT colado nela backfillaria as linhas antigas.
    const adicoes = [...sql.matchAll(/ADD COLUMN IF NOT EXISTS\s+termos_\w+\s+[^,;]*/gi)].map(([t]) => t);
    expect(adicoes).toHaveLength(2);
    for (const adicao of adicoes) {
      expect(
        adicao,
        `"${adicao.trim()}" traz DEFAULT no ADD COLUMN — isso preenche as linhas antigas e ` +
          "grava aceite em estabelecimento que nunca aceitou. O DEFAULT tem que vir " +
          "num ALTER COLUMN ... SET DEFAULT separado.",
      ).not.toMatch(/DEFAULT/i);
    }
  });

  it("define o default das colunas num segundo comando", () => {
    expect(sql).toMatch(/ALTER COLUMN\s+termos_versao\s+SET DEFAULT/i);
    expect(sql).toMatch(/ALTER COLUMN\s+termos_aceitos_em\s+SET DEFAULT\s+now\(\)/i);
  });

  it("grava a MESMA versão que o front publica", () => {
    const m = sql.match(/ALTER COLUMN\s+termos_versao\s+SET DEFAULT\s+'([^']*)'/i);
    expect(m, "não achei o SET DEFAULT de termos_versao").not.toBeNull();
    expect(
      m[1],
      `A migração grava a versão "${m?.[1]}" e o front publica a "${VERSAO_LEGAL}" ` +
        "(src/lib/legal/versaoLegal.js). O cliente leria um texto e o banco registraria " +
        "outro. Ao publicar redação nova, os dois sobem no mesmo commit.",
    ).toBe(VERSAO_LEGAL);
  });

  it("não abre escrita em tenants", () => {
    expect(sql).not.toMatch(/CREATE POLICY/i);
    expect(sql).not.toMatch(/UPDATE\s+public\.tenants\s+SET/i);
  });

  it("é executável à mão e diz que não mexe em RLS", () => {
    expect(bruto).toMatch(/EXECUÇÃO MANUAL/);
    expect(bruto).toMatch(/^-- RLS:/m);
    expect(sql).toMatch(/DO \$conf\$/);
  });

  it("está descrita no supabase/schema.sql", () => {
    // schema.sql é a única leitura do banco que cabe na cabeça de quem chega
    // (TD016). Coluna que só existe na migração some do mapa.
    expect(schema).toMatch(/termos_versao/);
    expect(schema).toMatch(/termos_aceitos_em/);
  });
});
