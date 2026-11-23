import { readFileSync } from "fs";
import { join } from "path";
import { describe, it, expect } from "vitest";

/**
 * Guard da RPC `salvar_subproduto` (tarefa 1.6 do plano de refatoração).
 * Promessa: subproduto e saldo gravam juntos, com as permissões de quem chama.
 * Comportamento real em supabase/tests/salvar_subproduto_cenarios.sql.
 */

const SQL = readFileSync(join(process.cwd(), "supabase/migrations/20261126_salvar_subproduto_atomico.sql"), "utf8");
const CORPO = SQL.slice(SQL.indexOf("CREATE OR REPLACE FUNCTION public.salvar_subproduto"));
const ASSINATURA = "public.salvar_subproduto(uuid, text, text, numeric, text, boolean, boolean, numeric, numeric)";

describe("salvar_subproduto, migration 20261126", () => {
  it("roda com as permissões de quem chama, nunca como dono", () => {
    expect(CORPO).toMatch(/SECURITY INVOKER/);
    expect(CORPO).not.toMatch(/SECURITY DEFINER/);
    expect(CORPO).toMatch(/SET search_path = public/);
  });

  it("anônimo não executa; autenticado executa", () => {
    expect(SQL).toContain(`REVOKE ALL ON FUNCTION ${ASSINATURA} FROM PUBLIC, anon;`);
    expect(SQL).toContain(`GRANT EXECUTE ON FUNCTION ${ASSINATURA} TO authenticated;`);
  });

  it("valida tudo, inclusive NaN, antes de gravar qualquer coisa", () => {
    const primeiraGravacao = CORPO.indexOf("INSERT INTO public.subprodutos");
    for (const frase of ["Informe o nome.", "Preço inválido.", "Quantidade em estoque inválida.", "Estoque mínimo inválido."]) {
      const i = CORPO.indexOf(frase);
      expect(i, frase).toBeGreaterThan(-1);
      expect(i, frase).toBeLessThan(primeiraGravacao);
    }
    expect(CORPO.match(/= 'NaN'::numeric/g)).toHaveLength(3);
  });

  it("edição que a RLS esconde vira recusa, e o saldo vem depois do subproduto", () => {
    const update = CORPO.indexOf("UPDATE public.subprodutos");
    const recusa = CORPO.indexOf("IF v_id IS NULL THEN");
    const saldo = CORPO.indexOf("INSERT INTO public.estoque_subprodutos");
    expect(recusa).toBeGreaterThan(update);
    expect(saldo).toBeGreaterThan(recusa);
  });

  it("deixar de controlar estoque não apaga o saldo", () => {
    expect(CORPO).not.toMatch(/DELETE FROM public\.estoque_subprodutos/);
  });

  it("cada recusa da própria função declara o SQLSTATE", () => {
    for (const r of CORPO.match(/RAISE EXCEPTION[^;]+;/g) ?? []) expect(r).toMatch(/USING ERRCODE = 'P000[12]'/);
  });
});
