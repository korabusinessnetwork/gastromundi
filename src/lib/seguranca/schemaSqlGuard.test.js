import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

/**
 * Guard do TD016 — `supabase/schema.sql` é a única leitura do banco que cabe
 * na cabeça de quem chega no projeto. Quando ele envelhece, ninguém percebe:
 * o código continua rodando contra o banco de verdade e só o documento mente.
 * Foi o que aconteceu entre 2026-07-04 e 2026-08-02 — 28 tabelas nasceram nas
 * migrations, a camada multi-tenant inteira entrou, e o arquivo seguia
 * descrevendo um sistema de um estabelecimento só.
 *
 * O que precisa continuar verdade:
 *
 *   (a) toda tabela criada por uma migration e não derrubada depois está
 *       descrita no `schema.sql` — é o critério 8 do spec, e o que teria
 *       pego as 28 no dia em que a primeira delas nasceu;
 *   (b) tabela derrubada por migration (hoje só `public.logs`, na
 *       `20260706_drop_logs.sql` — a `20260903` também tem um `DROP TABLE`,
 *       mas de uma TEMP TABLE de verificação, que não conta) NÃO continua
 *       descrita — schema que descreve tabela morta manda o próximo dev
 *       escrever query que não roda;
 *   (c) toda tabela isolada por tenant tem `tenant_id` no bloco
 *       `CREATE TABLE` do schema. Isolamento é a coisa mais cara de se
 *       enganar a respeito: um `tenant_id` que o documento não mostra é um
 *       `INSERT` escrito sem ele, que só falha em produção — ou pior, não
 *       falha e grava no tenant errado.
 *
 * De onde sai a lista de "isolada por tenant", já que a `20260724` faz o
 * ALTER dinamicamente dentro de um bloco DO:
 *   1. a variável `<nome> text[] := ARRAY[...]` percorrida por um
 *      `FOREACH ... IN ARRAY <nome>` — é a forma exata da `20260724`
 *      (24 tabelas) e da `20260743` (2 tabelas). O `FOREACH` faz parte do
 *      reconhecimento porque as mesmas migrations usam `ARRAY['nome']` e
 *      `ARRAY['category']` para COMPARAR colunas de constraint, e sem essa
 *      âncora o guard leria nomes de coluna como se fossem tabelas;
 *   2. `ALTER TABLE <t> ADD COLUMN ... tenant_id` literal — a forma da
 *      `20260723` (users), `20260726` (combo_produtos) e `20260813`
 *      (unidades_medida);
 *   3. `CREATE TABLE` que já nasce com a coluna.
 *
 * ── Limites declarados (o guard NÃO cobre) ───────────────────────────────
 * Não existe Postgres no CI: o que este arquivo compara é TEXTO de migration
 * contra TEXTO de schema. Ele não sabe o que o banco tem de fato — se uma
 * migration não foi aplicada em produção, os dois arquivos concordam e o
 * teste passa mesmo assim (é o caso das `20260912`–`20260915` hoje).
 * Também não vê tabela criada dentro de bloco `DO $$`/`EXECUTE format(...)`,
 * porque o nome ali é `%I` em tempo de execução, e não confere coluna a
 * coluna — só a existência da tabela e a do `tenant_id`.
 */
const MIGRATIONS_DIR = join(__dirname, "../../../supabase/migrations");
const SCHEMA_SQL = join(__dirname, "../../../supabase/schema.sql");

/**
 * Linhas de SQL ativo, sem CR (os arquivos do projeto são CRLF) e sem as
 * linhas de comentário — o `schema.sql` cita de propósito, em português, a
 * tabela `public.logs` que foi derrubada e o texto "DROP TABLE"; conferir o
 * arquivo cru daria falso positivo.
 */
function semComentarios(conteudo) {
  return conteudo
    .split("\n")
    .map((linha) => linha.replace(/\r$/, ""))
    .filter((linha) => !linha.trim().startsWith("--"))
    .join("\n");
}

/**
 * `public.` é opcional de propósito: a `20260726` cria `combo_produtos` sem o
 * prefixo, e um guard que exigisse o qualificador repetiria exatamente o
 * ponto cego que deixou essa tabela fora do schema por semanas.
 */
const RE_CREATE = /CREATE TABLE\s+(?:IF NOT EXISTS\s+)?(?:public\.)?"?([a-z_][a-z0-9_]*)"?\s*\(/gi;
const RE_DROP = /DROP TABLE\s+(?:IF EXISTS\s+)?(?:public\.)?"?([a-z_][a-z0-9_]*)"?/gi;
/**
 * `CREATE TEMP TABLE` é tabela de verificação dentro de um bloco `DO $$` — a
 * `20260903` cria e derruba `_numeros` para conferir uma renumeração. O `DROP`
 * dela não pode entrar na lista de derrubadas: essa lista é o que ISENTA uma
 * tabela dos outros três testes, então uma temp table que um dia colida de nome
 * com uma tabela real faria o guard parar de exigir a real, em silêncio.
 */
const RE_CREATE_TEMP = /CREATE\s+(?:TEMP|TEMPORARY)\s+TABLE\s+(?:IF NOT EXISTS\s+)?"?([a-z_][a-z0-9_]*)"?/gi;
const RE_ADD_TENANT =
  /ALTER TABLE\s+(?:IF EXISTS\s+)?(?:ONLY\s+)?(?:public\.)?"?([a-z_][a-z0-9_]*)"?\s+ADD COLUMN\s+(?:IF NOT EXISTS\s+)?tenant_id\b/gi;

/** Corpo entre parênteses de cada `CREATE TABLE`, casando os parênteses. */
function blocosDeTabela(sql) {
  const blocos = new Map();
  const re = new RegExp(RE_CREATE.source, "gi");
  let m;
  while ((m = re.exec(sql))) {
    let i = re.lastIndex;
    let profundidade = 1;
    while (i < sql.length && profundidade > 0) {
      if (sql[i] === "(") profundidade++;
      else if (sql[i] === ")") profundidade--;
      i++;
    }
    if (!blocos.has(m[1])) blocos.set(m[1], sql.slice(m.index, i));
  }
  return blocos;
}

function lerMigrations() {
  return readdirSync(MIGRATIONS_DIR)
    .filter((arquivo) => arquivo.endsWith(".sql"))
    .sort()
    .map((arquivo) => ({ arquivo, sql: semComentarios(readFileSync(join(MIGRATIONS_DIR, arquivo), "utf8")) }));
}

const migrations = lerMigrations();
const schema = semComentarios(readFileSync(SCHEMA_SQL, "utf8"));
const blocosDoSchema = blocosDeTabela(schema);

/** nome -> migration que a criou (a primeira; `IF NOT EXISTS` repetido não conta duas vezes) */
const criadasPorMigration = new Map();
/** nome -> migration que a derrubou */
const derrubadasPorMigration = new Map();
/** nome -> migration que provou o isolamento */
const isoladasPorTenant = new Map();

for (const { arquivo, sql } of migrations) {
  for (const [, nome] of sql.matchAll(new RegExp(RE_CREATE.source, "gi"))) {
    if (!criadasPorMigration.has(nome)) criadasPorMigration.set(nome, arquivo);
  }
  const temporarias = new Set(
    [...sql.matchAll(new RegExp(RE_CREATE_TEMP.source, "gi"))].map(([, nome]) => nome),
  );
  for (const [, nome] of sql.matchAll(new RegExp(RE_DROP.source, "gi"))) {
    if (temporarias.has(nome)) continue;
    derrubadasPorMigration.set(nome, arquivo);
  }

  // (2) ALTER literal
  for (const [, nome] of sql.matchAll(new RegExp(RE_ADD_TENANT.source, "gi"))) {
    if (!isoladasPorTenant.has(nome)) isoladasPorTenant.set(nome, arquivo);
  }

  // (1) ARRAY do bloco DO — só em migration que de fato isola por tenant
  if (/ADD COLUMN IF NOT EXISTS tenant_id/i.test(sql)) {
    for (const [, variavel, corpo] of sql.matchAll(
      /\b([a-z_][a-z0-9_]*)\s+text\s*\[\]\s*:=\s*ARRAY\s*\[([^\]]*)\]/gi,
    )) {
      const percorrida = new RegExp(`FOREACH\\s+[a-z_][a-z0-9_]*\\s+IN\\s+ARRAY\\s+${variavel}\\b`, "i");
      if (!percorrida.test(sql)) continue;
      for (const [, nome] of corpo.matchAll(/'([a-z_][a-z0-9_]*)'/g)) {
        if (!isoladasPorTenant.has(nome)) isoladasPorTenant.set(nome, arquivo);
      }
    }
  }

  // (3) tabela que já nasce com a coluna
  for (const [nome, bloco] of blocosDeTabela(sql)) {
    if (/\btenant_id\b/.test(bloco) && !isoladasPorTenant.has(nome)) isoladasPorTenant.set(nome, arquivo);
  }
}

describe("supabase/schema.sql acompanha supabase/migrations/", () => {
  it("descreve toda tabela criada por migration e não derrubada depois", () => {
    const ausentes = [...criadasPorMigration]
      .filter(([nome]) => !derrubadasPorMigration.has(nome))
      .filter(([nome]) => !blocosDoSchema.has(nome))
      .map(([nome, arquivo]) => `${nome} (criada em ${arquivo})`);

    expect(
      ausentes,
      `Tabela criada por migration e ausente do supabase/schema.sql:\n  ${ausentes.join("\n  ")}\n` +
        "Descreva o bloco CREATE TABLE dela no schema, no formato dos blocos vizinhos.",
    ).toEqual([]);
  });

  it("não descreve tabela que uma migration derrubou", () => {
    const zumbis = [...derrubadasPorMigration]
      .filter(([nome]) => blocosDoSchema.has(nome))
      // recriada depois do DROP por uma migration mais nova continua válida
      .filter(([nome, arquivo]) => !(criadasPorMigration.get(nome) > arquivo))
      .map(([nome, arquivo]) => `${nome} (derrubada em ${arquivo})`);

    expect(
      zumbis,
      `Tabela derrubada por migration mas ainda descrita no supabase/schema.sql:\n  ${zumbis.join("\n  ")}\n` +
        "Remova o bloco CREATE TABLE dela — query escrita contra ela não roda.",
    ).toEqual([]);
  });

  it("mostra tenant_id em toda tabela isolada por tenant", () => {
    const semColuna = [...isoladasPorTenant]
      .filter(([nome]) => !derrubadasPorMigration.has(nome))
      .filter(([nome]) => blocosDoSchema.has(nome))
      .filter(([nome]) => !/\btenant_id\b/.test(blocosDoSchema.get(nome)))
      .map(([nome, arquivo]) => `${nome} (isolada em ${arquivo})`);

    expect(
      semColuna,
      `Tabela isolada por tenant sem a coluna tenant_id no bloco do supabase/schema.sql:\n  ${semColuna.join("\n  ")}\n` +
        "Sem ela no documento, o próximo INSERT nasce sem tenant — e o RLS RESTRICTIVE só reclama em produção.",
    ).toEqual([]);
  });

  it("descreve toda tabela isolada por tenant (isolar o que o schema não conhece é pior)", () => {
    const desconhecidas = [...isoladasPorTenant]
      .filter(([nome]) => !derrubadasPorMigration.has(nome))
      .filter(([nome]) => !blocosDoSchema.has(nome))
      .map(([nome, arquivo]) => `${nome} (isolada em ${arquivo})`);

    expect(
      desconhecidas,
      `Tabela isolada por tenant e ausente do supabase/schema.sql:\n  ${desconhecidas.join("\n  ")}`,
    ).toEqual([]);
  });
});
