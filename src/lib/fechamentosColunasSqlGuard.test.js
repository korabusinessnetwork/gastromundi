import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { esperadoEmCaixa, diferencaCaixa } from "./caixa";

/**
 * Guard das colunas geradas de `fechamentos` (A6).
 *
 * O fechamento de caixa era um `data jsonb` inteiro: o app lia e mostrava na
 * tela, mas o banco não enxergava nada dentro. A migration 20260924 projeta
 * os valores em colunas GENERATED ALWAYS AS ... STORED, para o fechamento
 * virar consultável sem criar um segundo caminho de escrita.
 *
 * O risco que este arquivo cobre é o silencioso: coluna gerada com expressão
 * diferente da conta do app não dá erro nenhum — só passa a responder outro
 * número. Aí o relatório da tela e a consulta no banco contam histórias
 * diferentes sobre o mesmo dia de caixa. Não há Postgres no CI, então aqui
 * se garante o texto da migration, o espelho em `supabase/schema.sql`, e que
 * a regra escrita no SQL é a mesma que `src/lib/caixa.js` executa.
 */

const RAIZ = join(import.meta.dirname, "..", "..");
const MIGRATION = readFileSync(
  join(RAIZ, "supabase", "migrations", "20260924_fechamentos_colunas.sql"),
  "utf8",
);
const SCHEMA = readFileSync(join(RAIZ, "supabase", "schema.sql"), "utf8");

/** Só o SQL que roda — o cabeçalho cita nomes de coluna em prosa. */
const semComentarios = (conteudo) =>
  conteudo
    .split("\n")
    .map((linha) => linha.replace(/\r$/, ""))
    .filter((linha) => !linha.trim().startsWith("--"))
    .join("\n");

const SQL = semComentarios(MIGRATION);
const SCHEMA_SQL = semComentarios(SCHEMA);

/** Corpo do CREATE TABLE de fechamentos, casando os parênteses. */
const BLOCO_FECHAMENTOS = (() => {
  const abre = SCHEMA_SQL.search(/CREATE TABLE (?:public\.)?fechamentos\s*\(/);
  if (abre < 0) return "";
  let i = SCHEMA_SQL.indexOf("(", abre) + 1;
  let profundidade = 1;
  while (i < SCHEMA_SQL.length && profundidade > 0) {
    if (SCHEMA_SQL[i] === "(") profundidade++;
    else if (SCHEMA_SQL[i] === ")") profundidade--;
    i++;
  }
  return SCHEMA_SQL.slice(abre, i);
})();

const COLUNAS = [
  "usuario_nome",
  "usuario_papel",
  "fundo",
  "total_vendas",
  "total_esperado",
  "total_conferido",
  "diferenca",
  "conferido_por_metodo",
  "observacao",
];

describe("migration 20260924 — fechamento de caixa consultável", () => {
  it("cria as colunas que respondem as perguntas de conferência", () => {
    for (const coluna of COLUNAS) {
      expect(
        SQL,
        `A coluna ${coluna} não é adicionada pela migration.`,
      ).toMatch(new RegExp(`ADD COLUMN IF NOT EXISTS ${coluna}\\b`));
    }
  });

  it("deixa o banco calcular tudo, para não existir número gravado duas vezes", () => {
    // Se qualquer uma virar coluna comum, o app passa a ter de gravá-la — e
    // no dia em que a gravação esquecer um campo, tela e relatório divergem.
    for (const coluna of COLUNAS) {
      const trecho = SQL.slice(SQL.indexOf(`ADD COLUMN IF NOT EXISTS ${coluna}`));
      expect(
        trecho.slice(0, trecho.indexOf(";")),
        `A coluna ${coluna} precisa ser GENERATED ALWAYS AS ... STORED.`,
      ).toMatch(/GENERATED ALWAYS AS[\s\S]*STORED/);
    }
    expect(SQL).toMatch(/is_generated <> 'ALWAYS'/);
  });

  it("testa o tipo do JSON antes de converter, para payload torto não travar o caixa", () => {
    // Coluna gerada é calculada no insert: um cast que estoura impede a
    // gravação do fechamento inteiro, com o operador preso na tela.
    const casts = [...SQL.matchAll(/\(data ->> '(\w+)'\)::numeric/g)].map((m) => m[1]);
    expect(casts.length).toBeGreaterThan(0);
    for (const campo of new Set(casts)) {
      expect(
        SQL,
        `O cast de ${campo} para numeric não é protegido por jsonb_typeof.`,
      ).toMatch(new RegExp(`jsonb_typeof\\(data -> '${campo}'\\) = 'number'`));
    }
  });

  it("não inventa coluna de data — created_at do banco já é melhor que o relógio do caixa", () => {
    expect(SQL).not.toMatch(/ADD COLUMN IF NOT EXISTS (fechado_em|data_fechamento)/);
  });

  it("indexa só o caixa que não bateu, que é a linha que alguém vai procurar", () => {
    expect(SQL).toMatch(/CREATE INDEX IF NOT EXISTS fechamentos_tenant_diferenca_idx/);
    expect(SQL).toMatch(/WHERE diferenca <> 0/);
  });

  it("tem autoteste que confere a conta, não só a existência das colunas", () => {
    expect(SQL).toMatch(/DO \$conf\$/);
    expect(SQL).toMatch(/FALHA: coluna\(s\) não criada\(s\) em fechamentos/);
    expect(SQL).toMatch(/FALHA: a conta do fechamento saiu errada/);
  });
});

describe("a conta do SQL é a mesma de src/lib/caixa.js", () => {
  // O autoteste da migration usa um fechamento antigo (sem `totalEsperado`)
  // para exercitar justamente o fallback, que é a parte que dá para errar.
  // Aqui o mesmo exemplo passa pelas funções do app: se as duas contas
  // divergirem, uma das duas está errada e este teste diz qual exemplo usar
  // para reproduzir.
  const EXEMPLO = { totalVendas: 80.0, fundo: 20.0, totalConferido: 90.0 };

  it("o exemplo do autoteste bate com esperadoEmCaixa e diferencaCaixa", () => {
    expect(esperadoEmCaixa(EXEMPLO)).toBe(100.0);
    expect(diferencaCaixa(EXEMPLO)).toBe(-10.0);
  });

  it("o autoteste da migration cobra exatamente esses valores", () => {
    expect(SQL).toMatch(/"totalVendas": 80\.00, "fundo": 20\.00, "totalConferido": 90\.00/);
    expect(SQL).toMatch(/v_esperado <> 100\.00 OR v_diferenca <> -10\.00/);
  });

  it("o fallback do esperado existe no SQL porque existe no app", () => {
    // esperadoEmCaixa cai para totalVendas + fundo quando o fechamento é
    // anterior ao campo totalEsperado. Sem esse COALESCE no SQL, todo caixa
    // antigo apareceria na consulta como se tivesse sobrado o valor inteiro.
    expect(esperadoEmCaixa({ totalVendas: 50, fundo: 10 })).toBe(60);
    expect(esperadoEmCaixa({ totalEsperado: 42, totalVendas: 50, fundo: 10 })).toBe(42);
    expect(SQL).toMatch(/COALESCE\(\s*CASE WHEN jsonb_typeof\(data -> 'totalEsperado'\) = 'number'/);
  });
});

describe("supabase/schema.sql descreve as colunas geradas", () => {
  it("lista todas elas no CREATE TABLE", () => {
    expect(BLOCO_FECHAMENTOS).not.toBe("");
    for (const coluna of COLUNAS) {
      expect(
        BLOCO_FECHAMENTOS,
        `${coluna} não aparece no CREATE TABLE de fechamentos — o schema é o que o próximo dev lê antes de escrever query.`,
      ).toMatch(new RegExp(`^\\s+${coluna}\\s`, "m"));
    }
  });

  it("descreve os valores como numeric com precisão, igual à migration", () => {
    for (const coluna of ["fundo", "total_vendas", "total_esperado", "total_conferido", "diferenca"]) {
      const linha = BLOCO_FECHAMENTOS.split("\n").find((l) => new RegExp(`^\\s+${coluna}\\s`).test(l));
      expect(linha, `${coluna} deveria ser numeric(12,2) no schema.`).toMatch(/numeric\(12,2\)/);
    }
  });

  it("mostra o índice parcial junto da tabela", () => {
    expect(SCHEMA_SQL).toMatch(/CREATE INDEX fechamentos_tenant_diferenca_idx/);
  });
});
