import { emitirEvento } from "./jarvas";

/**
 * Fiscal (NF-e/NFC-e) — add-on pago transversal (decisão 019, F019).
 *
 * Fase 3 da camada de comercialização: só a ABSTRAÇÃO + um stub. Nenhum
 * provedor fiscal pago está integrado (Restrições de Custo) — quando
 * entrar, troca-se `emitirDocumentoFiscal` por uma implementação real
 * com a MESMA assinatura; quem chama (useFinalizarPagamento.js) não muda.
 *
 * Só é chamado quando `addonHabilitado('nfe')` é verdadeiro — sem o
 * add-on, o fluxo de pagamento nem invoca este módulo.
 */

/**
 * Emite o documento fiscal de uma venda.
 *
 * PONTO DE EXTENSÃO — o provedor real (ex.: Focus NFe, PlugNotas, NFe.io)
 * entra AQUI: troque o corpo desta função por uma chamada HTTP ao
 * provedor, preservando a assinatura (venda, opts) => Promise<resultado>.
 * Nunca deve lançar: falha de emissão é um resultado (`status: "erro"`),
 * não uma exceção — a venda já foi concluída e não pode ser desfeita
 * por causa de uma nota fiscal.
 *
 * @param {{id: string, total: number, comanda?: string}} venda
 * @param {{usuario?: string}} [opts]
 * @returns {Promise<{status: "stub"|"emitido"|"erro", vendaId: string|null, detalhe?: string}>}
 */
export async function emitirDocumentoFiscal(venda, { usuario } = {}) {
  // STUB — registra a intenção de emitir, sem contatar nenhum provedor.
  const resultado = { status: "stub", vendaId: venda?.id ?? null };
  emitirEvento(
    "fiscal.documento_simulado",
    "fiscal",
    { venda_id: venda?.id ?? null, total: venda?.total ?? null, comanda: venda?.comanda ?? null },
    usuario,
  );
  return resultado;
}
