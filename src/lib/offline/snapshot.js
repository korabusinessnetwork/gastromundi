// Snapshot local do bootstrap (Leva 11 — offline-first).
//
// Depois de cada bootstrap bem-sucedido, o essencial para operar o PDV
// (produtos, comandas abertas, config do caixa, estoque) é gravado no
// storage. Se o app abrir sem internet, esse snapshot hidrata o estado
// e o Palm continua tirando pedidos — que entram na fila local e são
// enviados quando a conexão voltar.
//
// ISOLAMENTO MULTI-TENANT (hardening): o snapshot é carimbado com o
// `tenant_id` (do JWT) de quem o gravou. Na leitura, se o tenant atual
// não bater com o carimbado, o snapshot é DESCARTADO (não hidrata dados
// de outro estabelecimento). Isso importa quando dois tenants dividem a
// mesma origem de navegador (preview/IP/apex/localhost, ou sem
// VITE_ROOT_DOMAIN) — cenário em que o localStorage é compartilhado.
// Snapshot é só cache: descartar apenas força um bootstrap online novo,
// sem perda de dados.

export const CHAVE_SNAPSHOT = "kora.snapshot.bootstrap.v1";

export function salvarSnapshot(storage, dados, tenantId = null, chave = CHAVE_SNAPSHOT) {
  try {
    storage.setItem(
      chave,
      JSON.stringify({ ...dados, __tenant: tenantId ?? null, salvoEm: new Date().toISOString() })
    );
    return true;
  } catch {
    return false; // storage cheio/bloqueado — snapshot é conforto, não requisito
  }
}

// `tenantId` opcional: quando informado, a leitura só devolve o snapshot se
// o carimbo `__tenant` bater (fail-closed contra vazamento cross-tenant).
// Omitido (undefined) = sem validação (uso puro/testes/retrocompat).
export function lerSnapshot(storage, tenantId = undefined, chave = CHAVE_SNAPSHOT) {
  try {
    const bruto = storage.getItem(chave);
    if (!bruto) return null;
    const dados = JSON.parse(bruto);
    if (!dados || typeof dados !== "object") return null;
    if (tenantId !== undefined && (dados.__tenant ?? null) !== (tenantId ?? null)) return null;
    return dados;
  } catch {
    return null;
  }
}
