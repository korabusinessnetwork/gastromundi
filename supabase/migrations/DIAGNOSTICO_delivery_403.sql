-- ══════════════════════════════════════════════════════════════════
-- DIAGNÓSTICO do 403 ao importar/cadastrar cardápio do Delivery.
-- NÃO altera nada — só LÊ o estado. Rode no SQL Editor do Supabase
-- LOGADO COMO VOCÊ (não use o "service_role" do editor; veja nota 4).
-- ══════════════════════════════════════════════════════════════════

-- 1) As policies PERMISSIVE da 20260807 REALMENTE existem na tabela?
--    Espere ver: produto_delivery_select_auth (PERMISSIVE, SELECT)
--                produto_delivery_write_gerente_admin (PERMISSIVE, ALL)
--                produto_delivery_tenant_isolamento (RESTRICTIVE, ALL)
select policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'produto_delivery'
order by permissive desc, policyname;

-- 2) Qual é o SEU papel no JWT e o SEU tenant resolvido?
--    role precisa ser 'gerente' ou 'admin'. tenant NÃO pode ser NULL.
select
  auth.uid()                       as user_id,
  auth.role()                      as pg_role,          -- deve ser 'authenticated'
  auth.jwt() ->> 'role'            as jwt_role,         -- deve ser gerente/admin
  auth.jwt() -> 'app_metadata'     as app_metadata,     -- deve conter tenant_id
  public.tenant_atual_id()         as tenant_resolvido; -- NÃO pode ser NULL

-- 3) O que a tabela public.users diz do seu papel/tenant?
--    (fonte da verdade do provisionamento — role='admin' pro dono)
--    Liga por auth_id (o id é bigint; auth.uid() é uuid).
select id, name, username, role, tenant_id, active
from public.users
where auth_id = auth.uid();
