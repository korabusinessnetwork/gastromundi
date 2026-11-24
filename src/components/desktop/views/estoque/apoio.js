import C from "@/constants/colors";
import { varColor } from "@/lib/tema";
import { MINIMO_PADRAO, situacaoDoSaldo } from "@/lib/estoqueSituacao";

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

const COR_DA_SITUACAO = { nao_controlado: C.muted, sem_estoque: C.red, baixo: C.warn, ok: C.green };

export function estoqueColor(qty, minimo, controlado = true) {
  return varColor(COR_DA_SITUACAO[situacaoDoSaldo(qty, minimo, controlado)]);
}

// Reexportado para não quebrar quem já importava daqui; a definição é uma só.

export { lerQuantidade } from "@/features/estoque/regras/quantidade";
