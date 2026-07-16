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
-- O plano liga os módulos (tenant_tem_modulo). Casa Coffee é CLIENTE
-- FUNDADORA (decisão 030): plano máximo ('avancado', todos os módulos).
--
-- Nota: NÃO usar alterar_plano_tenant() aqui — a guarda is_super_admin()
-- dela lê o JWT do chamador, e o SQL Editor roda sem JWT (barraria com
-- "Apenas a plataforma pode alterar o plano"). Essa RPC é a porta do
-- CONSOLE (app); no SQL Editor, como postgres, o equivalente é o UPDATE
-- direto — com a mesma validação de plano embutida no WHERE.
UPDATE public.tenants t
   SET plano_codigo = 'avancado'
 WHERE t.slug = 'casacoffeecolab'
   AND EXISTS (SELECT 1 FROM public.planos p WHERE p.codigo = 'avancado')
RETURNING t.slug, t.plano_codigo;
-- Esperado: 1 linha (slug + plano novo). 0 linhas = tenant não existe
-- OU o código de plano digitado não está no catálogo — confira os dois.

-- ── 4. AÇÃO · assinatura fundadora (billing manual — bootstrap) ─────
-- Plano Fundador (decisão 030): vitalício, 3 MESES DE TESTE grátis e
-- depois R$ 300/mês simbólicos no plano máximo (custeio de API).
-- Modelagem: valor_mensal = 300.00 e o PRIMEIRO vencimento cai só ao
-- fim do teste (data_inicio + 3 meses) — até lá status = 'ativo' sem
-- cobrança. Idempotente (1 assinatura por tenant).
INSERT INTO public.assinaturas (tenant_id, valor_mensal, data_inicio, data_vencimento)
SELECT t.id,
       300.00,                      -- fundador vitalício (decisão 030)
       current_date,
       (current_date + interval '3 months')::date
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
