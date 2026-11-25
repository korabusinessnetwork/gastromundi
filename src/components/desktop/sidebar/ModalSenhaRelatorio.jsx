import { fecharAoClicarFora } from "@/lib/overlayFechar";
import { createPortal } from "react-dom";
import { LuShieldAlert } from "react-icons/lu";

// Janela que pede a senha para o caixa abrir o relatório.
export default function ModalSenhaRelatorio({ tela }) {
  const {
    setShowAuthRel, authUser, setAuthUser, authPass, setAuthPass, authError, setAuthError, authLoading, handleAuthRelatorio,
  } = tela;
  return createPortal(
        <div
          {...fecharAoClicarFora(() => setShowAuthRel(false))}
          className="sidebar-janela__overlay sidebar-janela__overlay--escuro"
        >
          <div className="sidebar-janela sidebar-janela--senha">
            {/* Header */}
            <div className="sidebar-janela__topo">
              <div className="sidebar-janela__icone">
                <LuShieldAlert size={22} />
              </div>
              <div>
                <div className="sidebar__modal-titulo sidebar-janela__titulo">Acesso Restrito</div>
                <div className="sidebar__modal-subtitulo sidebar-janela__subtitulo">
                  Informe as credenciais de um administrador ou gerente
                </div>
              </div>
            </div>

            {/* Campos */}
            <div className="sidebar-janela__campos">
              <div>
                <div className="sidebar__form-label sidebar-janela__label">Usuário</div>
                <input
                  autoFocus
                  value={authUser}
                  onChange={e => { setAuthUser(e.target.value); setAuthError(""); }}
                  onKeyDown={e => e.key === "Enter" && document.getElementById("auth-rel-pass")?.focus()}
                  placeholder="nome de usuário"
                  autoComplete="off"
                  aria-invalid={!!authError}
                  className="sidebar__input sidebar-janela__input"
                />
              </div>
              <div>
                <div className="sidebar__form-label sidebar-janela__label">Senha</div>
                <input
                  id="auth-rel-pass"
                  type="password"
                  value={authPass}
                  onChange={e => { setAuthPass(e.target.value); setAuthError(""); }}
                  onKeyDown={e => e.key === "Enter" && handleAuthRelatorio()}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  aria-invalid={!!authError}
                  className="sidebar__input sidebar-janela__input"
                />
              </div>
              {authError && (
                <div role="alert" className="sidebar__alerta sidebar-janela__alerta">
                  {authError}
                </div>
              )}
            </div>

            {/* Botões */}
            <div className="sidebar-janela__botoes">
              <button
                onClick={() => setShowAuthRel(false)}
                className="sidebar__modal-btn sidebar-janela__btn sidebar-janela__btn--cancelar"
              >
                Cancelar
              </button>
              <button
                onClick={handleAuthRelatorio}
                disabled={!authUser.trim() || !authPass || authLoading}
                className="sidebar__modal-btn sidebar-janela__btn sidebar-janela__btn--confirmar"
              >
                {authLoading ? "Verificando..." : "Acessar Relatório"}
              </button>
            </div>
          </div>
        </div>,
        document.body
  );
}
