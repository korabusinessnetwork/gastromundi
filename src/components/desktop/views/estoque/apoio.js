import C from "@/constants/colors";
import { varColor } from "@/lib/tema";
import {
  MINIMO_PADRAO
} from "@/lib/estoqueSituacao";

// Cores, colunas e leitura de número da tela de Estoque, usadas pela tela e pelo gancho.
// A regra de "sem estoque"/"estoque baixo" mora em src/lib/estoqueSituacao.js —
// o PDV lê a MESMA conta. Enquanto cada tela tinha a sua, o aviso do PDV
// ("7 produtos sem estoque") contradizia esta aqui ("0 sem estoque").
export const MINIMO_FALLBACK = MINIMO_PADRAO;

export const COLUNAS = [
  { key: "name",     label: "Produto",   align: "left"   },
  { key: "category", label: "Categoria", align: "left"   },
  { key: "price",    label: "Preço",     align: "left"   },
  { key: "saldo",    label: "Saldo",     align: "center" },
  { key: "entrada",  label: "Entrada",   align: "center", sortable: false },
];

export function estoqueColor(qty, minimo, controlado = true) {
  if (!controlado)    return varColor(C.muted);
  if (qty === 0)      return varColor(C.red);
  if (qty <= minimo)  return varColor(C.warn);
  return varColor(C.green);
}

// Reexportado para não quebrar quem já importava daqui; a definição é uma só.

/**
 * Lê o que o operador digitou num campo de quantidade.
 *
 * Devolve `null` quando não há nada gravável — campo vazio, texto, negativo ou
 * infinito. Campo vazio NUNCA vira zero: apagar o número na tela é o operador
 * limpando o campo para digitar outro, não pedindo para zerar o estoque.
 */
export function lerQuantidade(valor) {
  if (valor === null || valor === undefined) return null;
  const texto = String(valor).trim();
  if (texto === "") return null;
  const n = parseFloat(texto.replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}
