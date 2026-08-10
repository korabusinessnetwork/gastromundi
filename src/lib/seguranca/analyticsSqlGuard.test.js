import { describe, it, expect, vi } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

// console.js importa ./supabase (que exige VITE_* no import). Aqui só lemos
// uma constante, então mockamos o módulo — mesmo padrão de console.test.js.
vi.mock("../supabase", async () => {
  const { createMockSupabase } = await import("@/test/mockSupabase");
  return { supabase: createMockSupabase() };
});

import { PERIODOS_ANALYTICS } from "../console/console";

/**
 * Guard da RPC de analytics da plataforma (F022-ANALYTICS).
 *
 * O que este arquivo protege NÃO é um bug — é uma decisão. A ADR-008
 * (§5, §7, Decisão Fechada v2 nº 2) fechou que o super-admin **não** lê o
 * dado operacional bruto de todos os tenants: as policies operacionais não
 * têm o ramo `OR is_super_admin()`, e o Console vê a operação por escopo
 * explícito, via RPC. A `20260912` é esse escopo explícito, com um limite a
 * mais: **ela devolve contagem e soma, nunca uma linha de venda.**
 *
 * O caminho de degradação é conhecido e barato: alguém precisa de "só mais
 * uma coluninha" na tela (o produto mais vendido, a última comanda, o
 * ticket de um cliente), abre a função, acrescenta a coluna, e a decisão v2
 * nº 2 morre num `CREATE OR REPLACE` que ninguém revisa — sem discussão,
 * sem ADR, e sem nada quebrar visivelmente. O que este teste garante:
 *
 *   (a) a migração existe e define a RPC com o parâmetro que o front chama;
 *   (b) a autorização é `is_super_admin() IS NOT TRUE` — NULL barra igual a
 *       false (20260730) — e vem ANTES da consulta. Sem ela, a RPC é um
 *       vazamento cross-tenant chamável por qualquer token `authenticated`,
 *       inclusive o do garçom de um cliente;
 *   (c) SECURITY DEFINER + SET search_path (é o DEFINER que atravessa a RLS
 *       de `vendas`; sem ele a função devolveria vazio calado);
 *   (d) **a migração não cria, altera nem remove policy nenhuma** — o
 *       caminho proibido pela ADR-008 é exatamente pôr `OR is_super_admin()`
 *       na policy de uma tabela operacional;
 *   (e) o `RETURNS TABLE` são quatro colunas de agregado e nenhuma
 *       identifica uma venda;
 *   (f) `p_dias` é lista fechada no BANCO, e a lista é a mesma que a tela
 *       oferece — quem valida de verdade não é o front;
 *   (g) dinheiro sai em centavos inteiros (`numeric` viraria float no JSON);
 *   (h) a função só lê: nada de INSERT/UPDATE/DELETE, nada de `select *`;
 *   (i) REVOKE de PUBLIC/anon ANTES do GRANT a authenticated;
 *   (j) a conferência ao vivo cobra o que quebraria a produção.
 *
 * Não há Postgres no CI: o que a PRODUÇÃO ganha é o bloco `DO $conf$` no fim
 * da migração, que consulta `pg_proc`/`pg_get_functiondef` ao vivo. Este
 * arquivo não substitui aquele bloco — cobra que ele exista e cubra o que
 * importa.
 */
const MIGRATIONS_DIR = join(__dirname, "../../../supabase/migrations");
const CORRETIVA = "20260912_analytics_plataforma.sql";
const ASSINATURA = "public.analytics_plataforma(integer)";

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
    /CREATE OR REPLACE FUNCTION public\.analytics_plataforma\(/.test(semComentarios(ler(n)))
  )
  .sort();

const ultima = definemRpc[definemRpc.length - 1];
const sql = ultima ? semComentarios(ler(ultima)) : "";

describe("Console — guard do analytics da plataforma (F022-ANALYTICS)", () => {
  it("a migração existe e define a RPC com o parâmetro que o front chama", () => {
    expect(arquivos).toContain(CORRETIVA);
    expect(definemRpc).toContain(CORRETIVA);

    // O nome do parâmetro é contrato com o supabase-js: a chamada manda
    // { p_dias } por nome. Um rename silencioso devolve 42883 na tela.
    const cabecalho = recorte(
      sql,
      "CREATE OR REPLACE FUNCTION public.analytics_plataforma(",
      "RETURNS TABLE"
    );
    expect(cabecalho).toMatch(/p_dias integer DEFAULT 30/);
  });

  it("só a plataforma lê o uso da base, e NULL barra igual a false", () => {
    // `IF NOT public.is_super_admin()` seria furo: a função devolve NULL
    // quando não há claim (20260730), e `NOT NULL` é NULL, que não entra no
    // IF — o gate deixaria passar. Tem de ser `IS NOT TRUE`.
    expect(sql).toMatch(
      /IF public\.is_super_admin\(\) IS NOT TRUE THEN\s+RAISE EXCEPTION[^;]+USING ERRCODE = 'insufficient_privilege';/
    );

    // E a guarda é a PRIMEIRA coisa do corpo — antes da validação de
    // período e antes de qualquer leitura de `vendas`.
    const iGate = sql.indexOf("is_super_admin()");
    const iPeriodo = sql.indexOf("p_dias NOT IN");
    const iLeitura = sql.indexOf("FROM public.vendas");
    expect(iGate).toBeGreaterThan(0);
    expect(iPeriodo).toBeGreaterThan(iGate);
    expect(iLeitura).toBeGreaterThan(iGate);
  });

  it("é SECURITY DEFINER, STABLE e com search_path fixo", () => {
    // `vendas` só é legível pelo próprio tenant (20260724): sem o DEFINER
    // esta função devolveria vazio para o super-admin e a tela mostraria
    // "ninguém está vendendo" para uma base inteira que vende.
    const cabecalho = recorte(
      sql,
      "CREATE OR REPLACE FUNCTION public.analytics_plataforma(",
      "AS $$"
    );
    expect(cabecalho).toMatch(/LANGUAGE plpgsql/);
    expect(cabecalho).toMatch(/SECURITY DEFINER/);
    expect(cabecalho).toMatch(/SET search_path = public/);
    // Só lê: STABLE também impede que alguém acrescente escrita depois sem
    // perceber que mudou a natureza da função.
    expect(cabecalho).toMatch(/\bSTABLE\b/);
  });

  it("não mexe em policy nenhuma — o caminho proibido pela ADR-008", () => {
    // O atalho seria `ALTER POLICY ... USING (tenant_id = auth.tenant_id()
    // OR public.is_super_admin())` em `vendas`. Isso entregaria a base de
    // vendas de TODOS os clientes a qualquer token de plataforma vazado —
    // exatamente o raio de exposição que a decisão v2 nº 2 fechou.
    expect(sql).not.toMatch(/CREATE\s+POLICY/i);
    expect(sql).not.toMatch(/ALTER\s+POLICY/i);
    expect(sql).not.toMatch(/DROP\s+POLICY/i);
    expect(sql).not.toMatch(/ALTER\s+TABLE/i);
    // A forma exata do atalho proibido, não a palavra: `is_super_admin()`
    // dentro de um `USING (...)` de policy.
    expect(sql).not.toMatch(/OR\s+(public\.)?is_super_admin\(\)/i);
    expect(sql).not.toMatch(/USING\s*\(/i);
  });

  it("devolve agregado — nenhuma coluna identifica uma venda", () => {
    const assinatura = recorte(sql, "RETURNS TABLE (", "LANGUAGE plpgsql");

    // As quatro, e só elas. Acrescentar coluna que identifique uma venda
    // (id, comanda, mesa, cashier, cliente_id, item, valor unitário) não é
    // melhoria incremental: é trocar a decisão v2 nº 2 por outra, e isso
    // passa por ADR, não por CREATE OR REPLACE.
    const colunas = assinatura
      .split("\n")
      .map((l) => l.trim().replace(/,$/, "").replace(/\s+/g, " "))
      .filter((l) => /^[a-z_]+ [a-z]/.test(l));
    expect(colunas).toEqual([
      "tenant_id uuid",
      "faturamento_centavos bigint",
      "pedidos integer",
      "ultima_venda timestamptz",
    ]);

    // E a proibição vale para o corpo inteiro, não só para a assinatura:
    // ninguém traz a coluna por dentro para "usar só no cálculo". (O bloco
    // de conferência fica de fora de propósito — é lá que os nomes
    // proibidos aparecem, para o banco cobrar a mesma regra ao vivo.)
    const corpoFuncao = recorte(
      sql,
      "CREATE OR REPLACE FUNCTION public.analytics_plataforma(",
      "REVOKE EXECUTE"
    );
    for (const proibida of ["comanda", "cashier", "cliente_id", "mesa", "venda_itens"]) {
      expect(corpoFuncao).not.toMatch(new RegExp(proibida));
    }
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

    // Faixa aberta (`BETWEEN`, `<=`) convidaria a varrer a base inteira por
    // uma URL — o custo da consulta é um passe sobre `vendas`.
    expect(sql).not.toMatch(/p_dias\s+BETWEEN/i);
  });

  it("dinheiro atravessa a fronteira em centavos inteiros", () => {
    // `vendas.total` é numeric: no JSON ele viraria float, e soma de
    // dinheiro em float é como os centavos somem (CLAUDE.md).
    expect(sql).toMatch(/round\(coalesce\(sum\(vd\.total\)/);
    expect(sql).toMatch(/\* 100\)::bigint/);

    // O corte de período é FILTER dentro do agregado, não WHERE: com WHERE,
    // quem não vendeu no período sumiria do resultado e a tela não teria
    // como diferenciar "parou de vender há 60 dias" de "nunca vendeu" — que
    // é justamente a pergunta que a aba existe para responder.
    expect(sql).toMatch(/FILTER \(WHERE vd\.at >= v_corte\)/);
    expect(sql).toMatch(/max\(vd\.at\)/);
    expect(sql).not.toMatch(/WHERE vd\.at >= v_corte\s*$/m);
  });

  it("só lê, e lê coluna nomeada", () => {
    expect(sql).not.toMatch(/INSERT INTO/i);
    expect(sql).not.toMatch(/UPDATE public\./i);
    expect(sql).not.toMatch(/DELETE\s+FROM/i);
    // `select *` em tabela sensível é proibido pelo CLAUDE.md — e aqui
    // traria a venda inteira para dentro de uma função que promete agregado.
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

    expect(conferencia).toMatch(/to_regprocedure\('public\.analytics_plataforma\(integer\)'\)/);
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
    expect(conferencia).toMatch(/unnest\(ARRAY\['comanda', 'cashier', 'cliente_id', 'mesa'\]\)/);

    // Conferência que não aborta é decoração.
    const excecoes = conferencia.match(/RAISE EXCEPTION/g) || [];
    expect(excecoes.length).toBeGreaterThanOrEqual(6);

    // Autoteste que ESCREVE em tabela real deixaria lixo em produção.
    expect(conferencia).not.toMatch(/INSERT INTO/i);
    expect(conferencia).not.toMatch(/UPDATE public\./i);
    expect(conferencia).not.toMatch(/DELETE\s+FROM/i);
  });
});
