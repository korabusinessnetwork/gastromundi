-- ══════════════════════════════════════════════════════════════════
-- Leads do apex — public.leads + registrar_lead()
-- decisão 017 (SaaS white-label) · ADR-008 (RLS/isolamento)
--
-- ┌─ POR QUE ESTA MIGRATION EXISTE ─────────────────────────────────┐
-- │ O formulário "Agendar demonstração" da landing (kora.codes)     │
-- │ coletava nome, WhatsApp e e-mail e não gravava NADA: mostrava   │
-- │ "Parabéns por adquirir seu plano!" e o contato morria ali.      │
-- │ 100% dos leads eram perdidos — e a página ainda afirmava uma    │
-- │ coisa que não aconteceu.                                        │
-- │                                                                  │
-- │ Esta tabela é o outro lado daquele formulário: o contato entra  │
-- │ aqui junto com o plano que a pessoa montou (é o que diz do que  │
-- │ ela precisa) e aparece no Console, aba "Leads".                 │
-- └───────────────────────────────────────────────────────────────────┘
--
-- ⚠️ ISTO NÃO É DADO DE ESTABELECIMENTO. É funil comercial da Kora,
-- lido só pelo Console (super-admin `plataforma`). Por isso NÃO tem
-- tenant_id e NÃO entra no isolamento por tenant — um lead ainda não é
-- cliente de ninguém.
--
-- ⚠️ LGPD: são dados pessoais de terceiros. Três decisões deliberadas:
--   1. Só o mínimo para retornar o contato (nome, WhatsApp, e-mail).
--      Sem IP, sem user-agent, sem rastreamento.
--   2. `consentimento` é NOT NULL com CHECK (consentimento): o banco
--      RECUSA lead sem o aceite marcado no formulário. O aceite não é
--      enfeite de tela, é condição de gravação.
--   3. Anon NÃO enxerga a tabela: escreve pela função abaixo e não tem
--      SELECT nenhum. Ninguém baixa a lista de contatos com a chave
--      pública.
--
-- COMO O ANÔNIMO ESCREVE: `registrar_lead()`, SECURITY DEFINER com
-- GRANT EXECUTE TO anon — mesmo desenho de `criar_pedido_delivery`
-- (20260804_delivery_fundacao.sql). A validação fica no servidor, não
-- na confiança do front.
--
-- Idempotente: CREATE TABLE/INDEX IF NOT EXISTS, DROP POLICY IF EXISTS,
-- CREATE OR REPLACE FUNCTION.
-- ⚠️ EXECUÇÃO MANUAL: rode no SQL Editor do Supabase.
-- ⚠️ RLS: depois de aplicar, confira no painel (Authentication →
--    Policies) que `leads` está com RLS HABILITADA e que as únicas
--    policies são as duas de `plataforma` abaixo. Se RLS ficar
--    desligada, a lista de contatos fica legível por qualquer chave.
-- ══════════════════════════════════════════════════════════════════

-- ── 1. O lead ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.leads (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- como a pessoa quer ser chamada
  nome                 text        NOT NULL,
  -- só dígitos, com DDD (10 ou 11). Guardar sem máscara é o que deixa
  -- montar o link wa.me direto, sem limpar string na hora de ligar.
  whatsapp             text        NOT NULL,
  email                text        NOT NULL,
  -- de onde veio: hoje só o construtor de plano do apex, mas o campo
  -- existe porque o segundo formulário sempre chega.
  origem               text        NOT NULL DEFAULT 'apex_planos',
  -- o plano que a PESSOA montou. Vale mais que o total: diz de quais
  -- módulos ela sentiu falta antes de falar com a gente.
  plano_total_centavos integer,
  plano_modulos        text[]      NOT NULL DEFAULT '{}',
  plano_addons         text[]      NOT NULL DEFAULT '{}',
  -- aceite do formulário (LGPD). CHECK abaixo: sem aceite não grava.
  consentimento        boolean     NOT NULL DEFAULT false,
  -- carimbo de "já falei com essa pessoa" — é o que impede a lista de
  -- virar um monte de nome sem saber quem já foi atendido.
  atendido_em          timestamptz,
  atendido_por         text,
  created_at           timestamptz NOT NULL DEFAULT now()
);

-- Sem aceite não existe lead: a regra mora no banco, não só no React.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'leads_consentimento_check'
      AND conrelid = 'public.leads'::regclass
  ) THEN
    ALTER TABLE public.leads
      ADD CONSTRAINT leads_consentimento_check CHECK (consentimento);
  END IF;
END $$;

-- Nome vazio vira card anônimo na aba do Console.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'leads_nome_check'
      AND conrelid = 'public.leads'::regclass
  ) THEN
    ALTER TABLE public.leads
      ADD CONSTRAINT leads_nome_check
      CHECK (length(btrim(nome)) BETWEEN 2 AND 120);
  END IF;
END $$;

-- WhatsApp já normalizado: 10 (fixo com DDD) ou 11 (celular) dígitos.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'leads_whatsapp_check'
      AND conrelid = 'public.leads'::regclass
  ) THEN
    ALTER TABLE public.leads
      ADD CONSTRAINT leads_whatsapp_check
      CHECK (whatsapp ~ '^[0-9]{10,11}$');
  END IF;
END $$;

-- E-mail: forma mínima. Quem valida de verdade é o retorno do contato.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'leads_email_check'
      AND conrelid = 'public.leads'::regclass
  ) THEN
    ALTER TABLE public.leads
      ADD CONSTRAINT leads_email_check
      CHECK (email ~ '^[^[:space:]@]+@[^[:space:]@.]+([.][^[:space:]@.]+)+$'
             AND length(email) <= 160);
  END IF;
END $$;

-- A aba abre na lista inteira, mais novo primeiro.
CREATE INDEX IF NOT EXISTS leads_recentes_idx
  ON public.leads (created_at DESC);

-- Filtro "só quem ainda não foi atendido" — a visão de trabalho.
CREATE INDEX IF NOT EXISTS leads_pendentes_idx
  ON public.leads (created_at DESC)
  WHERE atendido_em IS NULL;

-- ── 2. Como o visitante anônimo grava ──────────────────────────────
-- SECURITY DEFINER: o anônimo NÃO tem permissão na tabela, tem
-- permissão nesta função. Ela é a única porta, e valida antes de abrir.
--
-- Reenvio: quem clica duas vezes (ou volta e reenvia em minutos) não
-- vira dois cards na aba. Dentro de 10 minutos o mesmo WhatsApp
-- ATUALIZA o lead anterior — o dado mais novo é o que vale.
CREATE OR REPLACE FUNCTION public.registrar_lead(
  p_nome                 text,
  p_whatsapp             text,
  p_email                text,
  p_consentimento        boolean,
  p_origem               text    DEFAULT 'apex_planos',
  p_plano_total_centavos integer DEFAULT NULL,
  p_plano_modulos        text[]  DEFAULT '{}',
  p_plano_addons         text[]  DEFAULT '{}'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nome     text := btrim(coalesce(p_nome, ''));
  v_whatsapp text := regexp_replace(coalesce(p_whatsapp, ''), '[^0-9]', '', 'g');
  v_email    text := lower(btrim(coalesce(p_email, '')));
  v_origem   text := coalesce(nullif(btrim(p_origem), ''), 'apex_planos');
  v_id       uuid;
BEGIN
  IF p_consentimento IS NOT TRUE THEN
    RAISE EXCEPTION 'É preciso aceitar o uso dos dados para receber o contato.';
  END IF;

  IF length(v_nome) < 2 OR length(v_nome) > 120 THEN
    RAISE EXCEPTION 'Informe um nome válido.';
  END IF;

  -- Celular brasileiro pode vir com o 55 na frente (colado do contato).
  IF length(v_whatsapp) IN (12, 13) AND left(v_whatsapp, 2) = '55' THEN
    v_whatsapp := substr(v_whatsapp, 3);
  END IF;

  IF v_whatsapp !~ '^[0-9]{10,11}$' THEN
    RAISE EXCEPTION 'Informe um WhatsApp com DDD.';
  END IF;

  IF v_email !~ '^[^[:space:]@]+@[^[:space:]@.]+([.][^[:space:]@.]+)+$'
     OR length(v_email) > 160 THEN
    RAISE EXCEPTION 'Confira o e-mail digitado.';
  END IF;

  -- Origem é rótulo interno, não texto livre do visitante.
  IF v_origem !~ '^[a-z0-9_]{1,40}$' THEN
    v_origem := 'apex_planos';
  END IF;

  UPDATE public.leads
     SET nome                 = v_nome,
         email                = v_email,
         origem               = v_origem,
         plano_total_centavos = p_plano_total_centavos,
         plano_modulos        = coalesce(p_plano_modulos, '{}'),
         plano_addons         = coalesce(p_plano_addons, '{}'),
         created_at           = now()
   WHERE whatsapp = v_whatsapp
     AND atendido_em IS NULL
     AND created_at > now() - interval '10 minutes'
   RETURNING id INTO v_id;

  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  INSERT INTO public.leads (
    nome, whatsapp, email, origem,
    plano_total_centavos, plano_modulos, plano_addons, consentimento
  ) VALUES (
    v_nome, v_whatsapp, v_email, v_origem,
    p_plano_total_centavos,
    coalesce(p_plano_modulos, '{}'),
    coalesce(p_plano_addons, '{}'),
    true
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- ── 3. Como o Console marca "já falei com essa pessoa" ─────────────
-- Podia ser UPDATE direto pela policy, mas assim a aba não precisa de
-- permissão de escrita na tabela inteira: só neste botão.
CREATE OR REPLACE FUNCTION public.marcar_lead_atendido(
  p_lead_id  uuid,
  p_atendido boolean,
  p_por      text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- `IS NOT TRUE`, e não `IF NOT`: se is_super_admin() voltar a devolver
  -- NULL para token sem o claim (o bug da 20260730), `IF NOT NULL` não
  -- entra no bloco e a exceção é PULADA — a guarda vira decoração.
  IF public.is_super_admin() IS NOT TRUE THEN
    RAISE EXCEPTION 'Só a plataforma pode mexer nos leads.';
  END IF;

  UPDATE public.leads
     SET atendido_em  = CASE WHEN p_atendido THEN now() ELSE NULL END,
         atendido_por = CASE WHEN p_atendido THEN nullif(btrim(coalesce(p_por, '')), '') ELSE NULL END
   WHERE id = p_lead_id;
END;
$$;

-- ── 4. RLS ─────────────────────────────────────────────────────────
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

-- Só a plataforma LÊ. Não existe policy de SELECT para anon: a chave
-- pública da landing grava e não lê — de propósito.
DROP POLICY IF EXISTS leads_select_plataforma ON public.leads;
CREATE POLICY leads_select_plataforma
  ON public.leads FOR SELECT
  USING (public.is_super_admin());

-- Escrita direta é da plataforma. O visitante entra por registrar_lead().
DROP POLICY IF EXISTS leads_update_plataforma ON public.leads;
CREATE POLICY leads_update_plataforma
  ON public.leads FOR UPDATE
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- Sem policy de INSERT e sem policy de DELETE: lead não nasce pela
-- tabela nem some da tabela. Apagar é ato manual (e o titular do dado
-- pedindo exclusão, LGPD, é exatamente esse ato manual).

-- ── 5. Permissões ──────────────────────────────────────────────────
-- Explícito: o anônimo não toca na tabela, só na função.
REVOKE ALL ON public.leads FROM anon;

-- CREATE FUNCTION concede EXECUTE a PUBLIC por padrão, e anon está em
-- PUBLIC. Sem estes REVOKEs, `marcar_lead_atendido` ficaria chamável pela
-- chave pública da landing — barrada só pela guarda interna, uma camada
-- só. Revogamos primeiro e concedemos depois, nominalmente (padrão da
-- 20260730).
REVOKE EXECUTE ON FUNCTION public.registrar_lead(
  text, text, text, boolean, text, integer, text[], text[]
) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.marcar_lead_atendido(uuid, boolean, text)
  FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.registrar_lead(
  text, text, text, boolean, text, integer, text[], text[]
) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.marcar_lead_atendido(uuid, boolean, text)
  TO authenticated;

-- ── 6. Comentários ─────────────────────────────────────────────────
COMMENT ON TABLE public.leads IS
  'Contatos capturados na landing do apex. Dado pessoal (LGPD): só a plataforma lê.';
COMMENT ON COLUMN public.leads.consentimento IS
  'Aceite do formulário. CHECK obriga true — sem aceite o banco recusa.';
COMMENT ON COLUMN public.leads.plano_modulos IS
  'Códigos dos módulos que a pessoa marcou no construtor de plano.';
