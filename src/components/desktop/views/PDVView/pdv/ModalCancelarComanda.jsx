import { fecharAoClicarFora } from "@/lib/overlayFechar";
import { createPortal } from "react-dom";
import { LuX, LuEye, LuEyeOff } from "react-icons/lu";
import { verificarSenhaAdmin } from "@/lib/adminAuth";
import { fmtComanda } from "@/lib/rotuloComanda";
import { itensNaoCancelados } from "@/lib/comandaItens";

// Janela de cancelar a comanda inteira, com motivo e senha de gerente.
export default function ModalCancelarComanda({ tela }) {
  const {
    setMode, selected, setSelected, cancelarComanda, setShowCancelarComanda, cancelarSenha,
    setCancelarSenha, cancelarSenhaErro, setCancelarSenhaErro, cancelarSenhaVis,
    setCancelarSenhaVis, cancelarAutorizado, setCancelarAutorizado, cancelarMotivo,
    setCancelarMotivo, cancelandoComanda, setCancelandoComanda, notify,
  } = tela;
  return createPortal(
        <div
          {...fecharAoClicarFora(() => setShowCancelarComanda(false))}
          className="pdv__cancelar-overlay"
        >
          <div className="pdv__cancelar-card">
            {/* Header */}
            <div className="pdv__cancelar-header">
              <div>
                <div className="pdv__modal-titulo pdv__cancelar-titulo">Cancelar Comanda</div>
                <div className="pdv__modal-subtitulo pdv__cancelar-subtitulo">{fmtComanda(selected?.comanda)}</div>
              </div>
              <button onClick={() => setShowCancelarComanda(false)} className="pdv__modal-icone-btn pdv__cancelar-close-btn">
                <LuX size={20} />
              </button>
            </div>

            <div className="pdv__cancelar-body">
              {!cancelarAutorizado ? (
                <>
                  <div className="pdv__modal-desc">
                    Esta ação cancelará <strong className="pdv__modal-forte">todos os itens</strong> da comanda. Digite a senha de administrador ou gerente para continuar.
                  </div>
                  <div className="pdv__cancelar-senha-wrap">
                    <input
                      autoFocus
                      type={cancelarSenhaVis ? "text" : "password"}
                      value={cancelarSenha}
                      onChange={e => { setCancelarSenha(e.target.value); setCancelarSenhaErro(""); }}
                      onKeyDown={async e => {
                        if (e.key === "Enter") {
                          const { ok, erro } = await verificarSenhaAdmin(cancelarSenha);
                          if (ok) { setCancelarAutorizado(true); setCancelarSenhaErro(""); }
                          else setCancelarSenhaErro(erro || "Senha incorreta.");
                        }
                      }}
                      placeholder="Senha de admin ou gerente"
                      aria-invalid={!!cancelarSenhaErro}
                      className="pdv__modal-input pdv__cancelar-input"
                    />
                    <button
                      onClick={() => setCancelarSenhaVis(v => !v)}
                      className="pdv__modal-icone-btn pdv__cancelar-olho-btn"
                    >
                      {cancelarSenhaVis ? <LuEyeOff size={18} /> : <LuEye size={18} />}
                    </button>
                  </div>
                  {cancelarSenhaErro && <div role="alert" className="pdv__modal-erro">{cancelarSenhaErro}</div>}
                  <button
                    onClick={async () => {
                      const { ok, erro } = await verificarSenhaAdmin(cancelarSenha);
                      if (ok) { setCancelarAutorizado(true); setCancelarSenhaErro(""); }
                      else setCancelarSenhaErro(erro || "Senha incorreta.");
                    }}
                    disabled={!cancelarSenha}
                    className="pdv__modal-btn pdv__modal-btn--primario pdv__cancelar-btn-verificar"
                  >
                    Verificar Senha
                  </button>
                </>
              ) : (
                <>
                  <div className="pdv__modal-desc">
                    Motivo do cancelamento <span className="pdv__modal-vermelho">*</span>
                  </div>
                  <input
                    autoFocus
                    type="text"
                    value={cancelarMotivo}
                    onChange={e => setCancelarMotivo(e.target.value)}
                    placeholder="Ex: cliente desistiu, erro no pedido..."
                    maxLength={120}
                    className={`pdv__modal-input pdv__cancelar-motivo-input${cancelarMotivo.trim() ? " pdv__cancelar-motivo-input--preenchido" : ""}`}
                  />
                  <div className="pdv__modal-aviso pdv__cancelar-aviso">
                    ⚠️ {itensNaoCancelados(selected?.items).length} item(ns) serão cancelados e enviados para o relatório.
                  </div>
                  <button
                    onClick={async () => {
                      if (cancelandoComanda) return;
                      setCancelandoComanda(true);
                      try {
                        await cancelarComanda(selected, cancelarMotivo);
                        setShowCancelarComanda(false);
                        setSelected(null);
                        setMode("grid");
                      } catch (err) {
                        notify?.(err?.message || "Não foi possível cancelar a comanda. Tente novamente.", "err");
                      } finally {
                        setCancelandoComanda(false);
                      }
                    }}
                    disabled={cancelandoComanda || !cancelarMotivo.trim()}
                    className={`pdv__modal-btn pdv__modal-btn--primario pdv__cancelar-btn-confirmar${cancelarMotivo.trim() ? " pdv__cancelar-btn-confirmar--preenchido" : ""}`}
                  >
                    {cancelandoComanda ? "Cancelando..." : "✕ Confirmar Cancelamento"}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>,
        document.body
  );
}
