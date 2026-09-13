-- ══════════════════════════════════════════════════════════════════
-- Desabilitar um produto: PDV e delivery são chaves separadas, e o
-- dono escolhe se uma puxa a outra.
--
-- ┌─ O que existia ───────────────────────────────────────────────────┐
-- │ São duas chaves diferentes, em duas tabelas diferentes:           │
-- │   · `products.active`            — o produto é vendido no PDV     │
-- │   · `produto_delivery.disponivel`— o produto está no cardápio     │
-- │                                    online                          │
-- │                                                                    │
-- │ E é assim que tem de ser por padrão: acabou o hambúrguer para     │
-- │ entrega mas ainda tem no balcão é situação de todo dia. Desligar  │
-- │ um lado nunca deve desligar o outro sozinho.                       │
-- │                                                                    │
-- │ Só que o contrário também acontece: quem tira o item do cardápio  │
-- │ porque acabou de vez quer que ele suma dos dois lugares, e hoje   │
-- │ precisa lembrar de ir em duas telas. Esquecer a segunda deixa o   │
-- │ cliente pedindo pela internet o que a cozinha não tem.             │
-- └────────────────────────────────────────────────────────────────────┘
--
-- A saída é o dono decidir, uma vez, em Configurações → Delivery:
-- `espelhar_desabilitado`. DESLIGADO por padrão — ligar mudaria o
-- comportamento de quem já usa as duas chaves de propósito.
--
-- POR QUE UM GATILHO E NÃO CÓDIGO NA TELA: `products.active` é ligado
-- e desligado em mais de um lugar (a aba Produtos do desktop e o módulo
-- Cardápio do Palm, os dois via `updateProduct`), e amanhã pode ser
-- ligado por importação de planilha. Uma regra escrita numa tela vale
-- só naquela tela — o Palm pausaria o produto e o cardápio online
-- continuaria vendendo. No gatilho ela vale para toda escrita.
--
-- O ESPELHO SÓ ANDA NUMA DIREÇÃO: PDV → delivery. O catálogo do PDV é a
-- origem; o cardápio online é uma camada sobre ele (`produto_delivery`
-- referencia `products`). O caminho inverso não existe de propósito:
-- parar de ENTREGAR uma cerveja não pode parar de VENDÊ-LA no balcão.
--
-- RLS: nada muda. Nenhuma tabela nova, nenhuma policy nova. O gatilho é
-- SECURITY DEFINER e escreve só na linha de produto_delivery do MESMO
-- tenant do produto — nunca atravessa estabelecimento.
-- ══════════════════════════════════════════════════════════════════

-- ── 1. A opção ─────────────────────────────────────────────────────
ALTER TABLE public.config_delivery
  ADD COLUMN IF NOT EXISTS espelhar_desabilitado boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.config_delivery.espelhar_desabilitado IS
  'Ligado: desabilitar o produto no cadastro do PDV também o tira do cardápio online (e reabilitar devolve). Desligado (padrão): as duas chaves são independentes.';

-- ── 2. O espelho ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.espelhar_produto_no_delivery()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_espelhar boolean;
BEGIN
  -- Só reage à virada de `active`. Mudar preço, nome ou emoji não tem
  -- nada a ver com estar no cardápio online.
  IF NEW.active IS NOT DISTINCT FROM OLD.active THEN
    RETURN NEW;
  END IF;

  -- A opção é POR ESTABELECIMENTO, e é lida do tenant do PRODUTO — não
  -- de quem está executando. Importação em lote rodando por outro
  -- caminho continua respeitando a escolha do dono daquele produto.
  SELECT cd.espelhar_desabilitado
    INTO v_espelhar
    FROM public.config_delivery cd
   WHERE cd.tenant_id = NEW.tenant_id;

  IF NOT COALESCE(v_espelhar, false) THEN
    RETURN NEW;
  END IF;

  -- Só mexe em linha que já existe: o espelho não PUBLICA um produto no
  -- delivery que nunca esteve lá. Reabilitar no PDV devolve ao cardápio
  -- online apenas o que o dono já tinha publicado.
  UPDATE public.produto_delivery
     SET disponivel = NEW.active,
         updated_at = now()
   WHERE produto_id = NEW.id
     AND tenant_id  = NEW.tenant_id
     AND disponivel IS DISTINCT FROM NEW.active;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.espelhar_produto_no_delivery() FROM PUBLIC;

DROP TRIGGER IF EXISTS products_espelha_delivery ON public.products;
CREATE TRIGGER products_espelha_delivery
  AFTER UPDATE OF active ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.espelhar_produto_no_delivery();

-- ══════════════════════════════════════════════════════════════════
-- Conferência ao vivo — EXECUTA o espelho contra casos conhecidos e
-- aborta a transação se algum resultado divergir. Tudo o que grava é
-- desfeito no fim do bloco: o teste não deixa dado para trás.
-- ══════════════════════════════════════════════════════════════════
DO $conf$
DECLARE
  v_tenant  uuid;
  v_prod    bigint;
  v_pd      uuid;
  v_estado  boolean;
  v_plano   text;
BEGIN
  IF to_regclass('public.produto_delivery') IS NULL THEN
    RAISE EXCEPTION 'Espelho: produto_delivery não existe — rode 20260804 antes desta.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger
                  WHERE tgname = 'products_espelha_delivery' AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'Espelho: o gatilho não foi criado.';
  END IF;

  -- Tenant descartável só para o teste. `planos` tem FK, então pega-se
  -- um código que exista neste banco em vez de inventar um.
  SELECT codigo INTO v_plano FROM public.planos LIMIT 1;
  IF v_plano IS NULL THEN
    RAISE NOTICE 'Espelho: sem planos cadastrados, conferência pulada.';
    RETURN;
  END IF;

  INSERT INTO public.tenants (nome, slug, plano_codigo)
       VALUES ('Conferência do espelho', 'conf-espelho-' || gen_random_uuid(), v_plano)
    RETURNING id INTO v_tenant;

  INSERT INTO public.products (name, price, category, active, tenant_id)
       VALUES ('Produto de conferência', 10, 'Comidas', true, v_tenant)
    RETURNING id INTO v_prod;

  INSERT INTO public.produto_delivery (produto_id, disponivel, ordem, tenant_id)
       VALUES (v_prod, true, 0, v_tenant)
    RETURNING id INTO v_pd;

  -- Caso 1 — opção DESLIGADA (o padrão): desabilitar no PDV não pode
  -- mexer no cardápio online. É a regra que protege quem usa as duas
  -- chaves de propósito.
  INSERT INTO public.config_delivery (tenant_id, espelhar_desabilitado)
       VALUES (v_tenant, false);

  UPDATE public.products SET active = false WHERE id = v_prod;
  SELECT disponivel INTO v_estado FROM public.produto_delivery WHERE id = v_pd;
  IF v_estado IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Espelho: com a opção desligada o delivery foi alterado mesmo assim — as duas chaves deixariam de ser independentes.';
  END IF;

  -- Caso 2 — opção LIGADA: desabilitar no PDV tira do cardápio online.
  UPDATE public.config_delivery SET espelhar_desabilitado = true WHERE tenant_id = v_tenant;
  UPDATE public.products SET active = true  WHERE id = v_prod;
  UPDATE public.products SET active = false WHERE id = v_prod;
  SELECT disponivel INTO v_estado FROM public.produto_delivery WHERE id = v_pd;
  IF v_estado IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'Espelho: com a opção ligada o produto continuou no cardápio online.';
  END IF;

  -- Caso 3 — e reabilitar devolve.
  UPDATE public.products SET active = true WHERE id = v_prod;
  SELECT disponivel INTO v_estado FROM public.produto_delivery WHERE id = v_pd;
  IF v_estado IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Espelho: reabilitar no PDV não devolveu o produto ao cardápio online.';
  END IF;

  -- Caso 4 — mudar OUTRA coisa não mexe no cardápio online. Sem isto,
  -- corrigir um preço poderia religar um item tirado do ar à mão.
  UPDATE public.produto_delivery SET disponivel = false WHERE id = v_pd;
  UPDATE public.products SET price = 99 WHERE id = v_prod;
  SELECT disponivel INTO v_estado FROM public.produto_delivery WHERE id = v_pd;
  IF v_estado IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'Espelho: mexer no preço religou o produto no cardápio online.';
  END IF;

  -- Limpeza: o tenant sai e leva junto produto, camada e config (FK em
  -- cascata). A conferência não deixa nada para trás.
  DELETE FROM public.products        WHERE id = v_prod;
  DELETE FROM public.config_delivery WHERE tenant_id = v_tenant;
  DELETE FROM public.tenants         WHERE id = v_tenant;

  RAISE NOTICE 'Espelho PDV → delivery conferido: independente por padrão, espelha quando ligado.';
END;
$conf$;
