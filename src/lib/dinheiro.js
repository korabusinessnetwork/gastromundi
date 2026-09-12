/**
 * Dinheiro na tela, em um lugar só.
 *
 * O sistema tinha cinco formatadores locais e idênticos, todos
 * `"R$ " + Number(v).toFixed(2)`, espalhados pelas telas de relatório,
 * desempenho, notas fiscais, financeiro e combos. Eles produzem ponto decimal e
 * nenhum separador de milhar, então o dono lia "R$ 1234.56" onde o valor é
 * R$ 1.234,56, justamente nas telas em que o número é o assunto. Outras partes
 * do sistema já formatavam certo, cada uma do seu jeito: a tela de movimento de
 * caixa troca o ponto por vírgula na mão, o delivery usa `toFixed` com
 * `replace`, e os pedidos usam `Intl`. Ou seja, o formato do dinheiro dependia
 * de qual tela você estava olhando.
 *
 * Aqui a conta é uma só, com `Intl` em pt-BR, que resolve vírgula decimal,
 * ponto de milhar e o símbolo de uma vez.
 */

const BRL = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Número para "R$ 1.234,56".
 *
 * Entrada inválida (null, undefined, texto, NaN, Infinity) vira R$ 0,00 em vez
 * de "R$ NaN" na tela: o valor ausente aparece como zero, que é o que as telas
 * antigas já faziam com `Number(v ?? 0)`, e nenhuma delas precisa checar antes.
 * Quem quer dizer "não há valor" usa o marcador de célula vazia, não este.
 */
export function formatarDinheiro(valor) {
  const n = Number(valor);
  return BRL.format(Number.isFinite(n) ? n : 0);
}

/**
 * O mesmo número sem o símbolo, para célula de planilha e coluna de PDF:
 * "1.234,56". O cabeçalho da coluna já diz que é em reais, e repetir o símbolo
 * em toda linha atrapalha a leitura e a soma na própria planilha.
 */
export function formatarValor(valor) {
  const n = Number(valor);
  return (Number.isFinite(n) ? n : 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
