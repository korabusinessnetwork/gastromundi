// F021 fatia 2 — o IndexedDB embaixo de um espelho síncrono.
//
// A fila de operações pendentes (`fila.js`) é lógica pura sobre um storage
// injetável com a cara do `localStorage`: `getItem`, `setItem`, `removeItem`,
// tudo síncrono. Dois consumidores dependem dessa sincronia dentro de
// inicializador preguiçoso de `useState`, que não pode esperar promessa
// (`AppContext` e `HistoricoNfce`, no contador de pendências).
//
// O IndexedDB é assíncrono. Então ele não entra no lugar do `localStorage`, ele
// entra EMBAIXO: quem responde na hora é um espelho em memória, e cada escrita
// no espelho agenda uma gravação no banco. Na subida do app a hidratação lê o
// banco e traz o que ficou da sessão anterior.
//
// O que se ganha com a troca: a cota do IndexedDB é ordens de grandeza maior
// que os poucos megabytes do `localStorage`, e a falha de gravação chega ao
// `aoFalhar` em vez de morrer num `catch` vazio. Fila perdida em silêncio é
// venda que saiu para o cliente e nunca chegou ao banco (ADR-013, negativo 1).
//
// A janela de hidratação é o ponto delicado. Entre o primeiro render e a
// resposta do banco o operador pode enfileirar uma venda: o espelho fica com
// uma op e o banco tem outras três. Por isso a hidratação MESCLA em vez de
// sobrescrever, e quem decide como mesclar é quem monta o storage, não o
// storage (para a fila é `mesclarPorUid`, logo abaixo).

const NOME_BANCO = "kora.offline";
const NOME_STORE = "kv";

/** Lê um JSON que deveria ser lista. Devolve null quando não é. */
function comoLista(bruto) {
  if (typeof bruto !== "string" || bruto === "") return null;
  try {
    const valor = JSON.parse(bruto);
    return Array.isArray(valor) ? valor : null;
  } catch {
    return null;
  }
}

/**
 * Mesclagem da fila: união por `uid`, persistidas primeiro.
 *
 * `fila.js` carimba um `uid` em toda op no `enfileirar`, então a união é bem
 * definida e a ordem de reenvio é preservada: o que já estava no banco continua
 * na frente, e o que entrou durante a janela de hidratação entra atrás.
 *
 * Lado que não é lista válida não derruba nada: o outro lado vale sozinho. Item
 * sem `uid` passa direto, porque não há como saber se é o mesmo dos dois lados.
 *
 * @param {string|null} persistido JSON vindo do banco (ou do legado migrado)
 * @param {string|null} local JSON que está no espelho agora
 * @returns {string|null}
 */
export function mesclarPorUid(persistido, local) {
  const a = comoLista(persistido);
  const b = comoLista(local);
  if (!a && !b) return local != null ? local : persistido ?? null;
  if (!a) return local;
  if (!b) return persistido;

  const vistos = new Set();
  const saida = [];
  for (const op of [...a, ...b]) {
    const uid = op && typeof op === "object" ? op.uid : undefined;
    if (uid != null) {
      if (vistos.has(uid)) continue;
      vistos.add(uid);
    }
    saida.push(op);
  }
  return JSON.stringify(saida);
}

/**
 * Storage com a interface do `localStorage`, durável no IndexedDB.
 *
 * @param {object} opcoes
 * @param {string} [opcoes.banco] nome do banco
 * @param {string} [opcoes.store] nome do object store
 * @param {string[]} [opcoes.chaves] chaves a hidratar na subida
 * @param {(persistido: string|null, local: string|null) => string|null} [opcoes.mesclar]
 *   como juntar o que veio do banco com o que o espelho já tem. O default é
 *   conservador: o local vence quando existe.
 * @param {{getItem: Function, removeItem: Function}|null} [opcoes.legado]
 *   storage antigo (o `localStorage`) de onde migrar na primeira subida
 * @param {(erro: unknown, contexto: object) => void} [opcoes.aoFalhar]
 */
export function criarStorageIdb({
  banco = NOME_BANCO,
  store = NOME_STORE,
  chaves = [],
  mesclar,
  legado = null,
  aoFalhar = () => {},
} = {}) {
  const espelho = new Map();
  const assinantes = new Set();
  const juntar = typeof mesclar === "function" ? mesclar : (p, l) => (l != null ? l : p);

  let db = null;
  // Gravações em série: sem isso uma escrita antiga pode aterrissar depois de
  // uma nova e ressuscitar op já drenada.
  let emFila = Promise.resolve();

  const avisar = () => {
    for (const fn of [...assinantes]) {
      try {
        fn();
      } catch {
        /* assinante quebrado não pode derrubar a hidratação */
      }
    }
  };

  /** Abre o banco. Devolve null em qualquer ambiente onde ele não exista ou não abra. */
  const abrir = () =>
    new Promise((resolve) => {
      let idb = null;
      try {
        idb = typeof indexedDB !== "undefined" ? indexedDB : globalThis?.indexedDB ?? null;
      } catch {
        idb = null;
      }
      if (!idb) {
        resolve(null);
        return;
      }
      let req;
      try {
        req = idb.open(banco, 1);
      } catch (erro) {
        aoFalhar(erro, { acao: "abrir" });
        resolve(null);
        return;
      }
      req.onupgradeneeded = () => {
        const aberto = req.result;
        if (!aberto.objectStoreNames.contains(store)) aberto.createObjectStore(store);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        aoFalhar(req.error, { acao: "abrir" });
        resolve(null);
      };
      // Outra aba segurando uma versão antiga: não trava a subida, cai para memória.
      req.onblocked = () => resolve(null);
    });

  /**
   * Uma transação, resolvida no `oncomplete` e não no `onsuccess` da requisição:
   * o que interessa aqui é durabilidade, e ela só existe quando a transação fecha.
   */
  const transacao = (modo, fn) =>
    new Promise((resolve, reject) => {
      if (!db) {
        reject(new Error("sem banco"));
        return;
      }
      let tx;
      try {
        tx = db.transaction(store, modo);
      } catch (erro) {
        reject(erro);
        return;
      }
      let resultado;
      let req;
      try {
        req = fn(tx.objectStore(store));
      } catch (erro) {
        reject(erro);
        return;
      }
      if (req) req.onsuccess = () => { resultado = req.result; };
      tx.oncomplete = () => resolve(resultado);
      tx.onerror = () => reject(tx.error ?? req?.error ?? new Error("falha na transação"));
      tx.onabort = () => reject(tx.error ?? new Error("transação abortada"));
    });

  /**
   * Enfileira uma gravação. Nunca lança: o espelho já respondeu ao chamador, e
   * derrubar a venda por causa do banco seria trocar um problema por outro pior.
   *
   * @returns {Promise<boolean>} se o banco confirmou
   */
  const gravar = (chave, valor) => {
    const proxima = emFila.then(async () => {
      if (!db) return false;
      try {
        if (valor == null) await transacao("readwrite", (s) => s.delete(chave));
        else await transacao("readwrite", (s) => s.put(valor, chave));
        return true;
      } catch (erro) {
        aoFalhar(erro, { acao: "gravar", chave });
        return false;
      }
    });
    emFila = proxima.then(
      () => undefined,
      () => undefined,
    );
    return proxima;
  };

  const lerLegado = (chave) => {
    if (!legado) return null;
    try {
      const bruto = legado.getItem(chave);
      return bruto == null || bruto === "" ? null : bruto;
    } catch {
      return null;
    }
  };

  const apagarLegado = (chave) => {
    if (!legado) return;
    try {
      legado.removeItem(chave);
    } catch {
      /* storage bloqueado: a sobra fica, e o banco já manda */
    }
  };

  const hidratar = async () => {
    db = await abrir();
    if (!db) return { idb: false };

    let mudou = false;
    for (const chave of chaves) {
      let noBanco = null;
      try {
        // eslint-disable-next-line no-await-in-loop
        const bruto = await transacao("readonly", (s) => s.get(chave));
        noBanco = typeof bruto === "string" ? bruto : null;
      } catch (erro) {
        aoFalhar(erro, { acao: "ler", chave });
        continue;
      }

      // Migração: banco vazio para a chave, o `localStorage` de quem já usa o
      // sistema assume. Descartar isso seria jogar fora venda de cliente.
      const doLegado = noBanco == null ? lerLegado(chave) : null;
      const persistido = noBanco ?? doLegado;

      const local = espelho.has(chave) ? espelho.get(chave) : null;
      const juntado = persistido == null ? local : juntar(persistido, local);

      if (juntado !== local) {
        espelho.set(chave, juntado);
        mudou = true;
      }

      if (juntado != null && juntado !== noBanco) {
        // eslint-disable-next-line no-await-in-loop
        const confirmado = await gravar(chave, juntado);
        // O legado só some depois que o banco confirmou. Gravação que falha
        // deixa a fila antiga onde está, para a próxima subida tentar de novo.
        if (doLegado != null && confirmado) apagarLegado(chave);
      } else if (noBanco != null) {
        // O banco já tinha valor: a fila migrou numa sessão anterior e o que
        // sobrou no `localStorage` é resto.
        apagarLegado(chave);
      }
    }

    if (mudou) avisar();
    return { idb: true };
  };

  const pronto = hidratar().catch((erro) => {
    aoFalhar(erro, { acao: "hidratar" });
    return { idb: false };
  });

  return {
    getItem: (chave) => (espelho.has(chave) ? espelho.get(chave) : null),

    setItem: (chave, valor) => {
      const texto = String(valor);
      espelho.set(chave, texto);
      void gravar(chave, texto);
    },

    removeItem: (chave) => {
      espelho.delete(chave);
      void gravar(chave, null);
    },

    /** Resolve `{ idb: boolean }` quando a hidratação termina. Nunca rejeita. */
    pronto,

    /** Avisa quando a hidratação mudou o espelho. Devolve a função de cancelar. */
    assinar(fn) {
      assinantes.add(fn);
      return () => assinantes.delete(fn);
    },

    /** Espera a hidratação e a fila de gravações esvaziarem. */
    async liberado() {
      await pronto;
      await emFila;
    },

    fechar() {
      try {
        db?.close();
      } catch {
        /* já fechado */
      }
      db = null;
    },
  };
}
