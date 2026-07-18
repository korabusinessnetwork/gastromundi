-- Leva 14 — trava de edição de comanda (estado final pedido pelo dono):
-- enquanto uma pessoa está com a comanda aberta, outra não consegue mexer.
-- A trava é advisory: o app faz UPDATE condicional nessas colunas para
-- adquirir/renovar/liberar; expira sozinha (TTL no cliente) se o aparelho
-- morrer com a comanda aberta. Sem a migration aplicada o app detecta a
-- ausência das colunas (erro 42703) e segue funcionando sem trava (fail-open).
alter table public.pending
  add column if not exists editando_por text,
  add column if not exists editando_nome text,
  add column if not exists editando_desde timestamptz;
