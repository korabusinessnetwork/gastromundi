
// Categorias que NÃO são produto de venda: insumo (matéria-prima) e item
// de produção (preparo interno). O combo só pode ter um produto vendável
// como principal, então esses ficam fora do picker (mesma convenção de
// ImpostosAdmin/AdminView, onde essas categorias também são excluídas).
export const CATS_NAO_VENDAVEIS = ["Insumo", "Produção"];

// ── Helpers ────────────────────────────────────────────────────────

export function fmtBRL(v) {
  return `R$ ${Number(v || 0).toFixed(2)}`;
}

// ── Modal de criar/editar combo ────────────────────────────────────
