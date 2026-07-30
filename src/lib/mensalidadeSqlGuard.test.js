import { describe, it, expect, vi } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

// console.js importa ./supabase (que exige VITE_* no import). Aqui só lemos
// uma constante, então mockamos o módulo — mesmo padrão de console.test.js.
vi.mock("./supabase", async () => {
  const { createMockSupabase } = await import("@/test/mockSupabase");
  return { supabase: createMockSupabase() };
});

import { MENSALIDADE_MAXIMA } from "./console";

/**
 * Guard de regressão do R7L8 — a plataforma tem que ter como REGISTRAR o que
 * cobra, e só a plataforma.
 *
 * O defeito original: `assinaturas.valor_mensal` nasce em 0 (20260719, e a
 * partir da 20260908 isso vale para TODO estabelecimento provisionado) e
 * NENHUM caminho do sistema escrevia esse campo. A 20260908 dizia, no próprio
 * corpo, que "o preço é combinado depois, na tela do Console" — e essa tela não
 * existia. O único jeito de registrar o preço era um UPDATE cru no SQL Editor.
 *
 * O dano é de leitura e parece um fato: `resumirPlataforma` soma `valor_mensal`
 * da base que paga, então o cartão "Receita mensal" do Console mostrava
 * R$ 0,00 com clientes reais na base, e nada na tela dizia por quê — não havia
 * como distinguir "não fatura nada" de "nunca perguntamos o preço".
 *
 * Não há Postgres no CI, então o que este arquivo garante é o texto da
 * migração (mesmo instrumento de consoleAssinaturaSqlGuard.test.js e
 * renovacaoAssinaturaSqlGuard.test.js):
 *   (a) a migração existe e define a RPC com a assinatura que o front chama;
 *   (b) a autorização é `is_super_admin() IS NOT TRUE` — NULL barra igual a
 *       false (20260730). Preço é decisão da PLATAFORMA: se o gate cair, o
 *       admin do próprio estabelecimento define quanto ele paga;
 *   (c) SECURITY DEFINER + SET search_path (a tabela não tem policy de UPDATE:
 *       sem DEFINER a RPC não escreve nada);
 *   (d) recusa NULL, negativo e valor acima do teto, e arredonda em centavos;
 *   (e) o teto da migração é o MESMO exportado por src/lib/console.js — sem
 *       este pino, mudar um dos dois deixa a tela aceitando um valor que o
 *       banco recusa (ou o contrário);
 *   (f) `IF NOT FOUND` → erro: estabelecimento sem linha de assinatura não
 *       pode responder sucesso sem ter gravado nada;
 *   (g) a RPC mexe SÓ em valor_mensal — tocar em `status`/`data_vencimento`
 *       aqui viraria renovação de graça por fora da 20260909;
 *   (h) REVOKE de PUBLIC/anon ANTES do GRANT (função nova nasce com EXECUTE
 *       para PUBLIC; o REVOKE depois do GRANT tiraria de authenticated);
 *   (i) a conferência ao vivo cobra o que quebraria a produção.
 *
 * A garantia de que a PRODUÇÃO ficou correta é o bloco DO $conf$ no fim da
 * migração, que consulta pg_proc/pg_get_functiondef ao vivo — isso este teste
 * não substitui.
 */
const MIGRATIONS_DIR = join(__dirname, "../../supabase/migrations");
const CORRETIVA = "20260911_definir_mensalidade_tenant.sql";
const ASSINATURA = "public.definir_mensalidade_tenant(uuid, numeric)";

function ler(arquivo) {
  return readFileSync(join(MIGRATIONS_DIR, arquivo), "utf8");
}

/**
 * Linhas de SQL ativo — comentário `--` explicando o bug é permitido. Os
 * arquivos são CRLF: sem tirar o `\r` toda regex de várias linhas falha.
 */
function semComentarios(conteudo) {
  return conteudo
    .split(/\r?\n/)
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

/** Última migração que (re)define a RPC — é ela que vale em produção. */
const definemRpc = arquivos
  .filter((n) =>
    /CREATE OR REPLACE FUNCTION public\.definir_mensalidade_tenant\(/.test(
      semComentarios(ler(n))
    )
  )
  .sort();

const ultima = definemRpc[definemRpc.length - 1];
const sql = ultima ? semComentarios(ler(ultima)) : "";

describe("Console — guard da mensalidade da plataforma (R7L8)", () => {
  it("a migração existe e define a RPC com a assinatura que o front chama", () => {
    expect(arquivos).toContain(CORRETIVA);
    expect(definemRpc).toContain(CORRETIVA);

    // Os nomes dos parâmetros são contrato com o supabase-js: a chamada
    // manda { p_tenant_id, p_valor } por nome. Um rename silencioso aqui
    // devolve 42883 na cara do dono.
    const cabecalho = recorte(
      sql,
      "CREATE OR REPLACE FUNCTION public.definir_mensalidade_tenant(",
      "RETURNS public.assinaturas"
    );
    const parametros = cabecalho
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => /^p_/.test(l));
    expect(parametros).toHaveLength(2);
    expect(parametros[0]).toMatch(/^p_tenant_id\s+uuid,$/);
    expect(parametros[1]).toMatch(/^p_valor\s+numeric$/);
  });

  it("só a plataforma define preço, e NULL barra igual a false", () => {
    // `IF NOT public.is_super_admin()` seria furo: a função devolve NULL
    // quando não há claim (20260730), e `NOT NULL` é NULL, que não entra no
    // IF — o gate deixaria passar. Tem de ser `IS NOT TRUE`.
    expect(sql).toMatch(
      /IF public\.is_super_admin\(\) IS NOT TRUE THEN\s+RAISE EXCEPTION[^;]+USING ERRCODE = 'insufficient_privilege';/
    );

    // E a guarda vem ANTES de qualquer escrita.
    const iGate = sql.indexOf("is_super_admin()");
    const iUpdate = sql.indexOf("UPDATE public.assinaturas");
    expect(iGate).toBeGreaterThan(0);
    expect(iUpdate).toBeGreaterThan(iGate);
  });

  it("é SECURITY DEFINER com search_path fixo", () => {
    // `assinaturas` não tem policy de UPDATE (20260719/20260726): sem
    // SECURITY DEFINER esta RPC não escreveria nada e ainda responderia
    // sucesso, porque o UPDATE filtrado pela RLS simplesmente não acha linha.
    const cabecalho = recorte(
      sql,
      "CREATE OR REPLACE FUNCTION public.definir_mensalidade_tenant(",
      "AS $$"
    );
    expect(cabecalho).toMatch(/LANGUAGE plpgsql/);
    expect(cabecalho).toMatch(/SECURITY DEFINER/);
    expect(cabecalho).toMatch(/SET search_path = public/);
  });

  it("recusa NULL, negativo e acima do teto, e arredonda em centavos", () => {
    expect(sql).toMatch(
      /IF p_tenant_id IS NULL THEN\s+RAISE EXCEPTION[^;]+USING ERRCODE = 'check_violation';/
    );
    expect(sql).toMatch(
      /IF p_valor IS NULL THEN\s+RAISE EXCEPTION[^;]+USING ERRCODE = 'check_violation';/
    );
    // Negativo viraria receita negativa no cartão da plataforma.
    expect(sql).toMatch(
      /IF p_valor < 0 THEN\s+RAISE EXCEPTION[^;]+USING ERRCODE = 'check_violation';/
    );
    expect(sql).toMatch(
      /IF p_valor > c_teto THEN\s+RAISE EXCEPTION[^;]+USING ERRCODE = 'check_violation';/
    );

    // A coluna é `numeric` SEM escala: sem o round, um valor com 3 casas
    // ficaria gravado diferente do que a tela mostra de volta.
    expect(sql).toMatch(/v_valor := round\(p_valor, 2\);/);
    expect(sql).toMatch(/SET valor_mensal = v_valor/);

    // Zero é permitido de propósito (cortesia/piloto) — se isso virar recusa,
    // a tela oferece uma opção que o banco nega.
    expect(sql).not.toMatch(/IF p_valor <= 0 THEN/);
  });

  it("o teto do banco é o mesmo que a tela usa", () => {
    // Pino contra divergência: com dois números soltos, um lado aceita o que
    // o outro recusa e a recusa aparece como erro cru de Postgres na tela.
    const declaracao = /c_teto\s+constant numeric := (\d+);/.exec(sql);
    expect(declaracao).not.toBeNull();
    expect(Number(declaracao[1])).toBe(MENSALIDADE_MAXIMA);

    // E o teto tem de ser alto o bastante para não atrapalhar cobrança real
    // (o GO_LIVE cobra 300,00) e baixo o bastante para pegar dedo escorregado.
    expect(MENSALIDADE_MAXIMA).toBeGreaterThanOrEqual(10000);
  });

  it("estabelecimento sem assinatura não recebe sucesso vazio", () => {
    // Um UPDATE que não acha linha não é erro em SQL: sem o IF NOT FOUND a
    // RPC devolveria NULL e o Console fecharia o modal como se tivesse
    // gravado — o preço nunca entraria e ninguém saberia.
    expect(sql).toMatch(/RETURNING \* INTO v_ass;/);
    expect(sql).toMatch(
      /IF NOT FOUND THEN\s+RAISE EXCEPTION[^;]+USING ERRCODE = 'no_data_found';/
    );
    const iUpdate = sql.indexOf("UPDATE public.assinaturas");
    const iFound = sql.indexOf("IF NOT FOUND THEN");
    expect(iFound).toBeGreaterThan(iUpdate);
  });

  it("mexe só em valor_mensal — não renova nem desbloqueia por tabela", () => {
    // Tocar em `status`/`data_vencimento` aqui seria renovação de graça por
    // fora da 20260909, que é justamente quem controla renovação.
    const corpoUpdate = recorte(sql, "UPDATE public.assinaturas", "RETURNING * INTO v_ass;");
    expect(corpoUpdate).not.toMatch(/status\s*=/);
    expect(corpoUpdate).not.toMatch(/data_vencimento\s*=/);
    expect(corpoUpdate).not.toMatch(/ultima_renovacao\s*=/);

    // E o UPDATE é de UMA linha: tenant_id é PK em assinaturas, mas sem o
    // WHERE ele reprecificaria a base inteira.
    expect(corpoUpdate).toMatch(/WHERE tenant_id = p_tenant_id/);

    // Nada de escrever em outra tabela nem apagar cobrança.
    expect(sql).not.toMatch(/INSERT INTO/i);
    expect(sql).not.toMatch(/DELETE\s+FROM/i);
    expect(sql).not.toMatch(/UPDATE public\.tenants/);
  });

  it("fecha para o anônimo, e o REVOKE vem antes do GRANT", () => {
    const alvo = ASSINATURA.replace(/[.()]/g, (c) => `\\${c}`);
    const iRevoke = sql.search(
      new RegExp(`REVOKE EXECUTE ON FUNCTION ${alvo} FROM PUBLIC, anon;`)
    );
    const iGrant = sql.search(
      new RegExp(`GRANT\\s+EXECUTE ON FUNCTION ${alvo} TO authenticated;`)
    );
    expect(iRevoke).toBeGreaterThan(0);
    // Invertido, o REVOKE tiraria o EXECUTE de authenticated também e nem o
    // super-admin conseguiria definir preço.
    expect(iGrant).toBeGreaterThan(iRevoke);
  });

  it("a conferência ao vivo cobra tudo que quebraria a produção", () => {
    const conferencia = recorte(sql, "DO $conf$", "$conf$;");

    expect(conferencia).toMatch(
      /to_regprocedure\('public\.definir_mensalidade_tenant\(uuid, numeric\)'\)/
    );
    expect(conferencia).toMatch(/prosecdef/);
    // CREATE OR REPLACE descarta o proconfig em silêncio.
    expect(conferencia).toMatch(/SELECT proconfig INTO v_cfg FROM pg_proc WHERE oid = v_oid;/);
    expect(conferencia).toMatch(/LIKE 'search_path=%'/);
    expect(conferencia).toMatch(/NOT LIKE '%is_super_admin%'/);
    expect(conferencia).toMatch(/has_function_privilege\('anon', v_oid, 'EXECUTE'\)/);
    expect(conferencia).toMatch(
      /NOT has_function_privilege\('authenticated', v_oid, 'EXECUTE'\)/
    );

    // O dono precisa saber quantos estabelecimentos seguem sem preço.
    expect(conferencia).toMatch(/coalesce\(valor_mensal, 0\) <= 0/);
    expect(conferencia).toMatch(/RAISE NOTICE '/);

    // Conferência que não aborta é decoração.
    const excecoes = conferencia.match(/RAISE EXCEPTION/g) || [];
    expect(excecoes.length).toBeGreaterThanOrEqual(6);

    // Autoteste que ESCREVE em tabela real deixaria lixo em produção.
    expect(conferencia).not.toMatch(/INSERT INTO/i);
    expect(conferencia).not.toMatch(/UPDATE public\./);
    expect(conferencia).not.toMatch(/DELETE\s+FROM/i);
  });
});
