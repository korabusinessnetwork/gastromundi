import { supabase } from "@/lib/supabase";
import { useApp } from "@/context/AppContext";
import { logAction } from "@/lib/logger";

/**
 * TD011 — extraído de PDVView.handleConfirmPayment para ser testável
 * isoladamente (sem montar a árvore inteira do PDV). Mesma lógica de
 * antes, sem mudança de comportamento: grava a venda, remove a
 * pending, libera a reserva da mesa, desconta estoque dos itens
 * vendidos e registra o log de auditoria.
 *
 * O chamador (PDVView) continua responsável por setSalvando/try-catch
 * e por voltar para a grade de comandas (handleBack) após concluir.
 */
export function useFinalizarPagamento() {
  const { addSale, removePending, estoque, baixarEstoque, currentUser } = useApp();

  const finalizarPagamento = async (selected, cartItems, { pagamentos, total, taxaServico, valorTaxa, ajuste, valorAjuste }) => {
    const itensAcumulados = Array.isArray(selected.items) ? selected.items : [];
    const itensLocais     = cartItems.map(({ _key, ...rest }) => rest);
    const todosItens      = [...itensAcumulados, ...itensLocais];
    const subtotal        = todosItens.filter(i => !i.cancelado).reduce((s, i) => s + i.price * (i.qty ?? 1), 0);

    const sale = {
      id:          crypto.randomUUID(),
      comanda:     selected.comanda,
      items:       todosItens,
      subtotal,
      taxaServico: taxaServico ?? false,
      valorTaxa:   valorTaxa   ?? 0,
      ajuste:      ajuste      ?? null,
      valorAjuste: valorAjuste ?? 0,
      total,
      pagamentos,
      cashier:     currentUser?.name || "",
      at:          new Date().toISOString(),
    };

    await addSale(sale);
    await removePending(selected.id);
    if (selected.mesa) {
      supabase.rpc("limpar_reserva_mesa", { mesa_numero: selected.mesa })
        .then(() => {}, (err) => console.error("Falha ao limpar reserva da mesa:", err));
    }

    // Desconta estoque dos itens vendidos (ignora cancelados; apenas itens com id de produto)
    const itensAtivos = todosItens.filter(i => !i.cancelado && i.id);
    const delta = {};
    for (const item of itensAtivos) {
      delta[item.id] = (delta[item.id] ?? 0) + (item.qty ?? 1);
    }
    for (const [prodId, qty] of Object.entries(delta)) {
      const atual = estoque[prodId] ?? 0;
      if (atual > 0) await baixarEstoque(prodId, qty);
    }

    const metodoResumo = (pagamentos ?? []).map(p => p?.metodo).filter(Boolean).join(" + ") || "—";
    logAction(currentUser?.username, "comanda:finalizar", { msg: `Comanda ${selected.comanda} finalizada · R$ ${total.toFixed(2)} · ${metodoResumo}`, name: currentUser?.name, role: currentUser?.role, comanda: selected.comanda, total, metodo: metodoResumo });

    return sale;
  };

  return { finalizarPagamento };
}
