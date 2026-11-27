

// Card médio, clicável, da grade da biblioteca. Só LEITURA: mostra o nome,
// resumo (obrigatório/opcional), quantos itens tem e em quantos produtos
// aparece. Tocar abre o editor. Nada de campo editável aqui — a edição
// mora no menu limpo (GrupoEditor), pra grade ficar fácil de escanear.
/**
 * O que a dupla mín/máx significa, em português do balcão. Máximo 0 é
 * SEM LIMITE — é assim que se cadastra "quantos sabores o cliente quiser".
 * Usada na frase do editor (enquanto se digita) e no selo do cartão.
 */
export function explicarEscolhas(min, max) {
  if (min > 0) {
    if (max === 0) return `Obrigatório, o cliente escolhe ao menos ${min}, quantas quiser acima disso`;
    if (max === min) return `Obrigatório, o cliente precisa escolher ${min === 1 ? "1 opção" : `${min} opções`}`;
    return `Obrigatório, o cliente precisa escolher de ${min} a ${max}`;
  }
  if (max === 0) return "Opcional, o cliente escolhe quantas quiser";
  if (max === 1) return "Opcional, o cliente pode escolher 1, se quiser";
  return `Opcional, o cliente pode escolher até ${max}`;
}

/** Faixa curta para o selo do cartão: "1–3", "0–1", "2 ou mais". */
export function faixaEscolhas(min, max) {
  return max > 0 ? `${min}–${max}` : `${min} ou mais`;
}
