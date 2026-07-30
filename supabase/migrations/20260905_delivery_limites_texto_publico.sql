-- ══════════════════════════════════════════════════════════════════
-- Delivery público — limites de entrada e rate-limit por telefone
-- (auditoria Run 6, leva 8 — DL25 + DL26)
--
-- Rodar MANUALMENTE no SQL Editor do Supabase (não é aplicado automático).
-- Idempotente: DROP ... IF EXISTS antes de recriar; CREATE OR REPLACE.
-- NÃO mexe em RLS — nenhuma policy muda, nada a configurar no painel.
--
-- Contexto: `criar_pedido_delivery` é SECURITY DEFINER e chamável por
-- `anon` — é o ÚNICO ponto do produto onde alguém sem login escreve no
-- banco. Ela valida preço e complemento a fundo, mas não olha o tamanho
-- de nada que o cliente escreve.
--
-- DL25 — Texto livre sem limite nenhum no servidor.
--   A vitrine já limita tudo no navegador (maxLength: nome 60, telefone
--   20, bairro 80, endereço 160, complemento 80, observação 200), mas
--   maxLength é enfeite: quem chama POST /rest/v1/rpc/criar_pedido_delivery
--   direto manda o que quiser. Todas as colunas são `text` sem CHECK.
--   Um pedido com 100 KB de "observação" grava numa boa e depois:
--     · a Ponte manda tudo para a impressora térmica (rolo inteiro);
--     · o cartão da Cozinha e o kanban do Delivery viram uma parede de
--       texto e o operador não consegue mais trabalhar naquela tela;
--     · o banco engorda de graça — e no plano gratuito do Supabase o
--       espaço é o recurso que acaba primeiro.
--   Também não havia teto de LINHAS por pedido nem de QUANTIDADE por
--   linha: `GREATEST(1, ...)` põe piso e nenhum teto, então `qtd`
--   2000000000 entra e o pedido aparece na tela como R$ 50 bilhões.
--
--   Conserto no TRIGGER e não na RPC, pelo mesmo motivo que a 20260814
--   já documentou no rate-limit: não duplicar o corpo grande da função
--   (e assim valer para qualquer caminho de INSERT).
--
--   Só em INSERT. UPDATE fica de fora de propósito: mudar status é o
--   caminho mais quente do app e não pode passar a falhar por causa de
--   uma linha antiga fora do limite.
--
-- DL26 — O rate-limit contava telefone como texto cru.
--   `delivery_rate_limit_check` normalizava (`btrim`) só para decidir se
--   PULAVA a checagem, mas contava com `cliente_telefone = NEW.cliente_telefone`
--   — o valor cru da coluna. Como a RPC grava o telefone exatamente como
--   veio (`p_payload -> 'cliente' ->> 'telefone'`) e o front só dá
--   `.trim()`, "11999998888", "(11) 99999-8888", "11 99999-8888" e
--   "+5511999998888" são QUATRO contadores para a mesma pessoa. Um script
--   que muda a formatação a cada chamada nunca era freado. Agora a
--   comparação é por dígitos dos dois lados.
-- ══════════════════════════════════════════════════════════════════

-- ── DL25 · pedido: tamanho dos campos que o cliente escreve ─────────

CREATE OR REPLACE FUNCTION public.delivery_pedido_limites()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Limites com folga sobre o maxLength da vitrine: quem usa a tela
  -- nunca esbarra nisso. A mensagem existe para quem chama a API direto
  -- — e, se um dia a tela crescer, ainda cabe.
  IF char_length(COALESCE(NEW.cliente_nome, '')) > 120 THEN
    RAISE EXCEPTION 'O nome está muito longo. Use até 120 caracteres.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF char_length(COALESCE(NEW.cliente_telefone, '')) > 30 THEN
    RAISE EXCEPTION 'O telefone está muito longo. Use até 30 caracteres.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF char_length(COALESCE(NEW.cep, '')) > 20 THEN
    RAISE EXCEPTION 'O CEP está muito longo. Use até 20 caracteres.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF char_length(COALESCE(NEW.bairro, '')) > 120 THEN
    RAISE EXCEPTION 'O bairro está muito longo. Use até 120 caracteres.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF char_length(COALESCE(NEW.endereco, '')) > 300 THEN
    RAISE EXCEPTION 'O endereço está muito longo. Use até 300 caracteres.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF char_length(COALESCE(NEW.complemento_endereco, '')) > 200 THEN
    RAISE EXCEPTION 'O complemento está muito longo. Use até 200 caracteres.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS delivery_pedidos_limites ON public.delivery_pedidos;
CREATE TRIGGER delivery_pedidos_limites
  BEFORE INSERT ON public.delivery_pedidos
  FOR EACH ROW
  EXECUTE FUNCTION public.delivery_pedido_limites();

-- ── DL25 · item: tamanho do texto e teto da quantidade ──────────────

CREATE OR REPLACE FUNCTION public.delivery_item_limites()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF char_length(COALESCE(NEW.nome, '')) > 200 THEN
    RAISE EXCEPTION 'O nome do item está muito longo. Use até 200 caracteres.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- A observação é o campo que mais dói: vai inteira para a impressora
  -- térmica e para o cartão da Cozinha.
  IF char_length(COALESCE(NEW.obs, '')) > 400 THEN
    RAISE EXCEPTION 'A observação está muito longa. Use até 400 caracteres.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Nenhum pedido de restaurante tem 500 unidades do mesmo item numa
  -- linha só. Sem teto, `qtd` 2000000000 passava e o total ia junto.
  IF COALESCE(NEW.qtd, 1) > 500 THEN
    RAISE EXCEPTION 'Quantidade acima do permitido por item (máximo 500).'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS delivery_pedido_itens_limites ON public.delivery_pedido_itens;
CREATE TRIGGER delivery_pedido_itens_limites
  BEFORE INSERT ON public.delivery_pedido_itens
  FOR EACH ROW
  EXECUTE FUNCTION public.delivery_item_limites();

-- ── DL25 · teto de linhas por pedido ────────────────────────────────
--
-- A RPC grava TODOS os itens num único INSERT ... SELECT, então um
-- trigger de linha não enxerga o tamanho da leva. Statement-level com
-- tabela de transição conta exato.

CREATE OR REPLACE FUNCTION public.delivery_itens_limite_linhas()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max integer;
BEGIN
  SELECT max(c) INTO v_max
  FROM (SELECT count(*) AS c FROM novos GROUP BY pedido_id) s;

  IF COALESCE(v_max, 0) > 100 THEN
    RAISE EXCEPTION 'Pedido com itens demais (máximo 100 linhas).'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS delivery_pedido_itens_limite_linhas ON public.delivery_pedido_itens;
CREATE TRIGGER delivery_pedido_itens_limite_linhas
  AFTER INSERT ON public.delivery_pedido_itens
  REFERENCING NEW TABLE AS novos
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.delivery_itens_limite_linhas();

-- ── DL26 · rate-limit comparando telefone por dígitos ───────────────

CREATE OR REPLACE FUNCTION public.delivery_rate_limit_check()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tel   text := NULLIF(regexp_replace(COALESCE(NEW.cliente_telefone, ''), '\D', '', 'g'), '');
  v_count integer;
BEGIN
  -- Sem dígito nenhum não dá pra correlacionar — deixa passar (o UNIQUE
  -- de numero e as validações da RPC seguem valendo).
  IF v_tel IS NULL THEN
    RETURN NEW;
  END IF;

  -- Compara DÍGITOS dos dois lados. Antes o lado esquerdo era a coluna
  -- crua, então bastava mudar a máscara para ganhar um contador novo.
  SELECT count(*) INTO v_count
  FROM public.delivery_pedidos
  WHERE tenant_id = NEW.tenant_id
    AND created_at > now() - interval '2 minutes'
    AND regexp_replace(COALESCE(cliente_telefone, ''), '\D', '', 'g') = v_tel;

  IF v_count >= 3 THEN
    RAISE EXCEPTION 'Muitos pedidos em sequência. Aguarde um instante e tente de novo.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS delivery_pedidos_rate_limit ON public.delivery_pedidos;
CREATE TRIGGER delivery_pedidos_rate_limit
  BEFORE INSERT ON public.delivery_pedidos
  FOR EACH ROW
  EXECUTE FUNCTION public.delivery_rate_limit_check();

-- O regexp_replace não usa índice, então o filtro por tenant + janela
-- precisa chegar pequeno nele. Só havia índice em (tenant_id): num tenant
-- com histórico grande, cada pedido do site varria tudo.
CREATE INDEX IF NOT EXISTS delivery_pedidos_tenant_created_idx
  ON public.delivery_pedidos (tenant_id, created_at DESC);

-- ── Conferência (deve listar os 4 triggers) ─────────────────────────
DO $$
DECLARE
  v_faltando text;
BEGIN
  SELECT string_agg(t.nome, ', ')
    INTO v_faltando
  FROM (VALUES
    ('delivery_pedidos_limites'),
    ('delivery_pedido_itens_limites'),
    ('delivery_pedido_itens_limite_linhas'),
    ('delivery_pedidos_rate_limit')
  ) AS t(nome)
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_trigger g
    WHERE g.tgname = t.nome AND NOT g.tgisinternal
  );

  IF v_faltando IS NOT NULL THEN
    RAISE EXCEPTION 'Triggers não criados: %', v_faltando;
  END IF;

  RAISE NOTICE 'DL25 + DL26 aplicados: limites de entrada e rate-limit por dígitos ativos.';
END;
$$;
