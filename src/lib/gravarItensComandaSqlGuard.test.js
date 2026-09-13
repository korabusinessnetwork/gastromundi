import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * Guard da gravação atômica dos itens da comanda (TD013).
 *
 * A função `gravar_itens_comanda` existe para fechar uma janela de corrida:
 * o app lia os itens, mesclava no cliente e gravava, em três idas à rede, e
 * o item lançado por outro aparelho no meio do caminho era sobrescrito —
 * sumia da conta. Dentro do banco, com a linha travada, isso não acontece.
 *
 * Não há Postgres no CI, então o que se garante aqui é o texto do SQL
 * versionado (mesmo instrumento dos outros `*SqlGuard.test.js`) mais o
 * encaixe entre o SQL e a chamada do app: nome da função e nomes dos
 * parâmetros. Um erro de digitação em qualquer um dos dois faria a chamada
 * voltar com "função não existe", o app cair no caminho antigo em silêncio,
 * e a correção não valer nada em produção.
 */

const RAIZ = join(import.meta.dirname, "..", "..");
const MIGRATION = readFileSync(
  join(RAIZ, "supabase", "migrations", "20260922_gravar_itens_comanda.sql"),
  "utf8",
);
const APP_CONTEXT = readFileSync(join(RAIZ, "src", "context", "AppContext.jsx"), "utf8");

/** Só o SQL que roda — o cabeçalho cita palavras-chave em prosa. */
const SQL = MIGRATION.split("\n")
  .filter((linha) => !linha.trim().startsWith("--"))
  .join("\n");

describe("migration 20260922 — gravar_itens_comanda", () => {
  it("cria a função de forma idempotente (ela chega à produção rodada à mão no SQL Editor)", () => {
    expect(SQL).toMatch(/CREATE OR REPLACE FUNCTION public\.gravar_itens_comanda\s*\(/);
    expect(SQL).not.toMatch(/CREATE FUNCTION\s/);
  });

  it("trava a linha antes de ler — é o que fecha a janela entre ler e gravar", () => {
    // Sem o FOR UPDATE a função vira o mesmo ler-mesclar-gravar de antes, só
    // que mais rápido: duas chamadas simultâneas ainda leriam a versão velha.
    expect(SQL).toMatch(/FROM public\.pending p\s*\n\s*WHERE p\.id = p_id\s*\n\s*FOR UPDATE;/);
  });

  it("roda sob a RLS de quem chama (SECURITY INVOKER), com search_path fixo", () => {
    // Comanda é isolada por estabelecimento pela RLS de `pending`. SECURITY
    // DEFINER contornaria esse isolamento e exigiria reescrevê-lo aqui dentro.
    // Só o cabeçalho: o autoteste menciona DEFINER na mensagem de falha dele.
    const cabecalho = SQL.slice(0, SQL.indexOf("AS $fn$"));
    expect(cabecalho).toMatch(/SECURITY INVOKER/);
    expect(cabecalho).not.toMatch(/SECURITY DEFINER/);
    expect(cabecalho).toMatch(/SET search_path = public/);
    // E o autoteste confere isso no banco de verdade, não só no texto.
    expect(SQL).toMatch(/p\.prosecdef/);
  });

  it("tira o EXECUTE de PUBLIC/anon antes de dar a authenticated", () => {
    // Função nova no Supabase nasce executável por PUBLIC, que inclui `anon`
    // (visitante sem login). A ordem importa: GRANT antes do REVOKE não vale.
    const revoke = SQL.search(/REVOKE EXECUTE ON FUNCTION public\.gravar_itens_comanda/);
    const grant = SQL.search(/GRANT EXECUTE ON FUNCTION public\.gravar_itens_comanda/);
    expect(revoke).toBeGreaterThan(-1);
    expect(grant).toBeGreaterThan(revoke);
    expect(SQL).toMatch(/FROM PUBLIC, anon;/);
    expect(SQL).toMatch(/TO authenticated;/);
  });

  it("protege a mescla do NULL dentro de p_base_uids", () => {
    // `uid = ANY(arr)` com NULL no array devolve NULL, não false — e o
    // `NOT (...)` descartaria o item remoto justamente que a função protege.
    expect(SQL).toMatch(/array_remove\(p_base_uids, NULL\)/);
  });

  it("aceita items que o banco tenha gravado fora do formato de lista", () => {
    // jsonb_array_elements sobre um jsonb que não é array levanta exceção e
    // derrubaria o lançamento inteiro por causa de uma linha legada.
    expect(SQL).toMatch(/jsonb_typeof\(v_banco\) = 'array'/);
  });

  it("recusa entrada que faria a gravação virar um no-op silencioso", () => {
    expect(SQL).toMatch(/p_id IS NULL OR btrim\(p_id\) = ''/);
    expect(SQL).toMatch(/jsonb_typeof\(p_items\) <> 'array'/);
  });

  it("refaz o total só quando a mescla trouxe item de volta", () => {
    // Se refizesse sempre, um desconto ou taxa que o app aplica no total do
    // chamador seria apagado a cada gravação.
    expect(SQL).toMatch(/ELSIF jsonb_array_length\(v_remotos\) > 0 THEN/);
    // Mesma regra de totalItensAtivos: preço × quantidade dos não cancelados.
    expect(SQL).toMatch(/COALESCE\(\(e->>'cancelado'\)::boolean, false\) = false/);
    expect(SQL).toMatch(/round\(COALESCE\(sum\(/);
  });

  it("devolve ao app items, total e o aviso de mescla", () => {
    for (const chave of ["'items'", "'total'", "'houve_mescla'"]) {
      expect(SQL).toContain(chave);
    }
  });

  it("tem autoteste que exercita a mescla de verdade e não deixa lixo no banco", () => {
    expect(SQL).toMatch(/DO \$conf\$/);
    expect(SQL).toMatch(/RAISE EXCEPTION 'FALHA:/);
    expect(SQL).toMatch(/DELETE FROM public\.pending WHERE id = v_id;/);
  });
});

describe("encaixe entre o app e a função", () => {
  it("o app chama exatamente o nome que a migration cria", () => {
    expect(APP_CONTEXT).toMatch(/supabase\.rpc\("gravar_itens_comanda"/);
  });

  it("os parâmetros da chamada são os mesmos que a função declara", () => {
    const declarados = [...SQL.matchAll(/^\s*(p_[a-z_]+)\s+(?:text|jsonb|numeric)/gm)].map((m) => m[1]);
    expect(new Set(declarados)).toEqual(new Set(["p_id", "p_items", "p_base_uids", "p_total"]));

    const chamada = APP_CONTEXT.match(/supabase\.rpc\("gravar_itens_comanda",\s*\{([\s\S]*?)\}\)/)[1];
    const enviados = [...chamada.matchAll(/(p_[a-z_]+):/g)].map((m) => m[1]);
    expect(new Set(enviados)).toEqual(new Set(declarados));
  });

  it("o app volta ao caminho antigo quando a função ainda não existe no banco", () => {
    // As migrations são rodadas à mão: o front-end pode chegar à produção
    // antes desta. Sem o fail-open, todo lançamento quebraria até alguém
    // abrir o SQL Editor.
    expect(APP_CONTEXT).toMatch(/"PGRST202"/);
    expect(APP_CONTEXT).toMatch(/"42883"/);
  });
});
