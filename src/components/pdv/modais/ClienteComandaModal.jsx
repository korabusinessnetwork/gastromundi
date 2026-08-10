import { createPortal } from "react-dom";
import { LuUser } from "react-icons/lu";
import { fecharAoClicarFora } from "@/lib/comum/overlayFechar";
import ClienteFiadoSelector from "../campos/ClienteFiadoSelector";
import "./ClienteComandaModal.css";

/**
 * Modal "Cliente na comanda" — vincula (ou desvincula) um cliente
 * cadastrado a uma comanda direto no PDV, ao lado do botão de mesa.
 *
 * Intuitividade (princípio nº 1):
 * - Reúsa o MESMO seletor de cliente do fiado (busca + cadastro rápido),
 *   então o operador já conhece o fluxo — nada novo pra aprender.
 * - Vincular é opcional: dá pra confirmar sem cliente (fica desvinculada)
 *   ou remover o cliente pelo "x" do seletor.
 * - O vínculo viaja no checkout: identifica a venda no histórico do cliente,
 *   pré-satisfaz o fiado e pré-preenche o CPF na nota.
 *
 * Não persiste nada: monta a escolha e devolve via onConfirmar; quem chama
 * (PDVView) grava em `pending` (updatePending) e trata a trava de edição.
 */
export default function ClienteComandaModal({
  comanda,
  clienteSel,
  onSelecionar,
  onConfirmar,
  onCancelar,
  salvando = false,
  usuario,
}) {
  const nomeComanda = (() => {
    const nome = String(comanda?.comanda ?? "").trim();
    return /^\d+$/.test(nome) ? `Comanda ${nome}` : nome;
  })();

  return createPortal(
    <div {...fecharAoClicarFora(onCancelar)} className="cliente-comanda__overlay">
      <div className="cliente-comanda__modal" role="dialog" aria-modal="true" aria-label="Vincular cliente à comanda">
        <div className="cliente-comanda__header">
          <div className="cliente-comanda__emoji" aria-hidden="true">
            <LuUser size={20} />
          </div>
          <div>
            <div className="cliente-comanda__titulo">{nomeComanda || "Cliente da comanda"}</div>
            <div className="cliente-comanda__subtitulo">
              {clienteSel ? "Cliente vinculado a esta comanda" : "Vincule um cliente a esta comanda"}
            </div>
          </div>
        </div>

        <div className="cliente-comanda__corpo">
          <ClienteFiadoSelector
            cliente={clienteSel}
            onSelecionar={onSelecionar}
            usuario={usuario}
            placeholder="Busque por nome ou telefone"
          />
          <div className="cliente-comanda__dica">
            O cliente vinculado é usado no fechamento — histórico de compras, fiado e CPF na nota.
          </div>
        </div>

        <div className="cliente-comanda__acoes">
          <button type="button" onClick={onCancelar} className="cliente-comanda__btn-cancelar">
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirmar}
            disabled={salvando}
            className="cliente-comanda__btn-confirmar"
          >
            {salvando ? "Salvando..." : clienteSel ? "Vincular cliente" : "Salvar sem cliente"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
