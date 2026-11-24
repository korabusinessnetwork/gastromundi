// Leitura da quantidade digitada, usada pela tela de Estoque do computador e pela
// contagem do celular (refatoração 4.4). Antes o celular tinha a sua: lia "-5" como
// número e gravava zero no saldo; aqui negativo não é gravável.

/**
 * Lê o que o operador digitou num campo de quantidade.
 *
 * Devolve `null` quando não há nada gravável — campo vazio, texto, negativo ou
 * infinito. Campo vazio NUNCA vira zero: apagar o número na tela é o operador
 * limpando o campo para digitar outro, não pedindo para zerar o estoque.
 */
export function lerQuantidade(valor) {
  if (valor === null || valor === undefined) return null;
  const texto = String(valor).trim();
  if (texto === "") return null;
  const n = parseFloat(texto.replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}
