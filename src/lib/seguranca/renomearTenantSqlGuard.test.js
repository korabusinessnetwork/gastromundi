import { describe, it, expect, vi } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

// console.js importa ./supabase (que exige VITE_* no import). Aqui só lemos
// uma constante, então mockamos o módulo — mesmo padrão de console.test.js.
vi.mock("../supabase", async () => {
  const { createMockSupabase } = await import("@/test/mockSupabase");
  return { supabase: createMockSupabase() };
});

import { MAX_NOME_TENANT } from "../console/console";

/**
 * Guard de regressão do RENOMEAR (20260919) — a plataforma cadastra um
 * estabelecimento e precisa conseguir corrigir o nome que digitou.
 *
 * O defeito original: `tenants` é SELECT-only sob RLS (ADR-005/008 §7) e as
 * três RPCs existentes tocam outra coisa cada uma (plano, layout, identidade
 * do próprio admin). Ninguém escrevia `tenants.nome`, então um erro de
 * digitação no cadastro ficava para sempre — na lista do Console, no texto de
 * primeiro acesso copiado para o cliente e em todo relatório da plataforma —
 * com o SQL Editor como único conserto.
 *
 * Não há Postgres no CI, então o que este arquivo garante é o TEXTO da
 * migração (mesmo instrumento de isencaoSqlGuard.test.js):
 *   (a) a migração existe e define a RPC com a assinatura que o front chama;
 *   (b) a autorização é `is_super_admin() IS NOT TRUE` — NULL barra igual a
 *       false (20260730) — e vem ANTES de qualquer escrita. Sem esse gate, o
 *       admin de um estabelecimento renomearia o vizinho;
 *   (c) SECURITY DEFINER + SET search_path (sem DEFINER o UPDATE não acha
 *       linha sob a RLS e a RPC responde sucesso sem gravar nada);
 *   (d) valida a entrada antes de escrever, e o teto é o MESMO que a tela usa;
 *   (e) o UPDATE toca UMA coluna e carrega WHERE — sem ele, um clique
 *       renomearia a base inteira;
 *   (f) o SLUG nunca é escrito. Ele é o subdomínio E o namespace de e-mail do
 *       Auth (20260803): trocá-lo quebra o link do cardápio já entregue, os QR
 *       codes impressos e a porta de entrada da equipe;
 *   (g) REVOKE de PUBLIC/anon ANTES do GRANT.
 *
 * A garantia de que a PRODUÇÃO ficou correta é o bloco DO $conf$ no fim da
 * migração, que consulta pg_proc/pg_get_functiondef ao vivo — isto aqui não
 * substitui aquilo.
 */
const MIGRATIONS_DIR = join(__dirname, "../../../supabase/migrations");
const CORRETIVA = "20260919_renomear_tenant_console.sql";
const ASSINATURA = "public.renomear_tenant(uuid, text)";

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
    /CREATE OR REPLACE FUNCTION public\.renomear_tenant\(/.test(semComentarios(ler(n)))
  )
  .sort();

const ultima = definemRpc[definemRpc.length - 1];
const sql = ultima ? semComentarios(ler(ultima)) : "";

describe("Console — guard do renomear estabelecimento", () => {
  it("a migração existe e define a RPC com a assinatura que o front chama", () => {
    expect(arquivos).toContain(CORRETIVA);
    expect(definemRpc).toContain(CORRETIVA);

    // Os nomes dos parâmetros são contrato com o supabase-js: a chamada manda
    // { p_tenant_id, p_nome } por NOME. Um rename silencioso aqui devolve
    // 42883 ("function does not exist") na cara do dono.
    const cabecalho = recorte(
      sql,
      "CREATE OR REPLACE FUNCTION public.renomear_tenant(",
      "RETURNS public.tenants"
    );
    const parametros = cabecalho
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => /^p_/.test(l));
    expect(parametros).toHaveLength(2);
    expect(parametros[0]).toMatch(/^p_tenant_id uuid,$/);
    expect(parametros[1]).toMatch(/^p_nome\s+text$/);
  });

  it("só a plataforma renomeia, e NULL barra igual a false", () => {
    // `IF NOT public.is_super_admin()` seria furo: a função devolve NULL
    // quando não há claim (20260730), e `NOT NULL` é NULL, que não entra no
    // IF — o gate deixaria passar e o admin de um tenant renomearia o vizinho.
    expect(sql).toMatch(
      /IF public\.is_super_admin\(\) IS NOT TRUE THEN\s+RAISE EXCEPTION[^;]+USING ERRCODE = 'insufficient_privilege';/
    );

    // E a guarda vem ANTES de qualquer escrita.
    const iGate = sql.indexOf("is_super_admin() IS NOT TRUE");
    const iUpdate = sql.indexOf("UPDATE public.tenants");
    expect(iGate).toBeGreaterThan(0);
    expect(iUpdate).toBeGreaterThan(iGate);
  });

  it("é SECURITY DEFINER com search_path fixo", () => {
    // `tenants` não tem policy de UPDATE: sem SECURITY DEFINER o UPDATE não
    // acha linha nenhuma sob a RLS e a RPC responde sucesso sem gravar nada.
    const cabecalho = recorte(
      sql,
      "CREATE OR REPLACE FUNCTION public.renomear_tenant(",
      "AS $$"
    );
    expect(cabecalho).toMatch(/LANGUAGE plpgsql/);
    expect(cabecalho).toMatch(/SECURITY DEFINER/);
    expect(cabecalho).toMatch(/SET search_path = public/);
  });

  it("valida a entrada antes de escrever", () => {
    expect(sql).toMatch(
      /IF p_tenant_id IS NULL THEN\s+RAISE EXCEPTION[^;]+USING ERRCODE = 'check_violation';/
    );
    // Espaço em branco não é nome — e o btrim vem antes de medir, para que
    // "   " caia na recusa de vazio e não na de tamanho mínimo.
    expect(sql).toMatch(/v_nome := nullif\(btrim\(coalesce\(p_nome, ''\)\), ''\);/);
    expect(sql).toMatch(
      /IF v_nome IS NULL THEN\s+RAISE EXCEPTION[^;]+USING ERRCODE = 'check_violation';/
    );
    expect(sql).toMatch(
      /IF length\(v_nome\) < c_min_nome THEN\s+RAISE EXCEPTION[^;]+USING ERRCODE = 'check_violation';/
    );
    expect(sql).toMatch(
      /IF length\(v_nome\) > c_max_nome THEN\s+RAISE EXCEPTION[^;]+USING ERRCODE = 'check_violation';/
    );
  });

  it("o teto do banco é o mesmo que a tela usa", () => {
    // Pino contra divergência: com dois números soltos, a tela deixa digitar o
    // que o banco recusa e a recusa aparece como erro cru de Postgres.
    const declaracao = /c_max_nome constant integer := (\d+);/.exec(sql);
    expect(declaracao).not.toBeNull();
    expect(Number(declaracao[1])).toBe(MAX_NOME_TENANT);
  });

  it("mexe só no nome — e com WHERE", () => {
    const corpoUpdate = recorte(sql, "UPDATE public.tenants", "RETURNING * INTO v_tenant;");
    expect(corpoUpdate).toMatch(/SET nome = v_nome/);
    expect(corpoUpdate).toMatch(/WHERE id = p_tenant_id/);
    // Plano e tema têm RPC própria (20260729/20260801): um UPDATE largo aqui
    // apagaria o trabalho delas sem ninguém notar.
    expect(corpoUpdate).not.toMatch(/plano_codigo\s*=/);
    expect(corpoUpdate).not.toMatch(/tema\s*=/);

    // Nada de escrever em outra tabela nem apagar registro.
    expect(sql).not.toMatch(/INSERT INTO/i);
    expect(sql).not.toMatch(/DELETE\s+FROM/i);
    expect(sql).not.toMatch(/UPDATE public\.assinaturas/);
  });

  it("o endereço (slug) nunca é escrito", () => {
    // O slug é o subdomínio E o namespace de e-mail do Auth (20260803):
    // trocá-lo quebra na hora o link do cardápio já entregue ao cliente, os QR
    // codes impressos e a porta de entrada da equipe. Fica travado até existir
    // redirecionamento do endereço antigo.
    // Só o CORPO da função: a conferência ao vivo cita `slug =` de propósito,
    // justamente para recusar uma edição futura que o escrevesse.
    const corpo = recorte(sql, "CREATE OR REPLACE FUNCTION public.renomear_tenant(", "$$;");
    expect(corpo).not.toMatch(/slug\s*=/);
    expect(corpo).not.toMatch(/p_slug/);
  });

  it("estabelecimento inexistente não recebe sucesso vazio", () => {
    // Um UPDATE que não acha linha não é erro em SQL: sem o IF NOT FOUND a RPC
    // devolveria NULL e o Console fecharia o modal como se tivesse gravado.
    expect(sql).toMatch(/RETURNING \* INTO v_tenant;/);
    expect(sql).toMatch(
      /IF NOT FOUND THEN\s+RAISE EXCEPTION[^;]+USING ERRCODE = 'no_data_found';/
    );
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
    // super-admin conseguiria renomear.
    expect(iGrant).toBeGreaterThan(iRevoke);
  });

  it("a conferência ao vivo cobra tudo que quebraria a produção", () => {
    const conferencia = recorte(sql, "DO $conf$", "$conf$;");

    expect(conferencia).toMatch(/to_regprocedure\('public\.renomear_tenant\(uuid, text\)'\)/);
    expect(conferencia).toMatch(/prosecdef/);
    // CREATE OR REPLACE descarta proconfig em silêncio — a conferência olha.
    expect(conferencia).toMatch(/search_path=%/);
    expect(conferencia).toMatch(/is_super_admin/);
    expect(conferencia).toMatch(/slug/);
    expect(conferencia).toMatch(/WHERE id = p_tenant_id/);
    expect(conferencia).toMatch(/has_function_privilege\('anon'/);
    expect(conferencia).toMatch(/has_function_privilege\('authenticated'/);

    // Toda checagem falha ALTO — sem RAISE, a conferência vira decoração.
    const checagens = conferencia.match(/RAISE EXCEPTION/g) ?? [];
    expect(checagens.length).toBeGreaterThanOrEqual(8);
  });
});
