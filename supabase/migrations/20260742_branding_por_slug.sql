-- ══════════════════════════════════════════════════════════════════
-- branding_por_slug — marca do tenant para a TELA DE LOGIN (pré-auth)
-- docs/08_DECISOES/adr-009.md · adr-007.md (white-label) · decisão 017
--
-- ┌─ POR QUÊ ───────────────────────────────────────────────────────┐
-- │ A tela de login é PRÉ-autenticação: não há JWT, logo                │
-- │ tenant_atual_id() é NULL e a policy de SELECT de `tenants`          │
-- │ (id = tenant_atual_id() OR is_super_admin()) devolve ZERO linhas    │
-- │ ao anon. Sem isto, casacoffeecolab.kora.codes/login mostraria o     │
-- │ visual PADRÃO (GastroMundi) — o que o white-label não admite.       │
-- │ Esta RPC expõe, por slug do subdomínio, SÓ a marca (nome + tema).   │
-- └───────────────────────────────────────────────────────────────────┘
--
-- SEGURANÇA: SECURITY DEFINER, retorna APENAS (nome, tema). Nunca toca
-- usuários, caixa, pedidos, assinatura ou qualquer dado operacional. O
-- slug já é público (é o subdomínio na barra de endereço); expor
-- nome+tema por slug conhecido é branding, não vazamento. Não enumera a
-- lista de tenants (exige o slug exato; slug desconhecido → 0 linhas).
--
-- ⚠️ EXECUÇÃO MANUAL: rode no SQL Editor. Idempotente (CREATE OR REPLACE).
-- ══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.branding_por_slug(p_slug text)
RETURNS TABLE (nome text, tema jsonb)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT t.nome, t.tema
  FROM public.tenants t
  WHERE t.slug = lower(btrim(coalesce(p_slug, '')))
  LIMIT 1;
$$;

-- Acesso: anon (tela de login) e authenticated. NÃO exponha a PUBLIC de
-- forma mais ampla — anon/authenticated já cobrem a superfície do app.
REVOKE EXECUTE ON FUNCTION public.branding_por_slug(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.branding_por_slug(text) TO anon, authenticated;
