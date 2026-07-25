-- ══════════════════════════════════════════════════════════════════
-- Delivery — policies de Storage do bucket `delivery-fotos` (ESTADO FINAL).
--
-- Rodar MANUALMENTE no SQL Editor do Supabase (não é aplicado automático).
-- Idempotente: pode rodar de novo sem erro. Roda como `postgres`.
--
-- ⚠️ DEADLOCK: o SQL Editor roda o script inteiro em UMA transação, que segura
--    lock em storage.objects E storage.buckets ao mesmo tempo. Com o app em uso
--    (storage-api tranca as mesmas relações na ordem inversa) isso pode dar
--    "40P01: deadlock detected". Para evitar, RODE EM DUAS PARTES separadas
--    (PARTE 1 e PARTE 2 abaixo), cada uma na sua própria execução — assim cada
--    transação tranca só uma relação. Se ainda deadlockar, é transitório:
--    rode de novo (é idempotente), de preferência num momento de baixo uso.
--
-- SINTOMA (400 ao subir a foto do produto no painel do Delivery):
--   O upload para `delivery-fotos/{tenant_id}/{produto_id}.jpg` voltava
--   "new row violates row-level security policy" — MESMO com as policies de
--   INSERT/UPDATE totalmente abertas (`TO public`).
--
-- CAUSA RAIZ (confirmada):
--   O upload usa `upsert: true`, que no Storage vira INSERT ... ON CONFLICT
--   DO UPDATE. Pra decidir inserir vs. atualizar, o Storage precisa LER o
--   objeto antes — e o bucket NÃO tinha policy de SELECT. Sem SELECT, a
--   leitura interna do upsert era negada pela RLS → 400. Faltava o SELECT,
--   não o INSERT. (A hipótese anterior de `app_metadata` não propagar pro
--   Storage foi descartada — nunca se confirmou.)
--
-- SOLUÇÃO / ESTADO FINAL desta migration:
--   • Helper tenant_do_usuario_atual(): resolve o tenant por auth.uid()
--     (claim `sub`, sempre presente no Storage) → public.users.tenant_id.
--     SECURITY DEFINER p/ não depender da RLS de users e ser determinístico.
--   • 4 policies em storage.objects (INSERT/UPDATE/DELETE/SELECT), todas
--     `TO authenticated` e escopadas por tenant (1ª pasta = tenant do user):
--       - INSERT/UPDATE  → gravar/trocar a própria foto (o UPDATE do upsert).
--       - SELECT         → leitura interna do upsert + listar a galeria
--                          (o painel só enxerga o PRÓPRIO folder).
--       - DELETE         → remover a própria foto.
--   • 1 policy SELECT em storage.buckets (id='delivery-fotos') p/ a validação
--     do bucket no fluxo de upload autenticado.
--
--   Isolamento multi-tenant: cada tenant só grava/lê/troca/apaga dentro da
--   própria pasta. Isto REAPERTA policies `TO public` abertas durante o
--   diagnóstico (buraco cross-tenant). Leitura pública das imagens (bucket
--   public = true) NÃO passa por RLS → cardápio do cliente segue funcionando.
-- ══════════════════════════════════════════════════════════════════

-- ══════════════════ PARTE 1 — helper + policies de storage.objects ══════
-- (trava só storage.objects; rode este bloco sozinho no SQL Editor)

-- ── Helper: tenant do usuário logado, via auth.uid() (claim `sub`). ──
CREATE OR REPLACE FUNCTION public.tenant_do_usuario_atual()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tenant_id FROM public.users WHERE auth_id = auth.uid() LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.tenant_do_usuario_atual() TO authenticated;

-- ── storage.objects: INSERT (gravar a própria foto). ──
DROP POLICY IF EXISTS "delivery_fotos_insert" ON storage.objects;
CREATE POLICY "delivery_fotos_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'delivery-fotos'
    AND (storage.foldername(name))[1] = public.tenant_do_usuario_atual()::text
  );

-- ── storage.objects: UPDATE (o "U" do upsert / trocar a foto). ──
DROP POLICY IF EXISTS "delivery_fotos_update" ON storage.objects;
CREATE POLICY "delivery_fotos_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'delivery-fotos'
    AND (storage.foldername(name))[1] = public.tenant_do_usuario_atual()::text
  )
  WITH CHECK (
    bucket_id = 'delivery-fotos'
    AND (storage.foldername(name))[1] = public.tenant_do_usuario_atual()::text
  );

-- ── storage.objects: DELETE (remover a própria foto). ──
DROP POLICY IF EXISTS "delivery_fotos_delete" ON storage.objects;
CREATE POLICY "delivery_fotos_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'delivery-fotos'
    AND (storage.foldername(name))[1] = public.tenant_do_usuario_atual()::text
  );

-- ── storage.objects: SELECT — ESSENCIAL. ──
-- (a) o upsert precisa LER o objeto antes de decidir inserir/atualizar;
-- (b) a galeria do painel lista o folder do tenant (.list()).
-- Escopado por tenant: cada painel só enxerga as próprias fotos.
DROP POLICY IF EXISTS "delivery_fotos_select" ON storage.objects;
CREATE POLICY "delivery_fotos_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'delivery-fotos'
    AND (storage.foldername(name))[1] = public.tenant_do_usuario_atual()::text
  );

-- ══════════════════ PARTE 2 — policy de storage.buckets ═════════════════
-- (trava só storage.buckets; rode este bloco numa 2ª execução separada)

-- ── storage.buckets: SELECT do bucket (validação no upload autenticado). ──
DROP POLICY IF EXISTS "delivery_fotos_bucket_select" ON storage.buckets;
CREATE POLICY "delivery_fotos_bucket_select" ON storage.buckets
  FOR SELECT TO authenticated
  USING ( id = 'delivery-fotos' );

-- Nota: a leitura PÚBLICA das imagens continua sem policy (bucket public =
-- true); só o acesso autenticado (upsert, .list(), escrita) passa por RLS, e
-- agora resolve o tenant por auth.uid().
