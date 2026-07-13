-- ══════════════════════════════════════════════════════════════════
-- users — policy de SELECT da PRÓPRIA linha (login de qualquer papel)
-- Console da Plataforma (S1-2) · multi-tenant (decisão 002) · ADR-008
--
-- PROBLEMA (descoberto ao logar o super-admin `plataforma`):
--   A única policy de SELECT em public.users era `users_select_admin`
--   (auth.jwt() -> 'app_metadata' ->> 'gastro_role') = 'admin'. Ou seja,
--   SÓ quem já é admin lê a tabela users. Mas o login (AppContext
--   buscarDadosUsuario) precisa ler a PRÓPRIA linha logo após autenticar,
--   por auth_id, para descobrir name/role/permissions. Resultado: qualquer
--   usuário NÃO-admin — incluindo o `plataforma` (gastro_role='plataforma')
--   e, no alvo multi-tenant, garçom/caixa/gerente — autentica com sucesso
--   mas cai em "Usuário não encontrado ou inativo", porque a RLS esconde
--   dele a própria linha.
--
-- CORREÇÃO:
--   Adiciona `users_select_self`: todo usuário autenticado pode LER a sua
--   própria linha (auth_id = auth.uid()). É o mínimo que o login exige e
--   é seguro por construção — devolve no máximo 1 linha, a do próprio
--   chamador, sem qualquer vazamento entre tenants ou entre usuários.
--
--   A policy antiga `users_select_admin` continua existindo (admin segue
--   enxergando todos os usuários do seu tenant para a tela de gestão);
--   políticas PERMISSIVAS se somam via OR, então o admin não perde nada.
--
-- SEGURANÇA / MULTI-TENANT:
--   auth.uid() é o id da credencial em auth.users; auth_id é a FK do
--   perfil para essa credencial. O casamento é 1:1, então self-select
--   nunca revela linha de outro usuário nem de outro tenant. O super-admin
--   `plataforma` (tenant_id NULL) passa a ler a própria linha e conclui o
--   login → cai no /console.
--
-- Idempotente: DROP ... IF EXISTS antes de recriar.
-- ══════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "users_select_self" ON public.users;

CREATE POLICY "users_select_self" ON public.users FOR SELECT
  USING (auth_id = auth.uid());
