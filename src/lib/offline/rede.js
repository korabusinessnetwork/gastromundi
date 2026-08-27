// Detecção de erro de rede (Leva 11 — offline-first).
//
// O supabase-js não lança exceção: quando o fetch falha (sem internet,
// DNS, timeout), ele resolve com { error } cuja mensagem embrulha o erro
// do fetch ("TypeError: Failed to fetch" no Chrome, "NetworkError" no
// Firefox, "Load failed" no Safari). Este helper separa "sem conexão"
// (op vai para a fila local e será reenviada) de erro definitivo
// (RLS/constraint/validação — rollback imediato, reenviar não resolve).

// "tempo limite" é o nosso próprio estouro de prazo (redeTimeout.js), já em
// português porque essa mensagem vai para a tela: sem ele aqui, a requisição
// que ficou pendurada seria tratada como falha definitiva e a operação seria
// dada como perdida em vez de esperar a conexão voltar.
const PADROES_REDE = /failed to fetch|networkerror|network request failed|fetch failed|load failed|timeout|timed out|tempo limite|socket hang up|ENOTFOUND|ECONNREFUSED|ECONNRESET|aborted?/i;

export function isErroDeRede(error) {
  if (!error) return false;
  // O navegador sabe que está offline — qualquer falha aqui é de rede.
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  const texto = [error.message, error.details, error.name]
    .filter((parte) => typeof parte === "string")
    .join(" ");
  return PADROES_REDE.test(texto);
}
