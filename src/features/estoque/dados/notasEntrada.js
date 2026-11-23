// Camada de dados da importação de nota fiscal de compra (ADR-015, tarefa
// 1.2 do plano de refatoração). Única porta da tela para gravar a nota.

import { supabase } from "@/lib/supabase";

/**
 * Monta os argumentos da RPC `importar_nota_fiscal` a partir do estado da
 * tela. Função pura: é o contrato entre a tela e a migration 20261124.
 *
 * `dataEntrada` é o "hoje" do restaurante, calculado no fuso de quem opera.
 * Só vale quando a nota não traz data de emissão.
 */
export function argumentosImportarNota({ cabecalho, xmlString, itens, dataEntrada }) {
  return {
    p_nota: {
      chave_acesso: cabecalho.chaveAcesso || null,
      numero: cabecalho.numero,
      serie: cabecalho.serie,
      data_emissao: cabecalho.dataEmissao || null,
      fornecedor_nome: cabecalho.fornecedorNome,
      fornecedor_cnpj: cabecalho.fornecedorCnpj,
      valor_total: cabecalho.valorTotal,
      xml_raw: xmlString,
      data_entrada: cabecalho.dataEmissao || dataEntrada,
    },
    p_itens: itens.map((item) => ({
      product_id: item.produto?.id || null,
      descricao_xml: item.descricaoXml,
      codigo_xml: item.codigoXml,
      unidade_xml: item.unidadeXml,
      quantidade: item.quantidade,
      preco_unitario: item.precoUnitario,
      preco_total: item.precoTotal,
      fator_conversao: item.produto ? item.fator : null,
      quantidade_estoque: item.produto ? item.qtdEstoque : null,
    })),
  };
}

/**
 * Frase para a tela, sem o prefixo "Erro ao salvar:", que a tela põe.
 */
export function mensagemDeRecusaNota(error) {
  if (error?.code === "23505") return "esta nota já foi importada (chave de acesso duplicada).";
  if (error?.code === "42501") return "seu usuário não pode importar notas. Peça a um gerente ou ao administrador.";
  return error?.message || "tente novamente.";
}

/**
 * Grava nota, itens, histórico de entradas e saldo numa transação só: ou
 * tudo, ou nada. Lança erro com a frase da tela quando é recusada.
 *
 * @returns {Promise<{ notaId: string, saldos: { produtoId: number, quantidade: number, minimo: number }[] }>}
 */
export async function importarNotaFiscal(dadosDaTela) {
  const { data, error } = await supabase.rpc("importar_nota_fiscal", argumentosImportarNota(dadosDaTela));
  if (error) throw new Error(mensagemDeRecusaNota(error));
  const linhas = Array.isArray(data) ? data : [];
  return {
    notaId: linhas[0]?.nota_id ?? null,
    saldos: linhas
      .filter((l) => l.produto_id != null)
      .map((l) => ({ produtoId: l.produto_id, quantidade: Number(l.quantidade), minimo: Number(l.minimo) })),
  };
}
