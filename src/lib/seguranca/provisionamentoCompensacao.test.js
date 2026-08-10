import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  compensarProvisionamento,
  removerCredencialOrfa,
} from "../../../supabase/functions/_shared/provisionamento.ts";

/**
 * R7L6 — a compensação do provisionamento de estabelecimento tinha parado de
 * funcionar, e ninguém era avisado.
 *
 * A Edge Function `provisionar-estabelecimento` promete no cabeçalho "Nunca
 * deixa meio-usuário": se a credencial do admin (item 5) ou o perfil (item 6)
 * falharem depois do tenant criado, ela desfaz tudo. As duas compensações
 * descartavam o resultado:
 *
 *     await supabaseAdmin.from("tenants").delete().eq("id", tenant.id);
 *     await supabaseAdmin.auth.admin.deleteUser(authCreated.user.id);
 *
 * E desde a 20260908 (R7L1) a primeira falhava SEMPRE: o tenant nasce com
 * linha em `public.assinaturas`, cuja FK para `tenants(id)` não tem ON DELETE
 * CASCADE, então o delete cru devolvia 23503 — sem leitor. Todo
 * provisionamento que falhasse depois do item 3 deixava um ESTABELECIMENTO
 * ÓRFÃO: sem nenhum usuário para entrar nele, mas com assinatura, vencimento e
 * valor, contando na "Receita mensal" do Console e no bloco de atenção. O
 * caminho de falha mais provável é o que o próprio index.ts chama de
 * "esperado" (colisão de e-mail com TENANT_ROOT_DOMAIN desligado), então os
 * órfãos se acumulavam a cada nova tentativa do dono.
 *
 * Este arquivo tem duas metades, com instrumentos diferentes:
 *
 *   (A) COMPORTAMENTO — `supabase/functions/_shared/provisionamento.ts` foi
 *       extraído do index.ts justamente para poder ser executado aqui: recebe
 *       os clientes por parâmetro e não toca em nada do Deno. Os testes
 *       exercitam o defeito real (erro da compensação virando aviso em vez de
 *       silêncio) chamando a função.
 *
 *   (B) TEXTO — o index.ts chama `Deno.serve` no topo e importa de URL, então
 *       nenhum teste consegue carregá-lo; e não há Postgres no CI para a
 *       migração. Para essas duas partes o instrumento é o mesmo dos outros
 *       guards do repositório (rlsJwtClaimGuard, consoleAssinaturaSqlGuard):
 *       ler o arquivo e afirmar sobre o texto. A garantia de que a PRODUÇÃO
 *       ficou correta é o bloco DO $conf$ no fim da migração, que consulta
 *       pg_proc/pg_get_functiondef ao vivo — isto não substitui aquilo.
 */

const RAIZ = join(__dirname, "../../..");
const MIGRACAO = join(RAIZ, "supabase/migrations/20260910_remover_tenant_provisionado.sql");
const BORDA = join(RAIZ, "supabase/functions/provisionar-estabelecimento/index.ts");

function semComentariosSql(conteudo) {
  return conteudo
    .split("\n")
    .map((linha) => linha.replace(/\r$/, ""))
    .filter((linha) => !linha.trim().startsWith("--"))
    .join("\n");
}

// O cabeçalho do index.ts CITA o delete cru que foi removido; sem tirar os
// comentários, a asserção de que ele não existe mais passaria a falhar por
// causa da própria documentação.
function semComentariosTs(conteudo) {
  return conteudo
    .split("\n")
    .map((linha) => linha.replace(/\r$/, ""))
    .filter((linha) => {
      const t = linha.trim();
      return !(t.startsWith("//") || t.startsWith("*") || t.startsWith("/*") || t.startsWith("*/"));
    })
    .join("\n");
}

function recorte(conteudo, inicio, fim) {
  const i = conteudo.indexOf(inicio);
  expect(i).toBeGreaterThanOrEqual(0);
  const j = conteudo.indexOf(fim, i);
  expect(j).toBeGreaterThan(i);
  return conteudo.slice(i, j + fim.length);
}

const sql = semComentariosSql(readFileSync(MIGRACAO, "utf8"));
const borda = semComentariosTs(readFileSync(BORDA, "utf8"));

// ── (A) Comportamento da compensação ──────────────────────────────────────

describe("compensarProvisionamento", () => {
  let erros;

  beforeEach(() => {
    erros = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    erros.mockRestore();
  });

  it("remove o tenant pela RPC (não por DELETE em tenants) e não devolve aviso", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    const aviso = await compensarProvisionamento({ rpc }, { id: "t9", nome: "Bar do Zé", slug: "bar-do-ze" });

    expect(aviso).toBe("");
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("remover_tenant_provisionado", { p_tenant_id: "t9" });
    expect(erros).not.toHaveBeenCalled();
  });

  it("o furo original: erro da compensação vira aviso nomeando o estabelecimento, nunca silêncio", async () => {
    // 23503 é exatamente o que o DELETE cru passou a receber desde a 20260908.
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "23503", message: 'update or delete on table "tenants" violates foreign key constraint' },
    });

    const aviso = await compensarProvisionamento({ rpc }, { id: "t9", nome: "Bar do Zé", slug: "bar-do-ze" });

    expect(aviso).not.toBe("");
    expect(aviso).toContain("Bar do Zé");
    expect(aviso).toContain("bar-do-ze");
    expect(aviso).toContain("NÃO pôde ser removido automaticamente");
    expect(aviso).toContain("foreign key constraint");
    expect(erros).toHaveBeenCalled();
  });

  it("recusa da RPC (estabelecimento com usuário) também chega como aviso", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "23514", message: "O estabelecimento t9 tem 1 usuário(s) e NÃO foi removido" },
    });

    const aviso = await compensarProvisionamento({ rpc }, { id: "t9", nome: "Bar do Zé", slug: "bar-do-ze" });

    expect(aviso).toContain("tem 1 usuário(s)");
  });

  it("queda de rede no meio da compensação não derruba a função nem some", async () => {
    const rpc = vi.fn().mockRejectedValue(new Error("Failed to fetch"));

    const aviso = await compensarProvisionamento({ rpc }, { id: "t9", nome: "Bar do Zé", slug: "bar-do-ze" });

    expect(aviso).toContain("Bar do Zé");
    expect(aviso).toContain("Failed to fetch");
    expect(erros).toHaveBeenCalled();
  });

  it("erro sem mensagem não produz aviso com 'undefined' na tela do Console", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: {} });

    const aviso = await compensarProvisionamento({ rpc }, { id: "t9", nome: "Bar do Zé", slug: "bar-do-ze" });

    expect(aviso).not.toBe("");
    expect(aviso).not.toContain("undefined");
    expect(aviso).toContain("o banco não disse o motivo");
  });

  it("tenant sem nome/slug ainda é identificável no aviso", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: "sem permissão" } });

    const aviso = await compensarProvisionamento({ rpc }, { id: "t9" });

    expect(aviso).not.toContain("undefined");
    expect(aviso).toContain("t9");
  });
});

describe("removerCredencialOrfa", () => {
  let erros;

  beforeEach(() => {
    erros = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    erros.mockRestore();
  });

  it("apaga a credencial e não devolve aviso", async () => {
    const deleteUser = vi.fn().mockResolvedValue({ data: null, error: null });
    const aviso = await removerCredencialOrfa({ auth: { admin: { deleteUser } } }, "u1", "ze@bar.local");

    expect(aviso).toBe("");
    expect(deleteUser).toHaveBeenCalledWith("u1");
    expect(erros).not.toHaveBeenCalled();
  });

  it("o outro furo: falha ao apagar a credencial vira aviso — senão o e-mail fica ocupado em silêncio", async () => {
    const deleteUser = vi.fn().mockResolvedValue({ data: null, error: { message: "User not allowed" } });
    const aviso = await removerCredencialOrfa({ auth: { admin: { deleteUser } } }, "u1", "ze@bar.local");

    expect(aviso).toContain("ze@bar.local");
    expect(aviso).toContain("NÃO pôde ser removido automaticamente");
    expect(aviso).toContain("User not allowed");
    expect(erros).toHaveBeenCalled();
  });

  it("exceção do Admin API não escapa da compensação", async () => {
    const deleteUser = vi.fn().mockRejectedValue(new Error("socket hang up"));
    const aviso = await removerCredencialOrfa({ auth: { admin: { deleteUser } } }, "u1", "ze@bar.local");

    expect(aviso).toContain("socket hang up");
  });
});

// ── (B) Texto da função de borda ──────────────────────────────────────────

describe("provisionar-estabelecimento/index.ts", () => {
  it("não desfaz mais o tenant com DELETE cru em tenants", () => {
    expect(borda).not.toMatch(/from\("tenants"\)\s*\.delete\(\)/);
    expect(borda).not.toMatch(/\.from\("tenants"\)/);
  });

  it("as duas compensações passam pelos helpers testáveis", () => {
    expect(borda).toMatch(
      /import \{ compensarProvisionamento, removerCredencialOrfa \} from "\.\.\/_shared\/provisionamento\.ts";/
    );
    expect(borda.match(/await compensarProvisionamento\(/g)).toHaveLength(2);
    expect(borda.match(/await removerCredencialOrfa\(/g)).toHaveLength(1);
  });

  it("a compensação usa o JWT do chamador, não o service_role — com a chave de serviço is_super_admin() reprova", () => {
    expect(borda).toMatch(/compensarProvisionamento\(supabaseCaller, tenant\)/);
    expect(borda).not.toMatch(/compensarProvisionamento\(supabaseAdmin/);
  });

  it("o aviso da compensação entra na mensagem devolvida ao Console nos dois caminhos", () => {
    // O fim do recorte é "400);" e não "}": o `}` de `${motivo}` cortaria o
    // bloco no meio.
    const trechoAuth = recorte(borda, "if (eAuth || !authCreated?.user) {", "400);");
    expect(trechoAuth).toMatch(/const aviso = await compensarProvisionamento\(supabaseCaller, tenant\);/);
    expect(trechoAuth).toMatch(/json\(\{ error: `\$\{motivo\}\$\{aviso\}` \}, 400\)/);

    const trechoPerfil = recorte(borda, "if (ePerfil) {", "400);");
    expect(trechoPerfil).toMatch(/const avisoAuth = await removerCredencialOrfa\(supabaseAdmin, authCreated\.user\.id, email\);/);
    expect(trechoPerfil).toMatch(/const aviso = await compensarProvisionamento\(supabaseCaller, tenant\);/);
    expect(trechoPerfil).toMatch(/json\(\{ error: `\$\{motivo\}\$\{avisoAuth\}\$\{aviso\}` \}, 400\)/);
  });

  it("a credencial sai antes do tenant — enquanto ela existir o e-mail segue ocupado", () => {
    const trechoPerfil = recorte(borda, "if (ePerfil) {", "400);");
    expect(trechoPerfil.indexOf("removerCredencialOrfa")).toBeLessThan(
      trechoPerfil.indexOf("compensarProvisionamento")
    );
  });
});

// ── (B) Texto da migração ─────────────────────────────────────────────────

describe("20260910_remover_tenant_provisionado.sql", () => {
  it("define a RPC com boolean, plpgsql, SECURITY DEFINER e search_path fixo", () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.remover_tenant_provisionado\(p_tenant_id uuid\)/);
    const corpo = recorte(sql, "CREATE OR REPLACE FUNCTION public.remover_tenant_provisionado(", "RETURN true;");
    expect(corpo).toMatch(/RETURNS boolean/);
    expect(corpo).toMatch(/LANGUAGE plpgsql/);
    expect(corpo).toMatch(/SECURITY DEFINER\nSET search_path = public, auth, extensions/);
  });

  it("só a plataforma remove", () => {
    expect(sql).toMatch(/IF public\.is_super_admin\(\) IS NOT TRUE THEN/);
    expect(sql).toMatch(/Somente a plataforma pode remover um estabelecimento provisionado\./);
    expect(sql).toMatch(/USING ERRCODE = 'insufficient_privilege'/);
    // A guarda tem de ser fail-closed: NOT COALESCE/IS NOT TRUE, nunca NOT expr.
    expect(sql).not.toMatch(/IF NOT public\.is_super_admin\(\) THEN/);
  });

  it("recusa remover estabelecimento que tenha usuário, e a recusa é alcançável", () => {
    expect(sql).toMatch(/SELECT count\(\*\) INTO v_users\n\s+FROM public\.users\n\s+WHERE tenant_id = p_tenant_id;/);
    expect(sql).toMatch(/IF v_users > 0 THEN/);
    expect(sql).toMatch(/usuário\(s\) e NÃO foi removido: isto não é um provisionamento falho\./);
  });

  it("recusa remover estabelecimento com pagamento registrado, e a recusa é alcançável", () => {
    expect(sql).toMatch(/SELECT count\(\*\) INTO v_pagamentos\n\s+FROM public\.assinaturas_pagamentos\n\s+WHERE tenant_id = p_tenant_id;/);
    expect(sql).toMatch(/IF v_pagamentos > 0 THEN/);
    expect(sql).toMatch(/histórico financeiro não se apaga\./);
    expect(sql.match(/USING ERRCODE = 'check_violation'/g)).toHaveLength(3);
  });

  it("trava a linha do tenant ANTES de contar — senão há janela entre a contagem e o DELETE", () => {
    expect(sql).toMatch(/PERFORM 1 FROM public\.tenants WHERE id = p_tenant_id FOR UPDATE;/);
    expect(sql.indexOf("FOR UPDATE;")).toBeLessThan(sql.indexOf("INTO v_users"));
  });

  it("apaga a assinatura semeada pelo provisionamento ANTES do tenant", () => {
    const iAssinatura = sql.indexOf("DELETE FROM public.assinaturas WHERE tenant_id = p_tenant_id;");
    const iTenant = sql.indexOf("DELETE FROM public.tenants WHERE id = p_tenant_id;");
    expect(iAssinatura).toBeGreaterThan(0);
    expect(iTenant).toBeGreaterThan(iAssinatura);
  });

  it("vínculo desconhecido falha ALTO em vez de devolver sucesso deixando órfão", () => {
    const handler = recorte(sql, "EXCEPTION WHEN foreign_key_violation THEN", "END;");
    expect(handler).toMatch(/RAISE EXCEPTION/);
    expect(handler).toMatch(/tem dados vinculados e NÃO foi removido/);
    expect(handler).toMatch(/USING ERRCODE = 'foreign_key_violation'/);
    expect(handler).not.toMatch(/RETURN true/);
  });

  it("é idempotente: tenant que já não existe devolve false sem erro", () => {
    expect(sql).toMatch(/SELECT EXISTS \(SELECT 1 FROM public\.tenants WHERE id = p_tenant_id\) INTO v_existe;/);
    expect(sql).toMatch(/IF NOT v_existe THEN\n\s+RETURN false;/);
  });

  it("não introduz ON DELETE CASCADE nas tabelas de cobrança", () => {
    // A alternativa rejeitada: com CASCADE, um DELETE em tenants apagaria em
    // silêncio o histórico de pagamento de um cliente ativo.
    expect(sql).not.toMatch(/ON DELETE CASCADE/);
  });

  it("REVOKE antes do GRANT — invertido, o REVOKE de PUBLIC tira o EXECUTE de authenticated", () => {
    const iRevoke = sql.indexOf("REVOKE ALL ON FUNCTION public.remover_tenant_provisionado(uuid) FROM PUBLIC, anon;");
    const iGrant = sql.search(/GRANT\s+EXECUTE ON FUNCTION public\.remover_tenant_provisionado\(uuid\) TO authenticated;/);
    expect(iRevoke).toBeGreaterThan(0);
    expect(iGrant).toBeGreaterThan(iRevoke);
  });

  it("o autoteste confere ao vivo o que este arquivo não alcança", () => {
    const conf = recorte(sql, "DO $conf$", "$conf$;");
    expect(conf).toMatch(/to_regprocedure\('public\.remover_tenant_provisionado\(uuid\)'\)/);
    expect(conf).toMatch(/to_regprocedure\('public\.is_super_admin\(\)'\)/);
    expect(conf).toMatch(/prosecdef/);
    expect(conf).toMatch(/v_cfg := NULL;/);
    expect(conf).toMatch(/c LIKE 'search_path=%'/);
    // O autoteste roda no Postgres, não aqui: um `SELECT <escalar> INTO v_cfg`
    // com `v_cfg text[]` só estoura na hora de APLICAR a migração, quando já é
    // tarde. Fixa a forma provada na 20260909 — array inteiro para a variável
    // array, e a busca pelo prefixo feita com unnest depois.
    expect(conf).toMatch(/v_cfg\s+text\[\];/);
    expect(conf).toMatch(/SELECT proconfig INTO v_cfg FROM pg_proc WHERE oid = v_oid;/);
    expect(conf).toMatch(/NOT EXISTS \(SELECT 1 FROM unnest\(v_cfg\) c WHERE c LIKE 'search_path=%'\)/);
    expect(conf).toMatch(/v_def NOT LIKE '%is_super_admin%'/);
    expect(conf).toMatch(/v_def NOT LIKE '%assinaturas_pagamentos%'/);
    expect(conf).toMatch(/v_def NOT LIKE '%FOR UPDATE%'/);
    expect(conf).toMatch(/IF has_function_privilege\('anon', v_oid, 'EXECUTE'\) THEN/);
    expect(conf).toMatch(/IF NOT has_function_privilege\('authenticated', v_oid, 'EXECUTE'\) THEN/);
    // Diagnóstico dos órfãos que o DELETE quebrado já deixou em produção.
    expect(conf).toMatch(/SELECT count\(\*\) INTO v_orfaos/);
    expect(conf).toMatch(/sem nenhum usuário \(órfãos de provisionamento falho\)/);
  });

  it("o autoteste não escreve em tabela nenhuma", () => {
    const conf = recorte(sql, "DO $conf$", "$conf$;");
    expect(conf).not.toMatch(/INSERT INTO/);
    // `UPDATE` puro casaria com o literal '%FOR UPDATE%' que o autoteste
    // procura no corpo da função; o que não pode existir é um comando.
    expect(conf).not.toMatch(/\bUPDATE\s+public\./);
    expect(conf).not.toMatch(/DELETE FROM/);
  });
});
