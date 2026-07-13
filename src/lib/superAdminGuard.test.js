import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

/**
 * Guard de regressão do bug crítico de bypass da guarda de super-admin
 * (20260730_fix_super_admin_null_guard.sql).
 *
 * Dois furos que se somavam:
 *   (1) is_super_admin() devolvia NULL (não false) para token sem o claim
 *       gastro_role. Guarda `IF NOT is_super_admin() THEN RAISE` com NULL
 *       vira `IF NULL THEN` → não entra no bloco → exceção pulada.
 *   (2) CREATE FUNCTION concede EXECUTE a PUBLIC por padrão; sem REVOKE, a
 *       anon key (role `anon`) alcançava as RPCs de escrita.
 *
 * Este teste garante, sobre os arquivos de migration:
 *   (a) is_super_admin() foi recriada com COALESCE(..., false) — nunca NULL;
 *   (b) nenhuma migration usa a guarda perigosa `IF NOT ...is_super_admin()`
 *       em SQL ativo (o padrão seguro é `IS NOT TRUE`); comentários valem;
 *   (c) cada RPC de ESCRITA que guarda por super-admin tem o
 *       `REVOKE EXECUTE ... FROM PUBLIC` correspondente.
 */
const MIGRATIONS_DIR = join(__dirname, "../../supabase/migrations");
const RPCS_ESCRITA = ["provisionar_tenant", "alterar_plano_tenant"];

// Migrations são histórico imutável: a 20260727 introduziu provisionar_tenant
// com a guarda perigosa `IF NOT is_super_admin()` e JÁ FOI APLICADA — não se
// reescreve migração aplicada. A corretiva 20260730 recria a função com
// `IS NOT TRUE` (CREATE OR REPLACE), então a definição VIGENTE é segura.
// Ignoramos o arquivo histórico aqui, como o guard de RLS faz com os seus.
const HISTORICOS_SUPERSEDED = ["20260727_provisionar_tenant.sql"];

function arquivosSql() {
  return readdirSync(MIGRATIONS_DIR).filter((n) => n.endsWith(".sql"));
}

function linhasAtivas(conteudo) {
  return conteudo.split("\n").filter((l) => !l.trim().startsWith("--"));
}

describe("Segurança — guarda de super-admin (is_super_admin NULL bypass)", () => {
  const arquivos = arquivosSql();
  const todo = Object.fromEntries(
    arquivos.map((n) => [n, readFileSync(join(MIGRATIONS_DIR, n), "utf8")])
  );

  it("is_super_admin() é (re)definida com COALESCE — nunca devolve NULL", () => {
    // A definição vigente é a do arquivo lexicograficamente maior que
    // (re)cria a função. Basta existir uma definição com COALESCE e que a
    // ÚLTIMA definição no tempo seja essa.
    const definidoras = arquivos
      .filter((n) => /FUNCTION public\.is_super_admin/.test(todo[n]))
      .sort();
    expect(definidoras.length).toBeGreaterThan(0);

    const ultima = definidoras[definidoras.length - 1];
    expect(todo[ultima]).toMatch(/COALESCE\(\s*\(auth\.jwt\(\)[^)]*gastro_role'\)\s*=\s*'plataforma',\s*false\s*\)/i);
  });

  it("nenhuma migration usa a guarda perigosa `IF NOT ...is_super_admin()` em SQL ativo", () => {
    const perigosa = /IF\s+NOT\s+(public\.)?is_super_admin\(\)/i;
    const infratores = [];
    for (const n of arquivos) {
      if (HISTORICOS_SUPERSEDED.includes(n)) continue;
      if (linhasAtivas(todo[n]).some((l) => perigosa.test(l))) infratores.push(n);
    }
    expect(infratores).toEqual([]);
  });

  it("toda RPC de escrita guardada por super-admin tem REVOKE ... FROM PUBLIC", () => {
    for (const rpc of RPCS_ESCRITA) {
      // Encontra o(s) arquivo(s) que criam a RPC e checa que EXISTE um
      // REVOKE de PUBLIC para ela em alguma migration (a que a endurece).
      const temRevoke = arquivos.some((n) =>
        new RegExp(`REVOKE\\s+EXECUTE\\s+ON\\s+FUNCTION\\s+public\\.${rpc}\\b[^;]*FROM\\s+[^;]*PUBLIC`, "i").test(todo[n])
      );
      expect(temRevoke, `${rpc} precisa de REVOKE EXECUTE ... FROM PUBLIC`).toBe(true);
    }
  });
});
