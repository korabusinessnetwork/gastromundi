-- ══════════════════════════════════════════════════════════════════
-- DL30 — a vitrine pública ignorava o plano do estabelecimento.
--
-- `delivery` é módulo PAGO: só os planos 'alto' e 'avancado' o têm
-- (20260805_delivery_modulo_planos.sql; 'basico', 'simples' e 'medio'
-- ficam de fora por 20260717_planos_modulos.sql). Toda rota do dono é
-- fechada por `requiredModulo={MODULOS.DELIVERY}` — mas as QUATRO RPCs
-- que o cliente final chama sem login conferiam apenas se o slug
-- resolvia um tenant:
--   • cardapio_publico(text)
--   • calcular_taxa_entrega(text, text, text)                  ← viva
--   • calcular_taxa_entrega(text, text, text, numeric, numeric) ← viva
--   • criar_pedido_delivery(text, jsonb)
-- (as duas sobrecargas de taxa coexistem: a 20260810 criou a de 5
--  argumentos sem derrubar a de 3, e as duas seguem concedidas ao anon.)
--
-- O caminho real é a QUEDA DE PLANO: o estabelecimento configura o
-- delivery no 'avancado', desce para o 'medio', e a loja pública
-- continua no ar recebendo pedido de verdade enquanto /app/delivery
-- está bloqueado. O cliente pede numa tela que o restaurante não
-- consegue abrir — pedido que ninguém vai preparar nem entregar — e o
-- módulo pago segue rodando de graça.
--
-- Conserto num ponto só: as quatro resolvem o tenant pelo mesmo helper
-- interno `delivery_tenant_por_slug`. O gate entra ALI, não em cada
-- corpo — recriar quatro funções de ~300 linhas para repetir a mesma
-- linha convida a erro de transcrição, e qualquer RPC pública futura
-- nasceria sem o gate por esquecimento. Efeito em cada porta:
--   • cardapio_publico       → NULL, indistinguível de "slug sem
--     delivery configurado" (DL5): não revela que o estabelecimento
--     existe, que é o motivo de a função devolver NULL e não erro;
--   • criar_pedido_delivery  → recusa em português (P0001), a mesma
--     de slug desconhecido;
--   • calcular_taxa_entrega  → { ok:false, motivo:'tenant_invalido' }
--     nas duas sobrecargas.
--
-- `branding_por_slug` fica FORA do gate de propósito: é ela que pinta a
-- tela de login com a marca do estabelecimento, e quem não tem delivery
-- tem login. Ela é a única outra concessão ao anon no banco inteiro.
--
-- Não derruba quem paga. `delivery` é gated só por `planos_modulos` —
-- os únicos add-ons avulsos do produto são 'nfe' e 'tef'
-- (20260718_addons.sql), delivery não é um deles. E
-- `tenants.plano_codigo` é NOT NULL DEFAULT 'avancado' com FK para
-- planos(codigo) (20260717_planos_modulos.sql:71): não existe plano
-- nulo capaz de apagar uma loja por acidente. `tenant_tem_modulo` é
-- exatamente o mesmo critério que o front já aplica em
-- `moduloHabilitado(tenant.modulosDisponiveis, 'delivery')`, que lê
-- `planos_modulos` — servidor e tela passam a dizer a mesma coisa.
--
-- RLS: nada muda. Nenhuma tabela nova, nenhuma policy nova, nenhum
-- GRANT novo (CREATE OR REPLACE preserva dono e privilégios, e o
-- REVOKE ... FROM PUBLIC de 20260804 continua valendo).
-- ══════════════════════════════════════════════════════════════════

-- ── 1. tenant_tem_modulo passa a valer no caminho ANÔNIMO ──────────
-- Até aqui ela só era alcançada por sessão autenticada. A partir desta
-- migração ela decide o que um desconhecido vê, então precisa do
-- search_path fixo que toda SECURITY DEFINER exposta tem.
--
-- Ela chegou a ter: 20260725_fix_search_path_secdef.sql pôs o SET, mas
-- 20260725_multitenant_fase3_wrappers_jwt.sql roda DEPOIS (ordem
-- lexicográfica: 'fix' < 'multitenant') e fez CREATE OR REPLACE sem a
-- cláusula — e CREATE OR REPLACE descarta a configuração da função.
-- ALTER em vez de recriar: assim não há como mexer no corpo sem querer.
ALTER FUNCTION public.tenant_tem_modulo(uuid, text) SET search_path = public;

-- ── 2. O gate ──────────────────────────────────────────────────────
-- Mesmo corpo de 20260804_delivery_fundacao.sql:177, com uma condição
-- a mais. Lê-se como o que passou a ser: "o tenant que ATENDE DELIVERY
-- neste slug". Sem o módulo no plano, é como se o slug não existisse.
CREATE OR REPLACE FUNCTION public.delivery_tenant_por_slug(p_slug text)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT t.id
  FROM public.tenants t
  WHERE t.slug = lower(btrim(coalesce(p_slug, '')))
    AND public.tenant_tem_modulo(t.id, 'delivery')
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.delivery_tenant_por_slug(text) IS
  'Slug → tenant_id, SOMENTE se o plano do tenant inclui o módulo delivery. '
  'Helper interno das RPCs públicas da vitrine (DL30). Não exposto ao anon.';

-- ── 3. Conferência ao vivo ─────────────────────────────────────────
-- O teste do CI lê o texto desta migração; só o banco sabe se ela
-- pegou. Aborta a transação se qualquer uma das duas pontas faltar.
DO $conf$
DECLARE
  v_def  text;
  v_conf text[];
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'delivery_tenant_por_slug';

  IF v_def IS NULL OR position('tenant_tem_modulo' in v_def) = 0 THEN
    RAISE EXCEPTION 'delivery_tenant_por_slug sem o gate de módulo — vitrine pública continua aberta fora do plano.';
  END IF;

  SELECT p.proconfig INTO v_conf
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'tenant_tem_modulo';

  IF v_conf IS NULL OR NOT (v_conf @> ARRAY['search_path=public']) THEN
    RAISE EXCEPTION 'tenant_tem_modulo sem search_path fixo — agora ela responde a chamador anônimo.';
  END IF;
END;
$conf$;
