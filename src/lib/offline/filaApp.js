// Fila offline da aplicação (instância única).
//
// Estava dentro do AppContext, mas a fila deixou de ser assunto só do
// provider: uma NFC-e que não saiu fica guardada aqui e a tela "Notas
// emitidas" precisa contar essas pendências. Módulo próprio para as duas
// pontas olharem a MESMA fila, sem uma importar a outra.

import { criarFila } from "./fila";

export const filaOffline = criarFila({ storage: window.localStorage });

/** Quantas notas fiscais estão na fila esperando reemissão. */
export function contarPendenciasFiscais(fila = filaOffline) {
  return fila.listar().filter((op) => op?.tipo === "emitir_nfce").length;
}
