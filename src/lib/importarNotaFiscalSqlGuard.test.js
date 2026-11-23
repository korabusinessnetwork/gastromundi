import { readFileSync } from "fs";
import { join } from "path";
import { describe, it, expect } from "vitest";

/**
 * Guard da RPC `importar_nota_fiscal` (tarefa 1.2 do plano de refatoração).
 *
 * Promessa: nota, itens, histórico de entradas e saldo gravam na mesma
 * transação, com as permissões de quem chama, e o saldo é somado pela mesma
 * `entrada_estoque` atômica de antes. O comportamento rodando de verdade está
 * em supabase/tests/importar_nota_fiscal_cenarios.sql.
 */

const RAIZ = process.cwd();
const SQL = readFileSync(join(RAIZ, "supabase/migrations/20261124_importar_nota_fiscal_atomica.sql"), "utf8");
const CORPO = SQL.slice(SQL.indexOf("CREATE OR REPLACE FUNCTION public.importar_nota_fiscal"));

describe("importar_nota_fiscal, migration 20261124", () => {
  it("roda com as permissões de quem chama, nunca como dono", () => {
    expect(CORPO).toMatch(/SECURITY INVOKER/);
    expect(CORPO).not.toMatch(/SECURITY DEFINER/);
    expect(CORPO).toMatch(/SET search_path = public/);
  });

  it("anônimo não executa; autenticado executa", () => {
    expect(SQL).toContain("REVOKE ALL ON FUNCTION public.importar_nota_fiscal(jsonb, jsonb) FROM PUBLIC, anon;");
    expect(SQL).toContain("GRANT EXECUTE ON FUNCTION public.importar_nota_fiscal(jsonb, jsonb) TO authenticated;");
  });

  it("grava nota, itens e histórico, nessa ordem, antes de somar o saldo", () => {
    const nota = CORPO.indexOf("INSERT INTO public.notas_fiscais (");
    const itens = CORPO.indexOf("INSERT INTO public.notas_fiscais_itens");
    const historico = CORPO.indexOf("INSERT INTO public.estoque_entradas");
    const saldo = CORPO.indexOf("public.entrada_estoque(");
    expect(nota).toBeGreaterThan(-1);
    expect(itens).toBeGreaterThan(nota);
    expect(historico).toBeGreaterThan(itens);
    expect(saldo).toBeGreaterThan(historico);
  });

  it("o saldo passa pela entrada_estoque, nunca por escrita direta na tabela estoque", () => {
    expect(CORPO).not.toMatch(/(INSERT INTO|UPDATE)\s+public\.estoque\b(?!_)/);
  });

  it("item vinculado sem quantidade é recusado antes de gravar a nota", () => {
    const recusa = CORPO.indexOf("Há produto vinculado com quantidade 0 para o estoque");
    expect(recusa).toBeGreaterThan(-1);
    expect(recusa).toBeLessThan(CORPO.indexOf("INSERT INTO public.notas_fiscais ("));
  });

  it("o custo do histórico é o preço da nota dividido pelo fator, como a tela calculava", () => {
    expect(CORPO).toMatch(/THEN NULLIF\(e->>'preco_unitario', ''\)::numeric \/ NULLIF\(e->>'fator_conversao', ''\)::numeric/);
  });

  it("sem data de emissão, o histórico usa o hoje que o navegador mandou", () => {
    expect(CORPO).toMatch(/NULLIF\(p_nota->>'data_emissao', ''\)::date,\s*NULLIF\(p_nota->>'data_entrada', ''\)::date/);
  });

  it("cada recusa da própria função declara o SQLSTATE", () => {
    const raises = CORPO.match(/RAISE EXCEPTION[^;]+;/g) ?? [];
    expect(raises.length).toBeGreaterThan(0);
    for (const r of raises) expect(r).toMatch(/USING ERRCODE = 'P0001'/);
  });
});
