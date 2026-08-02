-- ══════════════════════════════════════════════════════════════════
-- Identidade do estabelecimento — RPC atualizar_identidade_tenant
-- docs/09_BACKLOG/sprint_pre_venda.md (S1-3) · ADR-005/008 §7 · ADR-007 §2
-- decisão 017 (white-label) · specs/s1-3-identidade-do-estabelecimento.md
--
-- ┌─ O QUE FALTAVA ─────────────────────────────────────────────────┐
-- │ O nome de exibição e o logo do estabelecimento moram em          │
-- │ `tenants.tema` (jsonb), e o front inteiro já os consome          │
-- │ (SidebarBranding, LoginPage, CardapioPage, cupom impresso).      │
-- │ Só que NINGUÉM os escrevia: `tenants` não tem policy de UPDATE   │
-- │ (ADR-005/008 §7 — escrita só por RPC/migration) e a única RPC    │
-- │ que mexe em `tema` é a alterar_layout_tenant (20260801), que é   │
-- │ do super-admin. Na prática, trocar o próprio logo era `UPDATE`   │
-- │ no SQL Editor — exatamente o "sistema que o cliente só configura │
-- │ por SQL" que o S1-3 existe para acabar.                          │
-- └──────────────────────────────────────────────────────────────────┘
--
-- ┌─ ESCOPO DELIBERADO ─────────────────────────────────────────────┐
-- │ Esta RPC escreve DUAS chaves: `nome_exibicao` e `logo_url`.      │
-- │ Paleta (`accent`) e `layout` continuam sendo escolha da          │
-- │ plataforma pelo Console. Não é esquecimento: a alterar_layout    │
-- │ APAGA os overrides de paleta de propósito (senão o layout novo   │
-- │ não apareceria), então duas pontas escrevendo as mesmas chaves   │
-- │ se sobrescreveriam sem ninguém perceber. Identidade (marca) é do │
-- │ estabelecimento; aparência (layout) é da plataforma.             │
-- └──────────────────────────────────────────────────────────────────┘
--
-- SEGURANÇA
-- • SEM parâmetro de tenant. O alvo é sempre tenant_do_usuario_atual()
--   — resolvido por auth.uid() → public.users. Não existe assinatura
--   possível desta função que mire OUTRO estabelecimento; um admin do
--   tenant A não tem como alcançar o tenant B nem informando id.
-- • Guarda de papel com `IS NOT TRUE`, não `NOT ...`: um JWT sem o claim
--   gastro_role devolve NULL, e `NOT NULL` é NULL — o IF não entraria no
--   bloco e a escrita seguiria. `IS NOT TRUE` trata NULL e false igual:
--   barra. (Mesmo racional de 20260729.)
-- • logo_url validada AQUI, não só no front: allowlist de esquema
--   (http/https/data:image). Sem isso, um `javascript:` gravado por
--   qualquer caminho vira XSS quando cai no `<img src>` da sidebar e da
--   tela de login. O front tem a mesma allowlist (lib/tema.js
--   logoUrlSegura) — as duas camadas são de propósito.
-- • REVOKE de PUBLIC/anon + GRANT só a authenticated (o CREATE FUNCTION
--   do Postgres concede EXECUTE a PUBLIC por padrão).
--
-- Idempotente (CREATE OR REPLACE). Roda como `postgres` no SQL Editor.
-- ══════════════════════════════════════════════════════════════════

-- ── Helper: tenant do usuário logado, via auth.uid() (claim `sub`). ──
-- Repetido aqui, idêntico ao de 20260826, para esta migration não
-- depender de aquela já ter sido rodada. CREATE OR REPLACE com o mesmo
-- corpo é inofensivo se já existir.
CREATE OR REPLACE FUNCTION public.tenant_do_usuario_atual()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tenant_id FROM public.users WHERE auth_id = auth.uid() LIMIT 1;
$$;

-- CREATE FUNCTION concede EXECUTE a PUBLIC por padrão, e `anon` herda de
-- PUBLIC: sem este REVOKE um visitante não autenticado chama a função
-- definer direto pela REST. Hoje ela devolve NULL para anon (auth.uid() é
-- NULL), mas função definer executável por anônimo não deve existir.
REVOKE EXECUTE ON FUNCTION public.tenant_do_usuario_atual() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.tenant_do_usuario_atual() TO authenticated;

-- ── RPC ────────────────────────────────────────────────────────────
-- Convenção dos parâmetros:
--   • NULL  = "não mexe nesta chave" (salvar só o nome, só o logo)
--   • ''    = "remove esta chave"     (tirar o logo, voltar ao nome)
CREATE OR REPLACE FUNCTION public.atualizar_identidade_tenant(
  p_nome_exibicao text DEFAULT NULL,
  p_logo_url      text DEFAULT NULL
)
RETURNS public.tenants
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
  v_tenant    public.tenants;
  v_tema      jsonb;
  v_nome      text;
  v_logo      text;
BEGIN
  -- ── Autorização: admin, e do próprio estabelecimento ─────────────
  IF ((auth.jwt() -> 'app_metadata' ->> 'gastro_role') = 'admin') IS NOT TRUE THEN
    RAISE EXCEPTION 'Apenas o administrador do estabelecimento pode alterar a identidade.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_tenant_id := public.tenant_do_usuario_atual();

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Usuário sem estabelecimento vinculado.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── Validação do nome ────────────────────────────────────────────
  IF p_nome_exibicao IS NOT NULL THEN
    v_nome := btrim(p_nome_exibicao);
    -- 40 caracteres é o que cabe no cabeçalho da sidebar sem quebrar a
    -- marca em duas linhas ilegíveis.
    IF char_length(v_nome) > 40 THEN
      RAISE EXCEPTION 'O nome de exibição deve ter no máximo 40 caracteres.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- ── Validação do logo (allowlist de esquema) ─────────────────────
  IF p_logo_url IS NOT NULL THEN
    v_logo := btrim(p_logo_url);
    IF v_logo <> '' AND v_logo !~* '^(https?://|data:image/)' THEN
      RAISE EXCEPTION 'Endereço de logo inválido.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- ── Merge: preserva layout, accent e qualquer outra chave ────────
  -- `||` sobrescreve só as chaves informadas; `-` remove a chave quando
  -- o chamador manda string vazia (tirar o logo).
  SELECT COALESCE(tema, '{}'::jsonb) INTO v_tema
    FROM public.tenants WHERE id = v_tenant_id;

  IF v_tema IS NULL THEN
    RAISE EXCEPTION 'Estabelecimento não encontrado.'
      USING ERRCODE = 'no_data_found';
  END IF;

  IF v_nome IS NOT NULL THEN
    IF v_nome = '' THEN
      v_tema := v_tema - 'nome_exibicao';
    ELSE
      v_tema := v_tema || jsonb_build_object('nome_exibicao', v_nome);
    END IF;
  END IF;

  IF v_logo IS NOT NULL THEN
    IF v_logo = '' THEN
      v_tema := v_tema - 'logo_url';
    ELSE
      v_tema := v_tema || jsonb_build_object('logo_url', v_logo);
    END IF;
  END IF;

  UPDATE public.tenants
     SET tema = v_tema
   WHERE id = v_tenant_id
  RETURNING * INTO v_tenant;

  RETURN v_tenant;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.atualizar_identidade_tenant(text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.atualizar_identidade_tenant(text, text) TO authenticated;

-- ── Conferência (opcional) — deve voltar uma linha com ✅ ───────────
SELECT p.proname,
       CASE WHEN p.prosecdef THEN '✅ security definer' ELSE '❌' END AS definer,
       CASE WHEN has_function_privilege('anon', p.oid, 'EXECUTE')
            THEN '❌ anon alcança' ELSE '✅ anon barrado' END AS anon
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'atualizar_identidade_tenant';
