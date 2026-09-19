import { criarFila, CHAVE_FILA_PENDING } from "./fila";
import { criarStorageIdb, mesclarPorUid } from "./storageIdb";
import { reportarFalha } from "@/lib/observabilidade";

// F021 fatia 2 — a fila pendente mora no IndexedDB, não mais no `localStorage`.
//
// A troca é de storage, não de lógica: `fila.js` continua igual, e continua
// falando com um objeto de cara `getItem`/`setItem`. Quem virou IndexedDB foi o
// objeto embaixo (ver `storageIdb.js`, inclusive a razão de a hidratação
// mesclar por `uid` em vez de sobrescrever).
//
// O `localStorage` entra aqui só como legado a migrar: quem já tem fila pendente
// gravada não pode perdê-la na virada.

const legado = (() => {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null; // storage bloqueado pelo navegador
  }
})();

const storageOffline = criarStorageIdb({
  chaves: [CHAVE_FILA_PENDING],
  mesclar: mesclarPorUid,
  legado,
  // Gravação que falha aqui é pendente que pode sumir: o `localStorage` morria
  // num `catch` vazio, este caminho é visível.
  aoFalhar: (erro, contexto) =>
    reportarFalha(erro, { acao: `filaOffline:${contexto?.acao ?? "?"}`, chave: contexto?.chave }),
});

export const filaOffline = criarFila({ storage: storageOffline });

/**
 * O storage em que a fila grava. Exportado para os testes de integração
 * semearem e inspecionarem a fila pela mesma porta que ela usa, sem depender de
 * qual banco está embaixo (era `localStorage`, hoje é IndexedDB).
 */
export const storageFilaOffline = storageOffline;

/**
 * Resolve quando a hidratação do IndexedDB termina. `{ idb: false }` significa
 * ambiente sem banco: a fila vive só em memória, enquanto a aba estiver aberta.
 */
export const prontoOffline = storageOffline.pronto;

/**
 * Avisa quando a hidratação trouxe pendências da sessão anterior. Os contadores
 * da tela leem a fila de forma síncrona no primeiro render, quando o banco ainda
 * não respondeu; é esta assinatura que faz o número chegar depois.
 *
 * @param {() => void} fn
 * @returns {() => void} cancela a assinatura
 */
export const assinarFilaOffline = (fn) => storageOffline.assinar(fn);

/** Quantas notas fiscais estão na fila esperando reemissão. */
export function contarPendenciasFiscais(fila = filaOffline) {
  return fila.listar().filter((op) => op?.tipo === "emitir_nfce").length;
}
