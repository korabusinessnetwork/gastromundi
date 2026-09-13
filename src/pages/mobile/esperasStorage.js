// ── Persistência da fila de pedidos em espera (Palm) ─────────────
//
// A fila vivia só em `useState`. Se o garçom recarregava a tela, o sistema
// descartava a aba, ou ele tocava em "Sem internet, lançar pelo Wi-Fi do
// caixa" (que troca a página inteira), todos os pedidos acumulados de várias
// mesas sumiam sem aviso, e nada tinha ido ao servidor.
//
// Guardar no próprio aparelho é o único lugar possível: até enviar, o pedido
// em espera não existe no servidor. O que volta do armazenamento é tratado
// como dado de fora, e não como verdade: conteúdo corrompido ou de uma versão
// antiga não pode derrubar a tela do garçom no meio do salão, então entra o
// que é válido e o resto é descartado.

/** Chave do armazenamento local. O sufixo de versão evita ler formato antigo. */
export const CHAVE_ESPERAS = "gm.palm.esperas.v1";

function armazenamento() {
  try {
    return typeof window !== "undefined" && window.localStorage ? window.localStorage : null;
  } catch {
    // Navegador com dados de site bloqueados: só o acesso já lança.
    return null;
  }
}

/** Um item do carrinho, ou null quando não dá para confiar no que voltou. */
function sanitizarItem(item) {
  if (!item || typeof item !== "object" || Array.isArray(item)) return null;
  const { id, name, price, qty } = item;
  if (typeof id !== "string" && typeof id !== "number") return null;
  const nome = typeof name === "string" ? name.trim() : "";
  if (!nome) return null;
  const preco = Number(price);
  if (!Number.isFinite(preco) || preco < 0) return null;
  const quantidade = Number(qty);
  return {
    ...item,
    id,
    name: nome,
    price: preco,
    qty: Number.isFinite(quantidade) && quantidade > 0 ? quantidade : 1,
  };
}

/**
 * Filtra uma fila (vinda do armazenamento ou da memória) deixando só o que é
 * lançável: comanda com nome e ao menos um item legível. Nunca lança.
 */
export function sanitizarEsperas(valor) {
  if (!Array.isArray(valor)) return [];
  const fila = [];
  for (const entrada of valor) {
    if (!entrada || typeof entrada !== "object" || Array.isArray(entrada)) continue;
    const comanda = typeof entrada.comanda === "string" ? entrada.comanda.trim() : "";
    if (!comanda) continue;
    const items = (Array.isArray(entrada.items) ? entrada.items : [])
      .map(sanitizarItem)
      .filter(Boolean);
    if (items.length === 0) continue; // pedido sem item não tem o que enviar
    const espera = {
      comanda,
      mesa:    typeof entrada.mesa    === "string" ? entrada.mesa.trim()    : "",
      apelido: typeof entrada.apelido === "string" ? entrada.apelido.trim() : "",
      items,
    };
    // Mensagem de um envio que falhou antes: o garçom precisa continuar vendo.
    if (typeof entrada.erro === "string" && entrada.erro.trim()) espera.erro = entrada.erro;
    fila.push(espera);
  }
  return fila;
}

/** Apaga a fila guardada no aparelho. */
export function limparEsperas() {
  const store = armazenamento();
  if (!store) return;
  try { store.removeItem(CHAVE_ESPERAS); } catch { /* nada a fazer */ }
}

/** Lê a fila guardada. Devolve sempre um array, mesmo com dado corrompido. */
export function lerEsperas() {
  const store = armazenamento();
  if (!store) return [];
  let bruto = null;
  try { bruto = store.getItem(CHAVE_ESPERAS); } catch { return []; }
  if (!bruto) return [];
  let valor = null;
  try {
    valor = JSON.parse(bruto);
  } catch {
    limparEsperas(); // texto ilegível não vira fila nem fica atrapalhando
    return [];
  }
  const fila = sanitizarEsperas(valor);
  if (fila.length === 0) limparEsperas();
  return fila;
}

/** Grava a fila no aparelho, e apaga a chave quando a fila esvazia. */
export function gravarEsperas(lista) {
  const store = armazenamento();
  if (!store) return;
  const fila = sanitizarEsperas(lista);
  try {
    if (fila.length === 0) store.removeItem(CHAVE_ESPERAS);
    else store.setItem(CHAVE_ESPERAS, JSON.stringify(fila));
  } catch {
    // Aparelho sem espaço ou armazenamento bloqueado: a fila segue valendo em
    // memória, que é o comportamento que já existia.
  }
}
