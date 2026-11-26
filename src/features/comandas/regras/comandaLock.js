// Trava de edição de comanda (Leva 14).
//
// Enquanto uma pessoa está com a comanda aberta (Palm ou PDV), outra não
// consegue mexer nela. A trava vive em 3 colunas de `pending`
// (editando_por/editando_nome/editando_desde) e é adquirida por UPDATE
// condicional no Supabase — quem chegar primeiro leva. Expira sozinha
// após LOCK_TTL_MS sem renovação, pra comanda não ficar presa se o
// celular morrer no bolso com a comanda aberta.
//
// Funções puras aqui; a parte com Supabase fica no AppContext.

/** Trava sem renovação por 5 minutos é considerada abandonada. */
export const LOCK_TTL_MS = 5 * 60_000;

/** Enquanto segura a trava, o app renova a cada 30s (10 batidas por TTL). */
export const HEARTBEAT_MS = 30_000;

/** A trava desta comanda está ativa (existe e não expirou)? */
export function lockAtivo(order, agora = Date.now()) {
  if (!order?.editando_por || !order?.editando_desde) return false;
  const desde = new Date(order.editando_desde).getTime();
  if (!Number.isFinite(desde)) return false;
  return agora - desde < LOCK_TTL_MS;
}

/** A comanda está travada por OUTRA pessoa (trava ativa e não é minha)? */
export function travadaPorOutro(order, username, agora = Date.now()) {
  if (!lockAtivo(order, agora)) return false;
  return order.editando_por !== username;
}

/** Nome exibível de quem segura a trava ("Em uso por {nome}"). */
export function nomeTrava(order) {
  return order?.editando_nome || order?.editando_por || "outra pessoa";
}
