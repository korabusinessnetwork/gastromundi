import { fecharAoClicarFora } from "@/lib/overlayFechar";
import { createPortal } from "react-dom";
import C from "@/constants/colors";
import { alfa } from "@/constants/colorAlfa";
import { varColor } from "@/lib/tema";
import { LuX } from "react-icons/lu";

// Janela de criar ou editar uma mesa.
export default function ModalMesa({ tela }) {
  const {
    editando, form, setForm, formErro, setFormErro, salvando, fecharModal, salvar,
  } = tela;
  return createPortal(
        <div
          {...fecharAoClicarFora(fecharModal, !salvando)}
          style={{
            position: "fixed", inset: 0, zIndex: 9000,
            background: "rgba(0,0,0,0.72)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 24, fontFamily: "'Inter',system-ui,sans-serif",
          }}
        >
          <div style={{
            background: varColor(C.card), borderRadius: 20, width: "100%", maxWidth: 420,
            border: `1px solid var(${C.border})`,
            boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
            display: "flex", flexDirection: "column", gap: 20, padding: 28,
          }}>
            {/* Título */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div className="mesas-admin__modal-titulo" style={{ fontWeight: 800, color: varColor(C.text) }}>
                {editando ? "Editar Mesa" : "Nova Mesa"}
              </div>
              <button
                onClick={fecharModal}
                disabled={salvando}
                style={{ background: "none", border: "none", color: varColor(C.muted), cursor: "pointer", padding: 4, lineHeight: 0 }}
              >
                <LuX size={20} />
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {/* Número / Nome */}
              <div>
                <div className="mesas-admin__campo-label" style={{ fontWeight: 700, color: varColor(C.muted), textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>
                  Número / Nome *
                </div>
                <input
                  autoFocus={!editando}
                  value={form.numero}
                  onChange={e => { setForm(f => ({ ...f, numero: e.target.value })); setFormErro(""); }}
                  onKeyDown={e => e.key === "Enter" && salvar()}
                  disabled={!!editando}
                  placeholder="Ex: 1, 2, Varanda A…"
                  maxLength={20}
                  className="mesas-admin__campo-input"
                  style={{
                    width: "100%", padding: "12px 14px", borderRadius: 10,
                    border: `1.5px solid ${formErro && !form.numero.trim() && !editando ? alfa(C.red, "88") : "var(--gm-input-border)"}`,
                    background: "var(--gm-input-bg)", color: varColor(C.text),
                    fontFamily: "inherit", outline: "none",
                    boxSizing: "border-box", opacity: editando ? 0.55 : 1,
                  }}
                />
                {editando && (
                  <div className="mesas-admin__campo-ajuda" style={{ color: varColor(C.muted), marginTop: 4 }}>
                    O número é chave primária e não pode ser alterado.
                  </div>
                )}
              </div>

              {/* Capacidade */}
              <div>
                <div className="mesas-admin__campo-label" style={{ fontWeight: 700, color: varColor(C.muted), textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>
                  Capacidade (pessoas)
                </div>
                <input
                  autoFocus={!!editando}
                  type="number"
                  min="1"
                  max="50"
                  value={form.capacidade}
                  onChange={e => setForm(f => ({ ...f, capacidade: e.target.value }))}
                  onKeyDown={e => e.key === "Enter" && salvar()}
                  className="mesas-admin__campo-input"
                  style={{
                    width: "100%", padding: "12px 14px", borderRadius: 10,
                    border: "1.5px solid var(--gm-input-border)",
                    background: "var(--gm-input-bg)", color: varColor(C.text),
                    fontFamily: "inherit", outline: "none",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              {formErro && (
                <div className="mesas-admin__erro-texto" style={{
                  padding: "8px 12px", borderRadius: 8,
                  background: `${alfa(C.red, "12")}`, border: `1px solid ${alfa(C.red, "33")}`,
                  color: varColor(C.red),
                }}>
                  {formErro}
                </div>
              )}
            </div>

            {/* Botões */}
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={fecharModal}
                disabled={salvando}
                className="mesas-admin__modal-botao"
                style={{
                  flex: 1, padding: 12, borderRadius: 10,
                  border: `1px solid var(${C.border})`, background: "none",
                  color: varColor(C.muted), cursor: salvando ? "not-allowed" : "pointer",
                  fontWeight: 600, fontFamily: "inherit",
                }}
              >
                Cancelar
              </button>
              <button
                onClick={salvar}
                disabled={((!form.numero.trim() && !editando)) || salvando}
                className="mesas-admin__modal-botao"
                style={{
                  flex: 2, padding: 12, borderRadius: 10, border: "none",
                  background: (form.numero.trim() || editando) && !salvando ? varColor(C.accent) : varColor(C.surface),
                  color: (form.numero.trim() || editando) && !salvando ? "#fff" : varColor(C.muted),
                  cursor: (form.numero.trim() || editando) && !salvando ? "pointer" : "not-allowed",
                  fontWeight: 700, fontFamily: "inherit",
                  transition: "background 0.15s",
                }}
              >
                {salvando ? "Salvando…" : editando ? "Salvar alterações" : "Criar mesa"}
              </button>
            </div>
          </div>
        </div>,
        document.body
  );
}
