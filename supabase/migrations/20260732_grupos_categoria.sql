-- ══════════════════════════════════════════════════════════════════
-- C3 (Bloco 2) — Grupos de categoria para o Radar de Oportunidades
--
-- products.category é texto livre. Em vez de forçar uma lista fixa,
-- mapeamos cada categoria (texto) a um GRUPO (comida, bebida, cafe, …):
--   grupos_categoria  — os grupos disponíveis (editáveis por gerente/admin)
--   categoria_grupo   — mapeia uma categoria de produto a um grupo
--
-- O Palm usa esse mapa para detectar lacunas (tem comida, sem bebida) e
-- sugerir vendas adicionais. As regras de lacuna ficam no front, numa
-- estrutura declarativa (src/lib/painelGarcom.js REGRAS_OPORTUNIDADE).
--
-- RLS: leitura para qualquer autenticado; escrita para gerente/admin —
-- mesmo padrão de mesas/estoque, claim correto app_metadata.gastro_role.
--
-- ⚠️ EXECUÇÃO MANUAL: rode este arquivo no SQL Editor do Supabase.
--    Multi-tenant: quando a isolação por tenant destas tabelas for
--    necessária, seguir o padrão das migrations 20260724_multitenant_*.
-- ══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.grupos_categoria (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nome       text NOT NULL UNIQUE,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.categoria_grupo (
  category   text PRIMARY KEY,
  grupo_id   bigint NOT NULL REFERENCES public.grupos_categoria(id) ON DELETE CASCADE,
  updated_at timestamptz DEFAULT now()
);

-- Grupos iniciais (idempotente)
INSERT INTO public.grupos_categoria (nome)
VALUES ('comida'), ('bebida'), ('cafe')
ON CONFLICT (nome) DO NOTHING;

ALTER TABLE public.grupos_categoria ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categoria_grupo  ENABLE ROW LEVEL SECURITY;

-- Leitura: qualquer autenticado
DROP POLICY IF EXISTS "grupos_categoria_select_auth" ON public.grupos_categoria;
CREATE POLICY "grupos_categoria_select_auth"
  ON public.grupos_categoria FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "categoria_grupo_select_auth" ON public.categoria_grupo;
CREATE POLICY "categoria_grupo_select_auth"
  ON public.categoria_grupo FOR SELECT
  USING (auth.role() = 'authenticated');

-- Escrita: gerente/admin
DROP POLICY IF EXISTS "grupos_categoria_write_gerencia" ON public.grupos_categoria;
CREATE POLICY "grupos_categoria_write_gerencia"
  ON public.grupos_categoria FOR ALL
  USING  ((auth.jwt() -> 'app_metadata' ->> 'gastro_role') IN ('gerente', 'admin'))
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'gastro_role') IN ('gerente', 'admin'));

DROP POLICY IF EXISTS "categoria_grupo_write_gerencia" ON public.categoria_grupo;
CREATE POLICY "categoria_grupo_write_gerencia"
  ON public.categoria_grupo FOR ALL
  USING  ((auth.jwt() -> 'app_metadata' ->> 'gastro_role') IN ('gerente', 'admin'))
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'gastro_role') IN ('gerente', 'admin'));
