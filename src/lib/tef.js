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
 * Métodos que usam TEF quando o estabelecimento nunca configurou a
 * seleção (config `metodos_tef` ausente) — cartão de crédito e débito,
 * o comportamento histórico do PDV.
 */
export const METODOS_TEF_PADRAO = ["credito", "debito"];

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
 * Verifica se um método de pagamento usa a maquininha (TEF) segundo a
 * configuração do estabelecimento (config `metodos_tef`). Um array —
 * inclusive vazio, "nenhum método usa TEF" — vale como escolha explícita;
 * sem config, vale o padrão (crédito/débito). Função pura.
 *
 * @param {string} metodo
 * @param {string[]|null|undefined} metodosTef lista configurada pelo estabelecimento
 * @returns {boolean}
 */
export function metodoUsaTef(metodo, metodosTef) {
  const id = String(metodo ?? "").trim().toLowerCase();
  if (!id) return false;
  const lista = Array.isArray(metodosTef) ? metodosTef : METODOS_TEF_PADRAO;
  return lista.some((m) => String(m ?? "").trim().toLowerCase() === id);
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
