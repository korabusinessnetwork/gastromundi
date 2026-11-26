import { fecharAoClicarFora } from "@/lib/overlayFechar";
import { createPortal } from "react-dom";
import {
  LuLock, LuLockOpen, LuEye, LuEyeOff, LuKeyRound
} from "react-icons/lu";

// Janela que pede a senha para liberar a entrada no estoque.
export default function PopupAutorizacaoEstoque({ tela }) {
  const {
    setShowAuth, senha, setSenha, senhaErro, setSenhaErro, senhaVis, setSenhaVis, verificando, confirmarSenha,
  } = tela;
  return createPortal(
        <div
          {...fecharAoClicarFora(() => setShowAuth(false))}
          className="estoque-view__auth-overlay"
        >
          <div className="estoque-view__auth-modal">
            {/* Título */}
            <div className="estoque-view__auth-topo">
              <div className="estoque-view__auth-icone">
                <LuKeyRound size={22} />
              </div>
              <div>
                <div className="estoque-view__auth-titulo">Liberar Entrada de Estoque</div>
                <div className="estoque-view__auth-ajuda">Requer senha de administrador ou gerente</div>
              </div>
            </div>

            {/* Campo de senha */}
            <div className="estoque-view__campo">
              <label className="estoque-view__label">
                <LuLock size={12} /> Senha
              </label>
              <div className="estoque-view__senha-wrap">
                <input
                  autoFocus
                  type={senhaVis ? "text" : "password"}
                  value={senha}
                  onChange={e => { setSenha(e.target.value); setSenhaErro(""); }}
                  onKeyDown={e => { if (e.key === "Enter") confirmarSenha(); }}
                  placeholder="Digite a senha..."
                  className="estoque-view__senha-input"
                  aria-invalid={!!senhaErro}
                />
                <button
                  type="button"
                  onClick={() => setSenhaVis(v => !v)}
                  className="estoque-view__senha-olho"
                >
                  {senhaVis ? <LuEyeOff size={16} /> : <LuEye size={16} />}
                </button>
              </div>
              {senhaErro && (
                <div role="alert" className="estoque-view__auth-erro">
                  {senhaErro}
                </div>
              )}
            </div>

            {/* Botões */}
            <div className="estoque-view__auth-botoes">
              <button
                onClick={() => setShowAuth(false)}
                className="estoque-view__auth-cancelar"
              >
                Cancelar
              </button>
              <button
                onClick={confirmarSenha}
                disabled={!senha || verificando}
                className="estoque-view__auth-confirmar"
              >
                <LuLockOpen size={15} />
                {verificando ? "Verificando..." : "Liberar"}
              </button>
            </div>
          </div>
        </div>,
        document.body
  );
}
