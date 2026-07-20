-- ──────────────────────────────────────────────────────────────────
-- Delivery — bucket de FOTOS dos produtos (upload direto pelo dono).
--
-- Rodar MANUALMENTE no SQL Editor do Supabase (não é aplicado automático).
--
-- O dono escolhe/tira a foto no painel; o front comprime (canvas, JPEG) e
-- envia para o bucket `delivery-fotos`, no caminho:
--     {tenant_id}/{produto_id}.jpg
-- A URL pública vai para produto_delivery.foto_url (versionada ?v=).
--
-- Segurança (multi-tenant, decisão 002):
--   • Leitura: bucket PÚBLICO — a vitrine do cardápio é pública, então as
--     fotos precisam abrir sem login (via getPublicUrl).
--   • Escrita (insert/update/delete): SÓ o autenticado, e SÓ dentro da
--     PRÓPRIA pasta de tenant (a 1ª parte do caminho tem que bater com
--     public.tenant_atual_id()). Assim um tenant nunca grava/apaga a foto
--     de outro, mesmo mandando um caminho forjado.
--
-- Idempotente: pode rodar de novo sem erro.
-- ──────────────────────────────────────────────────────────────────

-- 1) Bucket público, com teto de tamanho e tipos de imagem permitidos.
--    (O front já comprime p/ JPEG bem abaixo de 3 MB — o teto é só rede
--    de segurança contra upload gigante.)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'delivery-fotos',
  'delivery-fotos',
  true,
  3145728, -- 3 MB
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- 2) Policies de ESCRITA em storage.objects — só na própria pasta de tenant.
--    (storage.foldername(name))[1] é o 1º segmento do caminho = tenant_id.

drop policy if exists "delivery_fotos_insert" on storage.objects;
create policy "delivery_fotos_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'delivery-fotos'
    and (storage.foldername(name))[1] = public.tenant_atual_id()::text
  );

drop policy if exists "delivery_fotos_update" on storage.objects;
create policy "delivery_fotos_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'delivery-fotos'
    and (storage.foldername(name))[1] = public.tenant_atual_id()::text
  )
  with check (
    bucket_id = 'delivery-fotos'
    and (storage.foldername(name))[1] = public.tenant_atual_id()::text
  );

drop policy if exists "delivery_fotos_delete" on storage.objects;
create policy "delivery_fotos_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'delivery-fotos'
    and (storage.foldername(name))[1] = public.tenant_atual_id()::text
  );

-- Observações:
--  • Leitura pública não precisa de policy: bucket public = true serve as
--    fotos pelo endpoint público (getPublicUrl), sem passar por RLS.
--  • upsert:true (troca de foto) usa UPDATE — coberto pela policy acima.
