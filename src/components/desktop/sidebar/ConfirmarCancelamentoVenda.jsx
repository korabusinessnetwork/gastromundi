import { fecharAoClicarFora } from "@/lib/overlayFechar";
import { createPortal } from "react-dom";
import C from "@/constants/colors";
import { varColor } from "@/lib/tema";
import {
  LuLock, LuTrash2
} from "react-icons/lu";

// Confirmação do cancelamento de uma venda fechada, com motivo e senha.
export default function ConfirmarCancelamentoVenda({ tela }) {
  const {
    cancelVenda, setCancelVenda, cancelMotivo, setCancelMotivo, cancelSenha, setCancelSenha, cancelSenhaErro, setCancelSenhaErro, cancelErro, cancelando, confirmarCancelamento,
  } = tela;
  return createPortal(
        <div
          {...fecharAoClicarFora(() => setCancelVenda(null), !cancelando)}
          style={{
            position: "fixed", inset: 0, zIndex: 9100,
            background: "rgba(0,0,0,0.7)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 24, fontFamily: "'Inter',system-ui,sans-serif",
          }}
        >
          <div style={{
            background: varColor(C.card), borderRadius: 20, width: "100%", maxWidth: 440,
            border: `1px solid var(${C.border})`, boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
            color: varColor(C.text), padding: 24, display: "flex", flexDirection: "column", gap: 14,
          }}>
            <div>
              <div className="sidebar__modal-titulo" style={{ fontWeight: 900, color: varColor(C.red), display: "flex", alignItems: "center", gap: 8 }}>
                <LuTrash2 size={18} /> Cancelar venda
              </div>
              <div className="sidebar__modal-subtitulo" style={{ color: varColor(C.muted), marginTop: 4 }}>
                {(/^\d+$/.test(String(cancelVenda.comanda ?? "").trim()) ? `Comanda ${cancelVenda.comanda}` : cancelVenda.comanda) || `#${String(cancelVenda.id).slice(-6).toUpperCase()}`}
                {" · "}R$ {Number(cancelVenda.total ?? 0).toFixed(2)}
              </div>
              <div className="sidebar__aviso-irreversivel" style={{ color: varColor(C.muted), marginTop: 8 }}>
                A venda sai do saldo do dia, dos relatórios e do financeiro. Essa ação não pode ser desfeita.
              </div>
            </div>

            <div>
              <div className="sidebar__form-label" style={{ fontWeight: 700, color: varColor(C.muted), textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Motivo (obrigatório)</div>
              <textarea
                value={cancelMotivo}
                onChange={e => setCancelMotivo(e.target.value)}
                placeholder="Ex: cobrança duplicada, pagamento não confirmado..."
                maxLength={200}
                rows={2}
                className="sidebar__input"
                style={{
                  width: "100%", boxSizing: "border-box", resize: "none",
                  background: "var(--gm-input-bg)", border: "1px solid var(--gm-input-border)",
                  borderRadius: 10, padding: "10px 12px", color: varColor(C.text),
                  fontFamily: "inherit",
                }}
              />
            </div>

            <div>
              <div className="sidebar__form-label" style={{ fontWeight: 700, color: varColor(C.muted), textTransform: "uppercase", letterSpacing: 1, marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
                <LuLock size={12} /> Senha de gerente ou admin
              </div>
              <input
                type="password"
                value={cancelSenha}
                onChange={e => { setCancelSenha(e.target.value); setCancelSenhaErro(""); }}
                onKeyDown={e => { if (e.key === "Enter") confirmarCancelamento(); }}
                placeholder="Senha"
                // Autorização de gerente — nunca o login de quem está no
                // terminal. Sem isto o navegador autopreenchia a senha
                // salva do usuário logado e o cancelamento saía autorizado
                // sem gerente nenhum (PDV é terminal compartilhado).
                name="autorizacao-gerente"
                autoComplete="new-password"
                data-1p-ignore
                data-lpignore="true"
                className="sidebar__input"
                style={{
                  width: "100%", boxSizing: "border-box",
                  background: "var(--gm-input-bg)",
                  border: `1.5px solid ${cancelSenhaErro ? varColor(C.red) : "var(--gm-input-border)"}`,
                  borderRadius: 10, padding: "10px 12px", color: varColor(C.text),
                }}
              />
              {cancelSenhaErro && (
                <div role="alert" className="sidebar__campo-erro" style={{ color: varColor(C.red), marginTop: 6, fontWeight: 600 }}>
                  {cancelSenhaErro}
                </div>
              )}
            </div>

            {cancelErro && (
              <div role="alert" className="sidebar__erro-generico" style={{ color: varColor(C.red), fontWeight: 600 }}>{cancelErro}</div>
            )}

            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => { if (!cancelando) setCancelVenda(null); }}
                disabled={cancelando}
                className="sidebar__modal-btn"
                style={{
                  flex: 1, padding: "12px 0", borderRadius: 10, cursor: cancelando ? "default" : "pointer",
                  background: varColor(C.surface), border: `1px solid var(${C.border})`,
                  color: varColor(C.text), fontWeight: 700, opacity: cancelando ? 0.6 : 1,
                }}
              >
                Voltar
              </button>
              <button
                onClick={confirmarCancelamento}
                disabled={cancelando || !cancelMotivo.trim() || !cancelSenha.trim()}
                className="sidebar__modal-btn"
                style={{
                  flex: 2, padding: "12px 0", borderRadius: 10,
                  cursor: (cancelando || !cancelMotivo.trim() || !cancelSenha.trim()) ? "default" : "pointer",
                  background: (!cancelMotivo.trim() || !cancelSenha.trim()) ? varColor(C.surface) : varColor(C.red),
                  border: `1px solid ${(!cancelMotivo.trim() || !cancelSenha.trim()) ? `var(${C.border})` : varColor(C.red)}`,
                  color: (!cancelMotivo.trim() || !cancelSenha.trim()) ? varColor(C.muted) : "#fff",
                  fontWeight: 800,
                }}
              >
                {cancelando ? "Cancelando..." : "Cancelar venda"}
              </button>
            </div>
          </div>
        </div>,
        document.body
  );
}
