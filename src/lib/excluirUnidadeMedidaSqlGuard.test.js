import { readFileSync } from "fs";
import { join } from "path";
import { describe, it, expect } from "vitest";

/**
 * Guard da RPC `excluir_unidade_medida` (tarefa 1.3 do plano de refatoração).
 *
 * Promessa: desvincular dos produtos e excluir a unidade acontecem juntos, ou
 * nada acontece. O caso que motivou a função é o DELETE barrado pela RLS, que
 * não dá erro: a função tem de conferir que apagou e, se não, levantar erro
 * para desfazer os UPDATE. Comportamento real em
 * supabase/tests/excluir_unidade_medida_cenarios.sql.
 */

const RAIZ = process.cwd();
const SQL = readFileSync(join(RAIZ, "supabase/migrations/20261125_excluir_unidade_medida_atomica.sql"), "utf8");
const CORPO = SQL.slice(SQL.indexOf("CREATE OR REPLACE FUNCTION public.excluir_unidade_medida"));

describe("excluir_unidade_medida, migration 20261125", () => {
  it("roda com as permissões de quem chama, nunca como dono", () => {
    expect(CORPO).toMatch(/SECURITY INVOKER/);
    expect(CORPO).not.toMatch(/SECURITY DEFINER/);
    expect(CORPO).toMatch(/SET search_path = public/);
  });

  it("anônimo não executa; autenticado executa", () => {
    expect(SQL).toContain("REVOKE ALL ON FUNCTION public.excluir_unidade_medida(uuid) FROM PUBLIC, anon;");
    expect(SQL).toContain("GRANT EXECUTE ON FUNCTION public.excluir_unidade_medida(uuid) TO authenticated;");
  });

  it("desvincula estoque, consumo e compra antes de apagar a unidade", () => {
    const apagar = CORPO.indexOf("DELETE FROM public.unidades_medida");
    expect(apagar).toBeGreaterThan(-1);
    for (const passo of ["SET unidade_estoque = ''", "SET unidade_consumo = NULL", "SET unidades_compra ="]) {
      const i = CORPO.indexOf(passo);
      expect(i, passo).toBeGreaterThan(-1);
      expect(i, passo).toBeLessThan(apagar);
    }
  });

  it("confere que o DELETE apagou de fato, senão levanta erro e desfaz tudo", () => {
    expect(CORPO).toMatch(/DELETE FROM public\.unidades_medida WHERE id = p_unidade_id RETURNING id INTO v_apagada;\s*IF v_apagada IS NULL THEN\s*RAISE EXCEPTION/);
  });

  it("cada recusa declara o próprio SQLSTATE", () => {
    const raises = CORPO.match(/RAISE EXCEPTION[^;]+;/g) ?? [];
    expect(raises).toHaveLength(2);
    expect(raises[0]).toMatch(/USING ERRCODE = 'P0002'/);
    expect(raises[1]).toMatch(/USING ERRCODE = '42501'/);
  });

  it("a frase dublada nos testes das duas telas é a mesma que o banco levanta", () => {
    for (const arquivo of [
      "src/features/configuracoes/desktop/UnidadesMedidaTab.test.jsx",
      "src/pages/mobile/modulos/configuracoes/SecaoUnidades.test.jsx",
    ]) {
      const teste = readFileSync(join(RAIZ, arquivo), "utf8");
      const dublada = teste.match(/code: "42501",\s*message: "([^"]+)"/)[1];
      expect(CORPO, arquivo).toContain(`'${dublada}' USING ERRCODE = '42501'`);
    }
  });
});
