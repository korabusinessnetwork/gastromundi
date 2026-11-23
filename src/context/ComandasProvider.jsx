import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { ComandasContext } from "./ComandasContext";
import { useFuncaoEstavel } from "@/hooks/useFuncaoEstavel";
import { useOffline } from "./OfflineContext";
import { useSessao } from "./SessaoContext";
import {
  inserirComanda, atualizarComanda, excluirComanda, lerItensDaComanda,
  adquirirTravaDaComanda, lerDonoDaTrava, liberarTravaDaComanda, assinarComandas,
} from "@/features/comandas/dados/comandas";
import { garantirUidItens, mesclarItensComanda, totalItensAtivos } from "@/lib/comandaItens";
import { LOCK_TTL_MS } from "@/lib/comandaLock";
import { separarCampos, COLUNAS_ESCRITA_PENDING } from "@/lib/camposPermitidos";
import { emitirEvento } from "@/lib/jarvas";
import { isErroDeRede } from "@/lib/offline/rede";
import { reportarFalha, reportarInconsistencia } from "@/lib/observabilidade";

/**
 * Dono do estado das comandas em aberto (tarefa 2.9 do plano de
 * refatoração): a lista, o que o garçom já lançou, a trava de edição, as
 * ações que abrem, editam e fecham comanda, e o tempo real entre o garçom e
 * o caixa.
 *
 * Quem lê ou age usa `useComandas()`. Quem CARREGA (a abertura do app, do
 * banco ou da cópia offline, e a drenagem da fila) usa o canal interno
 * `useComandasCarga()`, que só o `AppProvider` deve chamar.
 *
 * O usuário logado vem do `SessaoProvider` e a fila offline do `OfflineProvider`,
 * os dois por fora deste. `lockIndisponivelRef` é dividido
 * com a carga, que é quem descobre se o banco tem as colunas da trava.
 */
const ComandasCargaContext = createContext(null);

export function useComandasCarga() {
  const ctx = useContext(ComandasCargaContext);
  if (!ctx) throw new Error("useComandasCarga deve ser usado dentro de <ComandasProvider>");
  return ctx;
}

export function ComandasProvider({ lockIndisponivelRef, children }) {
  // O usuário logado mora no SessaoProvider, por fora deste (tarefa 2.9).
  const { currentUser } = useSessao();
  // A fila offline mora no OfflineProvider, por fora deste (tarefa 2.9).
  const { enfileirarOffline } = useOffline();
  const [pending,  setPendingLocal] = useState([]);
  const [lancadas, setLancadas]     = useState(new Set());

  // ── Actions: Pending ──────────────────────────────────────────
  // O supabase-js NÃO lança em erro de RLS/constraint — resolve com
  // { error }. Toda escrita aqui checa o .error, desfaz o estado
  // otimista quando a gravação falha e devolve { error } para o
  // chamador mostrar feedback — senão a UI finge sucesso enquanto o
  // banco ficou para trás (pedido do garçom some, cobrança dupla).
  const addPending = async (order) => {
    // uid estável por item — base da reconciliação multi-dispositivo
    // (Palm × PDV) feita no updatePending.
    order = { ...order, items: garantirUidItens(order.items) };
    setPendingLocal(prev => [order, ...prev]);
    const { id, comanda, mesa, apelido, cliente_id, cliente_nome, items, status, note, total, garcom, created_by } = order;
    const { error } = await inserirComanda({ id, comanda, mesa, apelido, cliente_id, cliente_nome, items, status, note, total, garcom, created_by });
    if (error) {
      // Sem internet o pedido NÃO some (Leva 11): mantém o estado
      // otimista, guarda na fila local e reenvia quando a rede voltar.
      if (isErroDeRede(error)) {
        enfileirarOffline({ tipo: "insert", payload: { id, comanda, mesa, apelido, cliente_id, cliente_nome, items, status, note, total, garcom, created_by } });
        return { error: null, offline: true };
      }
      console.error("addPending error:", error);
      reportarFalha(error, { acao: "addPending", tabela: "pending" });
      setPendingLocal(prev => prev.filter(o => o.id !== id));
      return { error };
    }
    emitirEvento("pedido.aberto", "pedidos", { pedido_id: id, comanda, mesa: mesa ?? null, total: total ?? null, garcom: garcom ?? null }, created_by ?? currentUser?.username);
    return { error: null };
  };

  const removePending = async (id) => {
    let removida = null;
    setPendingLocal(prev => {
      removida = prev.find(o => o.id === id) ?? removida;
      return prev.filter(o => o.id !== id);
    });
    const { error } = await excluirComanda(id);
    if (error) {
      if (isErroDeRede(error)) {
        enfileirarOffline({ tipo: "delete", id });
        return { error: null, offline: true };
      }
      console.error("removePending error:", error);
      reportarFalha(error, { acao: "removePending", tabela: "pending", id });
      // Restaura a comanda: ela continua existindo no banco.
      if (removida) setPendingLocal(prev => prev.some(o => o.id === id) ? prev : [removida, ...prev]);
      return { error };
    }
    return { error: null };
  };

  // `baseItems` = snapshot de onde o chamador derivou `changes.items`.
  // Com ele, itens lançados por outro dispositivo (Palm) entre o snapshot
  // e a gravação são preservados em vez de sobrescritos ("última escrita
  // vence" fazia itens sumirem da conta). A janela de corrida residual
  // (leitura→gravação não é atômica) fica registrada como dívida técnica —
  // a solução definitiva é um RPC de append em jsonb no Postgres.
  const updatePending = async (id, changes, { baseItems } = {}) => {
    if (Array.isArray(changes.items)) {
      changes = { ...changes, items: garantirUidItens(changes.items) };
      if (Array.isArray(baseItems)) {
        const { data: atual, error: erroLeitura } = await lerItensDaComanda(id);
        if (!erroLeitura && atual) {
          const { items, houveMescla } = mesclarItensComanda({ base: baseItems, propostos: changes.items, banco: atual.items });
          if (houveMescla) {
            changes = { ...changes, items };
            if ("total" in changes) changes.total = totalItensAtivos(items);
          }
        }
      }
    }
    // Allowlist antes de qualquer coisa. Aqui ela pesa mais que nos outros
    // pontos: com a rede fora, este `changes` é gravado no localStorage pela
    // fila offline e só volta ao banco no dreno, depois de ter passado por um
    // armazenamento que o navegador deixa qualquer um editar. Filtrar na
    // entrada é o que garante que o que sai da fila tem a mesma forma do que
    // entrou nela.
    const { campos: permitidos, ignorados } = separarCampos(changes, COLUNAS_ESCRITA_PENDING);
    if (ignorados.length > 0) {
      reportarInconsistencia("escrita com coluna fora da allowlist", { acao: "updatePending", tabela: "pending", id, ignorados });
    }
    const payload = { ...permitidos, updated_at: new Date().toISOString() };
    let anterior = null;
    setPendingLocal(prev => prev.map(o => {
      if (o.id !== id) return o;
      anterior = o;
      return { ...o, ...permitidos };
    }));
    const { error } = await atualizarComanda(id, payload);
    if (error) {
      if (isErroDeRede(error)) {
        enfileirarOffline({ tipo: "update", id, changes: payload });
        return { error: null, offline: true };
      }
      console.error("updatePending error:", error);
      reportarFalha(error, { acao: "updatePending", tabela: "pending", id });
      if (anterior) setPendingLocal(prev => prev.map(o => o.id === id ? anterior : o));
      return { error };
    }
    return { error: null };
  };

  // ── Trava de edição de comanda (Leva 14) ─────────────────────
  // Enquanto uma pessoa está com a comanda aberta, outra não mexe.
  // Adquirir = UPDATE condicional: só grava se a trava está livre, é minha,
  // ou expirou (TTL). Quem chegar primeiro leva; o perdedor recebe ok:false
  // com o nome de quem está editando. Tudo fail-open: sem migration (42703)
  // ou sem rede, a trava se desliga e o app opera como antes.
  const adquirirTrava = async (id) => {
    if (lockIndisponivelRef.current || !currentUser?.username) return { ok: true, semTrava: true };
    // X3 — o username entra cru no filtro .or() abaixo. Um username com `,`
    // `.` `)` ou espaço reescreveria a lógica do filtro (roubo de trava).
    // Só montamos o .or() com username em allowlist [a-zA-Z0-9._-]; fora
    // dela, fail-open (não trava ninguém — coerente com o resto da função).
    if (!/^[a-zA-Z0-9._-]+$/.test(currentUser.username)) return { ok: true, semTrava: true };
    const agora = new Date();
    const limiteExpirada = new Date(agora.getTime() - LOCK_TTL_MS).toISOString();
    const { data, error } = await adquirirTravaDaComanda(id, {
      usuario: currentUser.username,
      nome: currentUser.name ?? currentUser.username,
      agoraIso: agora.toISOString(),
      limiteExpiradaIso: limiteExpirada,
    });
    if (error) {
      if (error.code === "42703") lockIndisponivelRef.current = true;
      // Rede fora ou banco sem migration: não bloqueia ninguém (fail-open).
      return { ok: true, semTrava: true };
    }
    if (!data) {
      // Outra pessoa segura a trava — busca quem, pra UI mostrar o nome.
      const { data: dono } = await lerDonoDaTrava(id);
      return { ok: false, nome: dono?.editando_nome || dono?.editando_por || "outra pessoa", desde: dono?.editando_desde ?? null };
    }
    setPendingLocal(prev => prev.map(o => o.id === id ? { ...o, ...data } : o));
    return { ok: true };
  };

  // Renovação (heartbeat): reusa a aquisição — se a minha trava segue
  // valendo, o UPDATE condicional só atualiza o editando_desde.
  const renovarTrava = (id) => adquirirTrava(id);

  const liberarTrava = async (id) => {
    if (lockIndisponivelRef.current || !currentUser?.username) return { error: null };
    setPendingLocal(prev => prev.map(o => (o.id === id && o.editando_por === currentUser.username)
      ? { ...o, editando_por: null, editando_nome: null, editando_desde: null }
      : o));
    const { error } = await liberarTravaDaComanda(id, currentUser.username);
    // Falhou (rede etc.)? Sem drama: a trava expira sozinha pelo TTL.
    return { error: error ?? null };
  };

  const addLancada = (id) => setLancadas(prev => new Set([...prev, id]));

  // ── Realtime: pedidos pendentes (palm ↔ caixa) ───────────────
  useEffect(() => {
    return assinarComandas((payload) => {
        if (payload.eventType === "INSERT") {
          setPendingLocal(prev =>
            prev.find(p => p.id === payload.new.id) ? prev : [payload.new, ...prev]
          );
        } else if (payload.eventType === "UPDATE") {
          setPendingLocal(prev => prev.map(p => p.id === payload.new.id ? payload.new : p));
        } else if (payload.eventType === "DELETE") {
          setPendingLocal(prev => prev.filter(p => p.id !== payload.old.id));
        }
    });
  }, []);


  // ── Carga (só o AppProvider chama) ──────────────────────────────
  // Aceita valor ou função, como o setState: a drenagem da fila e a cópia
  // offline usam os dois jeitos.
  const valorCarga = useMemo(() => ({ definirComandas: setPendingLocal }), []);

  // ── Valor memorizado (ver as tarefas 2.2 e 2.6) ─────────────────
  // Comandas em aberto, a trava de edição e o que o garçom já lançou.
  const addPendingEstavel    = useFuncaoEstavel(addPending);
  const removePendingEstavel = useFuncaoEstavel(removePending);
  const updatePendingEstavel = useFuncaoEstavel(updatePending);
  const adquirirTravaEstavel = useFuncaoEstavel(adquirirTrava);
  const liberarTravaEstavel  = useFuncaoEstavel(liberarTrava);
  const renovarTravaEstavel  = useFuncaoEstavel(renovarTrava);
  const addLancadaEstavel    = useFuncaoEstavel(addLancada);
  const valorComandas = useMemo(() => ({
    pending, lancadas,
    addPending: addPendingEstavel, removePending: removePendingEstavel, updatePending: updatePendingEstavel,
    adquirirTrava: adquirirTravaEstavel, liberarTrava: liberarTravaEstavel, renovarTrava: renovarTravaEstavel,
    addLancada: addLancadaEstavel,
  }), [pending, lancadas, addPendingEstavel, removePendingEstavel, updatePendingEstavel,
    adquirirTravaEstavel, liberarTravaEstavel, renovarTravaEstavel, addLancadaEstavel]);

  return (
    <ComandasCargaContext.Provider value={valorCarga}>
      <ComandasContext.Provider value={valorComandas}>
        {children}
      </ComandasContext.Provider>
    </ComandasCargaContext.Provider>
  );
}
