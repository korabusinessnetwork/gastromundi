// Snapshot local do bootstrap (Leva 11 — offline-first).
//
// Depois de cada bootstrap bem-sucedido, o essencial para operar o PDV
// (produtos, comandas abertas, config do caixa, estoque) é gravado no
// storage. Se o app abrir sem internet, esse snapshot hidrata o estado
// e o Palm continua tirando pedidos — que entram na fila local e são
// enviados quando a conexão voltar.

export const CHAVE_SNAPSHOT = "kora.snapshot.bootstrap.v1";

export function salvarSnapshot(storage, dados, chave = CHAVE_SNAPSHOT) {
  try {
    storage.setItem(chave, JSON.stringify({ ...dados, salvoEm: new Date().toISOString() }));
    return true;
  } catch {
    return false; // storage cheio/bloqueado — snapshot é conforto, não requisito
  }
}

export function lerSnapshot(storage, chave = CHAVE_SNAPSHOT) {
  try {
    const bruto = storage.getItem(chave);
    if (!bruto) return null;
    const dados = JSON.parse(bruto);
    return dados && typeof dados === "object" ? dados : null;
  } catch {
    return null;
  }
}
