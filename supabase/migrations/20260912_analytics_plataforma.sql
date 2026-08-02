-- ══════════════════════════════════════════════════════════════════
-- Console da Plataforma — RPC analytics_plataforma
-- F022-ANALYTICS · ADR-008 §5/§7 (decisão v2 nº 2) · 1ª peça de LEITURA
-- cross-tenant de dado OPERACIONAL do Console.
--
-- O QUE ESTAVA FURADO
-- O Console mostra quem PAGA (assinatura, vencimento, mensalidade) e não
-- mostra quem USA. Um estabelecimento que paga e não fecha uma venda há 30
-- dias é churn a caminho, e hoje isso é invisível até o cancelamento
-- chegar. Não existe tela, relatório nem consulta que responda "a base
-- está operando?" sem abrir o SQL Editor.
--
-- POR QUE ISTO É UMA RPC E NÃO UMA POLICY
-- O caminho curto seria pôr `OR public.is_super_admin()` na policy de
-- `vendas`, como já existe em `tenants` e `assinaturas` (20260726). Esse
-- caminho está PROIBIDO por decisão escrita — ADR-008, Decisão Fechada
-- v2 nº 2, e o cabeçalho da 20260724:
--
--   "as policies operacionais usam USING (tenant_id = auth.tenant_id())
--    SEM o OR auth.is_super_admin() global — o super-admin NÃO vê o dado
--    operacional bruto de todos os tenants o tempo todo. Para ver a
--    operação de um tenant específico, o super-admin usa impersonation /
--    escopo explícito (uma RPC que emite um contexto escopado)."
--
-- O motivo da decisão é o raio de exposição: um token de plataforma
-- vazado com aquele `OR` na policy entregaria a base de vendas inteira de
-- todos os clientes. Esta migração é o OUTRO braço da mesma decisão — o
-- escopo explícito por RPC — com um limite a mais que a ADR não precisou
-- escrever porque o caso não existia:
--
--   ⚠️ ESTA FUNÇÃO NÃO DEVOLVE LINHA DE VENDA. Devolve CONTAGEM e SOMA.
--
-- O que sai daqui sobre um cliente é o que a plataforma já sabe para
-- cobrar (que ele existe e que opera), não o que ele vendeu, para quem,
-- em qual mesa, por qual operador, nem quanto custou cada item. Quem for
-- mexer nesta função depois: acrescentar coluna que identifique uma venda
-- (id, comanda, mesa, cashier, cliente_id, item, valor unitário) NÃO é
-- uma melhoria incremental — é trocar a decisão v2 nº 2 por outra, e isso
-- passa por ADR, não por CREATE OR REPLACE. O guard em
-- `src/lib/analyticsSqlGuard.test.js` quebra se acontecer.
--
-- SEGURANÇA (mesmo desenho de 20260729, 20260801, 20260909 e 20260911):
-- • SECURITY DEFINER + SET search_path = public. O DEFINER é o que faz a
--   agregação atravessar a RLS de `vendas` — a autorização passa a ser a
--   guarda abaixo, e por isso ela é a primeira linha do corpo.
-- • Guarda `is_super_admin() IS NOT TRUE` (NULL e false barram igual, ver
--   20260730): a função é chamável pelo PostgREST por QUALQUER token
--   `authenticated`, inclusive o do garçom de um cliente. Sem a guarda,
--   ela seria um vazamento cross-tenant com URL pública.
-- • `p_dias` só aceita 7, 30 ou 90 — validado no BANCO, não na tela. A
--   tela oferece três botões; o PostgREST aceita qualquer número.
-- • REVOKE de PUBLIC/anon ANTES do GRANT a authenticated (nessa ordem: o
--   REVOKE depois tiraria de authenticated também).
--
-- CUSTO DA CONSULTA
-- Um passe agregando `vendas` inteira por tenant: o corte de período é um
-- FILTER dentro do agregado, não um WHERE, porque `ultima_venda` precisa
-- ser a última de SEMPRE. Sem isso, quem não vendeu no período sumiria do
-- resultado e a tela não teria como diferenciar "parou de vender há 60
-- dias" de "nunca vendeu" — que é justamente a pergunta do dono. Enquanto
-- a base couber em milhares de vendas isso é irrelevante; quando doer,
-- o caminho é uma tabela de resumo diário, não afrouxar a função.
--
-- Idempotente (CREATE OR REPLACE FUNCTION).
-- ⚠️ EXECUÇÃO MANUAL: rodar no SQL Editor do Supabase.
-- PRÉ-REQUISITOS: is_super_admin() (20260723/20260730), vendas.tenant_id
-- (20260724).
-- RLS: NENHUMA mudança no painel — nenhuma policy é criada, alterada ou
-- removida por esta migração. É esse o ponto dela.
-- ══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.analytics_plataforma(p_dias integer DEFAULT 30)
RETURNS TABLE (
  tenant_id            uuid,
  faturamento_centavos bigint,
  pedidos              integer,
  ultima_venda         timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_corte timestamptz;
BEGIN
  -- ── Autorização: só a plataforma vê a operação da base ───────────
  IF public.is_super_admin() IS NOT TRUE THEN
    RAISE EXCEPTION 'Apenas a plataforma pode ver o uso dos estabelecimentos.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── Validação de entrada ─────────────────────────────────────────
  -- Lista fechada, não faixa: um período livre convidaria a varrer a
  -- base inteira por uma URL, e os três valores são os que a tela usa.
  IF p_dias IS NULL OR p_dias NOT IN (7, 30, 90) THEN
    RAISE EXCEPTION 'Período inválido: use 7, 30 ou 90 dias.'
      USING ERRCODE = 'check_violation';
  END IF;

  v_corte := now() - make_interval(days => p_dias);

  -- ── Agregação ────────────────────────────────────────────────────
  -- Só quatro colunas, e nenhuma delas identifica uma venda. Dinheiro
  -- atravessa a fronteira para o JS em CENTAVOS INTEIROS: `total` é
  -- numeric e viraria float no JSON, e soma de dinheiro em float é como
  -- os centavos somem (CLAUDE.md).
  RETURN QUERY
  SELECT vd.tenant_id,
         round(coalesce(sum(vd.total) FILTER (WHERE vd.at >= v_corte), 0) * 100)::bigint,
         (count(*) FILTER (WHERE vd.at >= v_corte))::integer,
         max(vd.at)
    FROM public.vendas vd
   WHERE vd.tenant_id IS NOT NULL
   GROUP BY vd.tenant_id;
END;
$$;

-- Ordem importa: o REVOKE depois do GRANT tiraria de authenticated também.
REVOKE EXECUTE ON FUNCTION public.analytics_plataforma(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.analytics_plataforma(integer) TO authenticated;

-- ══════════════════════════════════════════════════════════════════
-- Autoteste (sem escrita) — falha alto se a migração não pegou.
-- ══════════════════════════════════════════════════════════════════
DO $conf$
DECLARE
  v_oid       oid;
  v_def       text;
  v_corpo     text;
  v_cfg       text[];
  v_proibida  text;
  v_operando  integer;
BEGIN
  v_oid := to_regprocedure('public.analytics_plataforma(integer)');
  IF v_oid IS NULL THEN
    RAISE EXCEPTION 'analytics_plataforma(integer) não existe após a migração.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid = v_oid AND prosecdef) THEN
    RAISE EXCEPTION 'analytics_plataforma precisa ser SECURITY DEFINER.';
  END IF;

  -- CREATE OR REPLACE descarta proconfig em silêncio; conferir de fato.
  SELECT proconfig INTO v_cfg FROM pg_proc WHERE oid = v_oid;
  IF v_cfg IS NULL OR NOT EXISTS (SELECT 1 FROM unnest(v_cfg) c WHERE c LIKE 'search_path=%') THEN
    RAISE EXCEPTION 'analytics_plataforma ficou sem SET search_path.';
  END IF;

  v_def := pg_get_functiondef(v_oid);

  -- Comentário fora ANTES de conferir texto: o cabeçalho desta própria
  -- função cita as colunas proibidas para explicar por que não estão lá,
  -- e sem tirar o comentário a conferência acusaria a si mesma
  -- (patterns.md — "Conferência textual de SQL").
  v_corpo := regexp_replace(v_def, '--.*', '', 'gn');

  IF v_corpo NOT LIKE '%is_super_admin%' THEN
    RAISE EXCEPTION 'analytics_plataforma sem a guarda is_super_admin().';
  END IF;

  -- A função é de AGREGADO. Coluna que identifique uma venda individual
  -- não pode aparecer na assinatura de saída (decisão v2 nº 2).
  SELECT a.nome INTO v_proibida
  FROM unnest(ARRAY['comanda', 'cashier', 'cliente_id', 'mesa']) AS a(nome)
  WHERE v_corpo LIKE '%' || a.nome || '%'
  LIMIT 1;
  IF v_proibida IS NOT NULL THEN
    RAISE EXCEPTION 'analytics_plataforma devolve dado de venda individual (%). A função é de agregado — ver ADR-008, decisão v2 nº 2.', v_proibida;
  END IF;

  -- Função recém-criada nasce com EXECUTE para PUBLIC — o REVOKE acima é
  -- que tira. Se ele falhar, qualquer visitante do site poderia chamar.
  IF has_function_privilege('anon', v_oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'anon não pode executar analytics_plataforma.';
  END IF;
  IF NOT has_function_privilege('authenticated', v_oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated precisa poder executar analytics_plataforma.';
  END IF;

  SELECT count(DISTINCT tenant_id) INTO v_operando
  FROM public.vendas
  WHERE at >= now() - interval '30 days';

  RAISE NOTICE 'analytics_plataforma instalada. Estabelecimentos com venda nos últimos 30 dias: %. Veja na aba "Uso e faturamento" do Console.', v_operando;
END $conf$;
