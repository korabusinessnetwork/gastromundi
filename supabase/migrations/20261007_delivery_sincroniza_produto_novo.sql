-- ══════════════════════════════════════════════════════════════════
-- Sincronizar automático: produto novo do PDV entra sozinho no cardápio
-- online, quando o dono liga.
--
-- Hoje só existe o caminho manual: cadastra no PDV, vai na aba Delivery,
-- clica em importar. Esquecer o segundo passo é o normal, não a exceção —
-- e o produto fica invisível para quem pede pela internet sem ninguém
-- perceber. Quem tem o cardápio do balcão igual ao do site faz esse
-- caminho toda vez que cria um item.
--
-- DESLIGADO por padrão. Ligar sozinho publicaria na internet, sem
-- ninguém pedir, tudo o que fosse cadastrado a partir de agora — e há
-- estabelecimento que mantém de propósito um cardápio online menor que o
-- do salão.
--
-- POR QUE UM GATILHO E NÃO CÓDIGO NA TELA: produto nasce em mais de um
-- lugar — o Cadastro Produtos do desktop, o botão novo da própria aba
-- Delivery, a importação de planilha. Uma regra escrita numa tela valeria
-- só naquela tela, e o dono que ligou a sincronização veria uns produtos
-- entrarem e outros não, sem entender o critério.
--
-- O MESMO CRITÉRIO DA VITRINE. Insumo e Produção moram em `products`
-- porque a ficha técnica precisa deles, mas farinha de trigo não se vende
-- por delivery; e produto sem preço publicado é pedido de graça. É a
-- regra que `categoria_interna` (20260918) já aplica nas RPCs públicas e
-- que `produtoPublicavelNoDelivery` aplica na tela — aqui ela vale mais
-- uma vez, no momento em que o produto nasce.
--
-- RLS: nada muda. Nenhuma tabela nova. O gatilho é SECURITY DEFINER e
-- escreve só a linha do MESMO tenant do produto.
-- ══════════════════════════════════════════════════════════════════

-- ── 1. A opção ─────────────────────────────────────────────────────
ALTER TABLE public.config_delivery
  ADD COLUMN IF NOT EXISTS sincronizar_automatico boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.config_delivery.sincronizar_automatico IS
  'Ligado: produto novo criado no PDV entra sozinho no cardápio online (se for vendável: fora de Insumo/Produção e com preço > 0). Desligado (padrão): só pela importação manual.';

-- ── 2. O gatilho ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.publicar_produto_novo_no_delivery()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_liga  boolean;
  v_ordem integer;
BEGIN
  -- Produto que já nasce desligado não vai para a vitrine: quem cadastra
  -- "inativo" está guardando para depois.
  IF NEW.active IS DISTINCT FROM true THEN
    RETURN NEW;
  END IF;

  -- Mesmo critério da vitrine e da tela: nada de insumo, nada de graça.
  IF public.categoria_interna(NEW.category) OR COALESCE(NEW.price, 0) <= 0 THEN
    RETURN NEW;
  END IF;

  -- A opção é POR ESTABELECIMENTO, lida do tenant do PRODUTO — não de
  -- quem executa. Importação em lote por outro caminho respeita a escolha
  -- do dono daquele estabelecimento.
  SELECT cd.sincronizar_automatico
    INTO v_liga
    FROM public.config_delivery cd
   WHERE cd.tenant_id = NEW.tenant_id;

  IF NOT COALESCE(v_liga, false) THEN
    RETURN NEW;
  END IF;

  -- Entra no fim da lista: publicar no topo empurraria o cardápio que o
  -- dono ordenou à mão.
  SELECT COALESCE(max(ordem), -1) + 1 INTO v_ordem
    FROM public.produto_delivery
   WHERE tenant_id = NEW.tenant_id;

  -- ON CONFLICT: a tela que cria o produto e JÁ grava a linha de delivery
  -- (o "Novo produto" da aba Delivery) não pode colidir com o gatilho.
  INSERT INTO public.produto_delivery (tenant_id, produto_id, disponivel, ordem)
  VALUES (NEW.tenant_id, NEW.id, true, v_ordem)
  ON CONFLICT (tenant_id, produto_id) DO NOTHING;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.publicar_produto_novo_no_delivery() FROM PUBLIC;

DROP TRIGGER IF EXISTS products_publica_no_delivery ON public.products;
CREATE TRIGGER products_publica_no_delivery
  AFTER INSERT ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.publicar_produto_novo_no_delivery();

-- ══════════════════════════════════════════════════════════════════
-- Conferência ao vivo — EXECUTA a sincronização contra casos conhecidos
-- e aborta se algum divergir. Limpa o que criou.
-- ══════════════════════════════════════════════════════════════════
DO $conf$
DECLARE
  v_plano  text;
  v_tenant uuid;
  v_prod   bigint;
  v_qtd    integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger
                  WHERE tgname = 'products_publica_no_delivery' AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'Sincronizar: o gatilho não foi criado.';
  END IF;

  SELECT codigo INTO v_plano FROM public.planos LIMIT 1;
  IF v_plano IS NULL THEN
    RAISE NOTICE 'Sincronizar: sem planos cadastrados, conferência pulada.';
    RETURN;
  END IF;

  INSERT INTO public.tenants (nome, slug, plano_codigo)
       VALUES ('Conferência sincronizar', 'conf-sinc-' || gen_random_uuid(), v_plano)
    RETURNING id INTO v_tenant;

  -- Caso 1 — opção DESLIGADA (o padrão): produto novo NÃO vai para o
  -- cardápio online. É a regra que protege quem mantém os dois cardápios
  -- diferentes de propósito.
  INSERT INTO public.config_delivery (tenant_id, sincronizar_automatico)
       VALUES (v_tenant, false);
  INSERT INTO public.products (name, price, category, active, tenant_id)
       VALUES ('Desligado', 10, 'Comidas', true, v_tenant) RETURNING id INTO v_prod;
  SELECT count(*) INTO v_qtd FROM public.produto_delivery WHERE produto_id = v_prod;
  IF v_qtd <> 0 THEN
    RAISE EXCEPTION 'Sincronizar: publicou com a opção desligada — o cardápio online passaria a crescer sozinho sem ninguém pedir.';
  END IF;

  -- Caso 2 — LIGADA: o produto novo entra.
  UPDATE public.config_delivery SET sincronizar_automatico = true WHERE tenant_id = v_tenant;
  INSERT INTO public.products (name, price, category, active, tenant_id)
       VALUES ('Ligado', 10, 'Comidas', true, v_tenant) RETURNING id INTO v_prod;
  SELECT count(*) INTO v_qtd FROM public.produto_delivery WHERE produto_id = v_prod;
  IF v_qtd <> 1 THEN
    RAISE EXCEPTION 'Sincronizar: com a opção ligada o produto novo não entrou no cardápio online.';
  END IF;

  -- Caso 3 — insumo NUNCA entra, nem com a opção ligada. Publicar farinha
  -- de trigo na vitrine foi um achado crítico de auditoria (20260918).
  INSERT INTO public.products (name, price, category, active, tenant_id)
       VALUES ('Farinha', 10, 'Insumo', true, v_tenant) RETURNING id INTO v_prod;
  SELECT count(*) INTO v_qtd FROM public.produto_delivery WHERE produto_id = v_prod;
  IF v_qtd <> 0 THEN
    RAISE EXCEPTION 'Sincronizar: publicou um insumo na vitrine.';
  END IF;

  -- Caso 4 — preço zero também não: publicado, o cliente pede de graça.
  INSERT INTO public.products (name, price, category, active, tenant_id)
       VALUES ('Sem preço', 0, 'Comidas', true, v_tenant) RETURNING id INTO v_prod;
  SELECT count(*) INTO v_qtd FROM public.produto_delivery WHERE produto_id = v_prod;
  IF v_qtd <> 0 THEN
    RAISE EXCEPTION 'Sincronizar: publicou produto sem preço — sairia de graça na vitrine.';
  END IF;

  -- Caso 5 — produto que nasce inativo fica guardado, não publicado.
  INSERT INTO public.products (name, price, category, active, tenant_id)
       VALUES ('Guardado', 10, 'Comidas', false, v_tenant) RETURNING id INTO v_prod;
  SELECT count(*) INTO v_qtd FROM public.produto_delivery WHERE produto_id = v_prod;
  IF v_qtd <> 0 THEN
    RAISE EXCEPTION 'Sincronizar: publicou produto que nasceu desativado.';
  END IF;

  DELETE FROM public.produto_delivery WHERE tenant_id = v_tenant;
  DELETE FROM public.products         WHERE tenant_id = v_tenant;
  DELETE FROM public.config_delivery  WHERE tenant_id = v_tenant;
  DELETE FROM public.tenants          WHERE id = v_tenant;

  RAISE NOTICE 'Sincronizar automático conferido: desligado por padrão, e nem ligado publica insumo, preço zero ou inativo.';
END;
$conf$;
