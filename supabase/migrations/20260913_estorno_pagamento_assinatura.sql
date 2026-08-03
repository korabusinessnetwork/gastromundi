-- ══════════════════════════════════════════════════════════════════
-- F022-HISTORICO — cancelar (estornar) um pagamento de assinatura
-- lançado por engano.
-- specs/f022-historico-de-pagamentos-da-assinatura.md · ADR-006 · ADR-008
--
-- O QUE ESTAVA ABERTO
-- A 20260909 deu à plataforma o poder de confirmar o pagamento da
-- mensalidade, e a Rodada 2 pôs o botão disso no Console. O inverso não
-- existia em lugar nenhum: valor errado, mês errado ou estabelecimento
-- errado só se desfaziam com UPDATE manual em produção — e um UPDATE
-- manual erra o `data_vencimento`, que é o que decide o bloqueio do
-- cliente (Fase 5). Esta migração fecha o par.
--
-- DESENHO
--   • ESTORNO NÃO APAGA. A linha continua no histórico com quem
--     confirmou, quanto e quando; ganha `estornado_em/por/motivo`.
--     Apagar destruiria a auditoria justamente do caminho do dinheiro.
--   • O índice único de competência vira PARCIAL (`WHERE estornado_em
--     IS NULL`), mantendo o MESMO nome. É isso que permite o conserto
--     de verdade: estorna agosto e registra agosto de novo com o valor
--     certo. Sem a parcialidade, o estorno deixaria o mês travado.
--   • O vencimento volta EXATAMENTE um ciclo e o status é recalculado
--     por `calcular_status_assinatura` — nunca cravado (ADR-006 §3).
--   • As duas tabelas seguem SEM política de INSERT/UPDATE/DELETE: a
--     escrita continua sendo só por função SECURITY DEFINER. NÃO é
--     preciso mexer em RLS no painel. A LEITURA do histórico já está
--     resolvida desde a 20260726 (a policy de `assinaturas_pagamentos`
--     tem o ramo `is_super_admin()`), então o Console lê direto e
--     nenhuma RPC de leitura é criada aqui.
-- ══════════════════════════════════════════════════════════════════

-- ── 1. Colunas do estorno (aditivas, nulas para todo histórico já
--       gravado — nenhuma linha existente muda de significado) ───────
ALTER TABLE public.assinaturas_pagamentos
  ADD COLUMN IF NOT EXISTS estornado_em   timestamptz,
  ADD COLUMN IF NOT EXISTS estornado_por  text,
  ADD COLUMN IF NOT EXISTS estorno_motivo text;

-- ── 2. O índice único de (tenant_id, competencia) passa a valer só
--       para pagamento VÁLIDO ─────────────────────────────────────────
--       Mesmo nome de propósito: a conferência ao vivo da 20260909
--       cobra a existência do índice por nome, e ela tem de continuar
--       passando se aquela migração for reexecutada.
DROP INDEX IF EXISTS public.assinaturas_pagamentos_competencia_uidx;
CREATE UNIQUE INDEX IF NOT EXISTS assinaturas_pagamentos_competencia_uidx
  ON public.assinaturas_pagamentos (tenant_id, competencia)
  WHERE estornado_em IS NULL;

-- ── 3. A RPC do estorno ─────────────────────────────────────────────
--       `p_tenant_id` NÃO é parâmetro de propósito: o estabelecimento
--       sai da própria linha de pagamento. Recebê-lo do cliente
--       permitiria estornar o pagamento de um e descontar o ciclo de
--       outro.
CREATE OR REPLACE FUNCTION public.estornar_pagamento_assinatura(
  p_pagamento_id uuid,
  p_motivo text,
  p_estornado_por text
)
RETURNS public.assinaturas
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_tenant    uuid;
  v_estornado timestamptz;
  v_result    public.assinaturas;
BEGIN
  -- Mesma guarda da confirmação (decisão 027): quem paga a mensalidade
  -- não dá baixa nela, e muito menos desfaz a baixa. Primeira instrução
  -- do corpo — nada acontece antes de saber quem está chamando.
  IF public.is_super_admin() IS NOT TRUE THEN
    RAISE EXCEPTION 'Somente a plataforma pode cancelar um pagamento de assinatura.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_pagamento_id IS NULL THEN
    RAISE EXCEPTION 'Informe qual pagamento será cancelado.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Motivo é obrigatório NO BANCO, não só na tela: o histórico é a
  -- única memória de por que um pagamento sumiu da conta.
  IF p_motivo IS NULL OR length(btrim(p_motivo)) < 3 THEN
    RAISE EXCEPTION 'Escreva o motivo do cancelamento — ele fica gravado no histórico.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Leitura sem lock só para descobrir o estabelecimento.
  SELECT tenant_id INTO v_tenant
    FROM public.assinaturas_pagamentos
   WHERE id = p_pagamento_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pagamento não encontrado no histórico deste estabelecimento.'
      USING ERRCODE = 'no_data_found';
  END IF;

  -- Ordem de lock IGUAL à da renovação (assinaturas → pagamentos).
  -- Travar na ordem inversa abriria deadlock quando um estorno e uma
  -- confirmação do mesmo estabelecimento acontecem ao mesmo tempo.
  PERFORM 1 FROM public.assinaturas WHERE tenant_id = v_tenant FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Assinatura não encontrada para o estabelecimento deste pagamento.'
      USING ERRCODE = 'no_data_found';
  END IF;

  -- Agora sim, sob o lock: reler o pagamento decide o duplo clique.
  -- Dois estornos simultâneos descontariam DOIS ciclos de um pagamento
  -- só, e o cliente ficaria bloqueado sem dever nada.
  SELECT estornado_em INTO v_estornado
    FROM public.assinaturas_pagamentos
   WHERE id = p_pagamento_id
     FOR UPDATE;

  IF v_estornado IS NOT NULL THEN
    RAISE EXCEPTION 'Este pagamento já foi cancelado em %.', to_char(v_estornado, 'DD/MM/YYYY')
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.assinaturas_pagamentos
     SET estornado_em   = now(),
         estornado_por  = p_estornado_por,
         estorno_motivo = btrim(p_motivo)
   WHERE id = p_pagamento_id;

  -- O inverso exato da confirmação: um ciclo a menos, status derivado
  -- da data NOVA. 'cancelado' é manual e nunca recalculado — mesma
  -- regra de `sincronizar_status_assinatura`.
  -- `ultima_renovacao` não pode continuar apontando para um pagamento
  -- que deixou de valer: vira a data do pagamento válido mais recente
  -- que sobrou (NULL se não sobrou nenhum). O UPDATE acima já marcou a
  -- linha estornada, então ela fica de fora desta conta.
  UPDATE public.assinaturas
     SET data_vencimento  = data_vencimento - ciclo_dias,
         status           = CASE
                              WHEN status = 'cancelado' THEN status
                              ELSE public.calcular_status_assinatura(
                                     data_vencimento - ciclo_dias, carencia_dias)
                            END,
         ultima_renovacao = (
           SELECT max(p.confirmado_em)::date
             FROM public.assinaturas_pagamentos p
            WHERE p.tenant_id = v_tenant
              AND p.estornado_em IS NULL
         )
   WHERE tenant_id = v_tenant
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$;

-- REVOKE antes do GRANT: na ordem inversa o REVOKE de PUBLIC também
-- tira o EXECUTE de `authenticated` (ele herda de PUBLIC).
REVOKE ALL ON FUNCTION public.estornar_pagamento_assinatura(uuid, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.estornar_pagamento_assinatura(uuid, text, text)
  TO authenticated;

-- ── 4. Conferência ao vivo (não escreve nada) ───────────────────────
DO $conf$
DECLARE
  v_reg oid;
  v_def text;
  v_cfg text[];
  v_pos_guarda int;
  v_pos_escrita int;
BEGIN
  -- 4.1 As três colunas do estorno.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name   = 'assinaturas_pagamentos'
       AND column_name  IN ('estornado_em', 'estornado_por', 'estorno_motivo')
     GROUP BY table_name HAVING count(*) = 3
  ) THEN
    RAISE EXCEPTION 'FALHA: assinaturas_pagamentos não tem as três colunas de estorno.';
  END IF;

  -- 4.2 O índice único tem de ser PARCIAL. Se continuar total, estornar
  --     agosto deixa agosto travado para sempre e o conserto não fecha.
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = 'public'
       AND tablename  = 'assinaturas_pagamentos'
       AND indexname  = 'assinaturas_pagamentos_competencia_uidx'
       AND indexdef ILIKE '%estornado_em IS NULL%'
  ) THEN
    RAISE EXCEPTION 'FALHA: assinaturas_pagamentos_competencia_uidx não é parcial — competência estornada continuaria bloqueada.';
  END IF;

  -- 4.3 A função existe com a assinatura que o cliente chama.
  v_reg := to_regprocedure('public.estornar_pagamento_assinatura(uuid, text, text)');
  IF v_reg IS NULL THEN
    RAISE EXCEPTION 'FALHA: estornar_pagamento_assinatura(uuid, text, text) não existe.';
  END IF;

  -- `pg_get_functiondef` devolve o fonte COM comentários, e o corpo
  -- acima explica em português o que faz — conferir o texto cru daria
  -- a guarda como presente por causa de um comentário. Mesmo cuidado
  -- da 20260909 e da 20260912.
  v_def := regexp_replace(pg_get_functiondef(v_reg), '--.*', '', 'gn');

  IF v_def NOT LIKE '%is_super_admin() IS NOT TRUE%' THEN
    RAISE EXCEPTION 'FALHA: a guarda de plataforma não está no corpo do estorno.';
  END IF;

  -- Guarda presente não basta: ela tem de vir ANTES de qualquer escrita.
  v_pos_guarda  := position('is_super_admin() IS NOT TRUE' in v_def);
  v_pos_escrita := position('UPDATE public.assinaturas_pagamentos' in v_def);
  IF v_pos_escrita = 0 THEN
    RAISE EXCEPTION 'FALHA: o estorno não marca mais a linha de pagamento.';
  END IF;
  IF v_pos_guarda > v_pos_escrita THEN
    RAISE EXCEPTION 'FALHA: a guarda de plataforma ficou depois da escrita.';
  END IF;

  -- Estorno NÃO apaga: a auditoria do dinheiro é a linha antiga.
  IF v_def LIKE '%DELETE FROM public.assinaturas_pagamentos%' THEN
    RAISE EXCEPTION 'FALHA: o estorno passou a apagar a linha em vez de marcá-la.';
  END IF;

  -- O estabelecimento sai da linha, não do cliente.
  -- `position`, não `LIKE`: em LIKE o `_` é curinga de um caractere, e
  -- o padrão '%p_tenant_id%' casava com o alias `p.tenant_id` que o
  -- próprio corpo usa — a conferência reprovava a função correta.
  IF position('p_tenant_id' in v_def) > 0 THEN
    RAISE EXCEPTION 'FALHA: o estorno voltou a receber o estabelecimento por parâmetro.';
  END IF;

  IF v_def NOT LIKE '%data_vencimento - ciclo_dias%' THEN
    RAISE EXCEPTION 'FALHA: o estorno não devolve o ciclo no vencimento.';
  END IF;

  IF v_def NOT LIKE '%calcular_status_assinatura(%' THEN
    RAISE EXCEPTION 'FALHA: o status do estorno virou fixo em vez de derivado da data.';
  END IF;

  IF v_def NOT LIKE '%length(btrim(p_motivo)) < 3%' THEN
    RAISE EXCEPTION 'FALHA: o motivo do estorno deixou de ser obrigatório no banco.';
  END IF;

  -- 4.4 SECURITY DEFINER sem search_path fixo é escalada de privilégio.
  SELECT proconfig INTO v_cfg FROM pg_proc WHERE oid = v_reg;
  IF v_cfg IS NULL OR NOT EXISTS (SELECT 1 FROM unnest(v_cfg) c WHERE c LIKE 'search_path=%') THEN
    RAISE EXCEPTION 'FALHA: estornar_pagamento_assinatura está SECURITY DEFINER com search_path mutável.';
  END IF;

  -- 4.5 Quem pode executar.
  IF has_function_privilege('anon', v_reg, 'EXECUTE') THEN
    RAISE EXCEPTION 'FALHA: anon ainda executa estornar_pagamento_assinatura.';
  END IF;
  IF NOT has_function_privilege('authenticated', v_reg, 'EXECUTE') THEN
    RAISE EXCEPTION 'FALHA: authenticated perdeu o EXECUTE — o Console não conseguiria cancelar um pagamento.';
  END IF;

  -- 4.6 Nenhuma política de escrita apareceu nas tabelas de assinatura:
  --     a porta continua sendo só a função.
  IF EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename IN ('assinaturas', 'assinaturas_pagamentos')
       AND cmd <> 'SELECT'
  ) THEN
    RAISE EXCEPTION 'FALHA: apareceu política de escrita em assinaturas/assinaturas_pagamentos — a escrita tem de ser só pelas RPCs.';
  END IF;

  RAISE NOTICE 'OK: estorno de pagamento é exclusivo da plataforma, não apaga histórico, devolve um ciclo com status derivado e libera a competência para novo lançamento.';
END;
$conf$;
