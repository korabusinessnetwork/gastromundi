
// TD015: a lista de fornecedores é editada linha a linha e removida do meio, e o
// cartão em edição é apontado por posição (`editingCompra === idx`). Por isso cada
// linha nasce com `uid`, que existe só no state: o save monta `unidades_compra`
// campo a campo, então ele não chega ao banco.
export const EMPTY_COMPRA = { nome: "", unidade: "", fator: "" };

export const EMPTY_FORM = {
  name: "", price: "", category: "", emoji: "",
  unidade_estoque: "",
  compras: [],
  unidade_consumo: "",
  fator_consumo: "",       // crítico 7 — quantas unidades de ESTOQUE 1 unidade de consumo gasta; vazio = 1
  codigo_barras: "",
  validade_dias: "",       // C1 — shelf life típico (dias); vazio = sem controle
  proxima_validade: "",    // C1 — próxima data a acompanhar (YYYY-MM-DD)
};

export const CATS_VISIVEIS = 6; // quantas categorias mostrar antes do "Mais"

// Balde de fallback: ao excluir uma categoria que ainda tem produtos, eles são
// movidos para cá em vez de bloquear a exclusão (nunca se perde produto). É uma
// categoria automática — não pode ser renomeada nem excluída.
export const CAT_SEM_CATEGORIA = "Sem Categoria";
