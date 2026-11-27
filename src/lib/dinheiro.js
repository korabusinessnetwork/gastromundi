/**
 * Dinheiro na tela — um formato só para o sistema inteiro.
 *
 * Antes havia três formatadores e nenhum concordava com os outros:
 * `formatarPreco` (delivery.js) e `formatarReais` (deliveryAdmin.js) faziam
 * `toFixed(2).replace(".", ",")`, `formatarReais` (deliveryPedidos.js) usava
 * `toLocaleString`, e o PDV inteiro escrevia `R$ ${n.toFixed(2)}` na marca —
 * que imprime "R$ 30.00", com PONTO, num sistema em português. Na mesma tela
 * conviviam "R$ 30.00" e "R$ 0,00".
 *
 * Aqui a fonte é uma só. Duas escolhas que valem explicação:
 *
 * · `Intl.NumberFormat` e não `toFixed`: é o que dá separador de milhar.
 *   Um fechamento de caixa de "R$ 12345,60" se lê errado; "R$ 12.345,60"
 *   não. O `toFixed` nunca teve como resolver isso.
 *
 * · O espaço fino inquebrável que o Intl coloca depois do "R$" (U+00A0)
 *   vira espaço normal. Ele é invisível na tela, mas quebra toda
 *   comparação de texto — em teste, em busca do navegador e em copiar e
 *   colar para uma planilha. Já custou um teste nesta base.
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
 * Número → "R$ 1.234,50". Lixo (null, undefined, NaN, texto) vira
 * "R$ 0,00" em vez de "R$ NaN" — na tela do caixa, um NaN assusta mais do
 * que informa, e some sem dizer qual valor era.
 * @param {number|string|null|undefined} valor
 * @returns {string}
 */
export function formatarReais(valor) {
  const n = Number(valor);
  // O \u00A0 vai escapado de propósito: literal, ele é um caractere
  // invisível no meio do código, e o linter o recusa com razão.
  return PT_BR_BRL.format(Number.isFinite(n) ? n : 0).replace(/\u00A0/g, " ");
}

/**
 * O mesmo, sem o "R$" — para quando o rótulo já diz que é dinheiro e
 * repetir o símbolo só polui (ex.: coluna de uma tabela de valores).
 * @param {number|string|null|undefined} valor
 * @returns {string}
 */
export function formatarValor(valor) {
  return formatarReais(valor).replace("R$ ", "");
}
