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
  const bruto = Number(valor);
  // Zero negativo existe em ponto flutuante e o `Intl` o imprime como
  // "-R$ 0,00". Na tela isso é pior do que feio: o card de lucro exatamente
  // zerado aparecia com sinal de menos, e sinal de menos ali significa
  // prejuízo. Somar 0 devolve o zero sem sinal.
  const n = bruto === 0 ? 0 : bruto;
  // `Intl` separa o "R$" do número com espaço INQUEBRÁVEL (U+00A0). Na tela é
  // idêntico ao espaço comum, mas em comparação exata não é: é um byte
  // invisível que faz `"R$ 70,00" === "R$ 70,00"` dar falso, e quem cair nisso
  // vai procurar o erro na conta, não na pontuação. Trocamos por espaço comum
  // de propósito: a chance de quebrar a linha entre o símbolo e o valor é
  // pequena, e vale menos que essa classe inteira de armadilha.
  return BRL.format(Number.isFinite(n) ? n : 0).replace(/\u00a0/g, " ");
}
