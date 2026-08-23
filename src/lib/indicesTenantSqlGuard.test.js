import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

/**
 * Guard dos índices de `tenant_id` — decisão 002 (multi-tenant por RLS).
 *
 * Com RLS ligada, toda consulta a uma tabela isolada por tenant recebe um
 * `tenant_id = tenant_atual_id()` invisível, colado pelo Postgres. Sem índice
 * nessa coluna o banco só resolve o filtro lendo a tabela inteira e
 * descartando as linhas dos outros estabelecimentos. Com três clientes isso
 * não aparece; com trezentos, é a tela do PDV que demora — e ninguém vai
 * ligar a lentidão a uma tabela que nasceu sem índice meses antes.
 *
 * Este arquivo não testa comportamento: testa que a tabela nova não nasça
 * com esse buraco. Ele cruza duas listas que já existem no repositório:
 *
 *   1. as tabelas que o front-end consulta (`supabase.from("...")`);
 *   2. as tabelas isoladas por tenant (têm coluna `tenant_id` no SQL).
 *
 * Toda tabela nas duas listas precisa ter `tenant_id` no início de ALGUM
 * índice — índice próprio, chave primária ou constraint UNIQUE. "No início"
 * importa: em índice composto o Postgres só usa a coluna se ela for o
 * prefixo, então `(created_at, tenant_id)` não contaria.
 *
 * Fora do alcance de propósito: tabela que só é lida de dentro de RPC pela
 * chave primária (`estoque_baixas_aplicadas`, `estoque_subprodutos`) e tabela
 * sem consulta nenhuma no app. Índice que ninguém usa não é neutro — custa em
 * todo INSERT e UPDATE. O critério aqui é "tem consulta que passa por RLS",
 * não "tem a coluna".
 *
 * Não há Postgres no CI: o que se garante é o texto do SQL versionado, mesmo
 * instrumento dos outros `*SqlGuard.test.js`.
 */

const RAIZ = join(import.meta.dirname, "..", "..");
const MIGRATIONS_DIR = join(RAIZ, "supabase", "migrations");
const SRC_DIR = join(RAIZ, "src");

/** schema.sql + todas as migrations, na ordem em que rodaram. */
function lerTodoSql() {
  let texto = readFileSync(join(RAIZ, "supabase", "schema.sql"), "utf8");
  for (const nome of readdirSync(MIGRATIONS_DIR).filter((n) => n.endsWith(".sql")).sort()) {
    texto += "\n" + readFileSync(join(MIGRATIONS_DIR, nome), "utf8");
  }
  return texto;
}

/** Todo .js/.jsx de produção sob src/ (teste não conta como consulta do app). */
function arquivosDeProducao(dir, acumulado = []) {
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const caminho = join(dir, entrada.name);
    if (entrada.isDirectory()) arquivosDeProducao(caminho, acumulado);
    else if (/\.(js|jsx)$/.test(entrada.name) && !/\.test\./.test(entrada.name)) acumulado.push(caminho);
  }
  return acumulado;
}

const SQL = lerTodoSql();

/** `CREATE TABLE nome (...)` → [nome, corpo]. */
const blocosCreateTable = [...SQL.matchAll(/CREATE TABLE (?:IF NOT EXISTS )?(?:public\.)?([a-z_0-9]+)\s*\(([\s\S]*?)\n\);/g)];

function tabelasConsultadasPeloApp() {
  const nomes = new Set();
  for (const arquivo of arquivosDeProducao(SRC_DIR)) {
    for (const m of readFileSync(arquivo, "utf8").matchAll(/\.from\(\s*["'`]([a-z_0-9]+)["'`]\s*\)/g)) {
      nomes.add(m[1]);
    }
  }
  return nomes;
}

function tabelasIsoladasPorTenant() {
  const nomes = new Set();
  // Nasceu com a coluna.
  for (const [, nome, corpo] of blocosCreateTable) {
    if (/\btenant_id\b/.test(corpo)) nomes.add(nome);
  }
  // Ganhou a coluna depois, uma a uma (20260723, 20260726, 20260813).
  for (const m of SQL.matchAll(/ALTER TABLE (?:IF EXISTS )?(?:public\.)?([a-z_0-9]+)\s+ADD COLUMN (?:IF NOT EXISTS )?tenant_id/g)) {
    nomes.add(m[1]);
  }
  // Ganhou a coluna em lote, pela lista dentro do bloco DO (20260724, 20260743).
  for (const m of SQL.matchAll(/text\[\]\s*:=\s*ARRAY\[([\s\S]*?)\]/g)) {
    for (const item of m[1].matchAll(/'([a-z_0-9]+)'/g)) nomes.add(item[1]);
  }
  return nomes;
}

function tabelasComTenantNoInicioDeAlgumIndice() {
  const nomes = new Set();
  // Índice explícito começando por tenant_id.
  for (const m of SQL.matchAll(/CREATE\s+(?:UNIQUE\s+)?INDEX[^;]*?\sON\s+(?:public\.)?([a-z_0-9]+)\s*\(\s*tenant_id/gi)) {
    nomes.add(m[1]);
  }
  // tenant_id como chave primária da tabela, ou no início de PK/UNIQUE composta.
  for (const [, nome, corpo] of blocosCreateTable) {
    if (/tenant_id[^,\n]*PRIMARY KEY/i.test(corpo) || /(PRIMARY KEY|UNIQUE)\s*\(\s*tenant_id/i.test(corpo)) nomes.add(nome);
  }
  for (const m of SQL.matchAll(/ALTER TABLE (?:IF EXISTS )?(?:public\.)?([a-z_0-9]+)[^;]*?(?:PRIMARY KEY|UNIQUE)\s*\(\s*tenant_id/gi)) {
    nomes.add(m[1]);
  }
  return nomes;
}

const CONSULTADAS = tabelasConsultadasPeloApp();
const COM_TENANT = tabelasIsoladasPorTenant();
const INDEXADAS = tabelasComTenantNoInicioDeAlgumIndice();
const PRECISAM_DE_INDICE = [...CONSULTADAS].filter((t) => COM_TENANT.has(t)).sort();

describe("índices de tenant_id (decisão 002)", () => {
  it("as três listas foram extraídas — se alguma vier vazia, o guard não está guardando nada", () => {
    expect(CONSULTADAS.size).toBeGreaterThan(30);
    expect(COM_TENANT.size).toBeGreaterThan(30);
    expect(INDEXADAS.size).toBeGreaterThan(20);
    expect(PRECISAM_DE_INDICE.length).toBeGreaterThan(30);
  });

  it("toda tabela isolada por tenant e consultada pelo app tem tenant_id no início de algum índice", () => {
    const semIndice = PRECISAM_DE_INDICE.filter((t) => !INDEXADAS.has(t));
    expect(
      semIndice,
      `Sem índice de tenant_id: ${semIndice.join(", ")}. ` +
        "Com RLS ligada, consultar estas tabelas lê a tabela inteira e joga fora as linhas " +
        "dos outros estabelecimentos. Crie o índice numa migration (veja 20260921_indices_tenant_id.sql).",
    ).toEqual([]);
  });

  it("vendas usa o índice composto (tenant_id, at DESC), sem o simples redundante", () => {
    // A consulta real é "as vendas deste estabelecimento, da mais recente para
    // a mais antiga": o composto resolve filtro e ordenação de uma vez.
    expect(SQL).toMatch(/CREATE INDEX IF NOT EXISTS vendas_tenant_at_idx\s*\n?\s*ON public\.vendas \(tenant_id, at DESC\)/);
    // O simples é prefixo do composto — manter os dois só custa escrita na
    // tabela mais quente do sistema.
    expect(SQL).toMatch(/DROP INDEX IF EXISTS public\.vendas_tenant_id_idx/);
  });

  it("a migration de índices é idempotente — ela chega à produção rodada à mão no SQL Editor", () => {
    // Só o SQL que roda — comentário `--` explicando a regra é permitido, e
    // este cabeçalho cita `CREATE INDEX` mais de uma vez em prosa.
    const migration = readFileSync(join(MIGRATIONS_DIR, "20260921_indices_tenant_id.sql"), "utf8")
      .split("\n")
      .filter((linha) => !linha.trim().startsWith("--"))
      .join("\n");
    const criacoes = migration.match(/CREATE INDEX/g) ?? [];
    const idempotentes = migration.match(/CREATE INDEX IF NOT EXISTS/g) ?? [];
    expect(criacoes.length).toBe(idempotentes.length);
    expect(criacoes.length).toBe(9);
  });
});
