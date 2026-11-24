import C from "@/constants/colors";
import { varColor } from "@/lib/tema";
import { alfa } from "@/constants/colorAlfa";
import { LuArrowLeft, LuPercent, LuTrash2 } from "react-icons/lu";
import ImpressaoAcoes from "./ImpressaoAcoes";
import ModalCpfNota from "./ModalCpfNota";
// TD015: no split, cada entrada de pagamento é adicionada e removida do meio da
// lista, e cada uma carrega estado próprio de tela (o método selecionado, o campo de
// valor com foco). A chave não pode ser a posição. O `uid` vive só no state daqui:
// `buildPayloadPagamentos` e `buildPrintPagamentos` montam campo a campo, então ele
// não chega à venda nem ao cupom.
import { fmtComanda } from "./checkout/apoio";
import { useCheckout } from "@/features/pdv/hooks/useCheckout";
import PopupAjuste from "./checkout/PopupAjuste";
import PopupRemocao from "./checkout/PopupRemocao";
import ResumoPedido from "./checkout/ResumoPedido";
import PainelPagamento from "./checkout/PainelPagamento";
import "./CheckoutView.css";

export default function CheckoutView({ comanda, items, onConfirm, onBack, onRemoverItem }) {
  const tela = useCheckout({ comanda, items, onConfirm, onBack, onRemoverItem });
  const {
    confirmando, clienteFiado, cpfNotaAberto, setCpfNotaAberto, showAjuste, ajusteAplicado, modoRemocao, setModoRemocao, remocao, itensVisiveis, total, abrirAjuste, confirmarCpfNota, montarVendaParaImpressao, isMob,
  } = tela;

  return (
    <>
      <div className="checkout-view" style={{ background: varColor(C.bg) }}>

        {/* ── Header ── */}
        <div className="checkout-view__header">
          <button
            onClick={onBack}
            disabled={confirmando}
            className="checkout-view__btn-voltar"
            style={{
              background: varColor(C.surface),
              border: `1.5px solid var(${C.border})`,
              color: varColor(C.text),
              cursor: confirmando ? "not-allowed" : "pointer",
              opacity: confirmando ? 0.5 : 1,
            }}
            onMouseEnter={e => { if (!confirmando) { e.currentTarget.style.background = varColor(C.accent); e.currentTarget.style.borderColor = varColor(C.accent); e.currentTarget.style.color = "#fff"; } }}
            onMouseLeave={e => { e.currentTarget.style.background = varColor(C.surface); e.currentTarget.style.borderColor = varColor(C.border); e.currentTarget.style.color = varColor(C.text); }}
          >
            <LuArrowLeft size={16} /> Voltar
          </button>

          <div style={{ flex: 1 }}>
            <div className="checkout-view__titulo">Finalizar Comanda</div>
            <div className="checkout-view__subtitulo" style={{ color: varColor(C.muted) }}>
              {fmtComanda(comanda?.comanda)} · {itensVisiveis.reduce((s, i) => s + i.qty, 0)} {itensVisiveis.reduce((s, i) => s + i.qty, 0) === 1 ? "item" : "itens"}
            </div>
          </div>

          {/* Botão Desconto/Acréscimo */}
          <button
            onClick={abrirAjuste}
            className="checkout-view__btn-ajuste"
            style={{
              background: ajusteAplicado ? alfa(ajusteAplicado.tipo === "desconto" ? varColor(C.red) : varColor(C.green), "18") : varColor(C.surface),
              border: `1.5px solid ${ajusteAplicado ? alfa(ajusteAplicado.tipo === "desconto" ? varColor(C.red) : varColor(C.green), "66") : varColor(C.border)}`,
              color: ajusteAplicado ? (ajusteAplicado.tipo === "desconto" ? varColor(C.red) : varColor(C.green)) : varColor(C.text),
            }}
          >
            <LuPercent size={16} /> {ajusteAplicado ? (ajusteAplicado.tipo === "desconto" ? "Desconto" : "Acréscimo") : "Desconto / Acréscimo"}
          </button>

          {/* Leva 15.1 — remover produto na finalização */}
          {onRemoverItem && itensVisiveis.length > 0 && (
            <button
              onClick={() => setModoRemocao(v => !v)}
              className="checkout-view__btn-remover-item"
              style={{
                background: modoRemocao ? alfa(varColor(C.red), "18") : varColor(C.surface),
                border: `1.5px solid ${modoRemocao ? alfa(varColor(C.red), "66") : varColor(C.border)}`,
                color: modoRemocao ? varColor(C.red) : varColor(C.text),
              }}
            >
              <LuTrash2 size={16} /> {modoRemocao ? "Concluir remoção" : "Remover item"}
            </button>
          )}

          {/* F015 — imprimir comprovante ou pré-nota */}
          <ImpressaoAcoes montarVenda={montarVendaParaImpressao} />
        </div>

        {/* ── Body ── */}
        <div className="checkout-view__body" style={{ flexDirection: isMob ? "column" : "row" }}>

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
