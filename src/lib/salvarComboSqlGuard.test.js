import { readFileSync } from "fs";
import { join } from "path";
import { describe, it, expect } from "vitest";

/**
 * Guard da RPC `salvar_combo` (tarefa 1.1 do plano de refatoração).
 *
 * O que ela promete, e que só o texto da migration pode provar aqui:
 * combo e composição gravam na mesma transação, com as permissões de quem
 * chama (SECURITY INVOKER herda a RLS de papel e de tenant), e editar um combo
 * que a RLS esconde vira recusa em vez de "deu certo sem gravar nada".
 */

const RAIZ = process.cwd();
const SQL = readFileSync(join(RAIZ, "supabase/migrations/20261123_salvar_combo_atomico.sql"), "utf8");
const CORPO = SQL.slice(SQL.indexOf("CREATE OR REPLACE FUNCTION public.salvar_combo"));
const ASSINATURA = "public.salvar_combo(uuid, text, bigint, text, numeric, jsonb, jsonb)";

describe("salvar_combo, migration 20261123", () => {
  it("roda com as permissões de quem chama, nunca como dono", () => {
    expect(CORPO).toMatch(/SECURITY INVOKER/);
    expect(CORPO).not.toMatch(/SECURITY DEFINER/);
    expect(CORPO).toMatch(/SET search_path = public/);
  });

  it("anônimo não executa; autenticado executa", () => {
    expect(SQL).toContain(`REVOKE ALL ON FUNCTION ${ASSINATURA} FROM PUBLIC, anon;`);
    expect(SQL).toContain(`GRANT EXECUTE ON FUNCTION ${ASSINATURA} TO authenticated;`);
  });

  it("na edição, só apaga a composição depois de confirmar que o UPDATE achou o combo", () => {
    const update = CORPO.indexOf("UPDATE public.combos");
    const recusa = CORPO.indexOf("IF v_id IS NULL THEN");
    const deleteSubs = CORPO.indexOf("DELETE FROM public.combo_subprodutos");
    const deleteProds = CORPO.indexOf("DELETE FROM public.combo_produtos");
    expect(update).toBeGreaterThan(-1);
    expect(recusa).toBeGreaterThan(update);
    expect(deleteSubs).toBeGreaterThan(recusa);
    expect(deleteProds).toBeGreaterThan(recusa);
  });

  it("combo sem item nenhum é recusado antes de gravar", () => {
    const recusa = CORPO.indexOf("jsonb_array_length(v_subs) + jsonb_array_length(v_prods) = 0");
    expect(recusa).toBeGreaterThan(-1);
    expect(recusa).toBeLessThan(CORPO.indexOf("INSERT INTO public.combos"));
  });

  it("as duas composições são inseridas dentro da mesma função", () => {
    expect(CORPO).toContain("INSERT INTO public.combo_subprodutos");
    expect(CORPO).toContain("INSERT INTO public.combo_produtos");
  });

  it("cada recusa declara o próprio SQLSTATE", () => {
    const raises = CORPO.match(/RAISE EXCEPTION[^;]+;/g) ?? [];
    expect(raises.length).toBeGreaterThan(0);
    for (const r of raises) expect(r).toMatch(/USING ERRCODE = 'P000[12]'/);
  });

  it("a frase que o teste da tela dubla é a mesma que o banco levanta", () => {
    const teste = readFileSync(join(RAIZ, "src/components/desktop/views/CombosView.test.jsx"), "utf8");
    const dublada = teste.match(/code: "P0002",\s*message: "([^"]+)"/)[1];
    expect(CORPO).toContain(`'${dublada}' USING ERRCODE = 'P0002'`);
  });
});
