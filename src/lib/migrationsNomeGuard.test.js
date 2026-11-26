import { readdirSync } from "fs";
import { join } from "path";
import { describe, it, expect } from "vitest";

/**
 * Guard do NOME das migrations (fase 0.6 do plano de refatoração).
 *
 * O prefixo de 8 dígitos é a versão da migration. A CLI do Supabase grava essa
 * versão em `supabase_migrations.schema_migrations`, e duas migrations com o
 * mesmo prefixo colidem ali: a segunda é tida como já aplicada e nunca roda.
 *
 * O passado não muda. Dez prefixos já se repetem, e julho seguiu contando
 * depois do dia 31 (20260732 a 20260748) como sequência, não como data. Esses
 * arquivos já estão aplicados em produção; renomear qualquer um deles faria o
 * banco achar que existe migration nova para aplicar. Então o guard congela o
 * que existe e só cobra regra do que vier depois:
 *
 * 1. nome no formato `AAAAMMDD_descricao.sql`, em minúsculas;
 * 2. prefixo que seja data de calendário real;
 * 3. prefixo que ninguém mais usa;
 * 4. prefixo maior que o da última migration congelada, para a ordem de
 *    aplicação continuar sendo a ordem alfabética.
 */

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");

// Última migration que existia quando o guard nasceu (2026-11-23).
const ULTIMO_PREFIXO_CONGELADO = "20260928";

// Prefixos que já se repetiam nessa data, com quantos arquivos cada um tem.
// Um arquivo a mais com qualquer um deles é colisão nova e reprova.
// A integração do PR #32 (2026-11-26) trouxe migrations escritas em paralelo à
// main com prefixos que a main já usava (20260918 a 20260928). Entram congeladas
// como as demais: se já rodaram em produção, renomear faria o banco reaplicá-las.
const REPETICOES_CONGELADAS = {
  20260703: 2, 20260724: 4, 20260725: 2, 20260726: 2, 20260728: 2,
  20260731: 2, 20260732: 2, 20260918: 2, 20260919: 3, 20260920: 3,
  20260921: 2, 20260922: 2, 20260923: 2, 20260924: 2, 20260925: 2,
  20260927: 2, 20260928: 2,
};

function dataValida(prefixo) {
  const ano = Number(prefixo.slice(0, 4));
  const mes = Number(prefixo.slice(4, 6));
  const dia = Number(prefixo.slice(6, 8));
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  return d.getUTCFullYear() === ano && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia;
}

export function problemasDeNomeDeMigration(nomes) {
  const problemas = [];
  const porPrefixo = {};
  for (const nome of nomes) {
    const prefixo = nome.slice(0, 8);
    porPrefixo[prefixo] = (porPrefixo[prefixo] ?? 0) + 1;
  }

  for (const nome of nomes) {
    if (!/^\d{8}_[a-z0-9_]+\.sql$/.test(nome)) {
      problemas.push(`${nome}: o nome precisa ser AAAAMMDD_descricao.sql, em minúsculas`);
      continue;
    }
    const prefixo = nome.slice(0, 8);
    if (prefixo <= ULTIMO_PREFIXO_CONGELADO) continue;
    if (!dataValida(prefixo)) problemas.push(`${nome}: ${prefixo} não é uma data de calendário`);
    if (porPrefixo[prefixo] > 1) problemas.push(`${nome}: o prefixo ${prefixo} já é usado por outra migration`);
  }

  for (const [prefixo, total] of Object.entries(porPrefixo)) {
    if (prefixo > ULTIMO_PREFIXO_CONGELADO || total < 2) continue;
    const esperado = REPETICOES_CONGELADAS[prefixo] ?? 1;
    if (total !== esperado) {
      problemas.push(`prefixo ${prefixo}: ${total} arquivos, eram ${esperado}. Migration nova usa data posterior a ${ULTIMO_PREFIXO_CONGELADO}`);
    }
  }
  return problemas;
}

describe("nome das migrations", () => {
  it("as migrations do repositório seguem a regra", () => {
    const nomes = readdirSync(MIGRATIONS_DIR).filter((n) => n.endsWith(".sql"));
    expect(problemasDeNomeDeMigration(nomes)).toEqual([]);
  });

  it("aceita migration nova com data real e prefixo livre", () => {
    expect(problemasDeNomeDeMigration(["20260928_saude_plataforma.sql", "20261124_salvar_combo.sql"])).toEqual([]);
  });

  it("recusa migration nova com prefixo já usado", () => {
    const problemas = problemasDeNomeDeMigration(["20261124_salvar_combo.sql", "20261124_importar_nota.sql"]);
    expect(problemas).toHaveLength(2);
    expect(problemas[0]).toContain("já é usado");
  });

  it("recusa migration nova com data que não existe", () => {
    expect(problemasDeNomeDeMigration(["20261132_salvar_combo.sql"])[0]).toContain("não é uma data");
  });

  it("recusa arquivo a mais num prefixo antigo que já se repetia", () => {
    const nomes = ["20260724_a.sql", "20260724_b.sql", "20260724_c.sql", "20260724_d.sql", "20260724_e.sql"];
    expect(problemasDeNomeDeMigration(nomes)[0]).toContain("5 arquivos, eram 4");
  });

  it("recusa repetição nova num prefixo antigo que era único", () => {
    expect(problemasDeNomeDeMigration(["20260801_a.sql", "20260801_b.sql"])[0]).toContain("2 arquivos, eram 1");
  });

  it("recusa nome fora do formato", () => {
    expect(problemasDeNomeDeMigration(["20261124-Salvar-Combo.sql"])[0]).toContain("AAAAMMDD_descricao.sql");
  });
});
