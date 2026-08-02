-- ═══════════════════════════════════════════════════════════════════
-- 20260917 — provisionar_tenant volta a semear os defaults do catálogo
-- ═══════════════════════════════════════════════════════════════════
--
-- PROBLEMA (bloqueia venda)
-- Estabelecimento novo nasce com o catálogo vazio em dois pontos:
--
--   1. `unidades_medida` — a 20260813 isolou as ~24 unidades por tenant,
--      mas semeou só uma vez (backfill sobre os tenants que já existiam)
--      e NÃO tocou em `provisionar_tenant`. Todo tenant criado depois
--      dela nasceu sem unidade nenhuma. `ProdutosView` não tem lista de
--      fallback: os selects de unidade de estoque/compra/consumo abrem
--      vazios e o cliente não consegue cadastrar produto no dia 1.
--
--   2. `grupos_categoria` — a 20260743 e a 20260829 semeavam os 4 grupos
--      (comida, bebida, cafe, sobremesa) dentro da própria função. A
--      20260908, ao recriar `provisionar_tenant` para criar a assinatura,
--      copiou o corpo sem esse trecho — regressão silenciosa.
--
-- SOLUÇÃO
-- Recria `provisionar_tenant` idêntica à 20260908 (mesma assinatura de
-- 4 argumentos — criar sobrecarga tornaria a chamada do Console ambígua,
-- erro 42725) acrescentando os dois seeds, e faz o backfill de quem já
-- nasceu torto. Idempotente: reexecutar não duplica nada.
--
-- RLS: não cria tabela nem policy. A função é SECURITY DEFINER (owner),
-- então os INSERT de seed passam pela RLS das duas tabelas — o mesmo
-- caminho que a 20260743 já usava para os grupos.

-- ── 1) A função ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.provisionar_tenant(
  p_nome         text,
  p_slug         text  DEFAULT NULL,
  p_plano_codigo text  DEFAULT 'avancado',
  p_tema         jsonb DEFAULT '{}'::jsonb
)
RETURNS public.tenants
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nome      text := btrim(coalesce(p_nome, ''));
  v_slug_base text;
  v_slug      text;
  v_n         int := 1;
  v_tenant    public.tenants;
BEGIN
  -- Autorização: só a plataforma provisiona (mesma guarda da 20260730).
  IF public.is_super_admin() IS NOT TRUE THEN
    RAISE EXCEPTION 'Apenas a plataforma pode provisionar estabelecimentos.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_nome = '' THEN
    RAISE EXCEPTION 'O nome do estabelecimento é obrigatório.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.planos WHERE codigo = p_plano_codigo) THEN
    RAISE EXCEPTION 'Plano inválido: %', p_plano_codigo
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  -- Slug: usa o pedido (normalizado) ou deriva do nome; fallback 'tenant'.
  v_slug_base := coalesce(public.slugify_tenant(p_slug),
                          public.slugify_tenant(v_nome),
                          'tenant');
  v_slug := v_slug_base;
  -- Garante unicidade E evita rótulos reservados: se o base bater com um
  -- slug existente OU com um reservado, acrescenta sufixo numérico
  -- (console → console2, casacoffee → casacoffee2, …).
  WHILE EXISTS (SELECT 1 FROM public.tenants WHERE slug = v_slug)
        OR public.slug_reservado(v_slug) LOOP
    v_n := v_n + 1;
    v_slug := v_slug_base || v_n::text;
  END LOOP;

  INSERT INTO public.tenants (nome, slug, plano_codigo, tema)
  VALUES (v_nome, v_slug, p_plano_codigo, coalesce(p_tema, '{}'::jsonb))
  RETURNING * INTO v_tenant;

  -- Billing (ADR-006 §4 / decisão 024): o estabelecimento entra no ciclo
  -- de cobrança no mesmo ato do cadastro. Sem esta linha ele nunca vence,
  -- nunca aparece no alerta de validade do Console e nunca é cobrado.
  -- valor_mensal fica 0 — o preço é combinado depois, na tela do Console;
  -- ciclo_dias (30) e carencia_dias (3) vêm do DEFAULT da tabela.
  INSERT INTO public.assinaturas (tenant_id, valor_mensal, data_inicio, data_vencimento)
  VALUES (v_tenant.id, 0, current_date, current_date + 30)
  ON CONFLICT (tenant_id) DO NOTHING;

  -- Grupos de categoria (restaurado da 20260829; perdido na 20260908).
  -- O cadastro de categoria exige um grupo; sem estes 4 o cliente trava
  -- antes de criar a primeira categoria do cardápio.
  INSERT INTO public.grupos_categoria (nome, tenant_id)
  VALUES ('comida',    v_tenant.id),
         ('bebida',    v_tenant.id),
         ('cafe',      v_tenant.id),
         ('sobremesa', v_tenant.id)
  ON CONFLICT (tenant_id, nome) DO NOTHING;

  -- Unidades de medida (as mesmas ~24 da 20260813, agora por tenant novo).
  -- Sem chave única na tabela, a guarda é o NOT EXISTS por
  -- (tenant_id, tipo, nome, abreviacao) — mesma da 20260813.
  INSERT INTO public.unidades_medida (nome, abreviacao, tipo, ordem, tenant_id)
  SELECT d.nome, d.abreviacao, d.tipo, d.ordem, v_tenant.id
  FROM (VALUES
    -- Estoque
    ('Unidade',    'un',       'estoque', 1),
    ('Quilograma', 'kg',       'estoque', 2),
    ('Grama',      'g',        'estoque', 3),
    ('Litro',      'L',        'estoque', 4),
    ('Mililitro',  'ml',       'estoque', 5),
    ('Caixa',      'cx',       'estoque', 6),
    ('Pacote',     'pct',      'estoque', 7),
    ('Dúzia',      'dt',       'estoque', 8),
    -- Compra
    ('Caixa',      'Caixa',    'compra',  1),
    ('Fardo',      'Fardo',    'compra',  2),
    ('Saca',       'Saca',     'compra',  3),
    ('Pacote',     'Pacote',   'compra',  4),
    ('Lata',       'Lata',     'compra',  5),
    ('Garrafa',    'Garrafa',  'compra',  6),
    ('Galão',      'Galão',    'compra',  7),
    ('Unidade',    'Unidade',  'compra',  8),
    -- Consumo
    ('Unidade',    'un',       'consumo', 1),
    ('Mililitro',  'ml',       'consumo', 2),
    ('Grama',      'g',        'consumo', 3),
    ('Fatia',      'fatia',    'consumo', 4),
    ('Dose',       'dose',     'consumo', 5),
    ('Copo',       'copo',     'consumo', 6),
    ('Prato',      'prato',    'consumo', 7),
    ('Porção',     'porção',   'consumo', 8)
  ) AS d(nome, abreviacao, tipo, ordem)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.unidades_medida um
    WHERE um.tenant_id = v_tenant.id
      AND um.tipo = d.tipo
      AND um.nome = d.nome
      AND um.abreviacao = d.abreviacao
  );

  RETURN v_tenant;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.provisionar_tenant(text, text, text, jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.provisionar_tenant(text, text, text, jsonb) TO authenticated;

-- ── 2) Regularizar quem já nasceu sem catálogo ─────────────────────
-- Tenants provisionados entre a 20260813/20260908 e esta migração estão
-- com selects vazios na tela de Produtos. Só insere o que falta.
DO $backfill$
DECLARE
  v_grupos int;
  v_unid   int;
BEGIN
  INSERT INTO public.grupos_categoria (nome, tenant_id)
  SELECT g.nome, t.id
  FROM public.tenants t
  CROSS JOIN (VALUES ('comida'), ('bebida'), ('cafe'), ('sobremesa')) AS g(nome)
  ON CONFLICT (tenant_id, nome) DO NOTHING;

  GET DIAGNOSTICS v_grupos = ROW_COUNT;

  INSERT INTO public.unidades_medida (nome, abreviacao, tipo, ordem, tenant_id)
  SELECT d.nome, d.abreviacao, d.tipo, d.ordem, t.id
  FROM public.tenants t
  CROSS JOIN (VALUES
    ('Unidade',    'un',       'estoque', 1),
    ('Quilograma', 'kg',       'estoque', 2),
    ('Grama',      'g',        'estoque', 3),
    ('Litro',      'L',        'estoque', 4),
    ('Mililitro',  'ml',       'estoque', 5),
    ('Caixa',      'cx',       'estoque', 6),
    ('Pacote',     'pct',      'estoque', 7),
    ('Dúzia',      'dt',       'estoque', 8),
    ('Caixa',      'Caixa',    'compra',  1),
    ('Fardo',      'Fardo',    'compra',  2),
    ('Saca',       'Saca',     'compra',  3),
    ('Pacote',     'Pacote',   'compra',  4),
    ('Lata',       'Lata',     'compra',  5),
    ('Garrafa',    'Garrafa',  'compra',  6),
    ('Galão',      'Galão',    'compra',  7),
    ('Unidade',    'Unidade',  'compra',  8),
    ('Unidade',    'un',       'consumo', 1),
    ('Mililitro',  'ml',       'consumo', 2),
    ('Grama',      'g',        'consumo', 3),
    ('Fatia',      'fatia',    'consumo', 4),
    ('Dose',       'dose',     'consumo', 5),
    ('Copo',       'copo',     'consumo', 6),
    ('Prato',      'prato',    'consumo', 7),
    ('Porção',     'porção',   'consumo', 8)
  ) AS d(nome, abreviacao, tipo, ordem)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.unidades_medida um
    WHERE um.tenant_id = t.id
      AND um.tipo = d.tipo
      AND um.nome = d.nome
      AND um.abreviacao = d.abreviacao
  );

  GET DIAGNOSTICS v_unid = ROW_COUNT;

  RAISE NOTICE 'Backfill: % grupo(s) de categoria e % unidade(s) de medida criados para estabelecimentos que estavam sem catálogo.',
    v_grupos, v_unid;
END;
$backfill$;

-- ── 3) Conferência ao vivo ─────────────────────────────────────────
-- Aborta se a migração ficou pela metade. Só lê catálogo e conta linhas.
DO $conf$
DECLARE
  v_oid  oid := to_regprocedure('public.provisionar_tenant(text, text, text, jsonb)');
  v_def  text;
  v_orfa int;
BEGIN
  IF v_oid IS NULL THEN
    RAISE EXCEPTION 'R24: public.provisionar_tenant(text,text,text,jsonb) não existe depois da migração.';
  END IF;

  v_def := pg_get_functiondef(v_oid);

  IF position('unidades_medida' IN v_def) = 0 THEN
    RAISE EXCEPTION 'R24: provisionar_tenant não semeia unidades_medida.';
  END IF;
  IF position('grupos_categoria' IN v_def) = 0 THEN
    RAISE EXCEPTION 'R24: provisionar_tenant não semeia grupos_categoria.';
  END IF;
  IF position('assinaturas' IN v_def) = 0 THEN
    RAISE EXCEPTION 'R24: provisionar_tenant perdeu a criação da assinatura (regressão da 20260908).';
  END IF;

  -- Nenhum tenant pode ter ficado sem catálogo depois do backfill.
  SELECT count(*) INTO v_orfa
  FROM public.tenants t
  WHERE NOT EXISTS (SELECT 1 FROM public.unidades_medida um WHERE um.tenant_id = t.id)
     OR NOT EXISTS (SELECT 1 FROM public.grupos_categoria gc WHERE gc.tenant_id = t.id);

  IF v_orfa > 0 THEN
    RAISE EXCEPTION 'R24: % estabelecimento(s) continuam sem unidades ou sem grupos depois do backfill.', v_orfa;
  END IF;

  RAISE NOTICE 'OK: provisionar_tenant semeia assinatura + grupos + unidades, e nenhum estabelecimento está sem catálogo.';
END;
$conf$;
