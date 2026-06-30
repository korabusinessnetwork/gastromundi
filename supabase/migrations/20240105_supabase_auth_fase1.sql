-- ══════════════════════════════════════════════════════════════════
-- FASE 1 — Supabase Auth: vinculação + hook de JWT customizado
--
-- O que faz:
--   1. Adiciona coluna auth_id em users (FK → auth.users)
--   2. Cria função custom_access_token_hook que injeta o role
--      do usuário no JWT emitido pelo Supabase Auth
--   3. Concede permissão para a função ser executada pelo sistema
--
-- DEPOIS de rodar este SQL:
--   → Ative o hook em: Dashboard › Auth › Hooks › Custom Access Token
--   → Escolha a função: public.custom_access_token_hook
--   → Rode o script scripts/migrar_usuarios_auth.mjs
-- ══════════════════════════════════════════════════════════════════

-- ── 1. Vincula users ↔ auth.users ─────────────────────────────────
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS auth_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_users_auth_id ON public.users(auth_id);

-- ── 2. Hook: injeta role no JWT ───────────────────────────────────
-- Executado pelo Supabase Auth a cada emissão de token.
-- Lê o role da tabela users via auth_id e coloca em claims.role.
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  claims   jsonb;
  user_role text;
BEGIN
  SELECT role INTO user_role
  FROM public.users
  WHERE auth_id = (event ->> 'user_id')::uuid
  LIMIT 1;

  claims := event -> 'claims';

  -- Injeta o role; se não encontrado, padrão é 'garcom' (menor privilégio)
  claims := jsonb_set(claims, '{role}',     to_jsonb(COALESCE(user_role, 'garcom')));
  -- app_metadata.role também — usado por algumas libs client-side
  claims := jsonb_set(claims, '{app_metadata, role}', to_jsonb(COALESCE(user_role, 'garcom')));

  RETURN jsonb_set(event, '{claims}', claims);
END;
$$;

-- ── 3. Permissões da função ───────────────────────────────────────
-- supabase_auth_admin precisa poder chamar a função
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;
-- Garante que a função pode ler a tabela users mesmo com RLS (SECURITY DEFINER faz isso)
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM PUBLIC, anon, authenticated;
