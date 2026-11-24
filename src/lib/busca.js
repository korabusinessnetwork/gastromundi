import { normalizarTexto } from "@/lib/importacao/planilha";

// Busca por nome, igual em todas as telas: sem diferença de acento, maiúscula ou
// espaço sobrando. "cafe" acha "Café", como já achava no Estoque e na
// administração do delivery. Refatoração 4.9: o Cardápio das duas telas, a grade
// do garçom, combos, fichas técnicas, impostos e o vínculo de nota fiscal
// comparavam só em minúsculas, e "cafe" não achava "Café".
export function nomeBateComBusca(nome, termo) {
  return normalizarTexto(nome).includes(normalizarTexto(termo));
}
