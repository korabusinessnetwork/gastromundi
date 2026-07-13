import { useMemo } from "react";
import { LuPrinter, LuX, LuLoaderCircle, LuTriangleAlert } from "react-icons/lu";
import { montarDanfeNfce } from "@/lib/nfceDanfe";
import { montarVendaFiscal } from "@/lib/nfceVenda";
import CupomNfce from "./CupomNfce";
import "./ModalCupomNfce.css";

/**
 * <ModalCupomNfce> — a nota do consumidor logo após finalizar a venda (Leva 7).
 *
 * Por que é intuitiva (Princípio nº1): abre SOZINHA no fim do pagamento, sem o
 * operador precisar procurar nada; lê de cima para baixo como o cupom de
 * verdade (reusa <CupomNfce>), com os ESTADOS sempre visíveis — "Emitindo
 * NFC-e…" com spinner enquanto a nota vai à SEFAZ, e o cupom (ou a mensagem
 * humana) quando conclui. A ação principal — Imprimir — fica em destaque, só
 * habilitada quando há de fato um cupom para imprimir (prevenção de erro).
 * Fechar é sempre permitido e nunca trava a próxima comanda: a venda já foi
 * concluída — a nota é um passo à parte.
 *
 * A emissão NUNCA bloqueia a venda: quem chama abre esta modal já em
 * 'emitindo' (fire-and-forget) e a atualiza para 'concluido' quando a promise
 * resolve. Em 'sem_chave' (sem certificado ainda) renderiza a PRÉVIA do
 * layout com a tarja "SEM VALOR FISCAL" — dá para validar o cupom antes da
 * chave chegar.
 *
 * FRONTEIRA DE SEGREDO intacta: só recebe campos não-secretos (emit, tpAmb,
 * tpEmis, dhEmi, chave, protocolo e a urlQrCode já hasheada pelo servidor).
 * Nunca toca em certificado nem CSC.
 *
 * @param {{
 *   estadoEmissao: 'emitindo'|'concluido',
 *   resultado: object|null,   // retorno de emitirDocumentoFiscal (Leva 7)
 *   venda: object,            // a venda finalizada (sale do PDV)
 *   onFechar: () => void,
 * }} props
 */
export default function ModalCupomNfce({ estadoEmissao, resultado, venda, onFechar }) {
  const status = resultado?.status ?? null;
  const temCupom = estadoEmissao === "concluido" && (status === "autorizada" || status === "sem_chave");

  // Monta a DANFE só quando há cupom a mostrar (autorizada/sem_chave). Reusa
  // montarVendaFiscal (mesmo mapeador da emissão) para itens/pagamentos.
  const danfe = useMemo(() => {
    if (!temCupom) return null;
    try {
      const { itens, pagamentos } = montarVendaFiscal(venda ?? {});
      return montarDanfeNfce({
        emit: resultado.emit ?? {},
        dest: venda?.dest ?? null,
        itens,
        pagamentos,
        chave: resultado.chave,
        protocolo: resultado.protocolo,
        urlQrCode: resultado.urlQrCode,
        tpAmb: resultado.tpAmb,
        tpEmis: resultado.tpEmis,
        dataEmissao: resultado.dhEmi,
      });
    } catch {
      // Venda sem itens/pagamentos válidos: não há cupom a montar — cai no
      // estado de mensagem (nunca quebra a modal nem a venda).
      return null;
    }
  }, [temCupom, resultado, venda]);

  const imprimir = () => window.print();

  return (
    <div
      className="modal-cupom-nfce__overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Cupom da NFC-e"
      onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}
    >
      <div className="modal-cupom-nfce">
        <header className="modal-cupom-nfce__cabecalho">
          <h2 className="modal-cupom-nfce__titulo">Nota Fiscal do Consumidor</h2>
          <button
            type="button"
            className="modal-cupom-nfce__fechar"
            onClick={onFechar}
            aria-label="Fechar cupom"
          >
            <LuX size={20} />
          </button>
        </header>

        <div className="modal-cupom-nfce__corpo">
          {estadoEmissao === "emitindo" && (
            <div className="modal-cupom-nfce__estado">
              <LuLoaderCircle size={40} className="modal-cupom-nfce__spinner" />
              <p className="modal-cupom-nfce__estado-texto">Emitindo NFC-e…</p>
              <p className="modal-cupom-nfce__estado-sub">
                A venda já foi concluída. A nota está sendo emitida.
              </p>
            </div>
          )}

          {estadoEmissao === "concluido" && danfe && (
            <CupomNfce danfe={danfe} />
          )}

          {/* Concluído sem cupom: rejeitada/erro (ou venda sem itens fiscais).
              Nunca tratamos como falha da VENDA — só da nota. */}
          {estadoEmissao === "concluido" && !danfe && (
            <div className="modal-cupom-nfce__estado modal-cupom-nfce__estado--aviso">
              <LuTriangleAlert size={40} />
              <p className="modal-cupom-nfce__estado-texto">A venda foi concluída.</p>
              <p className="modal-cupom-nfce__estado-sub">
                A nota não pôde ser emitida
                {resultado?.detalhe ? `: ${resultado.detalhe}` : "."}
              </p>
            </div>
          )}
        </div>

        <footer className="modal-cupom-nfce__rodape">
          {danfe && (
            <button
              type="button"
              className="modal-cupom-nfce__botao modal-cupom-nfce__botao--primario"
              onClick={imprimir}
            >
              <LuPrinter size={18} /> Imprimir
            </button>
          )}
          <button
            type="button"
            className="modal-cupom-nfce__botao"
            onClick={onFechar}
          >
            Fechar
          </button>
        </footer>
      </div>
    </div>
  );
}
