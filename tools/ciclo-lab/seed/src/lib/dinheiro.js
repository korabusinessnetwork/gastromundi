/**
 * Operações com dinheiro em centavos inteiros.
 *
 * Função pura: nunca float, sempre inteiro. Um centavo é a unidade.
 * Exemplos: R$ 10,00 = 1000, R$ 1,50 = 150, R$ 0,01 = 1.
 */

/**
 * Converte real (string ou número com ponto) para centavos inteiros.
 * Exemplos: "10.50" → 1050; "1,50" → 150; 10.5 → 1050
 * @param valor — string ou número
 * @returns número inteiro em centavos, ou erro se inválido
 */
export function reaisParaCentavos(valor) {
  if (valor === null || valor === undefined || valor === "") {
    return 0;
  }
  const str = String(valor)
    .replace(/\./g, "") // Remove separador de milhares (ponto)
    .replace(/,/g, "."); // Normaliza separador decimal para ponto

  const num = parseFloat(str);
  if (isNaN(num)) {
    throw new Error(`Valor inválido: "${valor}"`);
  }

  // Multiplica por 100 e arredonda para garantir inteiro
  const centavos = Math.round(num * 100);
  return centavos;
}

/**
 * Converte centavos inteiros para string formatada em reais.
 * Exemplos: 1050 → "10,50"; 150 → "1,50"; 1 → "0,01"
 * @param centavos — número inteiro
 * @returns string formatada "X,XX"
 */
export function centavosParaReais(centavos) {
  const num = Math.round(centavos);
  const reais = Math.floor(Math.abs(num) / 100);
  const cents = Math.abs(num) % 100;
  const sinal = num < 0 ? "-" : "";
  return `${sinal}${reais},${String(cents).padStart(2, "0")}`;
}

/**
 * Soma centavos inteiros (mantém precisão inteira).
 * Exemplos: somar([1050, 150, 300]) → 1500
 */
export function somar(...parcelas) {
  return parcelas.reduce((acc, val) => acc + Math.round(val), 0);
}

/**
 * Subtrai centavos inteiros.
 * Exemplos: subtrair(1500, 1050) → 450
 */
export function subtrair(minuendo, subtraendo) {
  return Math.round(minuendo) - Math.round(subtraendo);
}

/**
 * Multiplica centavos por um fator (ex: aplicar desconto percentual).
 * Resultado é sempre arredondado para inteiro.
 * Exemplos: multiplicar(1000, 0.9) → 900 (90% de 10,00)
 */
export function multiplicar(centavos, fator) {
  return Math.round(centavos * fator);
}

/**
 * Divide centavos entre N pessoas igualmente.
 * Arredonda de forma que a soma bata com o total.
 * Exemplos: dividir(1000, 3) → [334, 333, 333]
 */
export function dividir(centavos, partes) {
  if (partes <= 0) throw new Error("Partes deve ser > 0");
  const parteInteira = Math.floor(centavos / partes);
  const resto = centavos % partes;
  const resultado = Array(partes).fill(parteInteira);
  for (let i = 0; i < resto; i++) {
    resultado[i]++;
  }
  return resultado;
}
