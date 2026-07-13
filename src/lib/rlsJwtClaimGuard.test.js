import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

/**
 * Guard de regressão do bug crítico de RLS (20260722_fix_jwt_role_
 * claim_v2.sql): a raiz `role` do JWT é reservada pro role do banco
 * (sempre 'authenticated'); o papel do app só existe em
 * `auth.jwt() -> 'app_metadata' ->> 'gastro_role'`.
 *
 * Migrations são histórico imutável — os arquivos antigos que
 * introduziram o bug (20260701..20260719) continuam no disco com a
 * expressão errada, e é assim que deve ser (não reescrevemos migração
 * já aplicada). O que este guard garante é que a migração corretiva:
 *   (a) existe e roda DEPOIS de todas as que introduziram o bug
 *       (ordem lexicográfica do nome do arquivo = ordem de aplicação);
 *   (b) recria TODA policy/função que apareceu com a expressão errada
 *       nos arquivos antigos, com a expressão corrigida;
 *   (c) não contém, ela mesma, nenhuma linha de SQL ativo (fora de
 *       comentário) com a expressão errada.
 *
 * A garantia definitiva de que a PRODUÇÃO está correta é o bloco
 * DO $$ ... $$ no fim de 20260722_fix_jwt_role_claim_v2.sql, que
 * consulta pg_policies ao vivo e falha a migração se sobrar alguma
 * policy com o claim errado — isso este teste não substitui (só
 * roda contra pg_catalog real, no Supabase).
 */
const MIGRATIONS_DIR = join(__dirname, "../../supabase/migrations");
const SCHEMA_FILE = join(__dirname, "../../supabase/schema.sql");
const MIGRACAO_CORRETIVA = "20260722_fix_jwt_role_claim_v2.sql";
const ARQUIVOS_HISTORICOS_IGNORADOS = [
  "20240107_rls_por_role.sql",
  "20240108_fix_jwt_role_claim.sql",
];
const PADRAO_ERRADO = /auth\.jwt\(\)\s*->>\s*'role'/;
const NOME_POLICY_OU_FUNCAO = /(?:CREATE POLICY "([^"]+)"|FUNCTION public\.(\w+))/;

function linhasDeCodigoComPadraoErrado(conteudo) {
  return conteudo
    .split("\n")
    .filter(linha => !linha.trim().startsWith("--"))
    .filter(linha => PADRAO_ERRADO.test(linha));
}

// Extrai o nome da policy/função mais próxima ACIMA de cada linha com o padrão errado.
function nomesAfetados(conteudo) {
  const linhas = conteudo.split("\n");
  const nomes = new Set();
  let nomeAtual = null;
  for (const linha of linhas) {
    const m = linha.match(NOME_POLICY_OU_FUNCAO);
    if (m) nomeAtual = m[1] || m[2];
    if (!linha.trim().startsWith("--") && PADRAO_ERRADO.test(linha) && nomeAtual) {
      nomes.add(nomeAtual);
    }
  }
  return nomes;
}

describe("RLS — guard do claim de JWT (auth.jwt() ->> 'role')", () => {
  const arquivosMigracoes = readdirSync(MIGRATIONS_DIR).filter(n => n.endsWith(".sql"));

  // Só interessam as migrações que EFETIVAMENTE introduziram o bug (têm o
  // padrão errado em código ativo). Migrações posteriores corretas
  // (20260725+, que já usam app_metadata->>'gastro_role') não entram na
  // comparação de ordem — o guard é sobre "a corretiva roda depois das
  // BUGADAS" (§(a) do cabeçalho), não "é o arquivo mais recente do disco".
  const arquivosComBug = arquivosMigracoes.filter((n) => {
    if (ARQUIVOS_HISTORICOS_IGNORADOS.includes(n) || n === MIGRACAO_CORRETIVA) return false;
    const conteudo = readFileSync(join(MIGRATIONS_DIR, n), "utf8");
    return linhasDeCodigoComPadraoErrado(conteudo).length > 0;
  });

  it("a migração corretiva existe e roda depois de todas as que introduziram o bug", () => {
    expect(arquivosMigracoes).toContain(MIGRACAO_CORRETIVA);
    for (const arquivo of arquivosComBug) {
      expect(MIGRACAO_CORRETIVA >= arquivo).toBe(true);
    }
  });

  it("toda policy/função afetada nos arquivos antigos foi recriada, corrigida, na migração corretiva", () => {
    const conteudoCorretiva = readFileSync(join(MIGRATIONS_DIR, MIGRACAO_CORRETIVA), "utf8");
    const linhasCorretivaComBug = linhasDeCodigoComPadraoErrado(conteudoCorretiva);
    expect(linhasCorretivaComBug).toEqual([]);

    const afetadosEsperados = new Set();
    for (const arquivo of arquivosComBug) {
      const conteudo = readFileSync(join(MIGRATIONS_DIR, arquivo), "utf8");
      for (const nome of nomesAfetados(conteudo)) afetadosEsperados.add(nome);
    }

    // Sanity check: a auditoria original encontrou nomes nesses arquivos.
    expect(afetadosEsperados.size).toBeGreaterThan(0);

    const naoCorrigidos = [...afetadosEsperados].filter(
      nome => !conteudoCorretiva.includes(nome)
    );
    expect(naoCorrigidos).toEqual([]);
  });

  it("supabase/schema.sql não tem SQL ativo com a chave errada (comentários explicando o bug são permitidos)", () => {
    const conteudo = readFileSync(SCHEMA_FILE, "utf8");
    expect(linhasDeCodigoComPadraoErrado(conteudo)).toEqual([]);
    expect(conteudo).toContain("app_metadata' ->> 'gastro_role'");
  });
});
