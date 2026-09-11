import { describe, it, expect, vi } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

// console.js importa ./supabase (que exige VITE_* no import). Aqui só lemos
// uma constante, então mockamos o módulo — mesmo padrão de console.test.js.
vi.mock("./supabase", async () => {
  const { createMockSupabase } = await import("@/test/mockSupabase");
  return { supabase: createMockSupabase() };
});

import { PERIODOS_ANALYTICS } from "./console";

/**
 * Guard da RPC de saúde da plataforma (F022-SAUDE).
 *
 * Irmão do `analyticsSqlGuard.test.js`, e pela mesma razão: o que este
 * arquivo protege não é um bug, é uma decisão. A ADR-008 (§5, §7, Decisão
 * Fechada v2 nº 2) fechou que o super-admin não lê o dado operacional bruto
 * de todos os tenants. A `20260928` é o escopo explícito por RPC, com o
 * limite de sempre: **ela devolve contagem e a data do mais antigo, nunca a
 * linha do documento.**
 *
 * O caminho de degradação aqui é ainda mais convidativo que o do analytics,
 * porque a tela é de SUPORTE: quem está atendendo um cliente com nota parada
 * quer ver QUAL nota, com qual motivo de recusa, para resolver na hora. É um
 * pedido legítimo e a resposta continua sendo não por esta função — a chave
 * da nota e o `x_motivo` da SEFAZ identificam a venda e o cliente final. Se
 * o suporte precisar disso, o caminho é impersonation escopada a um tenant,
 * que é o outro braço da mesma ADR, não uma coluna a mais aqui.
 *
 * Não há Postgres no CI: o que a PRODUÇÃO ganha é o bloco `DO $conf$` no fim
 * da migração. Este arquivo cobra que ele exista e cubra o que importa.
 */
const MIGRATIONS_DIR = join(__dirname, "../../supabase/migrations");
const MIGRACAO = "20260928_saude_plataforma.sql";
const ASSINATURA = "public.saude_plataforma(integer)";

function ler(arquivo) {
  return readFileSync(join(MIGRATIONS_DIR, arquivo), "utf8");
}

/**
 * Linhas de SQL ativo — comentário `--` explicando a decisão é permitido, e
 * aqui é obrigatório tirar: o cabeçalho desta migração CITA as colunas
 * proibidas para explicar por que elas não estão lá, e sem retirar o
 * comentário a conferência acusaria o próprio texto que a defende
 * (patterns.md — "Conferência textual de SQL"). Os arquivos são CRLF: sem
 * tirar o `\r` toda regex de várias linhas falha.
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
    /CREATE OR REPLACE FUNCTION public\.saude_plataforma\(/.test(semComentarios(ler(n)))
  )
  .sort();

const ultima = definemRpc[definemRpc.length - 1];
const sql = ultima ? semComentarios(ler(ultima)) : "";

describe("Console, guard da saúde da plataforma (F022-SAUDE)", () => {
  it("a migração existe e define a RPC com o parâmetro que o front chama", () => {
    expect(arquivos).toContain(MIGRACAO);
    expect(definemRpc).toContain(MIGRACAO);

    // O nome do parâmetro é contrato com o supabase-js: a chamada manda
    // { p_dias } por nome. Um rename silencioso devolve 42883 na tela.
    const cabecalho = recorte(
      sql,
      "CREATE OR REPLACE FUNCTION public.saude_plataforma(",
      "RETURNS TABLE"
    );
    expect(cabecalho).toMatch(/p_dias integer DEFAULT 30/);
  });

  it("só a plataforma lê a saúde da base, e NULL barra igual a false", () => {
    // `IF NOT public.is_super_admin()` seria furo: a função devolve NULL
    // quando não há claim (20260730), e `NOT NULL` é NULL, que não entra no
    // IF — o gate deixaria passar. Tem de ser `IS NOT TRUE`.
    expect(sql).toMatch(
      /IF public\.is_super_admin\(\) IS NOT TRUE THEN\s+RAISE EXCEPTION[^;]+USING ERRCODE = 'insufficient_privilege';/
    );

    // E a guarda é a PRIMEIRA coisa do corpo — antes da validação de
    // período e antes de qualquer leitura das tabelas operacionais.
    const iGate = sql.indexOf("is_super_admin()");
    const iPeriodo = sql.indexOf("p_dias NOT IN");
    const iFiscal = sql.indexOf("FROM public.nfce_emitidas");
    const iImpressao = sql.indexOf("FROM public.trabalhos_impressao");
    expect(iGate).toBeGreaterThan(0);
    expect(iPeriodo).toBeGreaterThan(iGate);
    expect(iFiscal).toBeGreaterThan(iGate);
    expect(iImpressao).toBeGreaterThan(iGate);
  });

  it("é SECURITY DEFINER, STABLE e com search_path fixo", () => {
    // As duas tabelas só são legíveis pelo próprio tenant: sem o DEFINER
    // esta função devolveria vazio para o super-admin e a tela daria um
    // atestado de saúde a uma base cheia de nota parada.
    const cabecalho = recorte(
      sql,
      "CREATE OR REPLACE FUNCTION public.saude_plataforma(",
      "AS $$"
    );
    expect(cabecalho).toMatch(/LANGUAGE plpgsql/);
    expect(cabecalho).toMatch(/SECURITY DEFINER/);
    expect(cabecalho).toMatch(/SET search_path = public/);
    // Só lê: STABLE também impede que alguém acrescente escrita depois sem
    // perceber que mudou a natureza da função.
    expect(cabecalho).toMatch(/\bSTABLE\b/);
  });

  it("não mexe em policy nenhuma, o caminho proibido pela ADR-008", () => {
    // O atalho seria pôr `OR public.is_super_admin()` no USING da policy de
    // `nfce_emitidas`. Isso entregaria o histórico fiscal de TODOS os
    // clientes a qualquer token de plataforma vazado.
    expect(sql).not.toMatch(/CREATE\s+POLICY/i);
    expect(sql).not.toMatch(/ALTER\s+POLICY/i);
    expect(sql).not.toMatch(/DROP\s+POLICY/i);
    expect(sql).not.toMatch(/ALTER\s+TABLE/i);
    expect(sql).not.toMatch(/OR\s+(public\.)?is_super_admin\(\)/i);
    expect(sql).not.toMatch(/USING\s*\(/i);
  });

  it("devolve agregado, nenhuma coluna identifica um documento", () => {
    const assinatura = recorte(sql, "RETURNS TABLE (", "LANGUAGE plpgsql");

    // As sete, e só elas. Acrescentar coluna que identifique um documento
    // não é melhoria incremental: é trocar a decisão v2 nº 2 por outra.
    const colunas = assinatura
      .split("\n")
      .map((l) => l.trim().replace(/,$/, "").replace(/\s+/g, " "))
      .filter((l) => /^[a-z_]+ [a-z]/.test(l));
    expect(colunas).toEqual([
      "tenant_id uuid",
      "fiscais_recusadas integer",
      "fiscais_paradas integer",
      "fiscal_parada_desde timestamptz",
      "impressoes_com_erro integer",
      "impressoes_paradas integer",
      "impressao_parada_desde timestamptz",
    ]);

    // E a proibição vale para o corpo inteiro, não só para a assinatura:
    // ninguém traz a coluna por dentro para "usar só no cálculo". (O bloco
    // de conferência fica de fora de propósito — é lá que os nomes
    // proibidos aparecem, para o banco cobrar a mesma regra ao vivo.)
    const corpoFuncao = recorte(
      sql,
      "CREATE OR REPLACE FUNCTION public.saude_plataforma(",
      "REVOKE EXECUTE"
    );
    for (const proibida of ["chave", "numero", "venda_id", "protocolo", "x_motivo", "documento"]) {
      expect(corpoFuncao).not.toMatch(new RegExp(proibida));
    }
  });

  it("período conta evento, estado de agora não usa período", () => {
    const corpoFuncao = recorte(
      sql,
      "CREATE OR REPLACE FUNCTION public.saude_plataforma(",
      "REVOKE EXECUTE"
    );

    // Recusa e erro de impressão são EVENTOS: filtram pelo corte.
    expect(corpoFuncao).toMatch(/status = 'rejeitada'\s+AND nf\.created_at >= v_corte/);
    expect(corpoFuncao).toMatch(/status = 'erro'\s+AND ti\.criado_em >= v_corte/);

    // Pendência é ESTADO: conta o que está parado agora, sem corte. Aplicar
    // o período aqui apagaria o caso grave — a nota parada há 60 dias
    // sumiria de uma janela de 30 e a tela diria que está tudo bem.
    expect(corpoFuncao).toMatch(/count\(\*\) FILTER \(WHERE nf\.status = 'pendente'\)/);
    expect(corpoFuncao).toMatch(/count\(\*\) FILTER \(WHERE ti\.status = 'pendente'\)/);
    expect(corpoFuncao).toMatch(/min\(nf\.created_at\) FILTER \(WHERE nf\.status = 'pendente'\)/);
    expect(corpoFuncao).toMatch(/min\(ti\.criado_em\) FILTER \(WHERE ti\.status = 'pendente'\)/);

    // O corte NUNCA pode virar WHERE de linha: com WHERE, quem tem
    // pendência antiga e nenhuma falha recente sumiria do resultado.
    expect(corpoFuncao).not.toMatch(/WHERE nf\.created_at >= v_corte/);
    expect(corpoFuncao).not.toMatch(/WHERE ti\.criado_em >= v_corte/);

    // As duas falhas são independentes: quem só tem pendência de impressão
    // não pode sumir por não ter nenhuma linha em nfce_emitidas.
    expect(corpoFuncao).toMatch(/FULL OUTER JOIN/);
  });

  it("o período é lista fechada no banco, e é a mesma que a tela oferece", () => {
    // Pino contra divergência: a RPC é chamável direto pelo PostgREST com
    // qualquer token `authenticated`, então o front não valida nada de
    // verdade. Se as duas listas divergirem, a tela oferece um botão que o
    // banco recusa com check_violation.
    expect(sql).toMatch(
      /IF p_dias IS NULL OR p_dias NOT IN \([^)]*\) THEN\s+RAISE EXCEPTION[^;]+USING ERRCODE = 'check_violation';/
    );
    const lista = /p_dias NOT IN \(([^)]*)\)/.exec(sql);
    expect(lista).not.toBeNull();
    const aceitos = lista[1].split(",").map((n) => Number(n.trim()));
    expect(aceitos).toEqual(PERIODOS_ANALYTICS);

    expect(sql).not.toMatch(/p_dias\s+BETWEEN/i);
  });

  it("só lê, e lê coluna nomeada", () => {
    expect(sql).not.toMatch(/INSERT INTO/i);
    expect(sql).not.toMatch(/UPDATE public\./i);
    expect(sql).not.toMatch(/DELETE\s+FROM/i);
    // `select *` em tabela sensível é proibido pelo CLAUDE.md — e aqui
    // traria o documento inteiro para dentro de uma função que promete
    // agregado. `count(*)` é agregado, não projeção, e passa.
    expect(sql).not.toMatch(/SELECT\s+\*/i);
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
    // super-admin conseguiria abrir a aba.
    expect(iGrant).toBeGreaterThan(iRevoke);
  });

  it("a conferência ao vivo cobra tudo que quebraria a produção", () => {
    const conferencia = recorte(sql, "DO $conf$", "$conf$;");

    expect(conferencia).toMatch(/to_regprocedure\('public\.saude_plataforma\(integer\)'\)/);
    expect(conferencia).toMatch(/prosecdef/);
    // CREATE OR REPLACE descarta o proconfig em silêncio.
    expect(conferencia).toMatch(/SELECT proconfig INTO v_cfg FROM pg_proc WHERE oid = v_oid;/);
    expect(conferencia).toMatch(/LIKE 'search_path=%'/);
    expect(conferencia).toMatch(/NOT LIKE '%is_super_admin%'/);
    expect(conferencia).toMatch(/has_function_privilege\('anon', v_oid, 'EXECUTE'\)/);
    expect(conferencia).toMatch(
      /NOT has_function_privilege\('authenticated', v_oid, 'EXECUTE'\)/
    );

    // A conferência tira o comentário ANTES de olhar o texto — sem isso ela
    // acusaria o próprio cabeçalho da função, que cita as colunas proibidas
    // para explicar por que não estão lá (patterns.md).
    expect(conferencia).toMatch(/regexp_replace\(v_def, '--\.\*', '', 'gn'\)/);

    // E é ela que segura a decisão v2 nº 2 em produção, não este arquivo.
    expect(conferencia).toMatch(
      /unnest\(ARRAY\['chave', 'numero', 'venda_id', 'protocolo', 'x_motivo', 'documento'\]\)/
    );

    // Conferência que não aborta é decoração.
    const excecoes = conferencia.match(/RAISE EXCEPTION/g) || [];
    expect(excecoes.length).toBeGreaterThanOrEqual(6);

    // Autoteste que ESCREVE em tabela real deixaria lixo em produção.
    expect(conferencia).not.toMatch(/INSERT INTO/i);
    expect(conferencia).not.toMatch(/UPDATE public\./i);
    expect(conferencia).not.toMatch(/DELETE\s+FROM/i);
  });
});
