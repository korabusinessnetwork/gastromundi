import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

/**
 * Guard de regressão do R7L1 — estabelecimento provisionado pelo Console
 * tem que nascer COM assinatura, e a função que decide o bloqueio tem que
 * existir antes de a primeira linha ser criada.
 *
 * O defeito original: `provisionar_tenant` gravava só em public.tenants.
 * Como `assinatura_ativa()` devolve `true` no caminho NOT FOUND, as 12
 * políticas RESTRICTIVE da 20260720 nunca bloqueavam esse tenant; o
 * Console o classificava como `sem_assinatura`, status que fica fora de
 * `precisamAtencao`; e ele entrava com R$ 0 no MRR. O cliente operava de
 * graça para sempre sem nenhuma tela acusar nada.
 *
 * O agravante: consertar isso ARMA a chamada a
 * `public.calcular_status_assinatura(...)`, que o inventário registrado no
 * cabeçalho da 20260725 dá como ausente em produção. Se estiver ausente
 * mesmo, o 42883 acontece dentro de uma política RESTRICTIVE e derruba
 * todas as operações do estabelecimento. Por isso a corretiva recria a
 * função ANTES de criar qualquer linha.
 *
 * Não há Postgres no CI, então o que este arquivo garante é o texto da
 * migração (mesmo instrumento de rlsJwtClaimGuard.test.js e
 * deliveryEspelhoSqlGuard.test.js):
 *   (a) a corretiva existe e roda depois de toda versão anterior da RPC;
 *   (b) a versão MAIS RECENTE da RPC — hoje a nossa — cria a assinatura;
 *   (c) a cópia por cima é FIEL: o corpo inteiro da 20260803 (autorização,
 *       nome obrigatório, plano válido, laço de slug reservado) aparece
 *       byte a byte dentro da corretiva. Copiar função grande à mão é o
 *       jeito mais fácil de desfazer conserto antigo sem perceber;
 *   (d) a ASSINATURA da função não muda — um parâmetro novo criaria
 *       sobrecarga e a chamada de 4 argumentos do Console viraria ambígua;
 *   (e) o INSERT do billing vem depois do INSERT em tenants (precisa do id)
 *       e é idempotente;
 *   (f) calcular_status_assinatura é recriada com o corpo idêntico ao da
 *       20260719 e com REVOKE antes do GRANT — função criada de zero nasce
 *       com EXECUTE para PUBLIC, inclusive anon;
 *   (g) o backfill alcança só quem está sem assinatura;
 *   (h) a corretiva NÃO recria assinatura_ativa/assinatura_atual_ativa —
 *       `CREATE OR REPLACE` descarta o proconfig e apagaria o search_path
 *       que a 20260725_fix_search_path_secdef estampou nelas;
 *   (i) a conferência ao vivo cobra o que quebraria a produção.
 *
 * A garantia de que a PRODUÇÃO ficou correta é o bloco DO $conf$ no fim da
 * migração, que consulta pg_proc/pg_get_functiondef ao vivo — isso este
 * teste não substitui.
 */
const MIGRATIONS_DIR = join(__dirname, "../../supabase/migrations");
const CORRETIVA = "20260908_provisionar_cria_assinatura.sql";
const ORIGEM_CALC = "20260719_assinaturas.sql";
const ORIGEM_PROV = "20260803_reservar_slug_console.sql";

function ler(arquivo) {
  return readFileSync(join(MIGRATIONS_DIR, arquivo), "utf8");
}

/** Linhas de SQL ativo — comentário `--` explicando o bug é permitido. */
function linhasAtivas(conteudo) {
  return conteudo.split("\n").filter((linha) => !linha.trim().startsWith("--"));
}

function semComentarios(conteudo) {
  return linhasAtivas(conteudo).join("\n");
}

/** Recorta um trecho entre duas âncoras, incluindo as duas. */
function recorte(conteudo, inicio, fim) {
  const i = conteudo.indexOf(inicio);
  expect(i).toBeGreaterThanOrEqual(0);
  const j = conteudo.indexOf(fim, i);
  expect(j).toBeGreaterThan(i);
  return conteudo.slice(i, j + fim.length);
}

const arquivos = readdirSync(MIGRATIONS_DIR).filter((n) => n.endsWith(".sql"));

const definemProvisionar = arquivos
  .filter((n) =>
    /CREATE OR REPLACE FUNCTION public\.provisionar_tenant\(/.test(
      semComentarios(ler(n))
    )
  )
  .sort();

describe("Console — guard do billing no provisionamento (R7L1)", () => {
  it("a corretiva existe e roda depois de toda versão anterior de provisionar_tenant", () => {
    expect(arquivos).toContain(CORRETIVA);

    // Migration é histórico imutável: o teto não é "depois de todas para
    // sempre" — uma correção futura pode refazer a RPC legitimamente. Que
    // ela continue criando a assinatura é o que o teste seguinte cobra,
    // olhando sempre para a última versão.
    const anteriores = definemProvisionar.filter((n) => n < CORRETIVA);
    expect(anteriores.length).toBeGreaterThanOrEqual(5);
    expect(anteriores).toContain(ORIGEM_PROV);
    expect(anteriores).toContain("20260727_provisionar_tenant.sql");
  });

  it("a versão mais recente de provisionar_tenant cria a assinatura do estabelecimento", () => {
    const ultima = definemProvisionar[definemProvisionar.length - 1];
    const sql = semComentarios(ler(ultima));

    expect(sql).toMatch(
      /INSERT INTO public\.assinaturas \(tenant_id, valor_mensal, data_inicio, data_vencimento\)/
    );
    // O id só existe depois do INSERT em tenants com RETURNING.
    expect(sql).toMatch(/VALUES \(v_tenant\.id, 0, current_date, current_date \+ 30\)/);
  });

  it("a cópia por cima é fiel: o corpo inteiro da 20260803 continua ali", () => {
    // Copiar uma função plpgsql grande à mão é o jeito mais fácil de
    // desfazer, sem perceber, um conserto antigo — aqui a guarda de
    // autorização (20260730) e o laço de slug reservado (20260803).
    const corpoOriginal = recorte(
      ler(ORIGEM_PROV),
      "CREATE OR REPLACE FUNCTION public.provisionar_tenant(",
      "RETURNING * INTO v_tenant;"
    );
    expect(corpoOriginal.length).toBeGreaterThan(1500);
    expect(ler(CORRETIVA)).toContain(corpoOriginal);
  });

  it("a assinatura da função não muda — sobrecarga tornaria a chamada do Console ambígua", () => {
    const sql = semComentarios(ler(CORRETIVA));

    // Os 4 parâmetros da 20260803, nessa ordem, e nada além deles.
    const cabecalho = recorte(
      sql,
      "CREATE OR REPLACE FUNCTION public.provisionar_tenant(",
      "RETURNS public.tenants"
    );
    const parametros = cabecalho
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => /^p_/.test(l));
    expect(parametros).toHaveLength(4);
    expect(parametros[0]).toMatch(/^p_nome\s+text,$/);
    expect(parametros[3]).toMatch(/^p_tema\s+jsonb DEFAULT/);

    // E os GRANT/REVOKE têm de citar exatamente essa assinatura, senão
    // apontam para uma função que não existe e o fechamento não acontece.
    expect(sql).toMatch(
      /REVOKE EXECUTE ON FUNCTION public\.provisionar_tenant\(text, text, text, jsonb\) FROM PUBLIC, anon;/
    );
    expect(sql).toMatch(
      /GRANT\s+EXECUTE ON FUNCTION public\.provisionar_tenant\(text, text, text, jsonb\) TO authenticated;/
    );
  });

  it("o INSERT do billing é idempotente e nomeia as colunas", () => {
    const sql = semComentarios(ler(CORRETIVA));

    // Chamar a RPC duas vezes para o mesmo tenant não pode estourar a PK
    // e derrubar o cadastro inteiro no meio.
    expect(sql).toMatch(
      /VALUES \(v_tenant\.id, 0, current_date, current_date \+ 30\)\s+ON CONFLICT \(tenant_id\) DO NOTHING;/
    );
    // `INSERT ... VALUES` sem lista de colunas quebra na primeira coluna
    // nova da tabela.
    expect(sql).not.toMatch(/INSERT INTO public\.assinaturas\s+VALUES/);

    // Ordem: tenants primeiro (é dele que vem o id).
    const iTenants = sql.indexOf("INSERT INTO public.tenants (");
    const iAssin = sql.indexOf("INSERT INTO public.assinaturas (tenant_id, valor_mensal");
    expect(iTenants).toBeGreaterThan(0);
    expect(iAssin).toBeGreaterThan(iTenants);
  });

  it("calcular_status_assinatura é recriada igual à 20260719 e fechada para o anônimo", () => {
    const blocoOriginal = recorte(
      ler(ORIGEM_CALC),
      "CREATE OR REPLACE FUNCTION public.calcular_status_assinatura(",
      "$$;"
    );
    expect(blocoOriginal).toContain("ELSE 'bloqueado'");
    expect(ler(CORRETIVA)).toContain(blocoOriginal);

    const sql = semComentarios(ler(CORRETIVA));
    // Se a função NÃO existia, o CREATE acabou de nascer com EXECUTE para
    // PUBLIC (inclusive anon) — o REVOKE da 20260802 tem de ser reaplicado,
    // e antes do GRANT.
    const iRevoke = sql.search(
      /REVOKE EXECUTE ON FUNCTION public\.calcular_status_assinatura\(date, integer, date\) FROM PUBLIC, anon;/
    );
    const iGrant = sql.search(
      /GRANT\s+EXECUTE ON FUNCTION public\.calcular_status_assinatura\(date, integer, date\) TO authenticated;/
    );
    expect(iRevoke).toBeGreaterThan(0);
    expect(iGrant).toBeGreaterThan(iRevoke);
  });

  it("o backfill alcança só quem está sem assinatura e não mexe em quem já tem", () => {
    const sql = semComentarios(ler(CORRETIVA));

    expect(sql).toMatch(
      /INSERT INTO public\.assinaturas \(tenant_id, valor_mensal, data_inicio, data_vencimento\)\s+SELECT t\.id, 0, current_date, current_date \+ 30\s+FROM public\.tenants t\s+WHERE NOT EXISTS \(\s+SELECT 1 FROM public\.assinaturas a WHERE a\.tenant_id = t\.id\s+\)/
    );

    // Nada de reescrever vencimento de quem já é cliente pagante, e nada
    // de apagar linha de cobrança.
    expect(sql).not.toMatch(/UPDATE public\.assinaturas/);
    expect(sql).not.toMatch(/DELETE\s+FROM/i);

    // E o dono precisa saber quantos foram regularizados.
    expect(sql).toMatch(/GET DIAGNOSTICS v_qtd = ROW_COUNT;/);
    expect(sql).toMatch(/RAISE NOTICE 'Assinatura criada para %/);
  });

  it("não recria assinatura_ativa nem assinatura_atual_ativa", () => {
    // `CREATE OR REPLACE FUNCTION` DESCARTA o proconfig da função: recriar
    // qualquer uma das duas aqui apagaria o `SET search_path = public` que
    // a 20260725_fix_search_path_secdef estampou via ALTER FUNCTION, e
    // ambas são SECURITY DEFINER usadas dentro de política RESTRICTIVE.
    const sql = semComentarios(ler(CORRETIVA));
    expect(sql).not.toMatch(/CREATE OR REPLACE FUNCTION public\.assinatura_ativa/);
    expect(sql).not.toMatch(/CREATE OR REPLACE FUNCTION public\.assinatura_atual_ativa/);
    expect(sql).not.toMatch(/CREATE OR REPLACE FUNCTION public\.sincronizar_status_assinatura/);
  });

  it("a conferência ao vivo cobra tudo que quebraria a produção", () => {
    const sql = semComentarios(ler(CORRETIVA));
    const conferencia = recorte(sql, "DO $conf$", "$conf$;");

    // A função do bloqueio existe e responde os três estados.
    expect(conferencia).toMatch(
      /to_regprocedure\('public\.calcular_status_assinatura\(date, integer, date\)'\)/
    );
    expect(conferencia).toMatch(/<> 'ativo' THEN/);
    expect(conferencia).toMatch(/<> 'carencia' THEN/);
    expect(conferencia).toMatch(/<> 'bloqueado' THEN/);

    // Nenhuma das duas ficou executável pelo anônimo.
    expect(conferencia).toMatch(/has_function_privilege\('anon', v_oid_calc, 'EXECUTE'\)/);
    expect(conferencia).toMatch(/has_function_privilege\('anon', v_oid_prov, 'EXECUTE'\)/);

    // Sobrecarga de provisionar_tenant pararia o cadastro (42725).
    expect(conferencia).toMatch(/p\.proname = 'provisionar_tenant'\) <> 1 THEN/);

    // A função em produção realmente cria a assinatura e manteve as guardas.
    expect(conferencia).toMatch(/NOT LIKE '%INSERT INTO public\.assinaturas%'/);
    expect(conferencia).toMatch(/NOT LIKE '%slug_reservado%'/);
    expect(conferencia).toMatch(/NOT LIKE '%is_super_admin%'/);
    expect(conferencia).toMatch(/p\.prosecdef/);
    expect(conferencia).toMatch(/proconfig @> ARRAY\['search_path=public'\]/);

    // E ninguém ficou fora da cobrança depois do backfill.
    expect(conferencia).toMatch(
      /SELECT 1 FROM public\.tenants t\s+WHERE NOT EXISTS \(SELECT 1 FROM public\.assinaturas a WHERE a\.tenant_id = t\.id\)/
    );

    // Conferência que não aborta é decoração.
    const excecoes = conferencia.match(/RAISE EXCEPTION 'R7L1:/g) || [];
    expect(excecoes.length).toBeGreaterThanOrEqual(10);
  });
});
