import { describe, it, expect, vi } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

// console.js importa ./supabase (que exige VITE_* no import). Aqui só lemos
// uma constante, então mockamos o módulo — mesmo padrão de console.test.js.
vi.mock("../supabase", async () => {
  const { createMockSupabase } = await import("@/test/mockSupabase");
  return { supabase: createMockSupabase() };
});

import { ISENCAO_MAXIMA_ANOS } from "../console/console";

/**
 * Guard de regressão da CORTESIA (20260918) — a plataforma tem que conseguir
 * deixar um estabelecimento sem pagar por um tempo, e só a plataforma.
 *
 * O defeito original: a 20260911 aceita `valor_mensal = 0` de propósito
 * (cortesia, piloto, sócio), mas o status é sempre derivado de
 * `data_vencimento` + `carencia_dias` (ADR-006 §3) e o único caminho que
 * empurra o vencimento é `confirmar_renovacao_assinatura` (20260909), que
 * RECUSA `p_valor <= 0`. Ou seja: dava para registrar que o cliente não paga,
 * mas não para mantê-lo no ar. No 4º dia depois do vencimento as 48 policies
 * RESTRICTIVE de 20260720 fechavam LEITURA E ESCRITA de 12 tabelas na cara
 * dele, e o único conserto era UPDATE cru no SQL Editor, todo mês.
 *
 * Não há Postgres no CI, então o que este arquivo garante é o TEXTO da
 * migração (mesmo instrumento de mensalidadeSqlGuard.test.js):
 *   (a) a migração existe, cria as duas colunas e define a RPC com a
 *       assinatura que o front chama;
 *   (b) `assinatura_ativa()` — o portão que as 48 policies chamam — passou a
 *       olhar `isento_ate`. Sem esta parte a coluna é decoração: o tenant de
 *       cortesia continuaria trancado;
 *   (c) a ORDEM de checagem é a mesma do front (`calcularStatusAssinatura`):
 *       sem linha → cancelado → cortesia → cálculo por data. Trocar cortesia
 *       com cancelado ressuscita quem foi desligado;
 *   (d) a autorização é `is_super_admin() IS NOT TRUE` — NULL barra igual a
 *       false (20260730). Sem esse gate, o admin do próprio estabelecimento se
 *       daria acesso vitalício de graça: o bypass mais valioso do sistema;
 *   (e) SECURITY DEFINER + SET search_path nas DUAS funções (`assinaturas` não
 *       tem policy de UPDATE: sem DEFINER a RPC não escreve nada e ainda
 *       responde sucesso);
 *   (f) recusa data no passado, acima do teto, e exige motivo ao conceder;
 *       `NULL` retira a cortesia e limpa o motivo;
 *   (g) o teto da migração é o MESMO exportado por console.js — sem esse pino,
 *       a tela aceita uma data que o banco recusa (ou o contrário);
 *   (h) a RPC mexe SÓ nas duas colunas novas — tocar em vencimento/status aqui
 *       seria renovação de graça por fora da 20260909;
 *   (i) REVOKE de PUBLIC/anon ANTES do GRANT;
 *   (j) a recusa de `p_valor <= 0` da 20260909 continua exigida pela
 *       conferência — ela é o motivo de esta migração existir, e afrouxá-la
 *       seria o atalho errado.
 *
 * A garantia de que a PRODUÇÃO ficou correta é o bloco DO $conf$ no fim da
 * migração, que consulta pg_proc/pg_get_functiondef ao vivo — isto aqui não
 * substitui aquilo.
 */
const MIGRATIONS_DIR = join(__dirname, "../../../supabase/migrations");
const CORRETIVA = "20260918_assinatura_isencao.sql";
const ASSINATURA = "public.definir_isencao_tenant(uuid, date, text)";

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
    /CREATE OR REPLACE FUNCTION public\.definir_isencao_tenant\(/.test(
      semComentarios(ler(n))
    )
  )
  .sort();

const ultima = definemRpc[definemRpc.length - 1];
const sql = ultima ? semComentarios(ler(ultima)) : "";

/** Corpo do portão de enforcement, isolado da RPC que vem depois. */
const portao = () =>
  recorte(sql, "CREATE OR REPLACE FUNCTION public.assinatura_ativa(", "$$;");

describe("Billing — guard da cortesia (isento_ate)", () => {
  it("a migração existe e define a RPC com a assinatura que o front chama", () => {
    expect(arquivos).toContain(CORRETIVA);
    expect(definemRpc).toContain(CORRETIVA);

    // Os nomes dos parâmetros são contrato com o supabase-js: a chamada manda
    // { p_tenant_id, p_isento_ate, p_motivo } por NOME. Um rename silencioso
    // aqui devolve 42883 na cara do dono.
    const cabecalho = recorte(
      sql,
      "CREATE OR REPLACE FUNCTION public.definir_isencao_tenant(",
      "RETURNS public.assinaturas"
    );
    const parametros = cabecalho
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => /^p_/.test(l));
    expect(parametros).toHaveLength(3);
    expect(parametros[0]).toMatch(/^p_tenant_id\s+uuid,$/);
    expect(parametros[1]).toMatch(/^p_isento_ate\s+date,$/);
    expect(parametros[2]).toMatch(/^p_motivo\s+text DEFAULT NULL$/);
  });

  it("cria as duas colunas de forma idempotente", () => {
    // `isencao_motivo` não é enfeite: sem ele, daqui a um ano ninguém sabe por
    // que aquele estabelecimento não paga — e cortesia vira receita perdida.
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS isento_ate\s+date/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS isencao_motivo text/);
  });

  it("o portão que as policies chamam passou a olhar a cortesia", () => {
    // `assinatura_ativa()` é quem as 48 policies RESTRICTIVE de 20260720
    // chamam. Se a migração só criasse a coluna, o tenant de cortesia seguiria
    // trancado fora das 12 tabelas operacionais e nada na tela explicaria.
    const corpo = portao();
    expect(corpo).toMatch(/SELECT data_vencimento, carencia_dias, status, isento_ate/);
    expect(corpo).toMatch(
      /IF v_isento_ate IS NOT NULL AND current_date <= v_isento_ate THEN\s+RETURN true;/
    );
  });

  it("a ordem de checagem é a mesma do front: sem linha, cancelado, cortesia, data", () => {
    const corpo = portao();
    const iNotFound = corpo.indexOf("IF NOT FOUND THEN");
    const iCancelado = corpo.indexOf("IF v_status_cache = 'cancelado' THEN");
    const iIsento = corpo.indexOf("IF v_isento_ate IS NOT NULL");
    const iCalculo = corpo.indexOf("public.calcular_status_assinatura(");

    expect(iNotFound).toBeGreaterThanOrEqual(0);
    // Cortesia DEPOIS de cancelado: 'cancelado' é estado manual da plataforma
    // ("este cliente saiu") e uma isenção esquecida não pode ressuscitar o
    // acesso de quem foi desligado.
    expect(iCancelado).toBeGreaterThan(iNotFound);
    expect(iIsento).toBeGreaterThan(iCancelado);
    // E ANTES do cálculo por data — que é justamente o que a cortesia ignora.
    expect(iCalculo).toBeGreaterThan(iIsento);

    // Sem isenção vigente, a régua de sempre continua valendo inteira.
    expect(corpo).toMatch(/RETURN v_status IN \('ativo', 'carencia'\);/);
  });

  it("só a plataforma isenta alguém, e NULL barra igual a false", () => {
    // `IF NOT public.is_super_admin()` seria furo: a função devolve NULL
    // quando não há claim (20260730), e `NOT NULL` é NULL, que não entra no
    // IF — o gate deixaria passar e o cliente se daria acesso de graça.
    expect(sql).toMatch(
      /IF public\.is_super_admin\(\) IS NOT TRUE THEN\s+RAISE EXCEPTION[^;]+USING ERRCODE = 'insufficient_privilege';/
    );

    // E a guarda vem ANTES de qualquer escrita.
    const iGate = sql.indexOf("is_super_admin() IS NOT TRUE");
    const iUpdate = sql.indexOf("UPDATE public.assinaturas");
    expect(iGate).toBeGreaterThan(0);
    expect(iUpdate).toBeGreaterThan(iGate);
  });

  it("as duas funções são SECURITY DEFINER com search_path fixo", () => {
    // `assinaturas` não tem policy de UPDATE (20260719/20260726): sem
    // SECURITY DEFINER a RPC não escreveria nada e ainda responderia sucesso,
    // porque o UPDATE filtrado pela RLS simplesmente não acha linha.
    const cabecalhoRpc = recorte(
      sql,
      "CREATE OR REPLACE FUNCTION public.definir_isencao_tenant(",
      "AS $$"
    );
    expect(cabecalhoRpc).toMatch(/LANGUAGE plpgsql/);
    expect(cabecalhoRpc).toMatch(/SECURITY DEFINER/);
    expect(cabecalhoRpc).toMatch(/SET search_path = public/);

    // O portão lê `assinaturas` de dentro de policy: sem DEFINER ele
    // recursaria na própria RLS.
    const cabecalhoPortao = recorte(
      sql,
      "CREATE OR REPLACE FUNCTION public.assinatura_ativa(",
      "AS $$"
    );
    expect(cabecalhoPortao).toMatch(/STABLE/);
    expect(cabecalhoPortao).toMatch(/SECURITY DEFINER/);
    expect(cabecalhoPortao).toMatch(/SET search_path = public/);
  });

  it("recusa data no passado, acima do teto, e exige motivo ao conceder", () => {
    expect(sql).toMatch(
      /IF p_tenant_id IS NULL THEN\s+RAISE EXCEPTION[^;]+USING ERRCODE = 'check_violation';/
    );
    // "Cortesia até ontem" leria na tela como se estivesse valendo.
    expect(sql).toMatch(
      /IF p_isento_ate < current_date THEN\s+RAISE EXCEPTION[^;]+USING ERRCODE = 'check_violation';/
    );
    expect(sql).toMatch(
      /IF p_isento_ate > current_date \+ \(c_teto_anos \* 365\) THEN\s+RAISE EXCEPTION[^;]+USING ERRCODE = 'check_violation';/
    );
    // Motivo obrigatório no BANCO, não só na tela.
    expect(sql).toMatch(
      /IF v_motivo IS NULL OR length\(v_motivo\) < 3 THEN\s+RAISE EXCEPTION[^;]+USING ERRCODE = 'check_violation';/
    );
    // Espaço em branco não é motivo.
    expect(sql).toMatch(/v_motivo := nullif\(btrim\(coalesce\(p_motivo, ''\)\), ''\);/);
  });

  it("a cortesia tem prazo — não existe isenção eterna por booleano", () => {
    // Cortesia sem data vira cliente esquecido operando de graça para sempre:
    // exatamente o buraco que a 20260908 fechou para 'sem assinatura'.
    expect(sql).toMatch(/isento_ate\s+date/);
    expect(sql).not.toMatch(/isento\s+boolean/);
  });

  it("o teto do banco é o mesmo que a tela usa", () => {
    // Pino contra divergência: com dois números soltos, um lado aceita o que o
    // outro recusa e a recusa aparece como erro cru de Postgres na tela.
    const declaracao = /c_teto_anos\s+constant integer := (\d+);/.exec(sql);
    expect(declaracao).not.toBeNull();
    expect(Number(declaracao[1])).toBe(ISENCAO_MAXIMA_ANOS);

    // Folgado para qualquer piloto real, e ainda pega o ano digitado errado.
    expect(ISENCAO_MAXIMA_ANOS).toBeGreaterThanOrEqual(1);
    expect(ISENCAO_MAXIMA_ANOS).toBeLessThanOrEqual(10);
  });

  it("NULL retira a cortesia e limpa o motivo junto", () => {
    // A mesma porta que dá é a que tira: sem isso, retirar cortesia só seria
    // possível pelo SQL Editor — que é o estado que a migração veio consertar.
    // E motivo órfão sugeriria que a cortesia continua valendo.
    expect(sql).toMatch(/ELSE\s+v_motivo := NULL;/);
  });

  it("estabelecimento sem assinatura não recebe sucesso vazio", () => {
    // Um UPDATE que não acha linha não é erro em SQL: sem o IF NOT FOUND a RPC
    // devolveria NULL e o Console fecharia o modal como se tivesse gravado.
    expect(sql).toMatch(/RETURNING \* INTO v_ass;/);
    expect(sql).toMatch(
      /IF NOT FOUND THEN\s+RAISE EXCEPTION[^;]+USING ERRCODE = 'no_data_found';/
    );
  });

  it("mexe só nas colunas da cortesia — não renova nem reprecifica", () => {
    // Empurrar `data_vencimento` aqui seria um ciclo de graça por fora da
    // 20260909, que é justamente quem controla renovação.
    const corpoUpdate = recorte(sql, "UPDATE public.assinaturas", "RETURNING * INTO v_ass;");
    expect(corpoUpdate).toMatch(/SET isento_ate\s+= p_isento_ate/);
    expect(corpoUpdate).toMatch(/isencao_motivo = v_motivo/);
    expect(corpoUpdate).not.toMatch(/status\s*=/);
    expect(corpoUpdate).not.toMatch(/data_vencimento\s*=/);
    expect(corpoUpdate).not.toMatch(/valor_mensal\s*=/);

    // E o UPDATE é de UMA linha: tenant_id é PK, mas sem o WHERE ele isentaria
    // a base inteira de uma vez.
    expect(corpoUpdate).toMatch(/WHERE tenant_id = p_tenant_id/);

    // Nada de escrever em outra tabela nem apagar cobrança.
    expect(sql).not.toMatch(/INSERT INTO/i);
    expect(sql).not.toMatch(/DELETE\s+FROM/i);
    expect(sql).not.toMatch(/UPDATE public\.tenants/);
  });

  it("fecha para o anônimo, e o REVOKE vem antes do GRANT", () => {
    const alvo = ASSINATURA.replace(/[.()]/g, (c) => `\\${c}`);
    const iRevoke = sql.search(new RegExp(`REVOKE ALL ON FUNCTION ${alvo} FROM PUBLIC, anon;`));
    const iGrant = sql.search(
      new RegExp(`GRANT\\s+EXECUTE ON FUNCTION ${alvo} TO authenticated;`)
    );
    expect(iRevoke).toBeGreaterThan(0);
    // Invertido, o REVOKE tiraria o EXECUTE de authenticated também e nem o
    // super-admin conseguiria dar cortesia.
    expect(iGrant).toBeGreaterThan(iRevoke);
  });

  it("a conferência ao vivo cobra tudo que quebraria a produção", () => {
    const conferencia = recorte(sql, "DO $conf$", "$conf$;");

    // Colunas e as duas funções.
    expect(conferencia).toMatch(/column_name IN \('isento_ate', 'isencao_motivo'\)/);
    expect(conferencia).toMatch(/to_regprocedure\('public\.assinatura_ativa\(uuid\)'\)/);
    expect(conferencia).toMatch(
      /to_regprocedure\('public\.definir_isencao_tenant\(uuid, date, text\)'\)/
    );
    expect(conferencia).toMatch(/prosecdef/);
    // CREATE OR REPLACE descarta o proconfig em silêncio.
    expect(conferencia).toMatch(/LIKE 'search_path=%'/);

    // O portão precisa mesmo ter aprendido a cortesia — e não ter esquecido o
    // resto no caminho.
    expect(conferencia).toMatch(/NOT LIKE '%isento_ate%'/);
    expect(conferencia).toMatch(/NOT LIKE '%cancelado%'/);
    expect(conferencia).toMatch(/NOT LIKE '%calcular_status_assinatura\(%'/);
    expect(conferencia).toMatch(/NOT LIKE '%is_super_admin\(\) IS NOT TRUE%'/);

    // Quem pode executar.
    expect(conferencia).toMatch(/has_function_privilege\('anon', v_isen, 'EXECUTE'\)/);
    expect(conferencia).toMatch(
      /NOT has_function_privilege\('authenticated', v_isen, 'EXECUTE'\)/
    );

    // A recusa de pagamento zerado da 20260909 é o motivo desta migração
    // existir: se alguém "resolver" a cortesia afrouxando aquilo, esta
    // conferência tem de gritar.
    expect(conferencia).toMatch(/NOT LIKE '%p_valor <= 0%'/);

    // O dono precisa saber quem já está trancado hoje sem cortesia.
    expect(conferencia).toMatch(/isento_ate IS NULL/);
    expect(conferencia).toMatch(/RAISE NOTICE '/);

    // Conferência que não aborta é decoração.
    const excecoes = conferencia.match(/RAISE EXCEPTION/g) || [];
    expect(excecoes.length).toBeGreaterThanOrEqual(10);

    // Autoteste que ESCREVE em tabela real deixaria lixo em produção.
    expect(conferencia).not.toMatch(/INSERT INTO/i);
    expect(conferencia).not.toMatch(/UPDATE public\./);
    expect(conferencia).not.toMatch(/DELETE\s+FROM/i);
  });
});
