import { useApp } from "@/context/AppContext";
import { logAction } from "@/lib/logger";
import { emitirEvento } from "@/lib/jarvas";

const fmtComanda = (name) =>
  /^\d+$/.test(String(name ?? "").trim()) ? `Comanda ${name}` : name;

/**
 * TD011 — extraído de PDVView (popup "Cancelar Comanda") para ser
 * testável isoladamente. Cancela todos os itens não cancelados da
 * comanda (auditoria: motivo + responsável), grava esse cancelamento na
 * comanda, tira ela da tela de trabalho e emite o evento do Jarvas. O
 * motivo é obrigatório (o chamador já bloqueia o botão sem motivo; aqui
 * só aplicamos trim()).
 *
 * A GRAVAÇÃO ANTES DE REMOVER é o que torna o cancelamento rastreável.
 * Antes, os itens cancelados eram montados aqui e a comanda era apagada
 * em seguida sem nunca receber essa marcação: o que o cliente pediu saía
 * do banco, e o único rastro era o payload de um log fire-and-forget —
 * que, por ser fire-and-forget, pode falhar sem ninguém saber.
 *
 * Agora o motivo e o responsável entram na comanda primeiro; o gatilho
 * `pending_arquiva_antes_de_sair` (migração 20261009) copia a linha para
 * `comandas_arquivadas` no instante em que ela sai. O que ficou guardado
 * é a comanda como ela realmente terminou, e não uma versão sem o porquê.
 */
export function useCancelarComanda() {
  const { removePending, updatePending, currentUser } = useApp();

  const cancelarComanda = async (selected, motivoBruto) => {
    const motivo = motivoBruto.trim();
    const quemCancelou = currentUser?.name || "";
    const novosItens = (selected.items ?? []).map(it =>
      it.cancelado ? it : { ...it, cancelado: true, motivoCancelamento: motivo, canceladoPor: quemCancelou },
    );

    // Falha aqui NÃO aborta o cancelamento: a comanda ficaria aberta na
    // grade, cobrável, só porque a marcação não gravou. O que se perde é
    // detalhe do arquivo, não a existência dele — o gatilho arquiva a
    // linha de qualquer jeito. Registra e segue.
    const { error: erroMarcacao } = await updatePending(
      selected.id,
      { items: novosItens, status: "cancelada", note: `Cancelada: ${motivo}` },
      { baseItems: selected.items ?? [] },
    );
    if (erroMarcacao) console.error("cancelarComanda: não gravou o motivo antes de arquivar:", erroMarcacao);

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
