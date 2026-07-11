import { emitirEvento } from "./jarvas";

/**
 * TEF (pagamento por maquininha/terminal) — add-on pago transversal
 * (decisão 019, F017).
 *
 * Fase 3 da camada de comercialização: só a ABSTRAÇÃO + um stub. Nenhum
 * provedor TEF pago está integrado (SiTef/PayGo — Restrições de Custo)
 * — quando entrar, troca-se `processarPagamentoTef` por uma implementação
 * real com a MESMA assinatura; quem chama (useFinalizarPagamento.js) não muda.
 *
 * Só é chamado quando `addonHabilitado('tef')` é verdadeiro E o método
 * de pagamento é cartão (crédito/débito) — sem o add-on, o PDV nem
 * invoca este módulo, e o pagamento em dinheiro/pix nunca aciona TEF.
 */

const METODOS_CARTAO = new Set(["credito", "debito"]);

/**
 * Verifica se um método de pagamento é elegível a TEF (cartão).
 * Função pura — sem side-effect, usada tanto pelo hook quanto pelos testes.
 *
 * @param {string} metodo
 * @returns {boolean}
 */
export function isPagamentoCartao(metodo) {
  return METODOS_CARTAO.has(String(metodo ?? "").trim().toLowerCase());
}

/**
 * Processa um pagamento de cartão via terminal TEF.
 *
 * PONTO DE EXTENSÃO — o provedor real (ex.: SiTef, PayGo, Stone Connect)
 * entra AQUI: troque o corpo desta função pela integração com o SDK/API
 * do terminal, preservando a assinatura (pagamento, opts) => Promise<resultado>.
 * Nunca deve lançar: falha de comunicação com o provedor é um resultado
 * (`status: "erro"`), não uma exceção — nunca pode travar o PDV.
 *
 * @param {{metodo: string, valor: number}} pagamento
 * @param {{usuario?: string, comanda?: string}} [opts]
 * @returns {Promise<{status: "stub"|"aprovado"|"recusado"|"erro", metodo: string|null}>}
 */
export async function processarPagamentoTef(pagamento, { usuario, comanda } = {}) {
  // STUB — simula/registra o processamento, sem contatar nenhum terminal.
  const resultado = { status: "stub", metodo: pagamento?.metodo ?? null };
  emitirEvento(
    "tef.pagamento_simulado",
    "pdv",
    { comanda: comanda ?? null, metodo: pagamento?.metodo ?? null, valor: pagamento?.valor ?? null },
    usuario,
  );
  return resultado;
}
