-- ══════════════════════════════════════════════════════════════════
-- Login ciente de tenant via SUBDOMÍNIO — slug do tenant + username por tenant
-- docs/08_DECISOES/adr-009.md (realiza a superfície de login do adr-008) · decisão 002/017/027
--
-- ┌─ O PROBLEMA ────────────────────────────────────────────────────┐
-- │ O login pede só usuário+senha (sem estabelecimento). Por baixo o  │
-- │ app monta o e-mail `${username}@gastromundi.local` e manda ao     │
-- │ Supabase Auth. Dois namespaces são GLOBAIS:                       │
-- │   • users.username  UNIQUE global                                 │
-- │   • o e-mail do Auth (admin@gastromundi.local) — chave única      │
-- │ Resultado: dois tenants NÃO podem ter `admin`/`caixa`/`gerente`.  │
-- │ A função provisionar-estabelecimento já recusa (409) por isso.    │
-- └───────────────────────────────────────────────────────────────────┘
--
-- ┌─ A SOLUÇÃO (subdomínio) ────────────────────────────────────────┐
-- │ Cada tenant ganha um `slug` (ex: gastromundi, casacoffee). O app  │
-- │ lê o slug do subdomínio (casacoffee.dominio.app) e monta o e-mail │
-- │ `${username}@${slug}.local` — namespace por tenant. Assim o mesmo │
-- │ username coexiste em tenants diferentes. O RLS NÃO muda: o tenant │
-- │ continua vindo do JWT (app_metadata.tenant_id). O subdomínio só   │
-- │ resolve QUAL namespace de e-mail usar no momento do login.        │
-- │ Escolha de produto: subdomínio (e não campo/dropdown) para NÃO    │
-- │ vazar a carteira de estabelecimentos entre si (white-label).      │
-- └───────────────────────────────────────────────────────────────────┘
--
-- Esta migration é a FUNDAÇÃO (banco). As outras peças (helper de slug
-- no login, Edge Functions montando o e-mail pelo slug) vêm no mesmo PR,
-- no front/functions. Enquanto o domínio/subdomínio não existir, o front
-- cai num fallback de slug (gastromundi) e NADA muda — inerte por design.
--
-- ⚠️ EXECUÇÃO MANUAL: rode no SQL Editor do Supabase. Idempotente.
-- ══════════════════════════════════════════════════════════════════

-- ── 1) tenants.slug — rótulo do subdomínio e do namespace de e-mail ─
-- Nasce NULLABLE para o backfill; vira UNIQUE + NOT NULL no fim.
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS slug text;

-- 1a) O tenant mais antigo é a instalação GastroMundi original. Seu slug
--     PRECISA ser 'gastromundi' — os usuários dele já têm e-mail
--     `@gastromundi.local` no Auth; manter o slog preserva o login sem
--     re-migrar ninguém.
UPDATE public.tenants t
SET slug = 'gastromundi'
WHERE t.slug IS NULL
  AND t.id = (SELECT id FROM public.tenants ORDER BY created_at ASC LIMIT 1);

-- 1b) Demais tenants: slug derivado do nome (sem acento, só a-z0-9). Ex:
--     "Casa Coffee Colab" → "casacoffeecolab". É um PONTO DE PARTIDA — se
--     colidir, a constraint UNIQUE abaixo acusa e você ajusta à mão.
--     ⚠️ REVISE o resultado (SELECT final) e RENOMEIE para o subdomínio
--     exato que vai comprar/apontar ANTES de rodar o script que
--     re-nomeia os e-mails do Auth dos usuários já existentes.
UPDATE public.tenants t
SET slug = nullif(
      regexp_replace(
        lower(translate(t.nome,
          'áàâãäéèêëíìîïóòôõöúùûüçñ',
          'aaaaaeeeeiiiiooooouuuucn')),
        '[^a-z0-9]+', '', 'g'),
      '')
WHERE t.slug IS NULL;

-- 1c) Rede de segurança: se algum nome virou slug vazio (ex: só símbolos),
--     usa um fallback baseado no id para não violar o NOT NULL.
UPDATE public.tenants t
SET slug = 'tenant-' || substr(t.id::text, 1, 8)
WHERE t.slug IS NULL;

-- 1d) UNIQUE + NOT NULL. Se 1b gerou slug duplicado, o ADD CONSTRAINT
--     falha aqui de propósito — corrija os nomes/slugs e rode de novo.
ALTER TABLE public.tenants
  DROP CONSTRAINT IF EXISTS tenants_slug_key;
ALTER TABLE public.tenants
  ADD CONSTRAINT tenants_slug_key UNIQUE (slug);
ALTER TABLE public.tenants
  ALTER COLUMN slug SET NOT NULL;

-- ── 2) users.username — de UNIQUE global para UNIQUE (tenant_id, username)
-- Mesmo padrão composto de config/mesas (20260738). Libera `admin`/`caixa`
-- repetidos entre tenants, mantendo unicidade DENTRO de cada tenant.
--
-- 2a) Derruba QUALQUER unique de coluna única (username) — robusto a
--     nomes auto-gerados (users_username_key) e variações.
DO $$
DECLARE
  c text;
  v_username_attnum smallint;
BEGIN
  SELECT attnum INTO v_username_attnum
  FROM pg_attribute
  WHERE attrelid = 'public.users'::regclass AND attname = 'username';

  FOR c IN
    SELECT con.conname
    FROM pg_constraint con
    WHERE con.conrelid = 'public.users'::regclass
      AND con.contype = 'u'
      AND con.conkey = ARRAY[v_username_attnum]
  LOOP
    EXECUTE format('ALTER TABLE public.users DROP CONSTRAINT %I', c);
    RAISE NOTICE 'Removido UNIQUE global de username: %', c;
  END LOOP;
END $$;

-- 2b) Unique composto por tenant. tenant_id do super-admin `plataforma` é
--     NULL — e no Postgres NULLs são distintos no UNIQUE, então a linha
--     plataforma nunca colide (e é única de qualquer forma).
ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_tenant_username_key;
ALTER TABLE public.users
  ADD CONSTRAINT users_tenant_username_key UNIQUE (tenant_id, username);

-- ── 3) Conferência — REVISE os slugs antes de apontar DNS/re-nomear Auth
-- Cada tenant deve ter um slug limpo e único. Ajuste o do 2º tenant para
-- o subdomínio exato desejado com:
--   UPDATE public.tenants SET slug='casacoffee' WHERE nome='Casa Coffee Colab';
SELECT id, nome, slug, created_at
FROM public.tenants
ORDER BY created_at ASC;
