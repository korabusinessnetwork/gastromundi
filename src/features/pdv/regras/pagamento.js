// Regras de pagamento do caixa, usadas pelo PDV do computador e pela venda de
// balcão do celular. Refatoração 4.2: antes cada superfície tinha a sua cópia.
import { metodoUsaTef } from "@/lib/tef";
import { round2 } from "@/lib/vendas";

/** Meios de pagamento de quem ainda não escolheu os seus. */
export const METODOS_PADRAO = ["dinheiro", "credito", "debito", "pix"];

/**
 * TEF é só online: sem internet a maquininha não responde. Com o add-on de TEF
 * ligado, o método que passa por ela nasce bloqueado na hora de escolher, em vez
 * de deixar o operador cobrar e falhar depois (prevenção > erro).
 */
export function metodoBloqueadoSemRede(id, { redeOnline, tefLigado, metodosTef }) {
  return !redeOnline && Boolean(tefLigado) && metodoUsaTef(id, metodosTef);
}

/**
 * Troco de um pagamento em dinheiro, em centavos exatos. Nunca negativo: o que
 * falta não é troco. Sem o arredondamento, R$ 10 por uma conta de R$ 6,10
 * gravava 3.9000000000000004 na venda.
 */
export function trocoEmDinheiro(recebido, valor) {
  return Math.max(0, round2((Number(recebido) || 0) - (Number(valor) || 0)));
}
