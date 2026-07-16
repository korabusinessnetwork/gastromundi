-- ══════════════════════════════════════════════════════════════════
-- CUTOVER do login por SUBDOMÍNIO — renomeia e-mails de Auth existentes
-- ⚠️ NÃO RODE AGORA. Este é o passo da VIRADA, não da fase inerte.
-- Complementa 20260740/20260741. Ver docs/08_DECISOES/adr-008.md.
--
-- ┌─ O QUE FAZ ─────────────────────────────────────────────────────┐
-- │ Usuários de tenants != 'gastromundi' hoje têm e-mail de Auth      │
-- │ `usuario@gastromundi.local` (namespace global antigo). Ao ligar   │
-- │ o subdomínio, o login passa a montar `usuario@<slug>.local`, e    │
-- │ esses usuários não logariam. Este script move o e-mail de Auth    │
-- │ deles para o namespace do próprio tenant (preserva a parte antes  │
-- │ do @). Usuários de 'gastromundi' NÃO são tocados.                 │
-- └───────────────────────────────────────────────────────────────────┘
--
-- ┌─ SEQUÊNCIA DA VIRADA (faça numa janela de manutenção curta) ─────┐
-- │ 1. 20260740 e 20260741 já aplicadas.                              │
-- │ 2. Revise/ajuste os slugs em public.tenants (o do Casa Coffee     │
-- │    deve ser EXATAMENTE o subdomínio que você vai apontar).        │
-- │ 3. Rode a PRÉ-VISUALIZAÇÃO abaixo e confira os e-mails novos.     │
-- │ 4. Rode o BLOCO DE UPDATE (transação).                            │
-- │ 5. Configure no front (Vercel): VITE_ROOT_DOMAIN=<seu-dominio>    │
-- │    e nas Edge Functions: TENANT_ROOT_DOMAIN=<seu-dominio>.        │
-- │ 6. Aponte o DNS wildcard (*.<seu-dominio>) para a Vercel e refaça │
-- │    o build do front.                                              │
-- │ Entre 4 e 5 o login do 2º tenant fica indisponível — por isso a   │
-- │ janela curta. Os usuários de 'gastromundi' seguem logando normal. │
-- └───────────────────────────────────────────────────────────────────┘
-- ══════════════════════════════════════════════════════════════════

-- ── PRÉ-VISUALIZAÇÃO (rode SOZINHA primeiro; não altera nada) ───────
SELECT au.id,
       au.email                                                        AS email_atual,
       split_part(au.email, '@', 1) || '@' || t.slug || '.local'       AS email_novo,
       t.nome, t.slug
FROM auth.users au
JOIN public.users   pu ON pu.auth_id = au.id
JOIN public.tenants t  ON t.id = pu.tenant_id
WHERE t.slug <> 'gastromundi'
  AND au.email LIKE '%@gastromundi.local'
ORDER BY t.slug, email_atual;

-- ── BLOCO DE UPDATE (rode DEPOIS de conferir a pré-visualização) ────
-- Descomente e rode como uma transação única.
/*
BEGIN;

-- 1) auth.users — o e-mail canônico usado no login por senha.
UPDATE auth.users au
SET email = split_part(au.email, '@', 1) || '@' || t.slug || '.local'
FROM public.users pu
JOIN public.tenants t ON t.id = pu.tenant_id
WHERE pu.auth_id = au.id
  AND t.slug <> 'gastromundi'
  AND au.email LIKE '%@gastromundi.local';

-- 2) auth.identities — espelha o e-mail do provider 'email' (evita drift).
UPDATE auth.identities ai
SET identity_data = jsonb_set(
      ai.identity_data, '{email}',
      to_jsonb(split_part(ai.identity_data->>'email', '@', 1) || '@' || t.slug || '.local'))
FROM public.users pu
JOIN public.tenants t ON t.id = pu.tenant_id
WHERE ai.user_id = pu.auth_id
  AND ai.provider = 'email'
  AND t.slug <> 'gastromundi'
  AND ai.identity_data->>'email' LIKE '%@gastromundi.local';

-- Confira o resultado antes de confirmar:
SELECT au.email, t.slug
FROM auth.users au
JOIN public.users pu ON pu.auth_id = au.id
JOIN public.tenants t ON t.id = pu.tenant_id
WHERE t.slug <> 'gastromundi';

COMMIT;
*/
