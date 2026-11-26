import { fecharAoClicarFora } from "@/lib/overlayFechar";
import { useState } from "react";
import { LuLandmark } from "react-icons/lu";
import "./AberturaCaixaModal.css";

export default function AberturaCaixaModal({ onConfirm, onClose }) {
  const [fundo,     setFundo]     = useState("");
  const [salvando,  setSalvando]  = useState(false);

  const valor = parseFloat(fundo.replace(",", ".")) || 0;
  const pode  = valor >= 0 && fundo !== "";

  const handleConfirm = async () => {
    if (!pode || salvando) return;
    setSalvando(true);
    try {
      await onConfirm(valor);
    } finally {
      // Quem chama mantém o modal aberto quando a gravação falha, para o
      // operador saber que o caixa NÃO abriu. Sem liberar o botão aqui, o
      // "tente novamente" do aviso era impossível: travava em "Abrindo..."
      // e só saía fechando o modal e começando de novo.
      setSalvando(false);
    }
  };

  return (
    <div {...fecharAoClicarFora(onClose)} className="abertura-caixa__overlay">
      <div className="abertura-caixa">
        {/* Header */}
        <div className="abertura-caixa__topo">
          <div className="abertura-caixa__icone-header">
            <LuLandmark size={22} aria-hidden="true" />
          </div>
          <div>
            <div className="abertura-caixa__titulo">Abrir Caixa</div>
            <div className="abertura-caixa__subtitulo">
              Informe o fundo de caixa inicial
            </div>
          </div>
        </div>

        {/* Campo fundo */}
        <div>
          <div className="abertura-caixa__label">
            Fundo de Caixa (R$)
          </div>
          <div className="abertura-caixa__campo">
            <span className="abertura-caixa__simbolo-moeda">
              R$
            </span>
            <input
              className="abertura-caixa__input"
              autoFocus
              type="number"
              min="0"
              step="0.01"
              value={fundo}
              onChange={e => setFundo(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleConfirm()}
              placeholder="0,00"
            />
          </div>
          <div className="abertura-caixa__ajuda">
            Digite 0 se não houver fundo inicial.
          </div>
        </div>

        {/* Botões */}
        <div className="abertura-caixa__botoes">
          <button
            className="abertura-caixa__botao-cancelar"
            onClick={onClose}
          >
            Cancelar
          </button>
          {/* Verde assim que há um valor válido; enquanto grava continua verde
              (travado), para não parecer que o valor ficou inválido. */}
          <button
            className={`abertura-caixa__botao-confirmar${pode ? " abertura-caixa__botao-confirmar--pronto" : ""}`}
            onClick={handleConfirm}
            disabled={!pode || salvando}
          >
            {salvando ? "Abrindo..." : "✓ Abrir Caixa"}
          </button>
        </div>
      </div>
    </div>
  );
}
