-- ══════════════════════════════════════════════════════════════════
-- combo_produtos — fecha a policy permissiva e firma o isolamento
--
-- Tira a última `allow_all_%` viva do schema e alinha combo_produtos
-- às suas duas irmãs (combos e combo_subprodutos), que já são
-- select_auth + write_gerente_admin desde 20240108.
--
-- COMO A BRECHA APARECEU (não foi descuido, foi ordem de arquivo)
-- 20240107_rls_por_role.sql abre com um laço que apaga toda policy
-- chamada `allow_all_%`:
--
--     FOR r IN SELECT policyname, tablename FROM pg_policies
--       WHERE schemaname = 'public' AND policyname LIKE 'allow_all_%'
--     LOOP EXECUTE format('DROP POLICY IF EXISTS ...') END LOOP;
--
-- Esse laço rodou UMA vez, em 2024, e limpou o que existia até ali —
-- inclusive allow_all_combos e allow_all_combo_subprodutos, que em
-- seguida ganharam policy por papel. combo_produtos nasceu depois, em
-- 20260726, recriando `allow_all_combo_produtos` (FOR ALL USING (true)
-- WITH CHECK (true)) porque copiou o padrão de 20240104 — o padrão
-- antigo, o que a 20240107 tinha acabado de aposentar. A limpeza já
-- tinha passado; a policy permissiva ficou.
--
-- O QUE ISSO PERMITE HOJE
-- Qualquer sessão autenticada — garçom, caixa — pode inserir, alterar
-- e apagar linhas de combo_produtos direto pela chave anon. Na prática:
-- montar ou desmontar a composição de um combo sem passar pela tela de
-- Cardápio (que é gerência), e portanto sem log de atividade nenhum. O
-- efeito é comercial e silencioso: o combo passa a sair com produto a
-- mais, ou sem o produto que justificava o preço, e o PDV obedece —
-- ProductGrid.jsx:169 e PDVView/index.jsx:156 leem essa junção para
-- montar o que vai para a comanda.
--
-- O tenant continuava isolado o tempo todo (a RESTRICTIVE
-- combo_produtos_tenant_isolation soma AND a qualquer permissiva), então
-- nunca houve vazamento entre estabelecimentos. O furo é DENTRO do
-- estabelecimento: papel, não tenant.
--
-- ┌─ POR QUE `select_auth` E NÃO ALGO MAIS APERTADO ─────────────────┐
-- │ O PDV inteiro lê combo_produtos para montar o combo na venda, e   │
-- │ quem opera o PDV é caixa e garçom. Leitura para qualquer          │
-- │ autenticado é o mesmo que combos e combo_subprodutos já fazem —   │
-- │ e é o que mantém o combo funcionando na tela do garçom.           │
-- │                                                                   │
-- │ O cardápio público do delivery NÃO depende disto: cardapio_publico│
-- │ e combo_indisponivel são SECURITY DEFINER (20260907) e passam por  │
-- │ cima da RLS. O anônimo continua vendo o combo normalmente.        │
-- └───────────────────────────────────────────────────────────────────┘
--
-- Escrita: gerente e admin, como em combos/combo_subprodutos. Ninguém
-- perde acesso de verdade — quem não é gerência já era barrado na
-- tabela `combos` no mesmo fluxo de CombosView.jsx.
--
-- O bloco de tenant abaixo era CONDICIONAL em 20260726 (`IF
-- to_regprocedure('public.tenant_atual_id()') IS NOT NULL`), porque
-- naquele momento não dava para garantir que a leva multitenant já
-- tivesse rodado. Hoje dá: o helper existe. Aqui ele vira
-- incondicional, e a migration falha alto se o helper sumir — melhor
-- quebrar na hora de rodar do que criar a tabela sem isolamento e
-- descobrir depois.
--
-- Idempotente: DROP POLICY IF EXISTS + CREATE, ADD COLUMN IF NOT EXISTS.
-- RODAR MANUALMENTE no SQL Editor do Supabase.
-- ══════════════════════════════════════════════════════════════════

-- ── 1. Fora a permissiva ───────────────────────────────────────────
DROP POLICY IF EXISTS "allow_all_combo_produtos" ON public.combo_produtos;

-- ── 2. Policies por papel (espelho de combo_subprodutos) ───────────
DROP POLICY IF EXISTS "combo_produtos_select_auth" ON public.combo_produtos;
CREATE POLICY "combo_produtos_select_auth" ON public.combo_produtos
  FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "combo_produtos_write_gerente_admin" ON public.combo_produtos;
CREATE POLICY "combo_produtos_write_gerente_admin" ON public.combo_produtos
  FOR ALL
  USING  ((auth.jwt() -> 'app_metadata' ->> 'gastro_role') IN ('gerente', 'admin'))
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'gastro_role') IN ('gerente', 'admin'));

-- ── 3. Isolamento por tenant, agora sem condicional ────────────────
DO $$
BEGIN
  IF to_regprocedure('public.tenant_atual_id()') IS NULL THEN
    RAISE EXCEPTION 'public.tenant_atual_id() ausente — rode a leva multitenant (20260724) antes desta.';
  END IF;

  ALTER TABLE public.combo_produtos
    ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

  UPDATE public.combo_produtos
     SET tenant_id = (SELECT id FROM public.tenants ORDER BY created_at ASC LIMIT 1)
   WHERE tenant_id IS NULL;

  ALTER TABLE public.combo_produtos ALTER COLUMN tenant_id SET DEFAULT public.tenant_atual_id();
  ALTER TABLE public.combo_produtos ALTER COLUMN tenant_id SET NOT NULL;
END $$;

DROP POLICY IF EXISTS combo_produtos_tenant_isolation ON public.combo_produtos;
CREATE POLICY combo_produtos_tenant_isolation ON public.combo_produtos
  AS RESTRICTIVE FOR ALL
  USING (tenant_id = public.tenant_atual_id())
  WITH CHECK (tenant_id = public.tenant_atual_id());

CREATE INDEX IF NOT EXISTS combo_produtos_tenant_id_idx ON public.combo_produtos (tenant_id);

-- ── Verificação ────────────────────────────────────────────────────
-- Esperado: allow_all_combo_produtos ausente; select_auth, write_gerente_admin
-- e tenant_isolation (RESTRICTIVE = permissive 'f') presentes.
SELECT policyname, permissive, cmd
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'combo_produtos'
ORDER BY policyname;
