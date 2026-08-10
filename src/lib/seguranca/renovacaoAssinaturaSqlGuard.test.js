import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

/**
 * Guard de regressão do R7L5 — a renovação da mensalidade é o caminho do
 * dinheiro da plataforma, e ela tinha quatro furos na mesma função.
 *
 * O que estava em produção (`public.confirmar_renovacao_assinatura`,
 * última versão em 20260802_leva16_hardening_rpcs.sql):
 *
 *   (1) o ramo de não-plataforma aceitava `gastro_role IN
 *       ('gerente','admin')` com `p_tenant_id = tenant_atual_id()` — o
 *       admin do estabelecimento renovava a PRÓPRIA assinatura, de graça
 *       e sem limite. A função é concedida a `authenticated` e nenhuma
 *       tela chama essa RPC, então esse ramo nunca foi caminho de uso:
 *       era superfície de ataque pura sobre o portão de receita;
 *   (2) `assinaturas_pagamentos` sem unicidade de (tenant_id,
 *       competencia): confirmar o mesmo mês duas vezes adiantava o
 *       vencimento dois ciclos;
 *   (3) `status = 'ativo'` fixo: renovar um ciclo de quem está meses
 *       atrasado deixava o cache dizendo "ativo" enquanto o app, que
 *       recalcula pela data, seguia bloqueando;
 *   (4) `p_valor` sem validação no banco — pagamento zero ou negativo
 *       entrava e corrompia o MRR do Console.
 *
 * E o quinto, de configuração: a 20260725_fix_search_path_secdef
 * estampou `SET search_path` nas duas funções de assinatura via ALTER
 * FUNCTION, mas a 20260802 as recriou com `CREATE OR REPLACE`, que
 * descarta o `proconfig` — as duas ficaram SECURITY DEFINER com
 * search_path mutável.
 *
 * Não há Postgres no CI, então o que este arquivo garante é o TEXTO da
 * migração (mesmo instrumento de rlsJwtClaimGuard.test.js e
 * consoleAssinaturaSqlGuard.test.js):
 *   (a) a corretiva existe e roda depois de toda versão anterior da RPC;
 *   (b) a versão MAIS RECENTE da RPC só deixa a plataforma renovar, e o
 *       ramo do próprio estabelecimento não voltou;
 *   (c) a cópia por cima é FIEL onde tinha de ser: assinatura de 5
 *       argumentos byte a byte (parâmetro novo criaria sobrecarga e
 *       tornaria a chamada ambígua, 42725), checagem de assinatura
 *       inexistente e as cinco colunas do pagamento;
 *   (d) idempotência de competência: índice único MAIS normalização para
 *       o dia 1 do mês — só o índice não impediria confirmar agosto duas
 *       vezes com dias diferentes;
 *   (e) o status sai de `calcular_status_assinatura`, não é 'ativo' fixo;
 *   (f) `p_valor` é validado no banco;
 *   (g) `SET search_path` na renovação e ALTER na sincronização, que NÃO
 *       é recriada aqui de propósito;
 *   (h) REVOKE antes do GRANT — na ordem inversa o REVOKE de PUBLIC
 *       também tira o EXECUTE de `authenticated`;
 *   (i) as duas conferências ao vivo não escrevem em tabela nenhuma;
 *   (j) o docblock do cliente JS não continua dizendo que gerente/admin
 *       pode renovar.
 *
 * A garantia de que a PRODUÇÃO ficou correta é o bloco DO $conf$ no fim
 * da migração, que consulta pg_proc/pg_get_functiondef/pg_indexes ao
 * vivo — isso este teste não substitui.
 */
const MIGRATIONS_DIR = join(__dirname, "../../../supabase/migrations");
const CORRETIVA = "20260909_renovacao_assinatura_so_plataforma.sql";
const ORIGEM_802 = "20260802_leva16_hardening_rpcs.sql";

const ASSINATURA_FN = "public.confirmar_renovacao_assinatura(uuid, date, numeric, text, text)";

function ler(arquivo) {
  return readFileSync(join(MIGRATIONS_DIR, arquivo), "utf8");
}

/**
 * Linhas de SQL ativo, sem CR — comentário `--` explicando o bug é
 * permitido, e não pode ser confundido com código (as palavras
 * "gerente", "UPDATE" e afins aparecem de propósito nos comentários).
 */
function semComentarios(conteudo) {
  return conteudo
    .split("\n")
    .map((linha) => linha.replace(/\r$/, ""))
    .filter((linha) => !linha.trim().startsWith("--"))
    .join("\n");
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

const definemRenovacao = arquivos
  .filter((n) =>
    /CREATE OR REPLACE FUNCTION public\.confirmar_renovacao_assinatura\(/.test(
      semComentarios(ler(n))
    )
  )
  .sort();

/** O corpo da RPC na versão mais recente — sem comentários. */
function corpoAtual() {
  const ultima = definemRenovacao[definemRenovacao.length - 1];
  return recorte(
    semComentarios(ler(ultima)),
    "CREATE OR REPLACE FUNCTION public.confirmar_renovacao_assinatura(",
    "RETURN v_result;"
  );
}

describe("Assinatura — guard da renovação exclusiva da plataforma (R7L5)", () => {
  it("a corretiva existe e roda depois de toda versão anterior da RPC", () => {
    expect(arquivos).toContain(CORRETIVA);

    // Migration é histórico imutável: o teto não é "depois de todas para
    // sempre" — uma correção futura pode refazer a RPC legitimamente. Que
    // ela continue só da plataforma é o que os testes seguintes cobram,
    // olhando sempre para a última versão.
    const anteriores = definemRenovacao.filter((n) => n < CORRETIVA);
    expect(anteriores).toEqual([
      "20260719_assinaturas.sql",
      "20260722_fix_jwt_role_claim_v2.sql",
      ORIGEM_802,
    ]);
    expect(definemRenovacao[definemRenovacao.length - 1]).toBe(CORRETIVA);
  });

  it("só a plataforma renova: o ramo do próprio estabelecimento não voltou", () => {
    const corpo = corpoAtual();

    expect(corpo).toMatch(/IF public\.is_super_admin\(\) IS NOT TRUE THEN/);
    expect(corpo).toMatch(
      /RAISE EXCEPTION 'Somente a plataforma pode confirmar renovação de assinatura\.'/
    );
    expect(corpo).toMatch(/USING ERRCODE = 'insufficient_privilege'/);

    // Os dois marcadores do ramo antigo: o papel do tenant e o vínculo
    // de tenant que o autorizava.
    expect(corpo).not.toMatch(/gerente/);
    expect(corpo).not.toMatch(/tenant_atual_id\(\)/);
    expect(corpo).not.toMatch(/gastro_role/);
  });

  it("a cópia por cima é fiel: a assinatura de 5 argumentos é byte a byte a da 20260802", () => {
    // Parâmetro novo, mesmo com DEFAULT, criaria SOBRECARGA e faria a
    // chamada de 5 argumentos do cliente virar ambígua (42725).
    const cabecalhoOriginal = recorte(
      semComentarios(ler(ORIGEM_802)),
      "CREATE OR REPLACE FUNCTION public.confirmar_renovacao_assinatura(",
      "RETURNS public.assinaturas"
    );

    expect(semComentarios(ler(CORRETIVA))).toContain(cabecalhoOriginal);
  });

  it("a cópia por cima é fiel: a checagem de assinatura inexistente e as colunas do pagamento continuam", () => {
    const corpo802 = recorte(
      semComentarios(ler(ORIGEM_802)),
      "CREATE OR REPLACE FUNCTION public.confirmar_renovacao_assinatura(",
      "RETURN v_result;"
    );
    const trechoNaoEncontrada = recorte(corpo802, "  IF NOT FOUND THEN", "  END IF;");
    const colunasPagamento =
      "INSERT INTO public.assinaturas_pagamentos (tenant_id, competencia, valor, metodo, confirmado_por)";

    const corpo = corpoAtual();
    expect(corpo).toContain(trechoNaoEncontrada);
    expect(corpo).toContain(colunasPagamento);
    expect(corpo).toMatch(/ultima_renovacao = current_date/);
    expect(corpo).toMatch(/RETURNING \* INTO v_result;/);
  });

  it("a mesma competência não pode ser confirmada duas vezes", () => {
    const sql = semComentarios(ler(CORRETIVA));

    // Índice único (e não constraint) para a migração ser re-executável.
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS assinaturas_pagamentos_competencia_uidx\s*\n\s*ON public\.assinaturas_pagamentos \(tenant_id, competencia\);/
    );

    // Sem normalizar o mês, o índice não impediria confirmar agosto duas
    // vezes com dias diferentes — o furo continuaria aberto.
    const corpo = corpoAtual();
    expect(corpo).toMatch(/v_competencia := date_trunc\('month', p_competencia\)::date;/);
    expect(corpo).toMatch(/VALUES \(p_tenant_id, v_competencia, p_valor, p_metodo, p_confirmado_por\);/);

    // E o erro do catálogo vira frase que a plataforma entende, com o mês
    // escrito como mês (não "2026-08-01").
    expect(corpo).toMatch(/EXCEPTION WHEN unique_violation THEN/);
    expect(corpo).toMatch(
      /RAISE EXCEPTION 'A competência % já foi confirmada para este estabelecimento\.'/
    );
    expect(corpo).toMatch(/to_char\(v_competencia, 'MM\/YYYY'\)/);

    // Dois cliques simultâneos no mesmo estabelecimento serializam.
    expect(corpo).toMatch(
      /PERFORM 1 FROM public\.assinaturas WHERE tenant_id = p_tenant_id FOR UPDATE;/
    );
  });

  it("o índice único não é criado às cegas: duplicata no histórico falha em português", () => {
    const sql = semComentarios(ler(CORRETIVA));

    const posChecagem = sql.indexOf("HAVING count(*) > 1");
    const posIndice = sql.indexOf("CREATE UNIQUE INDEX IF NOT EXISTS assinaturas_pagamentos_competencia_uidx");
    expect(posChecagem).toBeGreaterThanOrEqual(0);
    expect(posIndice).toBeGreaterThan(posChecagem);

    expect(sql).toMatch(
      /RAISE EXCEPTION 'Há % par\(es\) \(estabelecimento, competência\) repetido\(s\) em assinaturas_pagamentos\./
    );
    // A frase existir não basta: ela tem de ser alcançável.
    expect(sql).toMatch(/IF v_dups > 0 THEN/);
  });

  it("o status gravado sai da data nova, não é 'ativo' na fé", () => {
    const corpo = corpoAtual();

    expect(corpo).toMatch(
      /status\s+= public\.calcular_status_assinatura\(\s*\n\s*data_vencimento \+ ciclo_dias, carencia_dias\),/
    );
    // O 'ativo' fixo da 20260802 não pode voltar.
    expect(corpo).not.toMatch(/status\s+= 'ativo'/);
    expect(corpo).toMatch(/data_vencimento\s+= data_vencimento \+ ciclo_dias,/);
  });

  it("p_valor e p_competencia são validados no banco, não só no cliente", () => {
    const corpo = corpoAtual();

    expect(corpo).toMatch(/IF p_valor IS NULL OR p_valor <= 0 THEN/);
    expect(corpo).toMatch(
      /RAISE EXCEPTION 'O valor do pagamento tem de ser maior que zero\.'/
    );
    expect(corpo).toMatch(/IF p_competencia IS NULL THEN/);
    expect(corpo.match(/USING ERRCODE = 'check_violation'/g)).toHaveLength(2);
  });

  it("as duas funções SECURITY DEFINER de assinatura ficam com search_path fixo", () => {
    const sql = semComentarios(ler(CORRETIVA));

    // A de renovação nasce com o SET no próprio CREATE (ALTER depois de
    // CREATE OR REPLACE funciona, mas dentro da definição não há janela).
    const cabecalho = recorte(
      sql,
      "CREATE OR REPLACE FUNCTION public.confirmar_renovacao_assinatura(",
      "AS $$"
    );
    expect(cabecalho).toMatch(/SECURITY DEFINER\nSET search_path = public, auth, extensions/);

    // A de sincronização recebe só o ALTER: recriá-la descartaria o
    // proconfig de novo e arriscaria desfazer o vínculo de tenant da
    // 20260802.
    expect(sql).toMatch(
      /ALTER FUNCTION public\.sincronizar_status_assinatura\(uuid\)\s*\n\s*SET search_path = public, auth, extensions;/
    );
    expect(sql).not.toMatch(/CREATE OR REPLACE FUNCTION public\.sincronizar_status_assinatura/);
  });

  it("REVOKE vem antes do GRANT e anon não fica com EXECUTE", () => {
    const sql = semComentarios(ler(CORRETIVA));

    const posRevoke = sql.indexOf(`REVOKE ALL ON FUNCTION ${ASSINATURA_FN}`);
    const posGrant = sql.indexOf(`GRANT EXECUTE ON FUNCTION ${ASSINATURA_FN}`);
    expect(posRevoke).toBeGreaterThanOrEqual(0);
    expect(posGrant).toBeGreaterThan(posRevoke);

    expect(sql).toMatch(/FROM PUBLIC, anon;/);
    expect(sql).toMatch(/TO authenticated;/);
  });

  it("a conferência ao vivo cobra o que quebraria a produção", () => {
    const sql = semComentarios(ler(CORRETIVA));
    const conf = recorte(sql, "DO $conf$", "$conf$;");

    // Assinatura preservada, portão de plataforma, ramo antigo ausente.
    expect(conf).toContain(`to_regprocedure('${ASSINATURA_FN}')`);
    expect(conf).toMatch(/v_def NOT LIKE '%is_super_admin\(\) IS NOT TRUE%'/);
    expect(conf).toMatch(/v_def LIKE '%gerente%' OR v_def LIKE '%tenant_atual_id\(\)%'/);

    // Idempotência, status derivado e valor validado.
    expect(conf).toMatch(/date_trunc\(''month''/);
    expect(conf).toMatch(/v_def NOT LIKE '%calcular_status_assinatura\(%'/);
    expect(conf).toMatch(/v_def NOT LIKE '%p_valor <= 0%'/);
    expect(conf).toMatch(/indexname\s+= 'assinaturas_pagamentos_competencia_uidx'/);

    // search_path das DUAS funções.
    expect(conf.match(/c LIKE 'search_path=%'/g)).toHaveLength(2);
    // SELECT INTO que não acha linha NÃO limpa a variável — sem este
    // reset a segunda checagem passaria lendo o proconfig da primeira.
    expect(conf).toMatch(/v_cfg := NULL;/);

    // Privilégio.
    expect(conf).toMatch(/IF has_function_privilege\('anon', v_reg, 'EXECUTE'\) THEN/);
    expect(conf).toMatch(/IF NOT has_function_privilege\('authenticated', v_reg, 'EXECUTE'\) THEN/);

    // A função de onde o status passa a sair existe e responde certo.
    expect(conf).toContain("to_regprocedure('public.calcular_status_assinatura(date, integer, date)')");
    expect(conf).toMatch(/calcular_status_assinatura\(current_date \+ 30, 3\) <> 'ativo'/);
    expect(conf).toMatch(/calcular_status_assinatura\(current_date - 10, 3\) <> 'bloqueado'/);
  });

  it("nenhuma das conferências escreve em tabela (não há precedente de self-test que grava)", () => {
    const sql = semComentarios(ler(CORRETIVA));

    for (const tag of ["$dup$", "$conf$"]) {
      const bloco = recorte(sql, `DO ${tag}`, `${tag};`);
      expect(bloco).not.toMatch(/INSERT INTO/);
      expect(bloco).not.toMatch(/\bUPDATE\b/);
      expect(bloco).not.toMatch(/DELETE FROM/);
    }
  });

  it("o cliente JS não continua documentando que gerente/admin renova", () => {
    const lib = readFileSync(join(__dirname, "../console/assinatura.js"), "utf8");

    // O docblock é o que o próximo dev lê antes de construir a tela de
    // renovação: se ele disser gerente/admin, a tela nasce chamando uma
    // RPC que vai negar.
    expect(lib).not.toMatch(/Restrito a gerente\/admin/);
    expect(lib).toMatch(/Restrito à PLATAFORMA/);
  });
});
