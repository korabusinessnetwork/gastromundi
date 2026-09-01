-- ══════════════════════════════════════════════════════════════════
-- 20260926 — solicitações de conta do site institucional (apex)
-- ══════════════════════════════════════════════════════════════════
--
-- O PROBLEMA
--   O botão "Entrar" do apex (kora.codes) mandava para /login, que no
--   domínio nu cai no slug de fallback: a porta de entrada da
--   PLATAFORMA abria o login de UM cliente específico (gastromundi),
--   com a marca dele na tela. Quem é cliente de outro estabelecimento
--   nem consegue entrar por ali — a credencial dele vive em outro
--   namespace (`usuario@<slug>.local`) — e quem ainda não é cliente
--   não tinha por onde começar.
--
--   Esta migração dá o que faltava do lado do banco: uma porta pública
--   para o visitante PEDIR sua conta (estabelecimento + plano), e uma
--   fila que o dono da plataforma resolve no Console.
--
-- POR QUE PEDIDO, E NÃO CRIAÇÃO DIRETA
--   Criar estabelecimento é ato da PLATAFORMA (decisão 027): a RPC
--   `provisionar_tenant` e a Edge Function `provisionar-estabelecimento`
--   exigem super-admin `plataforma`. Abrir isso para o anônimo daria a
--   qualquer script o poder de fabricar tenants, endereços e usuários
--   de auth. Então o visitante SOLICITA; quem cria continua sendo o
--   Console, com um clique a mais e nenhuma porta nova.
--
--   O responsável que preencheu vira o ADMIN do estabelecimento no
--   momento da aprovação — é o `provisionar-estabelecimento` de sempre,
--   agora com o formulário já preenchido pelo próprio cliente.
--
-- POR QUE UMA RPC E NÃO INSERT DIRETO COM POLICY DE anon
--   Mesmo desenho de `registrar_lead_apex` (20260925) e do delivery
--   público (20260804): tabela FECHADA para anon, escrita só por RPC
--   SECURITY DEFINER que valida de novo no banco e tem freio de abuso.
--
-- POR QUE NÃO TEM tenant_id NA ORIGEM
--   Quem solicita ainda NÃO é estabelecimento (decisão 017). O
--   `tenant_id` só é preenchido na APROVAÇÃO, e é o vínculo entre a
--   pessoa que pediu e o estabelecimento que nasceu para ela.
--
-- LGPD
--   Só o mínimo para abrir a conta e retomar o contato (nome, WhatsApp,
--   e-mail, nome do negócio, endereço pedido, plano de interesse). Sem
--   senha — senha de pedido guardado em tabela é segredo em texto claro;
--   a credencial nasce no provisionamento e vai pelo cartão de primeiro
--   acesso que o Console já emite. Sem IP, sem fingerprint.
--
-- Rodar MANUALMENTE no SQL Editor do Supabase. Idempotente
-- (IF NOT EXISTS / CREATE OR REPLACE / DROP POLICY IF EXISTS).
-- ══════════════════════════════════════════════════════════════════

-- ══════════════════════════════════════════════════════════════════
-- PARTE 1 — TABELA
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.solicitacoes_conta (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  nome            text        NOT NULL,   -- responsável (vira o admin)
  whatsapp        text        NOT NULL,   -- só dígitos (a RPC normaliza)
  email           text        NOT NULL,   -- minúsculo (a RPC normaliza)
  estabelecimento text        NOT NULL,   -- nome do negócio
  slug_desejado   text        NOT NULL,   -- endereço pedido, já normalizado
  -- Plano é INTERESSE COMERCIAL, não contrato: o código aqui é o do
  -- preset do site (balcao/restaurante/…), que não é o catálogo
  -- `public.planos`. Por isso sem FK — o preço real é fechado na
  -- conversa e o plano de verdade é escolhido no provisionamento.
  plano_codigo    text,
  plano_nome      text,
  plano_itens     text[],
  plano_total     numeric(10,2),
  status          text        NOT NULL DEFAULT 'pendente'
                              CHECK (status IN ('pendente', 'aprovada', 'recusada')),
  tenant_id       uuid        REFERENCES public.tenants(id),
  observacao      text,       -- anotação do dono ao decidir
  criado_em       timestamptz NOT NULL DEFAULT now(),
  decidido_em     timestamptz,
  decidido_por    uuid        -- auth.uid() de quem decidiu
);

COMMENT ON TABLE public.solicitacoes_conta IS
  'Pedidos de conta feitos no site institucional (apex). Da PLATAFORMA, sem tenant_id na origem: quem pede ainda não é estabelecimento. O tenant_id aparece na aprovação.';

-- Fila do Console e freio da RPC cortam por data recente; a mesma ordem
-- descendente serve às duas consultas.
CREATE INDEX IF NOT EXISTS solicitacoes_conta_criado_em_idx
  ON public.solicitacoes_conta (criado_em DESC);

-- O laço de endereço pergunta "este slug já foi pedido e está pendente?".
-- Índice parcial: só as pendentes disputam endereço — pedido recusado ou
-- já aprovado (que virou tenant) não bloqueia ninguém.
CREATE INDEX IF NOT EXISTS solicitacoes_conta_slug_pendente_idx
  ON public.solicitacoes_conta (slug_desejado)
  WHERE status = 'pendente';

-- ══════════════════════════════════════════════════════════════════
-- PARTE 2 — RLS: fechada por padrão
-- ══════════════════════════════════════════════════════════════════
-- Sem policy de INSERT de propósito: a única escrita pública é a RPC
-- abaixo, que roda como DEFINER e atravessa a RLS. Leitura e decisão
-- são do super-admin da plataforma. Nenhuma policy entrega esta tabela
-- a um token de estabelecimento.
ALTER TABLE public.solicitacoes_conta ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.solicitacoes_conta FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS solicitacoes_conta_leitura_plataforma ON public.solicitacoes_conta;
CREATE POLICY solicitacoes_conta_leitura_plataforma ON public.solicitacoes_conta
  FOR SELECT TO authenticated
  USING (public.is_super_admin());

-- Cinto e suspensório: nenhum GRANT de tabela para anon, e nenhum
-- UPDATE/DELETE direto nem para o super-admin — decidir passa pela RPC,
-- que é onde ficam as regras (transição de status, carimbo de quem
-- decidiu, vínculo com o tenant criado).
REVOKE ALL ON TABLE public.solicitacoes_conta FROM PUBLIC;
REVOKE ALL ON TABLE public.solicitacoes_conta FROM anon;
GRANT SELECT ON TABLE public.solicitacoes_conta TO authenticated;

-- ══════════════════════════════════════════════════════════════════
-- PARTE 3 — RPC pública (a única porta de escrita do visitante)
-- ══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.registrar_solicitacao_conta(
  p_nome            text,
  p_whatsapp        text,
  p_email           text,
  p_estabelecimento text,
  p_slug            text    DEFAULT NULL,
  p_plano_codigo    text    DEFAULT NULL,
  p_plano_nome      text    DEFAULT NULL,
  p_total           numeric DEFAULT NULL,
  p_itens           text[]  DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nome   text := NULLIF(btrim(COALESCE(p_nome, '')), '');
  v_tel    text := NULLIF(regexp_replace(COALESCE(p_whatsapp, ''), '\D', '', 'g'), '');
  v_email  text := NULLIF(lower(btrim(COALESCE(p_email, ''))), '');
  v_negocio text := NULLIF(btrim(COALESCE(p_estabelecimento, '')), '');
  v_slug   text;
  v_livre  text;
  v_itens  text[];
  v_count  integer;
  v_n      integer := 1;
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

  IF v_negocio IS NULL OR length(v_negocio) < 2 OR length(v_negocio) > 120 THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'estabelecimento_invalido');
  END IF;

  -- Endereço: mesma normalização que o provisionamento aplicaria
  -- (`slugify_tenant`, 20260741). Vazio à toa não existe — cai no nome
  -- do negócio, exatamente como `provisionar_tenant` faz.
  -- `left(…, 40)` é o mesmo teto do formulário e da Edge Function
  -- (MAX_SLUG): sem ele o nome comprido de um bar viraria um subdomínio
  -- que ninguém digita, e o endereço guardado aqui não bateria com o que
  -- o provisionamento cria depois.
  v_slug := left(COALESCE(public.slugify_tenant(p_slug),
                          public.slugify_tenant(v_negocio)), 40);
  IF v_slug IS NULL OR length(v_slug) < 2 THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'endereco_invalido');
  END IF;

  -- ── Endereço disputado ────────────────────────────────────────────
  -- Reservado, já de um estabelecimento, ou já pedido por outra pessoa
  -- que ainda está na fila. Recusar é o certo: dois clientes não podem
  -- combinar o mesmo subdomínio, e descobrir isso só na aprovação
  -- obrigaria o dono a renegociar o endereço depois da venda.
  --
  -- A recusa vem COM SUGESTÃO livre (mesmo laço de `provisionar_tenant`:
  -- base, base2, base3…), para a tela oferecer o próximo em vez de só
  -- dizer "não pode".
  IF public.slug_reservado(v_slug)
     OR EXISTS (SELECT 1 FROM public.tenants WHERE slug = v_slug)
     OR EXISTS (SELECT 1 FROM public.solicitacoes_conta
                 WHERE slug_desejado = v_slug AND status = 'pendente') THEN
    v_livre := v_slug;
    WHILE public.slug_reservado(v_livre)
          OR EXISTS (SELECT 1 FROM public.tenants WHERE slug = v_livre)
          OR EXISTS (SELECT 1 FROM public.solicitacoes_conta
                      WHERE slug_desejado = v_livre AND status = 'pendente') LOOP
      v_n := v_n + 1;
      v_livre := v_slug || v_n::text;
      EXIT WHEN v_n > 50;  -- teto de segurança: laço nunca é infinito
    END LOOP;
    RETURN jsonb_build_object('ok', false, 'erro', 'endereco_em_uso', 'sugestao', v_livre);
  END IF;

  -- Total é referência comercial, não cobrança. Fora da faixa plausível
  -- vira NULL em vez de recusar: o pedido vale mais que o número.
  IF p_total IS NOT NULL AND (p_total < 0 OR p_total > 100000) THEN
    p_total := NULL;
  END IF;

  -- Teto de itens, igual ao dos leads: impede usar o campo como
  -- depósito de texto.
  v_itens := (SELECT array_agg(left(btrim(i), 80))
              FROM unnest(COALESCE(p_itens, ARRAY[]::text[])) AS i
              WHERE btrim(i) <> '');
  IF v_itens IS NOT NULL AND array_length(v_itens, 1) > 30 THEN
    v_itens := v_itens[1:30];
  END IF;

  -- ── Freio 1: mesmo contato ────────────────────────────────────────
  SELECT count(*) INTO v_count
  FROM public.solicitacoes_conta
  WHERE criado_em > now() - interval '10 minutes'
    AND (email = v_email OR whatsapp = v_tel);
  IF v_count >= 3 THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'muitas_tentativas');
  END IF;

  -- ── Freio 2: balde geral do site ──────────────────────────────────
  SELECT count(*) INTO v_count
  FROM public.solicitacoes_conta
  WHERE criado_em > now() - interval '10 minutes';
  IF v_count >= 30 THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'muitas_tentativas');
  END IF;

  INSERT INTO public.solicitacoes_conta
    (nome, whatsapp, email, estabelecimento, slug_desejado,
     plano_codigo, plano_nome, plano_itens, plano_total)
  VALUES
    (v_nome, v_tel, v_email, v_negocio, v_slug,
     NULLIF(btrim(COALESCE(p_plano_codigo, '')), ''),
     NULLIF(btrim(COALESCE(p_plano_nome, '')), ''),
     v_itens, p_total);

  -- Devolve o endereço EFETIVO (normalizado) e nada mais: quem chama é
  -- anônimo e não tem o que fazer com o id de um registro que não pode
  -- ler — mas precisa ver o endereço que vai receber.
  RETURN jsonb_build_object('ok', true, 'endereco', v_slug);
END;
$$;

COMMENT ON FUNCTION public.registrar_solicitacao_conta(text, text, text, text, text, text, text, numeric, text[]) IS
  'Única porta de escrita em public.solicitacoes_conta. Chamada com a chave anon pelo site institucional (apex).';

-- ══════════════════════════════════════════════════════════════════
-- PARTE 4 — RPC de decisão (Console da plataforma)
-- ══════════════════════════════════════════════════════════════════
-- Aprovar/recusar não é UPDATE solto: carimba quem decidiu, quando, e
-- (na aprovação) qual estabelecimento nasceu do pedido. Guarda de
-- plataforma ANTES de qualquer escrita.
CREATE OR REPLACE FUNCTION public.decidir_solicitacao_conta(
  p_id         uuid,
  p_status     text,
  p_tenant_id  uuid DEFAULT NULL,
  p_observacao text DEFAULT NULL
)
RETURNS public.solicitacoes_conta
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text := lower(btrim(COALESCE(p_status, '')));
  v_linha  public.solicitacoes_conta;
BEGIN
  IF public.is_super_admin() IS NOT TRUE THEN
    RAISE EXCEPTION 'Somente a plataforma pode decidir uma solicitação de conta.'
      USING ERRCODE = '42501';
  END IF;

  IF v_status NOT IN ('aprovada', 'recusada') THEN
    RAISE EXCEPTION 'Decisão inválida: use aprovada ou recusada.'
      USING ERRCODE = '22023';
  END IF;

  -- Aprovar sem estabelecimento seria mentir na fila: o pedido sairia de
  -- "pendente" sem que nada tenha sido criado para a pessoa.
  IF v_status = 'aprovada' AND p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Aprovar exige o estabelecimento criado para esta solicitação.'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_linha FROM public.solicitacoes_conta WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitação não encontrada.' USING ERRCODE = 'P0002';
  END IF;

  IF v_linha.status <> 'pendente' THEN
    RAISE EXCEPTION 'Esta solicitação já foi decidida.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.solicitacoes_conta
     SET status       = v_status,
         tenant_id    = CASE WHEN v_status = 'aprovada' THEN p_tenant_id ELSE NULL END,
         observacao   = NULLIF(btrim(COALESCE(p_observacao, '')), ''),
         decidido_em  = now(),
         decidido_por = auth.uid()
   WHERE id = p_id
   RETURNING * INTO v_linha;

  RETURN v_linha;
END;
$$;

COMMENT ON FUNCTION public.decidir_solicitacao_conta(uuid, text, uuid, text) IS
  'Console: aprova (vinculando o tenant criado) ou recusa uma solicitação de conta. Só super-admin plataforma.';

-- ══════════════════════════════════════════════════════════════════
-- PARTE 5 — GRANTS (REVOKE antes do GRANT, nessa ordem)
-- ══════════════════════════════════════════════════════════════════
REVOKE EXECUTE ON FUNCTION public.registrar_solicitacao_conta(text, text, text, text, text, text, text, numeric, text[]) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.registrar_solicitacao_conta(text, text, text, text, text, text, text, numeric, text[]) TO anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.decidir_solicitacao_conta(uuid, text, uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.decidir_solicitacao_conta(uuid, text, uuid, text) FROM anon;
GRANT  EXECUTE ON FUNCTION public.decidir_solicitacao_conta(uuid, text, uuid, text) TO authenticated;

-- ── Conferência ───────────────────────────────────────────────────
SELECT 'public.solicitacoes_conta' AS tabela,
       CASE WHEN has_table_privilege('anon', 'public.solicitacoes_conta', 'SELECT')
             OR has_table_privilege('anon', 'public.solicitacoes_conta', 'INSERT')
            THEN '❌ anon alcança a tabela' ELSE '✅ fechada (só a RPC)' END AS anon_status,
       CASE WHEN has_function_privilege('anon', 'public.registrar_solicitacao_conta(text,text,text,text,text,text,text,numeric,text[])', 'EXECUTE')
            THEN '✅ RPC pública liberada' ELSE '❌ RPC pública sem grant' END AS rpc_publica,
       CASE WHEN has_function_privilege('anon', 'public.decidir_solicitacao_conta(uuid,text,uuid,text)', 'EXECUTE')
            THEN '❌ anon decide' ELSE '✅ decisão fechada ao anon' END AS rpc_decisao;
