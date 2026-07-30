-- ══════════════════════════════════════════════════════════════════
-- Estabelecimento novo nasce COM assinatura — e a função que decide o
-- bloqueio deixa de ser um bug dormente
-- Run 7 · leva 1 · corrige 20260727/20260741/20260803 (provisionar_tenant)
--                  e a PENDÊNCIA 2 documentada em 20260725_multitenant_fase3
--
-- ┌─ POR QUÊ ───────────────────────────────────────────────────────────┐
-- │ 1) `provisionar_tenant` grava só em public.tenants. A única linha   │
-- │    em public.assinaturas que já existiu foi o seed de uma vez da    │
-- │    20260719 (`WHERE NOT EXISTS (…) LIMIT 1`), que pegou apenas o    │
-- │    primeiro tenant. Todo estabelecimento cadastrado pelo Console    │
-- │    desde então nasceu SEM assinatura, e:                            │
-- │      · `assinatura_ativa()` devolve `true` no caminho NOT FOUND     │
-- │        ("ausência de configuração não é inadimplência"), então as   │
-- │        12 políticas RESTRICTIVE da 20260720 nunca bloqueiam nada;   │
-- │      · o Console classifica o tenant como `sem_assinatura`, e esse  │
-- │        status fica FORA de `precisamAtencao` — o alerta de validade │
-- │        nunca vê o cliente;                                          │
-- │      · ele entra com R$ 0 no MRR.                                   │
-- │    Resultado: vende-se um estabelecimento, ele opera de graça para  │
-- │    sempre e nenhuma tela da plataforma acusa nada.                  │
-- │                                                                     │
-- │ 2) O conserto de (1) desarma uma mina: no instante em que existe    │
-- │    linha em `assinaturas` com status != 'cancelado',                │
-- │    `assinatura_ativa()` passa a chamar                              │
-- │    `public.calcular_status_assinatura(...)` — que o inventário de   │
-- │    2026-07-12 (cabeçalho da 20260725) registrou como AUSENTE em     │
-- │    produção. Se estiver mesmo ausente, o erro 42883 acontece DENTRO │
-- │    de uma política RESTRICTIVE: todo SELECT/INSERT/UPDATE/DELETE    │
-- │    das 12 tabelas operacionais do tenant passa a falhar. O sistema  │
-- │    inteiro daquele estabelecimento morre.                           │
-- │    (O inventário pode ter sido falso-alarme: ele sondou a assinatura│
-- │    de 2 argumentos, e `to_regprocedure('…(date,integer)')` devolve  │
-- │    NULL para uma função declarada com 3 parâmetros e DEFAULT. Não   │
-- │    há como saber pelo repositório — então esta migração recria a    │
-- │    função de forma idempotente ANTES de criar qualquer linha.)      │
-- └─────────────────────────────────────────────────────────────────────┘
--
-- ⚠️ CONSEQUÊNCIA OPERACIONAL — leia antes de rodar:
--    depois desta migração todo estabelecimento tem vencimento. Os que já
--    existem sem assinatura ganham 30 dias a contar de hoje, e os novos
--    nascem com 30 dias. Passados os 3 dias de carência sem renovação, o
--    bloqueio previsto na ADR-006 §4 / decisão 024 ENTRA EM VIGOR de fato.
--    Renovar é `confirmar_renovacao_assinatura` (tela do Console) ou, na
--    mão: UPDATE public.assinaturas
--            SET data_vencimento = data_vencimento + ciclo_dias,
--                status = 'ativo'
--          WHERE tenant_id = '<uuid>';
--
-- ⚠️ EXECUÇÃO MANUAL: rode no SQL Editor do Supabase. Idempotente.
--    Não altera RLS: nenhuma mudança necessária no painel.
-- ══════════════════════════════════════════════════════════════════

-- ── 1) calcular_status_assinatura — garantir que existe ────────────
-- Cópia fiel da 20260719_assinaturas.sql. `CREATE OR REPLACE` é no-op se
-- ela já existir do jeito certo, e cria se o inventário estava correto.
-- Sem SET search_path de propósito: é a mesma declaração de lá, e quem a
-- chama (`assinatura_ativa`) já é SECURITY DEFINER com search_path fixo.
CREATE OR REPLACE FUNCTION public.calcular_status_assinatura(
  p_data_vencimento date,
  p_carencia_dias integer,
  p_hoje date DEFAULT current_date
)
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN p_hoje <= p_data_vencimento THEN 'ativo'
    WHEN p_hoje <= p_data_vencimento + p_carencia_dias THEN 'carencia'
    ELSE 'bloqueado'
  END;
$$;

-- Se a linha acima CRIOU a função (não existia), o Postgres concede
-- EXECUTE a PUBLIC por padrão — inclusive ao papel `anon`. Reaplicamos o
-- fechamento da 20260802 (leva 16) para não abrir um buraco ao consertar.
REVOKE EXECUTE ON FUNCTION public.calcular_status_assinatura(date, integer, date) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.calcular_status_assinatura(date, integer, date) TO authenticated;

-- ── 2) provisionar_tenant — passa a criar a assinatura ─────────────
-- Cópia fiel da 20260803_reservar_slug_console.sql (slug reservado + laço
-- de unicidade + guardas de autorização), acrescentando o INSERT em
-- public.assinaturas. A ASSINATURA DA FUNÇÃO NÃO MUDA: acrescentar um
-- parâmetro (ainda que com DEFAULT) criaria uma SOBRECARGA convivendo com
-- esta, e a chamada de 4 argumentos do Console viraria ambígua (42725).
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

  RETURN v_tenant;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.provisionar_tenant(text, text, text, jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.provisionar_tenant(text, text, text, jsonb) TO authenticated;

-- ── 3) Regularizar quem já nasceu sem assinatura ───────────────────
-- Os estabelecimentos cadastrados pelo Console antes desta migração são
-- vítimas do defeito: sem esta parte eles seguiriam invisíveis para
-- sempre. Não toca em quem já tem linha (PK = tenant_id).
DO $backfill$
DECLARE
  v_qtd int;
BEGIN
  INSERT INTO public.assinaturas (tenant_id, valor_mensal, data_inicio, data_vencimento)
  SELECT t.id, 0, current_date, current_date + 30
  FROM public.tenants t
  WHERE NOT EXISTS (
    SELECT 1 FROM public.assinaturas a WHERE a.tenant_id = t.id
  );

  GET DIAGNOSTICS v_qtd = ROW_COUNT;

  IF v_qtd > 0 THEN
    RAISE NOTICE 'Assinatura criada para % estabelecimento(s) que estavam sem cobrança. Vencimento: %. Ajuste o valor mensal de cada um na tela do Console.',
      v_qtd, (current_date + 30);
  ELSE
    RAISE NOTICE 'Nenhum estabelecimento estava sem assinatura.';
  END IF;
END;
$backfill$;

-- ── 4) Conferência ao vivo ─────────────────────────────────────────
-- Aborta se a migração ficou pela metade. Só lê catálogo e chama funções
-- puras — não escreve em tabela nenhuma.
DO $conf$
DECLARE
  v_oid_calc oid := to_regprocedure('public.calcular_status_assinatura(date, integer, date)');
  v_oid_prov oid := to_regprocedure('public.provisionar_tenant(text, text, text, jsonb)');
  v_def      text;
BEGIN
  -- (a) A função que decide o bloqueio existe e responde.
  IF v_oid_calc IS NULL THEN
    RAISE EXCEPTION 'R7L1: public.calcular_status_assinatura(date,integer,date) não existe depois da migração.';
  END IF;
  IF public.calcular_status_assinatura(current_date + 1, 3) <> 'ativo' THEN
    RAISE EXCEPTION 'R7L1: vencimento no futuro tinha de dar ativo.';
  END IF;
  IF public.calcular_status_assinatura(current_date - 1, 3) <> 'carencia' THEN
    RAISE EXCEPTION 'R7L1: 1 dia de atraso com carência 3 tinha de dar carencia.';
  END IF;
  IF public.calcular_status_assinatura(current_date - 10, 3) <> 'bloqueado' THEN
    RAISE EXCEPTION 'R7L1: 10 dias de atraso tinha de dar bloqueado.';
  END IF;

  -- (b) Nem ela nem o provisionamento ficaram executáveis pelo anônimo.
  IF has_function_privilege('anon', v_oid_calc, 'EXECUTE') THEN
    RAISE EXCEPTION 'R7L1: anon ficou com EXECUTE em calcular_status_assinatura.';
  END IF;
  IF v_oid_prov IS NULL THEN
    RAISE EXCEPTION 'R7L1: public.provisionar_tenant(text,text,text,jsonb) não existe — a cópia mudou a assinatura da função.';
  END IF;
  IF has_function_privilege('anon', v_oid_prov, 'EXECUTE') THEN
    RAISE EXCEPTION 'R7L1: anon ficou com EXECUTE em provisionar_tenant.';
  END IF;

  -- (c) Só existe UMA provisionar_tenant: sobrecarga tornaria a chamada
  --     de 4 argumentos do Console ambígua e o cadastro pararia.
  IF (SELECT count(*) FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'provisionar_tenant') <> 1 THEN
    RAISE EXCEPTION 'R7L1: existe mais de uma provisionar_tenant — resolva a sobrecarga.';
  END IF;

  -- (d) A cópia preservou o que a 20260803 garantia e ganhou o billing.
  v_def := pg_get_functiondef(v_oid_prov);
  IF v_def NOT LIKE '%INSERT INTO public.assinaturas%' THEN
    RAISE EXCEPTION 'R7L1: provisionar_tenant não cria a assinatura.';
  END IF;
  IF v_def NOT LIKE '%slug_reservado%' THEN
    RAISE EXCEPTION 'R7L1: a cópia perdeu a guarda de slug reservado da 20260803.';
  END IF;
  IF v_def NOT LIKE '%is_super_admin%' THEN
    RAISE EXCEPTION 'R7L1: a cópia perdeu a guarda de autorização.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.oid = v_oid_prov
      AND p.prosecdef
      AND p.proconfig @> ARRAY['search_path=public']
  ) THEN
    RAISE EXCEPTION 'R7L1: provisionar_tenant perdeu SECURITY DEFINER ou o search_path fixo.';
  END IF;

  -- (e) Nenhum estabelecimento ficou fora da cobrança.
  IF EXISTS (
    SELECT 1 FROM public.tenants t
    WHERE NOT EXISTS (SELECT 1 FROM public.assinaturas a WHERE a.tenant_id = t.id)
  ) THEN
    RAISE EXCEPTION 'R7L1: ainda há estabelecimento sem assinatura.';
  END IF;

  RAISE NOTICE 'R7L1: conferência OK — billing garantido no cadastro e nenhum estabelecimento fora da cobrança.';
END;
$conf$;

-- ── 5) Panorama depois de rodar ────────────────────────────────────
-- Confira o valor mensal de cada estabelecimento (nasce 0) e o vencimento.
SELECT t.nome,
       t.slug,
       t.plano_codigo,
       a.valor_mensal,
       a.data_vencimento,
       a.carencia_dias,
       public.calcular_status_assinatura(a.data_vencimento, a.carencia_dias) AS status_calculado
FROM public.tenants t
JOIN public.assinaturas a ON a.tenant_id = t.id
ORDER BY t.nome;
