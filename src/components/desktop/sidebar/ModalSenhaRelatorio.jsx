import { fecharAoClicarFora } from "@/lib/overlayFechar";
import { createPortal } from "react-dom";
import C from "@/constants/colors";
import { alfa } from "@/constants/colorAlfa";
import { varColor } from "@/lib/tema";
import {
  LuShieldAlert
} from "react-icons/lu";

// Janela que pede a senha para o caixa abrir o relatório.
export default function ModalSenhaRelatorio({ tela }) {
  const {
    setShowAuthRel, authUser, setAuthUser, authPass, setAuthPass, authError, setAuthError, authLoading, handleAuthRelatorio,
  } = tela;
  return createPortal(
        <div
          {...fecharAoClicarFora(() => setShowAuthRel(false))}
          style={{
            position: "fixed", inset: 0, zIndex: 9100,
            background: "rgba(0,0,0,0.75)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: "'Inter',system-ui,sans-serif",
          }}
        >
          <div style={{
            background: varColor(C.card), borderRadius: 20, padding: 32,
            width: "90%", maxWidth: 400, border: `1px solid var(${C.border})`,
            display: "flex", flexDirection: "column", gap: 20,
            boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
          }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{
                width: 48, height: 48, borderRadius: 14, flexShrink: 0,
                background: `${alfa(C.accent, "18")}`, border: `1.5px solid ${alfa(C.accent, "44")}`,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <LuShieldAlert size={22} color={varColor(C.accent)} />
              </div>
              <div>
                <div className="sidebar__modal-titulo" style={{ fontWeight: 800 }}>Acesso Restrito</div>
                <div className="sidebar__modal-subtitulo" style={{ color: varColor(C.muted), marginTop: 2 }}>
                  Informe as credenciais de um administrador ou gerente
                </div>
              </div>
            </div>

            {/* Campos */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <div className="sidebar__form-label" style={{ fontWeight: 700, color: varColor(C.muted), textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Usuário</div>
                <input
                  autoFocus
                  value={authUser}
                  onChange={e => { setAuthUser(e.target.value); setAuthError(""); }}
                  onKeyDown={e => e.key === "Enter" && document.getElementById("auth-rel-pass")?.focus()}
                  placeholder="nome de usuário"
                  autoComplete="off"
                  className="sidebar__input"
                  style={{
                    width: "100%", padding: "12px 14px", borderRadius: 10,
                    border: `1.5px solid ${authError ? alfa(C.red, "88") : "var(--gm-input-border)"}`,
                    background: "var(--gm-input-bg)", color: varColor(C.text),
                    fontFamily: "inherit", outline: "none", boxSizing: "border-box",
                  }}
                />
              </div>
              <div>
                <div className="sidebar__form-label" style={{ fontWeight: 700, color: varColor(C.muted), textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Senha</div>
                <input
                  id="auth-rel-pass"
                  type="password"
                  value={authPass}
                  onChange={e => { setAuthPass(e.target.value); setAuthError(""); }}
                  onKeyDown={e => e.key === "Enter" && handleAuthRelatorio()}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="sidebar__input"
                  style={{
                    width: "100%", padding: "12px 14px", borderRadius: 10,
                    border: `1.5px solid ${authError ? alfa(C.red, "88") : "var(--gm-input-border)"}`,
                    background: "var(--gm-input-bg)", color: varColor(C.text),
                    fontFamily: "inherit", outline: "none", boxSizing: "border-box",
                  }}
                />
              </div>
              {authError && (
                <div className="sidebar__alerta" style={{ color: varColor(C.red), fontWeight: 600, padding: "8px 12px", background: `${alfa(C.red, "12")}`, borderRadius: 8, border: `1px solid ${alfa(C.red, "33")}` }}>
                  {authError}
                </div>
              )}
            </div>

            {/* Botões */}
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => setShowAuthRel(false)}
                className="sidebar__modal-btn"
                style={{
                  flex: 1, padding: 12, borderRadius: 10,
                  border: `1px solid var(${C.border})`, background: "none",
                  color: varColor(C.muted), cursor: "pointer", fontWeight: 600,
                  fontFamily: "inherit",
                }}
              >
                Cancelar
              </button>
              <button
                onClick={handleAuthRelatorio}
                disabled={!authUser.trim() || !authPass || authLoading}
                className="sidebar__modal-btn"
                style={{
                  flex: 2, padding: 12, borderRadius: 10, border: "none",
                  background: authUser.trim() && authPass && !authLoading ? varColor(C.accent) : varColor(C.surface),
                  color: authUser.trim() && authPass && !authLoading ? "#fff" : varColor(C.muted),
                  cursor: authUser.trim() && authPass && !authLoading ? "pointer" : "not-allowed",
                  fontWeight: 700, fontFamily: "inherit",
                  transition: "background 0.15s",
                }}
              >
                {authLoading ? "Verificando..." : "Acessar Relatório"}
              </button>
            </div>
          </div>
        </div>,
        document.body
  );
}
