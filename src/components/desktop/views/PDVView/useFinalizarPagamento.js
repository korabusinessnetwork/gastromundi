import { supabase } from "@/lib/supabase";
import { useApp } from "@/context/AppContext";
import { logAction } from "@/lib/logger";
import { criarLancamento } from "@/lib/financeiro";

// Normalizado por nome: "fiado" ainda não existe como meio de pagamento
// cadastrado hoje, mas a checagem já fica pronta para quando existir
// (via meiosPagamento/metodosCustom em ConfiguracoesView).
const isFiado = (metodo) => String(metodo ?? "").trim().toLowerCase() === "fiado";

/**
 * TD011 — extraído de PDVView.handleConfirmPayment para ser testável
 * isoladamente (sem montar a árvore inteira do PDV). Mesma lógica de
 * antes, sem mudança de comportamento: grava a venda, remove a
 * pending, libera a reserva da mesa, desconta estoque dos itens
 * vendidos e registra o log de auditoria.
 *
 * Módulo Financeiro (fase 1): depois da venda gravada, cria a receita
 * automática por pagamento — fire-and-forget, nunca bloqueia a venda.
 * Pagamentos normais viram receita 'recebido'; pagamentos 'fiado'
 * viram conta a receber ('previsto', vencimento em 30 dias).
 *
 * O chamador (PDVView) continua responsável por setSalvando/try-catch
 * e por voltar para a grade de comandas (handleBack) após concluir.
 */
export function useFinalizarPagamento() {
  const { addSale, removePending, estoque, baixarEstoque, currentUser } = useApp();

  const finalizarPagamento = async (selected, cartItems, { pagamentos, total, taxaServico, valorTaxa, ajuste, valorAjuste, clienteId }) => {
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
      clienteId:   clienteId ?? null, // F010 — vínculo opcional ao cliente
      at:          new Date().toISOString(),
    };

    await addSale(sale);

    // Financeiro (fase 1): receita automática por pagamento — nunca bloqueia a venda.
    void (async () => {
      try {
        const hoje = new Date().toISOString().slice(0, 10);
        for (const p of pagamentos ?? []) {
          const valorPagamento = Number(p?.valor) || 0;
          if (!p?.metodo || valorPagamento <= 0) continue;

          if (isFiado(p.metodo)) {
            const vencimento = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
            await criarLancamento({
              tipo: "receita", categoria: "vendas",
              descricao: `Fiado — comanda ${selected.comanda}`,
              valor: valorPagamento, competencia: hoje, vencimento, status: "previsto",
              origem: "venda", venda_id: sale.id, cliente_id: clienteId ?? null,
            }, currentUser?.username);
          } else {
            await criarLancamento({
              tipo: "receita", categoria: "vendas",
              descricao: `Venda — comanda ${selected.comanda}`,
              valor: valorPagamento, competencia: hoje, status: "recebido",
              origem: "venda", venda_id: sale.id, cliente_id: clienteId ?? null,
            }, currentUser?.username);
          }
        }
      } catch (err) {
        console.error("financeiro (receita por venda):", err);
      }
    })();

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
