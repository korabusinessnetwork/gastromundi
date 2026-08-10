import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * Guard das RPCs de LGPD (20260922) — pré-venda §1.5.
 *
 * O que este arquivo protege, e por quê:
 *
 *   (a) as duas funções existem. A partir da primeira venda a plataforma
 *       guarda, por conta de terceiros, o faturamento de um restaurante e o
 *       cadastro dos clientes finais dele; a lei dá ao contratante o direito
 *       de pedir cópia e o de pedir eliminação (art. 18, V e VI). Sem essas
 *       funções não existe caminho nenhum para atender;
 *   (b) as duas são SECURITY DEFINER com `SET search_path`. Sem o
 *       search_path fixo, uma função DEFINER é escalada de privilégio à
 *       espera de um schema plantado no path do chamador;
 *   (c) as duas guardam `is_super_admin()` logo na entrada. Esta é a regra
 *       mais séria do conjunto: sem ela, `authenticated` — ou seja, o admin
 *       de QUALQUER estabelecimento — leria e apagaria os dados de outro,
 *       porque em SECURITY DEFINER o RLS deixa de valer;
 *   (d) o apagamento exige `p_confirmacao` e reconfere no banco. A tela pede
 *       o endereço digitado, mas a tela é opinião do navegador: quem chama a
 *       RPC direto não passa por ela;
 *   (e) o REVOKE vem ANTES do GRANT, nas duas. Invertido, o REVOKE tira o
 *       EXECUTE de `authenticated` também e o Console fica sem as funções;
 *   (f) nenhum DELETE sem WHERE. Um `DELETE FROM public.pedidos;` perdido no
 *       meio de uma varredura dinâmica apaga a base inteira de todos os
 *       clientes — e é justamente o tipo de linha que passa despercebida numa
 *       revisão de 400 linhas de SQL;
 *   (g) a migração NÃO cria policy nem mexe em RLS (ADR-005/008 §7 — escrita
 *       só por RPC SECURITY DEFINER), e diz por escrito que não substitui
 *       `remover_tenant_provisionado` (20260910), que continua sendo a
 *       compensação de provisionamento falho, não eliminação a pedido.
 *
 * Não existe Postgres no CI: o que se confere aqui é o TEXTO da migração
 * (mesmo instrumento de isencaoSqlGuard/aceiteTermosSqlGuard). A garantia de
 * que a PRODUÇÃO ficou correta é o bloco DO $conf$ no fim da migração, que
 * consulta pg_proc/pg_policies e `has_function_privilege` ao vivo.
 */
const MIGRATIONS_DIR = join(__dirname, "../../../supabase/migrations");
const MIGRACAO = "20260922_lgpd_exportar_apagar_tenant.sql";

/** Linhas de SQL ativo — o comentário explica o bug e não pode ser lido como código. */
function semComentarios(conteudo) {
  return conteudo
    .split(/\r?\n/)
    .filter((linha) => !linha.trim().startsWith("--"))
    .join("\n");
}

const bruto = readFileSync(join(MIGRATIONS_DIR, MIGRACAO), "utf8");
const sql = semComentarios(bruto);

/** Recorta o corpo de uma das funções, do CREATE dela até o CREATE seguinte. */
function corpoDa(nome) {
  const inicio = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${nome}`);
  expect(inicio, `não achei o CREATE de ${nome}`).toBeGreaterThan(-1);
  const proximo = sql.indexOf("CREATE OR REPLACE FUNCTION", inicio + 1);
  return sql.slice(inicio, proximo === -1 ? undefined : proximo);
}

const FUNCOES = ["exportar_dados_estabelecimento", "apagar_dados_estabelecimento"];

describe("20260922 — exportar e apagar os dados de um estabelecimento (LGPD)", () => {
  it("cria as duas funções que atendem o pedido do cliente", () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION\s+public\.exportar_dados_estabelecimento\s*\(/i);
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION\s+public\.apagar_dados_estabelecimento\s*\(/i);
  });

  it.each(FUNCOES)("%s é SECURITY DEFINER com search_path fixo", (nome) => {
    const corpo = corpoDa(nome);
    expect(corpo).toMatch(/SECURITY DEFINER/);
    expect(
      corpo,
      `${nome} é SECURITY DEFINER sem SET search_path: roda com os poderes do dono ` +
        "seguindo o schema que o CHAMADOR escolher.",
    ).toMatch(/SET\s+search_path\s*=\s*public/);
  });

  it.each(FUNCOES)("%s recusa quem não é a plataforma", (nome) => {
    const corpo = corpoDa(nome);
    // `IS NOT TRUE` e não `= false`: NULL (JWT sem a claim) tem que barrar
    // igual — lição do 20260730.
    expect(
      corpo,
      `${nome} não tem a guarda is_super_admin() IS NOT TRUE. Sem ela, o admin de ` +
        "um estabelecimento lê ou apaga os dados de outro: em SECURITY DEFINER o RLS " +
        "não vale.",
    ).toMatch(/public\.is_super_admin\(\)\s+IS NOT TRUE/);
    expect(corpo).toMatch(/insufficient_privilege/);
  });

  it("o apagamento exige a confirmação digitada e reconfere no banco", () => {
    const corpo = corpoDa("apagar_dados_estabelecimento");
    expect(corpo).toMatch(/p_confirmacao\s+text/);
    // A tela já pede o endereço digitado, mas a tela é do navegador: quem
    // chama a RPC direto não passa por ela.
    expect(corpo).toMatch(/p_confirmacao[^]*IS DISTINCT FROM/);
    expect(corpo).toMatch(/check_violation/);
  });

  it("nenhum DELETE sem WHERE", () => {
    // Um `DELETE FROM public.pedidos;` perdido aqui apaga a base de TODOS os
    // clientes, não a de um.
    const soltos = [...sql.matchAll(/DELETE FROM\s+[a-z_.%I]+\s*;/gi)].map(([t]) => t);
    expect(
      soltos,
      `DELETE sem WHERE na migração: ${soltos.join(" | ")}. Isso apaga a tabela inteira, ` +
        "de todos os estabelecimentos.",
    ).toHaveLength(0);
  });

  it.each(FUNCOES)("%s revoga de anon ANTES de liberar a authenticated", (nome) => {
    const revoke = sql.search(new RegExp(`REVOKE EXECUTE ON FUNCTION public\\.${nome}`));
    const grant = sql.search(new RegExp(`GRANT\\s+EXECUTE ON FUNCTION public\\.${nome}`));
    expect(revoke, `${nome} sem REVOKE: nasce executável por PUBLIC`).toBeGreaterThan(-1);
    expect(grant, `${nome} sem GRANT: o Console não conseguiria chamá-la`).toBeGreaterThan(-1);
    expect(
      revoke,
      `Em ${nome} o REVOKE vem depois do GRANT — nessa ordem ele tira o EXECUTE de ` +
        "authenticated também, e a função fica inalcançável pelo Console.",
    ).toBeLessThan(grant);
    expect(sql).toMatch(new RegExp(`REVOKE EXECUTE ON FUNCTION public\\.${nome}[^;]*FROM PUBLIC, anon`));
  });

  it("não mexe em RLS nem abre escrita em tenants", () => {
    expect(sql).not.toMatch(/CREATE POLICY/i);
    expect(sql).not.toMatch(/ALTER TABLE[^;]*ENABLE ROW LEVEL SECURITY/i);
  });

  it("diz por escrito que não substitui remover_tenant_provisionado", () => {
    // As duas coisas parecem a mesma e não são: a de 20260910 desfaz um
    // provisionamento que deu errado e RECUSA tenant com usuário ou
    // pagamento — exatamente o caso de um cliente real pedindo eliminação.
    expect(bruto).toMatch(/NÃO substitui `remover_tenant_provisionado`/);
  });

  it("é executável à mão, diz que não mexe em RLS e se confere sozinha", () => {
    expect(bruto).toMatch(/EXECUÇÃO MANUAL/);
    expect(bruto).toMatch(/^-- RLS:/m);
    expect(bruto).toMatch(/^-- PRÉ-REQUISITOS:/m);
    expect(sql).toMatch(/DO \$conf\$/);
  });
});
