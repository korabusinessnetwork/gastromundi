import { useApp } from "@/context/AppContext";
import { logAction } from "@/lib/logger";
import { emitirEvento } from "@/lib/jarvas";

const fmtComanda = (name) =>
  /^\d+$/.test(String(name ?? "").trim()) ? `Comanda ${name}` : name;

/**
 * TD011 — extraído de PDVView (popup "Cancelar Comanda") para ser
 * testável isoladamente. Cancela todos os itens não cancelados da
 * comanda (auditoria: motivo + responsável), remove a pending e
 * emite o evento do Jarvas — mesma lógica de antes, sem mudança de
 * comportamento. O motivo é obrigatório (o chamador já bloqueia o
 * botão sem motivo; aqui só aplicamos trim()).
 */
export function useCancelarComanda() {
  const { removePending, currentUser } = useApp();

  const cancelarComanda = async (selected, motivoBruto) => {
    const motivo = motivoBruto.trim();
    const quemCancelou = currentUser?.name || "";
    const novosItens = (selected.items ?? []).map(it =>
      it.cancelado ? it : { ...it, cancelado: true, motivoCancelamento: motivo, canceladoPor: quemCancelou },
    );

    // Log e evento só depois do banco confirmar — senão a trilha de
    // auditoria registra um cancelamento que não aconteceu e a comanda
    // reaparece na grade.
    const { error } = await removePending(selected.id);
    if (error) throw new Error("Não foi possível cancelar a comanda. Tente novamente.");
    logAction(currentUser?.username, "comanda:cancelar", { msg: `Comanda ${fmtComanda(selected.comanda)} cancelada por ${quemCancelou}`, name: quemCancelou, role: currentUser?.role, comanda: selected.comanda, motivo, items: novosItens });
    emitirEvento("pedido.cancelado", "pedidos", { pedido_id: selected.id, comanda: selected.comanda, motivo, itens: novosItens.length }, currentUser?.username);

    return novosItens;
  };

  return { cancelarComanda };
}
