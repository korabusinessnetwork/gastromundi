-- ══════════════════════════════════════════════════════════════════
-- Assinatura ISENTA (cortesia) — `isento_ate` + RPC definir_isencao_tenant
-- Billing (ADR-006 §3/§4 · decisão 024) · 5ª peça de ESCRITA do Console
--
-- O QUE ESTAVA FURADO
-- A plataforma sabe registrar mensalidade ZERO (20260911 aceita `p_valor = 0`
-- de propósito: cortesia, piloto, sócio), mas NÃO sabe manter esse
-- estabelecimento no ar. O status é sempre derivado de `data_vencimento` +
-- `carencia_dias` (ADR-006 §3), e o único caminho que empurra o vencimento é
-- `confirmar_renovacao_assinatura` (20260909) — que recusa `p_valor <= 0` com
-- 'check_violation'. Resultado: um cliente de cortesia opera até o vencimento,
-- entra em carência, e no 4º dia as 48 policies RESTRICTIVE de 20260720 fecham
-- LEITURA E ESCRITA de 12 tabelas na cara dele. Não havia como desfazer isso
-- pela tela: só um UPDATE cru no SQL Editor, todo mês, para sempre.
--
-- POR QUE NÃO AFROUXAR O `p_valor <= 0`
-- Porque a recusa não é um acidente: ela protege o fluxo de cobrança REAL de
-- gravar pagamento de R$ 0,00 no histórico e empurrar um ciclo de graça. A
-- própria 20260909 tem um autoteste que EXIGE a existência dessa recusa no
-- corpo da função ("FALHA: p_valor voltou a entrar sem validação no banco") —
-- tirá-la quebra a migração anterior de propósito. E, no fundo, cortesia não é
-- "pagamento de zero reais": é AUSÊNCIA de cobrança. Misturar as duas coisas
-- suja o histórico financeiro e faz a plataforma contar pagamentos que nunca
-- existiram.
--
-- O DESENHO
-- Uma coluna nova, `isento_ate date`, diz até quando este estabelecimento não
-- é cobrado. Enquanto `current_date <= isento_ate`, `assinatura_ativa()`
-- devolve true sem nem olhar o vencimento — o vencimento continua andando
-- para trás e ninguém precisa fingir pagamento nenhum. Acabada a isenção, a
-- régua normal volta a valer sozinha, sem nenhuma ação da plataforma: é por
-- isso que a isenção tem DATA e não é um booleano. Cortesia sem prazo vira
-- cliente esquecido operando de graça para sempre — exatamente o buraco que a
-- 20260908 fechou para 'sem assinatura'.
--
-- `isencao_motivo` é obrigatório ao conceder e fica gravado na linha: daqui a
-- um ano ninguém lembra por que aquele estabelecimento não paga.
--
-- 'cancelado' continua ganhando de tudo. É estado MANUAL da plataforma ("este
-- cliente saiu"), e uma isenção esquecida não pode ressuscitar acesso de quem
-- foi desligado.
--
-- SEGURANÇA (mesmo desenho de 20260911/20260913):
-- • SECURITY DEFINER + SET search_path (a tabela não tem policy de UPDATE:
--   escrita em `assinaturas` é só por RPC desde a 20260719/20260726).
-- • Guarda `is_super_admin() IS NOT TRUE` na entrada — NULL barra igual a
--   false (20260730). Isenção é decisão da PLATAFORMA: sem esse gate, o admin
--   do próprio estabelecimento se daria acesso vitalício de graça, que é o
--   bypass mais valioso que existe neste sistema.
-- • Teto de 5 anos: pega o dedo que digitou 2260 no lugar de 2026 antes de
--   isso virar "nunca mais cobra ninguém".
-- • REVOKE de PUBLIC/anon ANTES do GRANT (nessa ordem: o REVOKE depois
--   tiraria de authenticated também).
--
-- Idempotente (ADD COLUMN IF NOT EXISTS + CREATE OR REPLACE FUNCTION).
-- ⚠️ EXECUÇÃO MANUAL: rodar no SQL Editor do Supabase.
-- PRÉ-REQUISITOS: assinaturas (20260719), assinatura_ativa (20260720),
-- is_super_admin() (20260723/20260730).
-- RLS: NENHUMA policy nova e nenhum ajuste no painel. As policies de
-- 20260720 chamam `assinatura_ativa()`, que passa a conhecer a isenção — o
-- comportamento muda sem uma linha de policy mudar. As colunas novas ficam
-- sob as policies de SELECT que `assinaturas` já tem (tenant lê a própria
-- linha, plataforma lê todas) e sem policy de UPDATE, como o resto da tabela.
-- ══════════════════════════════════════════════════════════════════

-- ── 1. As colunas ─────────────────────────────────────────────────
ALTER TABLE public.assinaturas
  ADD COLUMN IF NOT EXISTS isento_ate     date,
  ADD COLUMN IF NOT EXISTS isencao_motivo text;

COMMENT ON COLUMN public.assinaturas.isento_ate IS
  'Cortesia: até este dia (inclusive) o estabelecimento não é bloqueado por vencimento. NULL = cobrança normal. Ver 20260918.';
COMMENT ON COLUMN public.assinaturas.isencao_motivo IS
  'Por que este estabelecimento está isento. Obrigatório ao conceder a isenção (20260918).';

-- ── 2. O portão de enforcement passa a conhecer a isenção ─────────
--      Esta é a função que as 48 policies RESTRICTIVE de 20260720 chamam.
--      Sem esta parte, a coluna acima seria decoração: o tenant de cortesia
--      continuaria trancado fora das 12 tabelas operacionais.
CREATE OR REPLACE FUNCTION public.assinatura_ativa(p_tenant_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_data_vencimento date;
  v_carencia_dias   integer;
  v_status_cache    text;
  v_isento_ate      date;
  v_status          text;
BEGIN
  SELECT data_vencimento, carencia_dias, status, isento_ate
    INTO v_data_vencimento, v_carencia_dias, v_status_cache, v_isento_ate
  FROM public.assinaturas
  WHERE tenant_id = p_tenant_id;

  -- Billing não configurado ≠ inadimplência. Um estabelecimento sem linha de
  -- assinatura opera; o Console o mostra no topo do alerta de validade.
  IF NOT FOUND THEN
    RETURN true;
  END IF;

  -- Cancelado é estado MANUAL e ganha de tudo, inclusive de uma isenção
  -- esquecida: quem foi desligado não volta por uma cortesia antiga.
  IF v_status_cache = 'cancelado' THEN
    RETURN false;
  END IF;

  -- Cortesia dentro do prazo: passa sem olhar vencimento. O vencimento segue
  -- correndo por baixo — no dia seguinte ao fim da isenção a régua normal
  -- volta a valer sozinha, sem ninguém precisar lembrar de nada.
  IF v_isento_ate IS NOT NULL AND current_date <= v_isento_ate THEN
    RETURN true;
  END IF;

  v_status := public.calcular_status_assinatura(v_data_vencimento, v_carencia_dias);
  RETURN v_status IN ('ativo', 'carencia');
END;
$$;

GRANT EXECUTE ON FUNCTION public.assinatura_ativa(uuid) TO authenticated;

-- ── 3. A RPC que concede e retira a cortesia ──────────────────────
--      `p_isento_ate = NULL` RETIRA a isenção (e limpa o motivo): a mesma
--      porta que dá é a que tira, para não existir um estado só alcançável
--      pelo SQL Editor.
CREATE OR REPLACE FUNCTION public.definir_isencao_tenant(
  p_tenant_id  uuid,
  p_isento_ate date,
  p_motivo     text DEFAULT NULL
)
RETURNS public.assinaturas
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- Cortesia é sempre temporária por decisão de produto. Cinco anos é folgado
  -- para qualquer piloto/sócio real e ainda pega o ano digitado errado.
  c_teto_anos constant integer := 5;
  v_motivo    text;
  v_ass       public.assinaturas;
BEGIN
  -- ── Autorização: só a plataforma isenta alguém ───────────────────
  IF public.is_super_admin() IS NOT TRUE THEN
    RAISE EXCEPTION 'Apenas a plataforma pode isentar um estabelecimento da mensalidade.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── Validação de entrada ─────────────────────────────────────────
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'O estabelecimento é obrigatório.'
      USING ERRCODE = 'check_violation';
  END IF;

  v_motivo := nullif(btrim(coalesce(p_motivo, '')), '');

  IF p_isento_ate IS NOT NULL THEN
    -- Data no passado não isenta nada e ainda deixaria na tela a frase
    -- "cortesia até ontem", que lê como se estivesse valendo.
    IF p_isento_ate < current_date THEN
      RAISE EXCEPTION 'A cortesia tem de valer pelo menos até hoje.'
        USING ERRCODE = 'check_violation';
    END IF;

    IF p_isento_ate > current_date + (c_teto_anos * 365) THEN
      RAISE EXCEPTION 'A cortesia não pode passar de % anos.', c_teto_anos
        USING ERRCODE = 'check_violation';
    END IF;

    -- Motivo obrigatório no BANCO, não só na tela: daqui a um ano ninguém
    -- lembra por que este estabelecimento não paga, e "não sei por quê" é
    -- como cortesia vira receita perdida em silêncio.
    IF v_motivo IS NULL OR length(v_motivo) < 3 THEN
      RAISE EXCEPTION 'Escreva o motivo da cortesia — ele fica gravado na assinatura.'
        USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    -- Retirar a isenção limpa o motivo junto: motivo órfão sugeriria que a
    -- cortesia continua valendo.
    v_motivo := NULL;
  END IF;

  -- ── Escrita ──────────────────────────────────────────────────────
  -- tenant_id é PRIMARY KEY: este UPDATE nunca atinge mais de uma linha.
  -- NÃO toca em data_vencimento nem em status — isenção não é renovação, e
  -- empurrar o vencimento aqui seria um ciclo de graça por fora da 20260909.
  UPDATE public.assinaturas
     SET isento_ate     = p_isento_ate,
         isencao_motivo = v_motivo
   WHERE tenant_id = p_tenant_id
  RETURNING * INTO v_ass;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Este estabelecimento não tem assinatura: %', p_tenant_id
      USING ERRCODE = 'no_data_found';
  END IF;

  RETURN v_ass;
END;
$$;

-- Ordem importa: o REVOKE depois do GRANT tiraria de authenticated também.
REVOKE ALL ON FUNCTION public.definir_isencao_tenant(uuid, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.definir_isencao_tenant(uuid, date, text) TO authenticated;

-- ══════════════════════════════════════════════════════════════════
-- Autoteste (sem escrita) — falha alto se a migração não pegou.
-- ══════════════════════════════════════════════════════════════════
DO $conf$
DECLARE
  v_isen oid;
  v_gate oid;
  v_def  text;
  v_cfg  text[];
  v_qtd  integer;
BEGIN
  -- ── Colunas ──────────────────────────────────────────────────────
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'assinaturas'
       AND column_name IN ('isento_ate', 'isencao_motivo')
     GROUP BY table_name HAVING count(*) = 2
  ) THEN
    RAISE EXCEPTION 'FALHA: assinaturas ficou sem isento_ate/isencao_motivo.';
  END IF;

  -- ── O portão ─────────────────────────────────────────────────────
  v_gate := to_regprocedure('public.assinatura_ativa(uuid)');
  IF v_gate IS NULL THEN
    RAISE EXCEPTION 'FALHA: assinatura_ativa(uuid) não existe — as policies de 20260720 apontam para ela.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid = v_gate AND prosecdef) THEN
    RAISE EXCEPTION 'FALHA: assinatura_ativa precisa ser SECURITY DEFINER.';
  END IF;

  -- CREATE OR REPLACE descarta proconfig em silêncio; conferir de fato.
  SELECT proconfig INTO v_cfg FROM pg_proc WHERE oid = v_gate;
  IF v_cfg IS NULL OR NOT EXISTS (SELECT 1 FROM unnest(v_cfg) c WHERE c LIKE 'search_path=%') THEN
    RAISE EXCEPTION 'FALHA: assinatura_ativa ficou SECURITY DEFINER com search_path mutável.';
  END IF;

  -- Daqui para baixo, só CÓDIGO: o corpo é comentado em português e as
  -- palavras conferidas aparecem nos comentários (mesmo cuidado da 20260909).
  v_def := regexp_replace(pg_get_functiondef(v_gate), '--.*', '', 'gn');

  IF v_def NOT LIKE '%isento_ate%' THEN
    RAISE EXCEPTION 'FALHA: assinatura_ativa não olha isento_ate — o tenant de cortesia continuaria bloqueado.';
  END IF;
  IF v_def NOT LIKE '%cancelado%' THEN
    RAISE EXCEPTION 'FALHA: assinatura_ativa perdeu a checagem de cancelado.';
  END IF;
  IF v_def NOT LIKE '%calcular_status_assinatura(%' THEN
    RAISE EXCEPTION 'FALHA: assinatura_ativa parou de derivar o status da data — quem não é isento nunca bloquearia.';
  END IF;

  -- ── A RPC ────────────────────────────────────────────────────────
  v_isen := to_regprocedure('public.definir_isencao_tenant(uuid, date, text)');
  IF v_isen IS NULL THEN
    RAISE EXCEPTION 'FALHA: definir_isencao_tenant(uuid, date, text) não existe.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid = v_isen AND prosecdef) THEN
    RAISE EXCEPTION 'FALHA: definir_isencao_tenant precisa ser SECURITY DEFINER.';
  END IF;

  v_cfg := NULL;   -- SELECT INTO sem linha NÃO limpa a variável
  SELECT proconfig INTO v_cfg FROM pg_proc WHERE oid = v_isen;
  IF v_cfg IS NULL OR NOT EXISTS (SELECT 1 FROM unnest(v_cfg) c WHERE c LIKE 'search_path=%') THEN
    RAISE EXCEPTION 'FALHA: definir_isencao_tenant ficou SECURITY DEFINER com search_path mutável.';
  END IF;

  v_def := regexp_replace(pg_get_functiondef(v_isen), '--.*', '', 'gn');

  IF v_def NOT LIKE '%is_super_admin() IS NOT TRUE%' THEN
    RAISE EXCEPTION 'FALHA: definir_isencao_tenant sem a guarda de plataforma — o próprio cliente se isentaria.';
  END IF;
  IF v_def LIKE '%data_vencimento%' OR v_def LIKE '%SET status%' THEN
    RAISE EXCEPTION 'FALHA: definir_isencao_tenant mexe em vencimento/status — isso é renovação de graça por fora da 20260909.';
  END IF;

  -- Quem pode executar.
  IF has_function_privilege('anon', v_isen, 'EXECUTE') THEN
    RAISE EXCEPTION 'FALHA: anon executa definir_isencao_tenant.';
  END IF;
  IF NOT has_function_privilege('authenticated', v_isen, 'EXECUTE') THEN
    RAISE EXCEPTION 'FALHA: authenticated perdeu o EXECUTE — o Console não conseguiria isentar.';
  END IF;

  -- A recusa de valor zero da 20260909 TEM de continuar de pé: é ela que
  -- torna esta migração necessária, e afrouxá-la seria o atalho errado.
  IF to_regprocedure('public.confirmar_renovacao_assinatura(uuid, date, numeric, text, text)') IS NOT NULL THEN
    v_def := regexp_replace(
      pg_get_functiondef(to_regprocedure('public.confirmar_renovacao_assinatura(uuid, date, numeric, text, text)')),
      '--.*', '', 'gn'
    );
    IF v_def NOT LIKE '%p_valor <= 0%' THEN
      RAISE EXCEPTION 'FALHA: a recusa de pagamento zerado sumiu de confirmar_renovacao_assinatura.';
    END IF;
  END IF;

  -- Quantos estariam trancados hoje sem cortesia e sem mensalidade — é
  -- exatamente a lista que motivou a migração.
  SELECT count(*) INTO v_qtd
  FROM public.assinaturas
  WHERE coalesce(valor_mensal, 0) <= 0
    AND status <> 'cancelado'
    AND isento_ate IS NULL
    AND public.calcular_status_assinatura(data_vencimento, carencia_dias) = 'bloqueado';

  RAISE NOTICE 'Isenção instalada. Estabelecimentos sem mensalidade JÁ BLOQUEADOS e sem cortesia hoje: %. Marque a cortesia deles na aba "Planos e assinaturas" do Console.', v_qtd;
END $conf$;
