/**
 * NFC-e (modelo 65) — mapeia a venda do PDV para o contrato de emissão
 * (Leva 4, pura/testável). Ponte entre o formato interno da venda
 * (`sale` de useFinalizarPagamento) e o payload que a Edge Function
 * `emitir-nfce` espera (itens/pagamentos/dest no leiaute da Leva 2).
 *
 * FRONTEIRA DE DADOS FISCAIS (ponto de extensão marcado): NCM, CFOP e o
 * grupo tributário (CST/CSOSN) do item são DADOS FISCAIS DO PRODUTO que
 * ainda não existem no cadastro (uma leva futura: "registro fiscal do
 * produto"). Aqui NÃO os inventamos — mapeamos o que a venda tem (nome,
 * quantidade, preço) e deixamos os campos fiscais de fora. A montagem do
 * XML (server) preenche/valida esses campos a partir do cadastro do
 * produto quando ele existir; até lá, o estado "sem_chave" devolve o
 * detalhe do que falta (ver emitir-nfce, passo 5). É o mesmo princípio dos
 * "PLUG A CHAVE": o que depende de dado/segredo que ainda não temos fica
 * como encaixe explícito, não como número fingido.
 *
 * Multi-tenant / white-label: nada aqui é de um estabelecimento específico
 * — é só transformação de formato da venda.
 */

import { apenasDigitos } from "./documento";

// Método de pagamento do PDV → tPag da SEFAZ (NFC-e). O que não casar cai
// em "99" (Outros) — nunca esconde nem perde um pagamento.
const TPAG_POR_METODO = {
  dinheiro: "01",
  credito: "03",
  "cartao de credito": "03",
  "cartão de crédito": "03",
  debito: "04",
  "cartao de debito": "04",
  "cartão de débito": "04",
  pix: "17",
  fiado: "05", // crédito na loja / venda a prazo
  voucher: "10",
  vale: "10",
};

/**
 * tPag (2 dígitos) para um método de pagamento do PDV.
 * @param {string} metodo
 * @returns {string}
 */
export function tPagDoMetodo(metodo) {
  const chave = String(metodo ?? "").trim().toLowerCase();
  return TPAG_POR_METODO[chave] ?? "99";
}

/**
 * Converte a venda interna do PDV no payload de emissão da NFC-e.
 *
 * @param {{
 *   items?: Array<{name?:string, nome?:string, price?:number, qty?:number, id?:string, cancelado?:boolean}>,
 *   pagamentos?: Array<{metodo?:string, valor?:number, troco?:number}>,
 *   dest?: {cpf?:string, cnpj?:string, xNome?:string}|null,
 * }} sale
 * @returns {{ itens: Array<object>, pagamentos: Array<object>, dest: object|null }}
 */
export function montarVendaFiscal(sale = {}) {
  const itensVenda = Array.isArray(sale.items) ? sale.items : [];
  const itens = itensVenda
    .filter((it) => !it.cancelado)
    .map((it, i) => {
      const qCom = Number(it.qty ?? 1) || 1;
      const vUnCom = Number(it.price ?? 0) || 0;
      return {
        cProd: it.id != null ? String(it.id) : String(i + 1),
        xProd: it.name ?? it.nome ?? `Item ${i + 1}`,
        qCom,
        uCom: "UN",
        vUnCom,
        vProd: Number((qCom * vUnCom).toFixed(2)),
        // NCM/CFOP/icms/pis/cofins: ponto de extensão (cadastro fiscal do
        // produto). Deliberadamente ausentes — ver cabeçalho.
      };
    });

  const pagamentosVenda = Array.isArray(sale.pagamentos) ? sale.pagamentos : [];
  const pagamentos = pagamentosVenda
    .filter((p) => p && p.metodo && Number(p.valor) > 0)
    .map((p) => {
      const linha = { tPag: tPagDoMetodo(p.metodo), vPag: Number(p.valor) || 0 };
      const troco = Number(p.troco) || 0;
      if (troco > 0) linha.vTroco = troco;
      return linha;
    });

  return {
    itens,
    pagamentos,
    // dest: consumidor identificado (CPF/CNPJ na nota). Vem preenchido quando a
    // venda tem cliente vinculado com documento — ver destDoCliente, chamado em
    // useFinalizarPagamento. Sem cliente/documento fica null (NFC-e anônima).
    dest: sale.dest ?? null,
  };
}

/**
 * Destinatário (consumidor identificado) da NFC-e a partir do cliente
 * vinculado à venda. Puxa AUTOMATICAMENTE o CPF/CNPJ já cadastrado do
 * cliente — o operador não redigita nada e não há como errar o documento
 * (intuitividade + prevenção de erro). Mapeia para o shape do `dest`
 * (`{cpf|cnpj, xNome}`) que a Edge Function `emitir-nfce` espera.
 *
 * Retorna null quando não há cliente, não há documento, ou o documento
 * salvo está com tamanho inválido — nesses casos a NFC-e sai anônima
 * (comportamento padrão, nunca bloqueia a venda).
 *
 * @param {{ documento?: string|null, documento_tipo?: 'cpf'|'cnpj'|null, nome?: string|null } | null} [cliente]
 * @returns {{ cpf?: string, cnpj?: string, xNome?: string } | null}
 */
export function destDoCliente(cliente) {
  const doc = apenasDigitos(cliente?.documento);
  if (!doc) return null;

  const tipo = cliente?.documento_tipo === "cnpj" ? "cnpj" : "cpf";
  // Guarda de comprimento: nunca manda um documento truncado/errado à SEFAZ
  // (o dígito verificador já foi validado no cadastro/edição do cliente).
  if (tipo === "cnpj" ? doc.length !== 14 : doc.length !== 11) return null;

  const dest = tipo === "cnpj" ? { cnpj: doc } : { cpf: doc };
  const nome = String(cliente?.nome ?? "").trim();
  if (nome) dest.xNome = nome;
  return dest;
}
