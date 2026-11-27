import { LuArrowLeft, LuPercent, LuTrash2 } from "react-icons/lu";
import ImpressaoAcoes from "./ImpressaoAcoes";
import ModalCpfNota from "./ModalCpfNota";
// TD015: no split, cada entrada de pagamento é adicionada e removida do meio da
// lista, e cada uma carrega estado próprio de tela (o método selecionado, o campo de
// valor com foco). A chave não pode ser a posição. O `uid` vive só no state daqui:
// `buildPayloadPagamentos` e `buildPrintPagamentos` montam campo a campo, então ele
// não chega à venda nem ao cupom.
import { fmtComanda } from "@/features/comandas/regras/rotuloComanda";
import { useCheckout } from "@/features/pdv/hooks/useCheckout";
import PopupAjuste from "./checkout/PopupAjuste";
import PopupRemocao from "./checkout/PopupRemocao";
import ResumoPedido from "./checkout/ResumoPedido";
import PainelPagamento from "./checkout/PainelPagamento";
import VendaConcluida from "./checkout/VendaConcluida";
import "./CheckoutView.css";

export default function CheckoutView({ comanda, items, onConfirm, onBack, onConcluir, onRemoverItem }) {
  const tela = useCheckout({ comanda, items, onConfirm, onBack, onConcluir, onRemoverItem });
  const {
    confirmando, clienteFiado, cpfNotaAberto, setCpfNotaAberto, showAjuste, ajusteAplicado, modoRemocao, setModoRemocao, remocao, itensVisiveis, total, abrirAjuste, confirmarCpfNota, montarVendaParaImpressao, isMob,
    vendaConcluida, statusImpressao, erroImpressao, imprimirComprovanteConcluido, concluir,
  } = tela;

  if (vendaConcluida) {
    return (
      <VendaConcluida
        venda={vendaConcluida}
        statusImpressao={statusImpressao}
        erroImpressao={erroImpressao}
        onImprimir={imprimirComprovanteConcluido}
        onConcluir={concluir}
      />
    );
  }

  return (
    <>
      <div className="checkout-view">

        {/* ── Header ── */}
        <div className="checkout-view__header">
          <button
            onClick={onBack}
            disabled={confirmando}
            className="checkout-view__btn-voltar"
          >
            <LuArrowLeft size={16} /> Voltar
          </button>

          <div className="checkout-view__header-info">
            <div className="checkout-view__titulo">Finalizar Comanda</div>
            <div className="checkout-view__subtitulo">
              {fmtComanda(comanda?.comanda)} · {itensVisiveis.reduce((s, i) => s + i.qty, 0)} {itensVisiveis.reduce((s, i) => s + i.qty, 0) === 1 ? "item" : "itens"}
            </div>
          </div>

          {/* Botão Desconto/Acréscimo */}
          <button
            onClick={abrirAjuste}
            className={`checkout-view__btn-ajuste${ajusteAplicado ? ` checkout-view__btn-ajuste--${ajusteAplicado.tipo === "desconto" ? "desconto" : "acrescimo"}` : ""}`}
          >
            <LuPercent size={16} /> {ajusteAplicado ? (ajusteAplicado.tipo === "desconto" ? "Desconto" : "Acréscimo") : "Desconto / Acréscimo"}
          </button>

          {/* Leva 15.1 — remover produto na finalização */}
          {onRemoverItem && itensVisiveis.length > 0 && (
            <button
              onClick={() => setModoRemocao(v => !v)}
              className={`checkout-view__btn-remover-item${modoRemocao ? " checkout-view__btn-remover-item--ativo" : ""}`}
            >
              <LuTrash2 size={16} /> {modoRemocao ? "Concluir remoção" : "Remover item"}
            </button>
          )}

          {/* F015 — imprimir comprovante ou pré-nota */}
          <ImpressaoAcoes montarVenda={montarVendaParaImpressao} />
        </div>

        {/* ── Body ── */}
        <div className={`checkout-view__body${isMob ? " checkout-view__body--coluna" : ""}`}>

          {/* ── Resumo do pedido ── */}
          <ResumoPedido tela={tela} />

          {/* ── Sidebar de pagamento ── */}
          <PainelPagamento tela={tela} />
        </div>
      </div>
      {/* ── Popup Desconto / Acréscimo ── */}
      {showAjuste && <PopupAjuste tela={tela} />}

      {/* ── Popup Remover produto (Leva 15.1) ── */}
      {remocao && <PopupRemocao tela={tela} />}

      {/* Etapa "CPF na nota" — abre ao confirmar quando o add-on nfe está ligado
          (em toda venda com nota). Deixar em branco = NFC-e anônima. */}
      {cpfNotaAberto && (
        <ModalCpfNota
          total={total}
          cliente={clienteFiado}
          onConfirmar={confirmarCpfNota}
          onCancelar={() => setCpfNotaAberto(false)}
        />
      )}
    </>
  );
}
