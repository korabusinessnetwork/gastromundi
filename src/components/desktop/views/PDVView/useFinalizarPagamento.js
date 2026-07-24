import { supabase } from "@/lib/supabase";
import { useApp } from "@/context/AppContext";
import { logAction } from "@/lib/logger";
import { criarLancamento } from "@/lib/financeiro";
import { emitirDocumentoFiscal } from "@/lib/fiscal";
import { destDoCliente } from "@/lib/nfceVenda";
import { processarPagamentoTef, metodoUsaTef } from "@/lib/tef";
import { consumoParaEstoque } from "@/utils/conversaoUnidades";
import { calcularBaixasSubprodutos } from "@/lib/combos";
import { isErroDeRede } from "@/lib/offline/rede";
import { round2 } from "@/lib/vendas";
import { reportarFalha } from "@/lib/observabilidade";

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
 * Add-ons pagos (Fase 3 da camada de comercialização, decisão 019):
 * NF-e (`@/lib/fiscal`) e TEF (`@/lib/tef`) são chamados aqui, também
 * fire-and-forget, só quando `addonHabilitado('nfe'|'tef')` — sem o
 * add-on ativo, nenhum dos dois módulos roda e o pagamento é idêntico
 * a antes desta fase existir. Hoje ambos são STUBS (nenhum provedor
 * fiscal/TEF pago integrado); o provedor real entra trocando o corpo
 * de `emitirDocumentoFiscal`/`processarPagamentoTef`, sem mexer aqui.
 *
 * O chamador (PDVView) continua responsável por setSalvando/try-catch
 * e por voltar para a grade de comandas (handleBack) após concluir.
 */
export function useFinalizarPagamento() {
  const { addSale, removePending, estoque, baixarEstoque, baixarEstoqueSubproduto, currentUser, addonHabilitado, products, redeOnline, metodosTef, enfileirarOffline } = useApp();

  const finalizarPagamento = async (selected, cartItems, { pagamentos, total, taxaServico, valorTaxa, ajuste, valorAjuste, clienteId, cliente }, { onNfce } = {}) => {
    // TEF é só online: a maquininha precisa de comunicação em tempo real —
    // não dá pra "guardar pra depois" uma cobrança de cartão. Métodos sem
    // TEF (dinheiro, Pix etc.) podem fechar offline: a venda entra na fila
    // local e sobe quando a internet voltar.
    const exigeTef = (m) => addonHabilitado?.("tef") && metodoUsaTef(m, metodosTef);
    if (!redeOnline && (pagamentos ?? []).some((p) => exigeTef(p?.metodo))) {
      throw new Error("Sem internet: pagamento pela maquininha (TEF) fica indisponível. Cobre em dinheiro, Pix ou outro método — ou aguarde a conexão voltar.");
    }
    const itensAcumulados = Array.isArray(selected.items) ? selected.items : [];
    const itensLocais     = cartItems.map(({ _key, ...rest }) => rest);
    const todosItens      = [...itensAcumulados, ...itensLocais];
    // P7 — arredonda o subtotal na ORIGEM (não só na gravação em vendas.js):
    // este `subtotal` vai para recibo, UI e sales.data; sem round2 o erro de
    // ponto flutuante (0.1+0.2) vazaria para essas superfícies.
    const subtotal        = round2(todosItens.filter(i => !i.cancelado).reduce((s, i) => s + i.price * (i.qty ?? 1), 0));

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
      // C3 — preserva quem lançou a comanda (garçom), não só quem cobrou
      // (cashier). Permite atribuir a venda finalizada ao garçom no painel.
      garcom:      selected.garcom     ?? null,
      created_by:  selected.created_by ?? null,
      clienteId:   clienteId ?? null, // F010 — vínculo opcional ao cliente
      // Destinatário fiscal (CPF/CNPJ na nota): puxado AUTOMÁTICO do cliente
      // vinculado à venda — o operador não redigita o documento. Sem cliente
      // ou sem documento fica null e a NFC-e sai anônima (add-on `nfe`).
      dest:        destDoCliente(cliente),
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

          const dados = isFiado(p.metodo)
            ? {
                tipo: "receita", categoria: "vendas",
                descricao: `Fiado — comanda ${selected.comanda}`,
                valor: valorPagamento, competencia: hoje,
                vencimento: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
                status: "previsto",
                origem: "venda", venda_id: sale.id, cliente_id: clienteId ?? null,
              }
            : {
                tipo: "receita", categoria: "vendas",
                descricao: `Venda — comanda ${selected.comanda}`,
                valor: valorPagamento, competencia: hoje, status: "recebido",
                origem: "venda", venda_id: sale.id, cliente_id: clienteId ?? null,
              };
          const { error } = await criarLancamento(dados, currentUser?.username);
          // Sem internet a receita não se perde: entra na fila local e é
          // recriada no reenvio. Outros erros seguem fire-and-forget (a
          // venda nunca é bloqueada pelo financeiro).
          if (isErroDeRede(error)) enfileirarOffline({ tipo: "insert_lancamento", dados, usuario: currentUser?.username });
        }
      } catch (err) {
        console.error("financeiro (receita por venda):", err);
      }
    })();

    // Add-ons pagos (Fase 3, decisão 019): fire-and-forget — nunca bloqueiam
    // nem quebram a venda. Só disparam quando o tenant tem o add-on ativo;
    // sem o add-on, o pagamento segue idêntico a hoje (nenhum código extra roda).
    if (addonHabilitado?.("nfe")) {
      // Leva 7: a modal do cupom abre JÁ em 'emitindo' (logo aqui, antes do
      // round-trip) e se atualiza para 'concluido' quando a promise resolve —
      // sem NUNCA dar await (a venda não pode esperar a SEFAZ). Sem callback
      // (ex.: chamador sem UI de cupom) o comportamento é idêntico a antes.
      onNfce?.({ estado: "emitindo", resultado: null, venda: sale });
      emitirDocumentoFiscal(sale, { usuario: currentUser?.username })
        .then((resultado) => onNfce?.({ estado: "concluido", resultado, venda: sale }))
        .catch((err) => {
          // emitirDocumentoFiscal já é "nunca lança"; o catch é rede de
          // segurança e ainda assim conclui a modal (nunca a deixa girando).
          console.error("fiscal (nf-e):", err);
          onNfce?.({
            estado: "concluido",
            resultado: { status: "erro", vendaId: sale.id, detalhe: err?.message ?? "Falha ao emitir NFC-e." },
            venda: sale,
          });
        });
    }
    if (addonHabilitado?.("tef")) {
      for (const p of pagamentos ?? []) {
        if (!metodoUsaTef(p?.metodo, metodosTef)) continue;
        void processarPagamentoTef(p, { usuario: currentUser?.username, comanda: selected.comanda }).catch((err) => {
          console.error("tef:", err);
        });
      }
    }

    // Venda já está gravada — se a remoção da pending falhar, a comanda
    // reaparece na grade e o operador cobra DE NOVO (cobrança dupla).
    // Tenta uma segunda vez e, se ainda falhar, avisa alto no fim do fluxo.
    let remocaoFalhou = null;
    {
      let { error } = await removePending(selected.id);
      if (error) ({ error } = await removePending(selected.id));
      remocaoFalhou = error ?? null;
    }
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
      // Produto sem entrada no mapa de estoque = sem controle de estoque.
      // Estoque zerado NÃO pula a baixa: a RPC clampa em zero e o Jarvas
      // sinaliza a venda sem estoque (oversell) — pular escondia o furo.
      if (!(prodId in estoque)) continue;
      const produto = (products ?? []).find(p => String(p.id) === prodId);
      // Crítico 7 — converte a quantidade vendida (unidade de consumo)
      // para unidade de estoque via fator_consumo_estoque do produto.
      const qtdEstoque = produto ? consumoParaEstoque(qty, produto) : qty;
      await baixarEstoque(prodId, qtdEstoque);
    }

    // B4 — combos também descontam o estoque dos subprodutos que os compõem
    // (a receita viaja no item do carrinho; só entram os com controla_estoque).
    // Mesma filosofia da baixa do principal: nunca bloqueia nem quebra a venda.
    for (const baixa of calcularBaixasSubprodutos(itensAtivos)) {
      await baixarEstoqueSubproduto(baixa.subprodutoId, baixa.qtd, baixa.nome);
    }

    const metodoResumo = (pagamentos ?? []).map(p => p?.metodo).filter(Boolean).join(" + ") || "—";
    logAction(currentUser?.username, "comanda:finalizar", { msg: `Comanda ${selected.comanda} finalizada · R$ ${total.toFixed(2)} · ${metodoResumo}`, name: currentUser?.name, role: currentUser?.role, comanda: selected.comanda, total, metodo: metodoResumo });

    if (remocaoFalhou) {
      logAction(currentUser?.username, "comanda:finalizar:remocao_falhou", { msg: `Venda gravada, mas a comanda ${selected.comanda} não foi removida da grade`, name: currentUser?.name, role: currentUser?.role, comanda: selected.comanda, venda_id: sale.id, erro: remocaoFalhou?.message ?? String(remocaoFalhou) });
      // Risco de cobrança dupla: a venda gravou mas a comanda não saiu da
      // grade (removePending falhou nas 2 tentativas). É exatamente o tipo de
      // falha silenciosa que o operador pode não notar — sobe pro Sentry.
      reportarFalha(remocaoFalhou, { risco: "cobranca_dupla", acao: "removePending", comanda: selected.comanda, venda_id: sale.id });
      // Lança DEPOIS dos efeitos (mesa/estoque/log) para não perdê-los:
      // o CheckoutView exibe esta mensagem e o operador resolve manualmente.
      throw new Error(`Venda registrada, mas a comanda ${selected.comanda} não saiu da tela. NÃO cobre de novo — feche a comanda manualmente.`);
    }

    return sale;
  };

  return { finalizarPagamento };
}
