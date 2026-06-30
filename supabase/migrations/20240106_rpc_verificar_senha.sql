-- ══════════════════════════════════════════════════════════════════
-- FASE 3 — RPC para verificação de senha admin/gerente
--
-- Permite que o frontend verifique credenciais sem expor hashes.
-- Usa bcrypt nativo do Postgres via pgcrypto (já incluso no Supabase).
-- SECURITY DEFINER: roda com privilégios do owner, lê auth.users.
--
-- Parâmetros:
--   p_password  — senha digitada pelo usuário
--   p_username  — NULL = qualquer admin/gerente | preenchido = usuário específico
-- ══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.verificar_senha_admin(
  p_password text,
  p_username text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_ok boolean := false;
BEGIN
  -- Rejeita entrada vazia imediatamente
  IF p_password IS NULL OR length(trim(p_password)) = 0 THEN
    RETURN false;
  END IF;

  IF p_username IS NOT NULL THEN
    -- Verifica usuário específico + exige papel admin ou gerente
    SELECT (au.encrypted_password = crypt(p_password, au.encrypted_password))
    INTO v_ok
    FROM public.users pu
    JOIN auth.users au ON au.id = pu.auth_id
    WHERE pu.username = lower(trim(p_username))
      AND pu.active   = true
      AND pu.role    IN ('admin', 'gerente')
    LIMIT 1;
  ELSE
    -- Verifica se qualquer admin/gerente ativo possui essa senha
    SELECT true INTO v_ok
    FROM public.users pu
    JOIN auth.users au ON au.id = pu.auth_id
    WHERE pu.role   IN ('admin', 'gerente')
      AND pu.active  = true
      AND au.encrypted_password = crypt(p_password, au.encrypted_password)
    LIMIT 1;
  END IF;

  RETURN COALESCE(v_ok, false);
END;
$$;

-- Apenas usuários autenticados podem chamar — anon sem sessão não consegue
REVOKE EXECUTE ON FUNCTION public.verificar_senha_admin(text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.verificar_senha_admin(text, text) TO authenticated;
