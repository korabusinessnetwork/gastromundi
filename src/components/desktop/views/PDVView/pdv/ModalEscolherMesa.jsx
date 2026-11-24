import { fecharAoClicarFora } from "@/lib/overlayFechar";
import { createPortal } from "react-dom";
import { fmtComanda } from "./apoio";

// Janela que pede a mesa antes de entrar na comanda.
export default function ModalEscolherMesa({ tela }) {
  const {
    setShowMesa, mesaInput, setMesaInput, apelidoInput, setApelidoInput, mesaPendingOrder, setMesaPendingOrder, salvandoMesa, handleConfirmarMesa,
  } = tela;
  return createPortal(
        <div
          {...fecharAoClicarFora(() => { handleConfirmarMesa(); })}
          className="pdv__mesa-overlay"
        >
          <div className="pdv__mesa-card">
            {/* Header */}
            <div className="pdv__mesa-header">
              <div className="pdv__modal-emoji-circulo pdv__mesa-emoji">
                🪑
              </div>
              <div>
                <div className="pdv__modal-titulo pdv__mesa-titulo">
                  {fmtComanda(mesaPendingOrder.comanda)}
                </div>
                <div className="pdv__transfer-info pdv__mesa-sub">
                  {mesaPendingOrder.mesa ? "Editar mesa e apelido" : "Informe a mesa antes de continuar"}
                </div>
              </div>
            </div>

            {/* Body */}
            <div className="pdv__mesa-body">

              {/* Mesa */}
              <div className="pdv__mesa-campo">
                <label className="pdv__modal-label">
                  Número ou nome da mesa <span className="pdv__modal-vermelho">*</span>
                </label>
                <input
                  autoFocus
                  type="text"
                  value={mesaInput}
                  onChange={e => setMesaInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleConfirmarMesa()}
                  placeholder="Ex: 5, Varanda, Salão 2..."
                  maxLength={40}
                  aria-invalid={!mesaInput.trim()}
                  className="pdv__modal-input pdv__mesa-input"
                />
                {!mesaInput.trim() && (
                  <div className="pdv__modal-erro">Campo obrigatório.</div>
                )}
              </div>

              {/* Apelido */}
              <div className="pdv__mesa-campo">
                <label className="pdv__modal-label">
                  Apelido do cliente <span className="pdv__mesa-label-opcional">(opcional)</span>
                </label>
                <input
                  type="text"
                  value={apelidoInput}
                  onChange={e => setApelidoInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleConfirmarMesa()}
                  placeholder="Ex: João, Família Silva..."
                  maxLength={40}
                  className="pdv__modal-input pdv__mesa-input"
                />
              </div>

              <div className="pdv__mesa-hint">
                Apelido é opcional. Pressione Enter ou clique em Entrar para continuar.
              </div>

              <div className="pdv__mesa-acoes">
                <button
                  onClick={() => { setShowMesa(false); setMesaPendingOrder(null); }}
                  className="pdv__modal-btn pdv__modal-btn--secundario pdv__mesa-btn-cancelar"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleConfirmarMesa}
                  disabled={salvandoMesa || !mesaInput.trim()}
                  className={`pdv__modal-btn pdv__modal-btn--primario pdv__mesa-btn-entrar${mesaInput.trim() ? " pdv__mesa-btn-entrar--ativo" : ""}${salvandoMesa ? " pdv__mesa-btn-entrar--salvando" : ""}`}
                >
                  {salvandoMesa ? "Entrando..." : "Entrar na comanda →"}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
  );
}
