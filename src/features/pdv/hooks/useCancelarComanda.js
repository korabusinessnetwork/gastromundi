import { useSessao, useComandas } from "@/context/AppContext";
import { logAction } from "@/features/auditoria/dados/logger";
import { emitirEvento } from "@/features/jarvas/dados/jarvas";
import { fmtComanda } from "@/features/comandas/regras/rotuloComanda";


/**
 * TD011 — extraído de PDVView (popup "Cancelar Comanda") para ser
 * testável isoladamente. Cancela todos os itens não cancelados da
 * comanda (auditoria: motivo + responsável), grava esse cancelamento na
 * comanda, tira ela da tela de trabalho e emite o evento do Jarvas. O
 * motivo é obrigatório (o chamador já bloqueia o botão sem motivo; aqui
 * só aplicamos trim()).
 *
 * A GRAVAÇÃO ANTES DE REMOVER é o que torna o cancelamento rastreável:
 * o motivo e o responsável entram na comanda primeiro, e o gatilho
 * `pending_arquiva_antes_de_sair` (migração 20261009) copia a linha para
 * `comandas_arquivadas` no instante em que ela sai.
 */
export function useCancelarComanda() {
  const { currentUser } = useSessao();
  const { removePending, updatePending } = useComandas();

  const cancelarComanda = async (selected, motivoBruto) => {
    const motivo = motivoBruto.trim();
    const quemCancelou = currentUser?.name || "";
    const novosItens = (selected.items ?? []).map(it =>
      it.cancelado ? it : { ...it, cancelado: true, motivoCancelamento: motivo, canceladoPor: quemCancelou },
    );

    // Log e evento só depois do banco confirmar — senão a trilha de
    // auditoria registra um cancelamento que não aconteceu e a comanda
    // reaparece na grade.
    const { error: erroMarcacao } = await updatePending(
      selected.id,
      { items: novosItens, status: "cancelada", note: `Cancelada: ${motivo}` },
      { baseItems: selected.items ?? [] },
    );
    if (erroMarcacao) console.error("cancelarComanda: não gravou o motivo antes de arquivar:", erroMarcacao);

    const { error } = await removePending(selected.id);
    if (error) throw new Error("Não foi possível cancelar a comanda. Tente novamente.");
    logAction(currentUser?.username, "comanda:cancelar", { msg: `Comanda ${fmtComanda(selected.comanda)} cancelada por ${quemCancelou}`, name: quemCancelou, role: currentUser?.role, comanda: selected.comanda, motivo, items: novosItens });
    emitirEvento("pedido.cancelado", "pedidos", { pedido_id: selected.id, comanda: selected.comanda, motivo, itens: novosItens.length }, currentUser?.username);

    return novosItens;
  };

  return { cancelarComanda };
}
