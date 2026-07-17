// Fila local de operações offline (Leva 11 — offline-first).
//
// Lógica pura sobre um storage injetável (localStorage no app, Map nos
// testes). Cada operação ganha um `uid` próprio, o que permite drenar a
// fila com segurança mesmo que novas operações entrem durante o envio:
// só as processadas saem, o resto (inclusive o que chegou no meio) fica.

export const CHAVE_FILA_PENDING = "kora.fila.pending.v1";

const uidOp = () =>
  (typeof crypto !== "undefined" && crypto.randomUUID)
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export function criarFila({ storage, chave = CHAVE_FILA_PENDING }) {
  const ler = () => {
    try {
      const bruto = storage.getItem(chave);
      const ops = bruto ? JSON.parse(bruto) : [];
      return Array.isArray(ops) ? ops : [];
    } catch {
      return []; // storage corrompido/indisponível nunca derruba o app
    }
  };
  const gravar = (ops) => {
    try { storage.setItem(chave, JSON.stringify(ops)); } catch { /* storage cheio/bloqueado — fila vive só em memória */ }
  };

  return {
    listar: ler,
    tamanho: () => ler().length,
    // Devolve o novo tamanho da fila (para o contador da UI).
    enfileirar(op) {
      const ops = ler();
      ops.push({ ...op, uid: uidOp(), enfileiradaEm: new Date().toISOString() });
      gravar(ops);
      return ops.length;
    },
    removerPorUid(uids) {
      gravar(ler().filter((op) => !uids.has(op.uid)));
    },
    limpar() { gravar([]); },
  };
}

// Drena a fila em ordem (FIFO). `executar(op)` segue o contrato do
// supabase-js: resolve com { error }. Três destinos possíveis por op:
//   sucesso        → sai da fila;
//   erro de rede   → para tudo e mantém o restante (a internet caiu de novo);
//   erro definitivo→ sai da fila (repetir não resolve) e volta em `falhas`
//                    para o chamador dar visibilidade.
export async function drenarFila({ fila, executar, isErroDeRede }) {
  const ops = fila.listar();
  const processadas = new Set();
  const falhas = [];
  let enviadas = 0;

  for (const op of ops) {
    const { error } = await executar(op);
    if (!error) {
      processadas.add(op.uid);
      enviadas += 1;
      continue;
    }
    if (isErroDeRede(error)) break;
    processadas.add(op.uid);
    falhas.push({ op, error });
  }

  fila.removerPorUid(processadas);
  return { enviadas, falhas, restantes: fila.tamanho() };
}
