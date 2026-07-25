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
//
// ISOLAMENTO MULTI-TENANT (hardening): `tenantAtual` (tenant_id do JWT da
// sessão atual). Uma op carimbada com `__tenant` de OUTRO tenant nunca é
// executada na sessão atual — é PULADA e MANTIDA na fila (sem executar, sem
// remover), para ser drenada quando o tenant dono voltar a logar. Sem isso,
// se dois tenants dividem a mesma origem (preview/IP/apex/localhost), as
// escritas enfileiradas por A poderiam ser reenviadas na sessão de B. Ops
// legadas sem `__tenant` seguem o fluxo normal (a RLS do banco ainda
// valida o tenant de cada escrita no servidor).
export async function drenarFila({ fila, executar, isErroDeRede, tenantAtual = undefined }) {
  const ops = fila.listar();
  const processadas = new Set();
  const falhas = [];
  let enviadas = 0;

  for (const op of ops) {
    if (tenantAtual !== undefined && op.__tenant != null && op.__tenant !== tenantAtual) {
      continue; // op de outro tenant — não replica aqui e preserva pro dono
    }
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
