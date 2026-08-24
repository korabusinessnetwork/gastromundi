-- ══════════════════════════════════════════════════════════════════
-- 20260925 — leads do site institucional (apex kora.codes)
-- ══════════════════════════════════════════════════════════════════
--
-- O PROBLEMA
--   O construtor de plano do apex termina no botão "Agendar
--   demonstração", que abre um formulário pedindo nome, WhatsApp e
--   e-mail. O formulário valida tudo, mostra uma tela de sucesso e
--   JOGA O DADO FORA: não havia insert, nem e-mail, nem webhook
--   (src/pages/apex/ApexAgendamento.jsx dizia, no próprio código,
--   "TODO: gravar lead em `leads`"). Cada pessoa que preencheu ficou
--   esperando um contato que nunca ia chegar.
--
--   É o pior tipo de furo: silencioso dos dois lados. O visitante acha
--   que agendou; a plataforma não sabe que ele existiu.
--
-- POR QUE UMA RPC E NÃO INSERT DIRETO COM POLICY DE anon
--   A tela é pública e roda com a chave anon. Abrir um INSERT direto na
--   tabela para anon significa entregar o endpoint do PostgREST para
--   qualquer script: campos livres, sem teto, sem validação. O padrão
--   já estabelecido no projeto para escrita anônima é o do delivery
--   (20260804): a tabela fica FECHADA para anon e a única porta é uma
--   RPC SECURITY DEFINER que valida e limita. Esta migração segue o
--   mesmo desenho.
--
-- POR QUE NÃO TEM tenant_id
--   Um lead é alguém que AINDA NÃO é estabelecimento — é a plataforma
--   vendendo (decisão 017, SaaS multi-estabelecimento). Não existe
--   tenant a que ele pertença, e por isso a leitura é do super-admin da
--   plataforma (is_super_admin()), não de um tenant. Nenhuma policy
--   entrega esta tabela a um token de estabelecimento.
--
-- FREIO DE ABUSO
--   Formulário público sem freio vira lixeira em uma noite. Dois tetos,
--   na mesma lógica do balde do delivery (20260921):
--     • mesmo contato (e-mail OU WhatsApp): 3 envios em 10 minutos —
--       cobre quem clicou duas vezes ou corrigiu um dígito;
--     • balde geral: 30 envios em 10 minutos — o site inteiro. É folga
--       enorme para o volume real de uma landing em bootstrap e corta
--       o script na trigésima em vez de na trigésima milésima.
--   A recusa NÃO é erro de tela para o visitante honesto: ele nunca
--   encosta nesses números.
--
-- LGPD
--   Só o mínimo para retomar o contato (nome, WhatsApp, e-mail) mais o
--   plano que a pessoa montou, que é o assunto da conversa. Sem IP, sem
--   fingerprint, sem rastreamento. `origem` fica preparado para outras
--   portas de entrada além do apex.
--
-- Rodar MANUALMENTE no SQL Editor do Supabase. Idempotente
-- (IF NOT EXISTS / CREATE OR REPLACE / DROP POLICY IF EXISTS).
-- ══════════════════════════════════════════════════════════════════

-- ══════════════════════════════════════════════════════════════════
-- PARTE 1 — TABELA
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.leads (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  nome        text        NOT NULL,
  whatsapp    text        NOT NULL,   -- só dígitos (a RPC normaliza)
  email       text        NOT NULL,   -- minúsculo (a RPC normaliza)
  plano_total numeric(10,2),          -- total estimado que a pessoa montou
  plano_itens text[],                 -- módulos/complementos escolhidos
  origem      text        NOT NULL DEFAULT 'apex',
  criado_em   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.leads IS
  'Contatos capturados no site institucional (apex). Da PLATAFORMA, sem tenant_id: quem está aqui ainda não é estabelecimento.';

-- Índice do freio e da tela de leitura: as duas consultas cortam por
-- data recente, então a ordem descendente é a que serve às duas.
CREATE INDEX IF NOT EXISTS leads_criado_em_idx ON public.leads (criado_em DESC);

-- ══════════════════════════════════════════════════════════════════
-- PARTE 2 — RLS: fechada por padrão
-- ══════════════════════════════════════════════════════════════════
-- Sem policy de INSERT/UPDATE/DELETE de propósito: a única escrita é a
-- RPC abaixo, que roda como DEFINER e atravessa a RLS. Leitura só do
-- super-admin da plataforma.
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS leads_leitura_plataforma ON public.leads;
CREATE POLICY leads_leitura_plataforma ON public.leads
  FOR SELECT TO authenticated
  USING (public.is_super_admin());

-- Cinto e suspensório: mesmo com RLS, nenhum GRANT de tabela para anon.
REVOKE ALL ON TABLE public.leads FROM PUBLIC;
REVOKE ALL ON TABLE public.leads FROM anon;
GRANT SELECT ON TABLE public.leads TO authenticated;

-- ══════════════════════════════════════════════════════════════════
-- PARTE 3 — RPC pública (a única porta)
-- ══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.registrar_lead_apex(
  p_nome     text,
  p_whatsapp text,
  p_email    text,
  p_total    numeric DEFAULT NULL,
  p_itens    text[]  DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nome  text := NULLIF(btrim(COALESCE(p_nome, '')), '');
  v_tel   text := NULLIF(regexp_replace(COALESCE(p_whatsapp, ''), '\D', '', 'g'), '');
  v_email text := NULLIF(lower(btrim(COALESCE(p_email, ''))), '');
  v_itens text[];
  v_count integer;
BEGIN
  -- ── Validação NO BANCO ────────────────────────────────────────────
  -- A tela valida igual, mas a tela não é a fronteira: o PostgREST
  -- aceita a chamada de qualquer lugar, com qualquer conteúdo.
  IF v_nome IS NULL OR length(v_nome) < 2 OR length(v_nome) > 120 THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'nome_invalido');
  END IF;

  IF v_tel IS NULL OR length(v_tel) < 10 OR length(v_tel) > 11 THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'whatsapp_invalido');
  END IF;

  IF v_email IS NULL OR length(v_email) > 160
     OR v_email !~ '^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$' THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'email_invalido');
  END IF;

  -- Total é referência comercial, não cobrança. Fora da faixa plausível
  -- vira NULL em vez de recusar: o lead vale mais que o número.
  IF p_total IS NOT NULL AND (p_total < 0 OR p_total > 100000) THEN
    p_total := NULL;
  END IF;

  -- Teto de itens: a lista tem 11 opções hoje; 30 cobre crescimento e
  -- impede alguém de usar o campo como depósito de texto.
  v_itens := (SELECT array_agg(left(btrim(i), 80))
              FROM unnest(COALESCE(p_itens, ARRAY[]::text[])) AS i
              WHERE btrim(i) <> '');
  IF v_itens IS NOT NULL AND array_length(v_itens, 1) > 30 THEN
    v_itens := v_itens[1:30];
  END IF;

  -- ── Freio 1: mesmo contato ────────────────────────────────────────
  SELECT count(*) INTO v_count
  FROM public.leads
  WHERE criado_em > now() - interval '10 minutes'
    AND (email = v_email OR whatsapp = v_tel);
  IF v_count >= 3 THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'muitas_tentativas');
  END IF;

  -- ── Freio 2: balde geral do site ──────────────────────────────────
  SELECT count(*) INTO v_count
  FROM public.leads
  WHERE criado_em > now() - interval '10 minutes';
  IF v_count >= 30 THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'muitas_tentativas');
  END IF;

  INSERT INTO public.leads (nome, whatsapp, email, plano_total, plano_itens)
  VALUES (v_nome, v_tel, v_email, p_total, v_itens);

  -- Não devolve o id: quem chama é anônimo e não tem o que fazer com
  -- ele; devolver seria dar um identificador de registro a quem não
  -- pode ler a tabela.
  RETURN jsonb_build_object('ok', true);
END;
$$;

COMMENT ON FUNCTION public.registrar_lead_apex(text, text, text, numeric, text[]) IS
  'Única porta de escrita em public.leads. Chamada com a chave anon pelo site institucional.';

-- ══════════════════════════════════════════════════════════════════
-- PARTE 4 — GRANTS (REVOKE antes do GRANT, nessa ordem)
-- ══════════════════════════════════════════════════════════════════
REVOKE EXECUTE ON FUNCTION public.registrar_lead_apex(text, text, text, numeric, text[]) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.registrar_lead_apex(text, text, text, numeric, text[]) TO anon, authenticated;

-- ── Conferência: a tabela NÃO pode estar acessível ao anon ─────────
SELECT 'public.leads' AS tabela,
       CASE WHEN has_table_privilege('anon', 'public.leads', 'SELECT')
             OR has_table_privilege('anon', 'public.leads', 'INSERT')
            THEN '❌ anon alcança a tabela' ELSE '✅ fechada (só a RPC)' END AS anon_status,
       CASE WHEN has_function_privilege('anon', 'public.registrar_lead_apex(text,text,text,numeric,text[])', 'EXECUTE')
            THEN '✅ RPC liberada' ELSE '❌ RPC sem grant' END AS rpc_status;
