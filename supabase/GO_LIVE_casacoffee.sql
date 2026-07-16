-- ══════════════════════════════════════════════════════════════════
-- GO-LIVE · Casa Coffee Colab (casacoffeecolab.kora.codes)
-- Conferência + acabamento para deixar o tenant OPERÁVEL pela Paula.
--
-- Roteiro completo (com os passos fora do SQL — Auth, Vercel):
--   docs/05_FLUXOS/golive-casacoffee.md
-- Depois do go-live, o dia a dia da Paula é self-service:
--   docs/05_FLUXOS/ativar-novo-estabelecimento.md
--
-- ⚠️ EXECUÇÃO MANUAL no SQL Editor do Supabase, bloco a bloco, na
-- ordem. Cada bloco diz se é CONFERÊNCIA (só SELECT, sempre seguro)
-- ou AÇÃO (idempotente). Nada aqui cria credenciais — usuário é pelo
-- Console da plataforma / painel de Auth (service_role nunca sai de lá).
-- ══════════════════════════════════════════════════════════════════

-- ── 1. CONFERÊNCIA · o tenant existe e com qual cara? ───────────────
-- Esperado: 1 linha, slug 'casacoffeecolab'. Se vier VAZIO, provisione
-- pelo Console da Plataforma (menu Console, super-admin) — ele cria o
-- tenant E o primeiro usuário da Paula juntos — e volte pra cá.
SELECT id, nome, slug, plano_codigo,
       tema->>'nome_exibicao'                    AS nome_exibicao,
       (tema ? 'accent')                         AS tema_aplicado,
       created_at
FROM public.tenants
WHERE slug = 'casacoffeecolab';

-- ── 2. AÇÃO · tema white-label (café/terracota do Social DNA) ───────
-- Idempotente. É o mesmo conteúdo de supabase/SEED_tema_casacoffee.sql
-- (fonte canônica do tema — se editar lá, reaplique). Se a conferência
-- acima mostrou tema_aplicado = true, pode pular.
--   → rodar: supabase/SEED_tema_casacoffee.sql

-- ── 3. AÇÃO · plano do tenant ───────────────────────────────────────
-- O plano liga os módulos (tenant_tem_modulo). Recomendação pro Casa
-- Coffee: 'medio' (Casa Cheia) — cafeteria com salão usa mesas/comandas
-- e Palm do garçom; se a Paula operar só balcão, 'simples' basta.
-- DECISÃO DO DONO — troque o código abaixo se for outro.
SELECT public.alterar_plano_tenant(
  (SELECT id FROM public.tenants WHERE slug = 'casacoffeecolab'),
  'medio'
);

-- ── 4. AÇÃO · assinatura (billing manual — fase bootstrap) ──────────
-- Cliente fundador (decisão 029): desconto forte em troca de case; o
-- VALOR é decisão do dono → preencha :valor_fundador antes de rodar.
-- Preço cheio de tabela do Médio: R$ 349. Idempotente (1 por tenant).
INSERT INTO public.assinaturas (tenant_id, valor_mensal, data_inicio, data_vencimento)
SELECT t.id,
       0.00,                        -- ⚠️ TROCAR pelo valor fundador acordado
       current_date,
       (current_date + interval '1 month')::date
FROM public.tenants t
WHERE t.slug = 'casacoffeecolab'
  AND NOT EXISTS (
    SELECT 1 FROM public.assinaturas a WHERE a.tenant_id = t.id
  );

-- ── 5. CONFERÊNCIA · grupos de categoria semeados? ──────────────────
-- Esperado: 3 linhas (comida, bebida, cafe — migração 20260743). Se
-- vier vazio, o tenant foi criado antes da 20260743; rode o INSERT dela
-- restrito a este tenant.
SELECT g.nome
FROM public.grupos_categoria g
JOIN public.tenants t ON t.id = g.tenant_id
WHERE t.slug = 'casacoffeecolab'
ORDER BY g.nome;

-- ── 6. CONFERÊNCIA · usuários da Paula no namespace certo ───────────
-- Esperado: pelo menos 1 usuário (dona/gerente) com e-mail de Auth
-- terminando em @casacoffeecolab.local. Se aparecer alguém do Casa com
-- @gastromundi.local (criado antes do subdomínio), rode o cutover:
--   supabase/CUTOVER_SUBDOMINIO_renomear_auth.sql (pré-visualização
--   primeiro; janela curta). Se não houver NENHUM usuário, crie pelo
--   Console da Plataforma ou painel de Auth com app_metadata
--   { tenant_id: <id do passo 1>, gastro_role: 'dono' | 'gerente' }.
SELECT pu.username, pu.role, au.email AS email_auth
FROM public.users pu
JOIN auth.users au ON au.id = pu.auth_id
JOIN public.tenants t ON t.id = pu.tenant_id
WHERE t.slug = 'casacoffeecolab'
ORDER BY pu.role, pu.username;

-- ── 7. CONFERÊNCIA FINAL · resumo operável ──────────────────────────
-- Tudo true/preenchido = Paula consegue logar, ver a marca dela e
-- montar o cardápio sozinha (self-service).
SELECT t.slug,
       t.plano_codigo,
       (t.tema ? 'accent')                                        AS tema_ok,
       EXISTS (SELECT 1 FROM public.assinaturas a
               WHERE a.tenant_id = t.id)                          AS assinatura_ok,
       (SELECT count(*) FROM public.users u
        WHERE u.tenant_id = t.id)                                 AS usuarios,
       (SELECT count(*) FROM public.grupos_categoria g
        WHERE g.tenant_id = t.id)                                 AS grupos_default,
       (SELECT count(*) FROM public.products p
        WHERE p.tenant_id = t.id)                                 AS produtos
FROM public.tenants t
WHERE t.slug = 'casacoffeecolab';
