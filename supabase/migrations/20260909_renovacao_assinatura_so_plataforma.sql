-- ══════════════════════════════════════════════════════════════════
-- 20260909 — Renovação de assinatura: só a plataforma, uma vez por
--            competência, e o status para de mentir
--
-- Run 7 / leva 5. Quatro furos na MESMA função, todos vivos hoje em
-- produção (`public.confirmar_renovacao_assinatura`, última versão em
-- 20260802_leva16_hardening_rpcs.sql):
--
--   (1) AUTO-RENOVAÇÃO PELO PRÓPRIO CLIENTE. A função é concedida a
--       `authenticated` e o ramo de não-plataforma aceita
--       `gastro_role IN ('gerente','admin')` desde que
--       `p_tenant_id = tenant_atual_id()` — ou seja, o admin do
--       estabelecimento renova a PRÓPRIA assinatura, de graça e sem
--       limite, empurrando `data_vencimento` um ciclo por chamada.
--       Nenhuma tela do sistema chama essa RPC (o Console tem
--       `PlanosDashboard`, que só lê), então esse ramo nunca foi
--       caminho de uso: é superfície de ataque pura sobre o portão de
--       receita da plataforma. A 20260908 acabou de dar vencimento a
--       TODOS os estabelecimentos e ligou o bloqueio de verdade
--       (ADR-006 §4, decisão 024) — o que armou o furo.
--
--   (2) SEM IDEMPOTÊNCIA. `assinaturas_pagamentos` não tem unicidade
--       de (tenant_id, competencia): confirmar o mesmo mês duas vezes
--       grava dois pagamentos e adianta o vencimento DOIS ciclos. Um
--       duplo-clique na tela futura vale um mês de graça.
--
--   (3) `status = 'ativo'` NA FÉ. Renovar um ciclo de quem está quatro
--       meses atrasado empurra o vencimento um mês — ainda no passado —
--       e mesmo assim o cache passava a dizer 'ativo'. O app recalcula
--       a partir da data (`calcularStatusAssinatura`) e segue
--       bloqueando, então a tela do Console mostrava "ativo" para um
--       cliente que continua travado. Agora o status sai da data nova.
--
--   (4) `p_valor` SEM VALIDAÇÃO NO BANCO. Só o cliente JS checava
--       `> 0`; uma chamada direta gravava pagamento zero ou negativo e
--       corrompia o MRR do Console.
--
-- E um quinto, de configuração: a 20260725_fix_search_path_secdef
-- estampou `SET search_path` nas duas funções de assinatura via
-- ALTER FUNCTION, mas a 20260802 as recriou com `CREATE OR REPLACE` —
-- que DESCARTA silenciosamente o `proconfig`. Hoje as duas são
-- SECURITY DEFINER com search_path mutável. Reestampado aqui.
--
-- Segurança: nenhuma tabela nova, nenhuma política nova — a RLS de
-- `assinaturas`/`assinaturas_pagamentos` (20260726, fase 4) já está
-- correta e as duas tabelas seguem SEM política de INSERT/UPDATE, ou
-- seja, escrita só por esta função SECURITY DEFINER. NÃO é preciso
-- mexer em RLS no painel.
-- ══════════════════════════════════════════════════════════════════

-- ── 1. Pré-checagem: o índice único não nasce com duplicata ────────
--      Falha alto e em português em vez de deixar o CREATE INDEX
--      estourar com mensagem de catálogo.
DO $dup$
DECLARE
  v_dups  integer;
  v_total integer;
BEGIN
  SELECT count(*) INTO v_dups
    FROM (SELECT tenant_id, competencia
            FROM public.assinaturas_pagamentos
           GROUP BY tenant_id, competencia
          HAVING count(*) > 1) d;

  IF v_dups > 0 THEN
    RAISE EXCEPTION 'Há % par(es) (estabelecimento, competência) repetido(s) em assinaturas_pagamentos. Resolva o histórico antes de aplicar: o índice único não pode ser criado com duplicata.', v_dups;
  END IF;

  SELECT count(*) INTO v_total FROM public.assinaturas_pagamentos;
  RAISE NOTICE 'assinaturas_pagamentos: % pagamento(s) no histórico, nenhuma competência repetida.', v_total;
END;
$dup$;

-- ── 2. Um pagamento por competência, por estabelecimento ───────────
--      Índice (e não constraint) porque CREATE INDEX aceita
--      IF NOT EXISTS e a migração fica re-executável.
CREATE UNIQUE INDEX IF NOT EXISTS assinaturas_pagamentos_competencia_uidx
  ON public.assinaturas_pagamentos (tenant_id, competencia);

-- ── 3. confirmar_renovacao_assinatura — plataforma, idempotente,
--      status derivado da data e valor validado ────────────────────
CREATE OR REPLACE FUNCTION public.confirmar_renovacao_assinatura(
  p_tenant_id      uuid,
  p_competencia    date,
  p_valor          numeric,
  p_metodo         text,
  p_confirmado_por text
)
RETURNS public.assinaturas
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_competencia date;
  v_result      public.assinaturas;
BEGIN
  -- (1) Só a plataforma. Quem paga a mensalidade não pode ser quem dá
  -- baixa nela: o ramo anterior deixava gerente/admin renovar o
  -- próprio estabelecimento sem limite nenhum.
  IF public.is_super_admin() IS NOT TRUE THEN
    RAISE EXCEPTION 'Somente a plataforma pode confirmar renovação de assinatura.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- (4) Validação no banco, não só no cliente JS.
  IF p_competencia IS NULL THEN
    RAISE EXCEPTION 'Informe a competência (mês de referência) do pagamento.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_valor IS NULL OR p_valor <= 0 THEN
    RAISE EXCEPTION 'O valor do pagamento tem de ser maior que zero.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Competência é MÊS de referência: qualquer dia do mês vira o dia 1.
  -- Sem isso o índice único não impediria confirmar agosto duas vezes
  -- com dias diferentes, que é justamente o furo (2).
  v_competencia := date_trunc('month', p_competencia)::date;

  -- Existência + lock da linha: serializa dois cliques simultâneos no
  -- mesmo estabelecimento. `assinaturas_pagamentos.tenant_id` referencia
  -- `tenants`, não `assinaturas`, então sem esta checagem daria para
  -- gravar pagamento de quem não tem assinatura.
  PERFORM 1 FROM public.assinaturas WHERE tenant_id = p_tenant_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Assinatura não encontrada para o tenant %.', p_tenant_id;
  END IF;

  -- (2) Quem garante a idempotência é o índice único; aqui só
  -- traduzimos o erro do catálogo para uma frase que a plataforma
  -- entende.
  BEGIN
    INSERT INTO public.assinaturas_pagamentos (tenant_id, competencia, valor, metodo, confirmado_por)
    VALUES (p_tenant_id, v_competencia, p_valor, p_metodo, p_confirmado_por);
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'A competência % já foi confirmada para este estabelecimento.',
      to_char(v_competencia, 'MM/YYYY')
      USING ERRCODE = 'unique_violation';
  END;

  -- (3) O status sai da data NOVA. As duas expressões leem a linha
  -- antes do UPDATE, sob o lock da própria linha, então não há leitura
  -- velha e um ciclo pago em cima de um atraso grande devolve
  -- 'carencia'/'bloqueado' honestamente em vez de 'ativo'.
  UPDATE public.assinaturas
     SET data_vencimento  = data_vencimento + ciclo_dias,
         status           = public.calcular_status_assinatura(
                              data_vencimento + ciclo_dias, carencia_dias),
         ultima_renovacao = current_date
   WHERE tenant_id = p_tenant_id
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$;

-- REVOKE antes do GRANT: na ordem inversa o REVOKE de PUBLIC também
-- tira o EXECUTE de `authenticated` (ele herda de PUBLIC).
REVOKE ALL ON FUNCTION public.confirmar_renovacao_assinatura(uuid, date, numeric, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirmar_renovacao_assinatura(uuid, date, numeric, text, text)
  TO authenticated;

-- ── 4. search_path que a 20260802 apagou nas duas funções ──────────
--      A de renovação já nasceu com `SET search_path` no CREATE acima;
--      `sincronizar_status_assinatura` NÃO é recriada aqui de propósito
--      (CREATE OR REPLACE descartaria de novo o proconfig e ainda
--      arriscaria desfazer o vínculo de tenant da 20260802) — só recebe
--      o ALTER.
ALTER FUNCTION public.sincronizar_status_assinatura(uuid)
  SET search_path = public, auth, extensions;

-- ── 5. Conferência ao vivo (não escreve nada) ──────────────────────
DO $conf$
DECLARE
  v_reg   oid;
  v_sinc  oid;
  v_def   text;
  v_cfg   text[];
BEGIN
  -- A assinatura de 5 argumentos tem de continuar a MESMA: um parâmetro
  -- novo criaria sobrecarga e a chamada do cliente viraria ambígua
  -- (42725).
  v_reg := to_regprocedure('public.confirmar_renovacao_assinatura(uuid, date, numeric, text, text)');
  IF v_reg IS NULL THEN
    RAISE EXCEPTION 'FALHA: confirmar_renovacao_assinatura(uuid, date, numeric, text, text) não existe.';
  END IF;

  v_def := pg_get_functiondef(v_reg);

  IF v_def NOT LIKE '%is_super_admin() IS NOT TRUE%' THEN
    RAISE EXCEPTION 'FALHA: a guarda de plataforma não está no corpo da função.';
  END IF;

  IF v_def LIKE '%gerente%' OR v_def LIKE '%tenant_atual_id()%' THEN
    RAISE EXCEPTION 'FALHA: o ramo de auto-renovação pelo próprio estabelecimento continua no corpo da função.';
  END IF;

  IF v_def NOT LIKE '%date_trunc(''month''%' THEN
    RAISE EXCEPTION 'FALHA: a competência não está sendo normalizada para o mês — o índice único não impediria confirmar o mesmo mês duas vezes.';
  END IF;

  IF v_def NOT LIKE '%calcular_status_assinatura(%' THEN
    RAISE EXCEPTION 'FALHA: o status voltou a ser fixo em vez de derivado da data nova.';
  END IF;

  IF v_def NOT LIKE '%p_valor <= 0%' THEN
    RAISE EXCEPTION 'FALHA: p_valor voltou a entrar sem validação no banco.';
  END IF;

  -- search_path fixo nas DUAS funções SECURITY DEFINER de assinatura.
  SELECT proconfig INTO v_cfg FROM pg_proc WHERE oid = v_reg;
  IF v_cfg IS NULL OR NOT EXISTS (SELECT 1 FROM unnest(v_cfg) c WHERE c LIKE 'search_path=%') THEN
    RAISE EXCEPTION 'FALHA: confirmar_renovacao_assinatura está SECURITY DEFINER com search_path mutável.';
  END IF;

  v_sinc := to_regprocedure('public.sincronizar_status_assinatura(uuid)');
  IF v_sinc IS NULL THEN
    RAISE EXCEPTION 'FALHA: sincronizar_status_assinatura(uuid) não existe.';
  END IF;

  v_cfg := NULL;   -- SELECT INTO sem linha NÃO limpa a variável
  SELECT proconfig INTO v_cfg FROM pg_proc WHERE oid = v_sinc;
  IF v_cfg IS NULL OR NOT EXISTS (SELECT 1 FROM unnest(v_cfg) c WHERE c LIKE 'search_path=%') THEN
    RAISE EXCEPTION 'FALHA: sincronizar_status_assinatura está SECURITY DEFINER com search_path mutável.';
  END IF;

  -- Idempotência de competência.
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = 'public'
       AND tablename  = 'assinaturas_pagamentos'
       AND indexname  = 'assinaturas_pagamentos_competencia_uidx'
  ) THEN
    RAISE EXCEPTION 'FALHA: sem o índice único (tenant_id, competencia) a mesma competência pode ser confirmada duas vezes.';
  END IF;

  -- Quem pode executar.
  IF has_function_privilege('anon', v_reg, 'EXECUTE') THEN
    RAISE EXCEPTION 'FALHA: anon ainda executa confirmar_renovacao_assinatura.';
  END IF;
  IF NOT has_function_privilege('authenticated', v_reg, 'EXECUTE') THEN
    RAISE EXCEPTION 'FALHA: authenticated perdeu o EXECUTE — o Console não conseguiria renovar.';
  END IF;

  -- A função de onde o status passa a sair precisa existir e responder
  -- certo (leitura pura, não escreve).
  IF to_regprocedure('public.calcular_status_assinatura(date, integer, date)') IS NULL THEN
    RAISE EXCEPTION 'FALHA: calcular_status_assinatura(date, integer, date) não existe — a gravação do status quebraria com 42883.';
  END IF;
  IF public.calcular_status_assinatura(current_date + 30, 3) <> 'ativo' THEN
    RAISE EXCEPTION 'FALHA: calcular_status_assinatura não devolve ativo para vencimento futuro.';
  END IF;
  IF public.calcular_status_assinatura(current_date - 10, 3) <> 'bloqueado' THEN
    RAISE EXCEPTION 'FALHA: calcular_status_assinatura não devolve bloqueado depois da carência.';
  END IF;

  RAISE NOTICE 'OK: renovação de assinatura é exclusiva da plataforma, idempotente por competência, com status derivado da data e search_path fixo nas duas funções.';
END;
$conf$;
