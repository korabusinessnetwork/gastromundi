-- ══════════════════════════════════════════════════════════════════
-- Aceite dos Termos de Uso no provisionamento
-- Pré-venda §1.5 (LGPD / contrato) · decisão 017 (SaaS multi-tenant)
--
-- O QUE ESTAVA FURADO
-- A plataforma vai vender acesso a um sistema que guarda venda, caixa e
-- dado de cliente final de terceiros — e não tinha onde registrar que o
-- contratante aceitou alguma coisa. Sem esse registro, o Termo de Uso
-- publicado em /termos é um texto no site: não há prova de que o dono do
-- estabelecimento o leu, nem QUAL texto ele leu no dia em que assinou.
-- "O cliente aceitou os termos" sem versão não vale nada: o texto muda
-- (preço, prazo de retenção, foro) e o que obriga é a redação vigente na
-- data do aceite.
--
-- O QUE ESTA MIGRAÇÃO FAZ
-- Duas colunas em `tenants`, carimbadas por DEFAULT no INSERT:
--   • termos_versao      — QUAL redação foi aceita (bate com VERSAO_LEGAL
--                          de src/lib/legal/versaoLegal.js);
--   • termos_aceitos_em  — QUANDO.
--
-- POR QUE DEFAULT, E NÃO UM PARÂMETRO NOVO EM provisionar_tenant
-- `provisionar_tenant` (20260917) tem ~200 linhas e quatro argumentos.
-- Acrescentar um quinto criaria sobrecarga ambígua para a chamada do
-- Console (erro 42725, o mesmo que a 20260917 registra), e recriar o corpo
-- inteiro só para citar duas colunas é como nasceu a regressão que a
-- 20260917 teve de consertar (a 20260908 copiou o corpo e perdeu o seed
-- dos grupos). O DEFAULT carimba o INSERT que já existe, sem tocar nele.
-- O ato humano do aceite acontece na tela: o Console só habilita "Criar
-- estabelecimento" depois da confirmação explícita de quem está vendendo,
-- com link para /termos e /privacidade. Estas colunas são a PROVA, não a
-- porta.
--
-- POR QUE OS TENANTS QUE JÁ EXISTEM FICAM NULL
-- `ADD COLUMN ... DEFAULT` no Postgres 11+ preenche as linhas antigas.
-- Aqui a coluna nasce SEM default e o default entra num segundo comando,
-- de propósito: o GastroMundi é anterior ao Termo, e carimbar nele um
-- aceite que nunca houve seria fabricar prova. NULL é a verdade —
-- "aceite não registrado" — e o Console mostra assim.
--
-- Idempotente (ADD COLUMN IF NOT EXISTS + SET DEFAULT).
-- ⚠️ EXECUÇÃO MANUAL: rodar no SQL Editor do Supabase.
-- PRÉ-REQUISITOS: tenants (20260716), provisionar_tenant (20260917).
-- RLS: nenhuma mudança no painel. `tenants` segue com SELECT só, e a
-- escrita continua exclusivamente por RPC — estas colunas entram pelo
-- DEFAULT do INSERT de `provisionar_tenant`, que é SECURITY DEFINER.
-- ══════════════════════════════════════════════════════════════════

-- ── 1) Colunas SEM default (não backfilla quem já existe) ─────────
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS termos_versao     text,
  ADD COLUMN IF NOT EXISTS termos_aceitos_em timestamptz;

-- ── 2) Default só para as linhas NOVAS ────────────────────────────
-- '1' é a mesma VERSAO_LEGAL de src/lib/legal/versaoLegal.js. Ao publicar
-- uma redação nova, os dois sobem juntos — aceiteTermosSqlGuard.test.js
-- quebra a suíte se um andar sem o outro.
ALTER TABLE public.tenants
  ALTER COLUMN termos_versao     SET DEFAULT '1',
  ALTER COLUMN termos_aceitos_em SET DEFAULT now();

COMMENT ON COLUMN public.tenants.termos_versao IS
  'Versão do Termo de Uso aceita no provisionamento (VERSAO_LEGAL do front). NULL = tenant anterior aos Termos, aceite não registrado.';
COMMENT ON COLUMN public.tenants.termos_aceitos_em IS
  'Quando o Termo de Uso foi aceito, carimbado pelo DEFAULT no INSERT de provisionar_tenant. NULL = aceite não registrado.';

-- ══════════════════════════════════════════════════════════════════
-- Autoteste (sem escrita) — falha alto se a migração não pegou.
-- ══════════════════════════════════════════════════════════════════
DO $conf$
DECLARE
  v_default_versao text;
  v_default_data   text;
  v_tipo_versao    text;
  v_tipo_data      text;
  v_sem_aceite     bigint;
BEGIN
  SELECT a.atttypid::regtype::text,
         pg_get_expr(d.adbin, d.adrelid)
    INTO v_tipo_versao, v_default_versao
    FROM pg_attribute a
    LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
   WHERE a.attrelid = 'public.tenants'::regclass
     AND a.attname  = 'termos_versao';

  IF v_tipo_versao IS NULL THEN
    RAISE EXCEPTION 'tenants.termos_versao não existe após a migração.';
  END IF;
  IF v_tipo_versao <> 'text' THEN
    RAISE EXCEPTION 'tenants.termos_versao precisa ser text (está %).', v_tipo_versao;
  END IF;
  -- Sem default a coluna é decoração: o INSERT de provisionar_tenant não a
  -- cita, então todo tenant novo nasceria sem registro de aceite.
  IF v_default_versao IS NULL THEN
    RAISE EXCEPTION 'tenants.termos_versao ficou sem DEFAULT.';
  END IF;

  SELECT a.atttypid::regtype::text,
         pg_get_expr(d.adbin, d.adrelid)
    INTO v_tipo_data, v_default_data
    FROM pg_attribute a
    LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
   WHERE a.attrelid = 'public.tenants'::regclass
     AND a.attname  = 'termos_aceitos_em';

  IF v_tipo_data IS NULL THEN
    RAISE EXCEPTION 'tenants.termos_aceitos_em não existe após a migração.';
  END IF;
  IF v_tipo_data <> 'timestamp with time zone' THEN
    RAISE EXCEPTION 'tenants.termos_aceitos_em precisa ser timestamptz (está %).', v_tipo_data;
  END IF;
  IF v_default_data IS NULL OR v_default_data NOT LIKE '%now()%' THEN
    RAISE EXCEPTION 'tenants.termos_aceitos_em ficou sem DEFAULT now().';
  END IF;

  -- `tenants` não pode ganhar policy de escrita por causa disto (ADR-005/008
  -- §7): quem escreve continua sendo só RPC SECURITY DEFINER.
  IF EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'tenants'
       AND cmd IN ('INSERT', 'UPDATE', 'DELETE')
  ) THEN
    RAISE EXCEPTION 'tenants ganhou policy de escrita — a escrita tem que seguir só por RPC.';
  END IF;

  SELECT count(*) INTO v_sem_aceite FROM public.tenants WHERE termos_aceitos_em IS NULL;

  RAISE NOTICE 'Aceite de Termos instalado em tenants. % estabelecimento(s) sem aceite registrado — são os anteriores aos Termos, e ficam NULL de propósito (carimbar aceite que não houve seria fabricar prova). Todo estabelecimento criado daqui para frente nasce carimbado.', v_sem_aceite;
END $conf$;
