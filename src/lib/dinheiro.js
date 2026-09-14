/**
 * Dinheiro na tela, um formato só para o sistema inteiro.
 *
 * Este arquivo nasceu duas vezes, em duas sessões que trabalhavam em
 * paralelo e acharam o mesmo defeito por caminhos diferentes. Uma contou
 * cinco formatadores locais e idênticos (`"R$ " + Number(v).toFixed(2)`)
 * nas telas de relatório, desempenho, notas fiscais, financeiro e combos.
 * A outra contou três no delivery e no PDV, onde conviviam "R$ 30.00", com
 * PONTO, e "R$ 0,00" na mesma tela. As duas listas são reais e somam o
 * mesmo problema: o formato do dinheiro dependia de qual tela você estava
 * olhando. A junção das duas está aqui.
 *
 * Três escolhas que valem explicação:
 *
 * · `Intl.NumberFormat` e não `toFixed`: é o que dá separador de milhar.
 *   Um fechamento de caixa de "R$ 12345,60" se lê errado; "R$ 12.345,60"
 *   não. O `toFixed` nunca teve como resolver isso.
 *
 * · O espaço fino inquebrável que o `Intl` coloca depois do "R$" (U+00A0)
 *   vira espaço comum. Ele é invisível na tela, mas quebra toda comparação
 *   de texto: em teste, na busca do navegador e ao copiar para uma
 *   planilha. Já custou um teste nesta base. A chance de a linha quebrar
 *   entre o símbolo e o valor vale menos que essa classe de armadilha.
 *
 * · Zero negativo, que existe em ponto flutuante, é normalizado. O `Intl`
 *   imprime `-0` como "-R$ 0,00", e o card de lucro exatamente zerado
 *   aparecia com sinal de menos, que ali quer dizer prejuízo.
 *
 * SÓ PARA MOSTRAR. Nada aqui decide valor: conta é feita em número, e o
 * servidor recalcula o que vale dinheiro.
 */

const PT_BR_BRL = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Número para "R$ 1.234,56".
 *
 * Entrada inválida (null, undefined, texto, NaN, Infinity) vira "R$ 0,00" em
 * vez de "R$ NaN": na tela do caixa um NaN assusta mais do que informa, e é o
 * que as telas antigas já faziam com `Number(v ?? 0)`. Quem quer dizer "não há
 * valor" usa o marcador de célula vazia, não este.
 *
 * @param {number|string|null|undefined} valor
 * @returns {string}
 */
export function formatarReais(valor) {
  const bruto = Number(valor);
  const n = bruto === 0 ? 0 : bruto; // mata o -0 antes de formatar
  // O   vai escapado de propósito: literal, ele é um caractere invisível
  // no meio do código, e o linter o recusa com razão.
  return PT_BR_BRL.format(Number.isFinite(n) ? n : 0).replace(/ /g, " ");
}

/**
 * O mesmo, sem o "R$", para quando o rótulo já diz que é dinheiro e repetir o
 * símbolo só polui (por exemplo, uma coluna de tabela de valores).
 *
 * @param {number|string|null|undefined} valor
 * @returns {string}
 */
export function formatarValor(valor) {
  return formatarReais(valor).replace("R$ ", "");
}
