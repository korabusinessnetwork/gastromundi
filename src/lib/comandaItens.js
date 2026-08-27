import { round2 } from "./vendas";

// Reconciliação de itens de comanda entre dispositivos (Palm × PDV).
//
// O `pending.items` é um jsonb gravado inteiro a cada update — sem isto,
// dois dispositivos lançando na mesma comanda fazem "última escrita vence"
// e itens somem da conta. Cada item ganha um `uid` estável na primeira
// gravação; na hora de gravar, comparamos o snapshot que o chamador usou
// de base com o que está no banco e preservamos os itens que outro
// dispositivo lançou no meio do caminho.

/** Garante `uid` estável em todos os itens (idempotente). */
export function garantirUidItens(items) {
  if (!Array.isArray(items)) return items;
  let mudou = false;
  const out = items.map((it) => {
    if (!it || typeof it !== "object" || it.uid) return it;
    mudou = true;
    return { ...it, uid: crypto.randomUUID() };
  });
  return mudou ? out : items;
}

/**
 * Mescla a lista proposta pelo chamador com o que está no banco.
 *
 * - `base`: snapshot dos itens de onde o chamador partiu.
 * - `propostos`: lista que o chamador quer gravar (derivada de `base`).
 * - `banco`: itens atuais no banco (podem ter lançamentos de outro dispositivo).
 *
 * Itens do banco cujo `uid` não aparece nem em `base` nem em `propostos`
 * foram lançados por outro dispositivo → são preservados no fim da lista.
 * Itens sem `uid` (legado) não são recuperáveis por identidade e ficam a
 * cargo do snapshot do chamador.
 */
export function mesclarItensComanda({ base, propostos, banco }) {
  const conhecidos = new Set(
    [...(Array.isArray(base) ? base : []), ...(Array.isArray(propostos) ? propostos : [])]
      .map((i) => i?.uid)
      .filter(Boolean),
  );
  const remotos = (Array.isArray(banco) ? banco : []).filter(
    (i) => i?.uid && !conhecidos.has(i.uid),
  );
  if (remotos.length === 0) return { items: propostos, houveMescla: false };
  return { items: [...propostos, ...remotos], houveMescla: true };
}

/**
 * Cancela (soft-cancel) o item de índice `indice` — mesma convenção do PDV
 * (useCancelarComanda): o item permanece na lista para a trilha de auditoria,
 * mas sai da conta (totalItensAtivos o ignora). Grava motivo + responsável.
 *
 * Puro e idempotente: índice inválido ou item já cancelado devolvem a MESMA
 * referência da lista (sem alteração). Os demais itens e seus uids ficam
 * intactos, então o merge multi-dispositivo (mesclarItensComanda) segue
 * reconhecendo o cancelamento pelo uid.
 *
 * @param {Array<object>} items
 * @param {number} indice
 * @param {{motivo?:string, por?:string}} [ctx]
 * @returns {Array<object>} nova lista (ou a original quando nada muda)
 */
export function cancelarItemComanda(items, indice, { motivo = "", por = "" } = {}) {
  if (!Array.isArray(items)) return items;
  const alvo = items[indice];
  if (!alvo || alvo.cancelado) return items;
  return items.map((it, i) =>
    i === indice
      ? { ...it, cancelado: true, motivoCancelamento: String(motivo).trim(), canceladoPor: por }
      : it,
  );
}

/**
 * Horas de comanda aberta sem nenhum item ativo a partir das quais o PDV
 * passa a tratá-la como esquecida. Seis horas cobrem um turno inteiro: uma
 * comanda aberta por engano de manhã já aparece marcada na virada da tarde,
 * mas a mesa que abriu antes do almoço e ainda não pediu não é acusada.
 */
export const HORAS_COMANDA_ESQUECIDA = 6;

/**
 * Comanda aberta há muito tempo e sem nenhum consumo ativo — item cancelado
 * não conta como consumo.
 *
 * Existe porque uma comanda nesse estado some da conta de todo mundo: ela
 * não tem valor para cobrar, ninguém lembra de fechar, e mesmo assim ocupa a
 * mesa no mapa do salão e entra na lista de "comandas em aberto" (uma mesa
 * ficou 107h assim). O PDV mostra "Vazio" e o tempo decorrido em campos
 * separados — a leitura de que a soma dos dois é um problema fica por conta
 * do operador. Aqui essa leitura vira um estado com nome.
 *
 * Puro: quem chama passa o instante atual (facilita teste e evita recalcular
 * Date.now() por card).
 *
 * @param {{created_at?: string|null, items?: Array<object>}|null|undefined} order
 * @param {number} agora - Date.now()
 * @param {number} [limiteHoras]
 * @returns {{ esquecida: boolean, horas: number }}
 */
export function comandaEsquecida(order, agora, limiteHoras = HORAS_COMANDA_ESQUECIDA) {
  const abertaEm = order?.created_at ? new Date(order.created_at).getTime() : NaN;
  if (!Number.isFinite(abertaEm)) return { esquecida: false, horas: 0 };
  const horas = Math.floor((agora - abertaEm) / 3600000);
  if (horas < limiteHoras) return { esquecida: false, horas: Math.max(0, horas) };
  const temConsumo = (Array.isArray(order?.items) ? order.items : [])
    .some((i) => !i?.cancelado && (i?.qty ?? 1) > 0);
  return { esquecida: !temConsumo, horas };
}

/**
 * Total da conta: soma apenas itens não cancelados, arredondado.
 *
 * O round2 não é enfeite: o retorno daqui é gravado em `pending.total` e é
 * ele que o Palm e a lista de destino da transferência mostram na tela. Sem
 * arredondar, três cervejas de R$ 16,10 viram R$ 48,300000000000004 no banco.
 */
export function totalItensAtivos(items) {
  return round2(
    (Array.isArray(items) ? items : [])
      .filter((i) => !i?.cancelado)
      .reduce((s, i) => s + (i.price ?? 0) * (i.qty ?? 1), 0),
  );
}
