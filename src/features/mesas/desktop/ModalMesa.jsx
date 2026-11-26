import { fecharAoClicarFora } from "@/lib/overlayFechar";
import { createPortal } from "react-dom";
import { LuX } from "react-icons/lu";

// Janela de criar ou editar uma mesa.
export default function ModalMesa({ tela }) {
  const {
    editando, form, setForm, formErro, setFormErro, salvando, fecharModal, salvar,
  } = tela;
  return createPortal(
        <div
          {...fecharAoClicarFora(fecharModal, !salvando)}
          className="mesas-admin__overlay"
        >
          <div className="mesas-admin__janela">
            {/* Título */}
            <div className="mesas-admin__janela-topo">
              <div className="mesas-admin__modal-titulo">
                {editando ? "Editar Mesa" : "Nova Mesa"}
              </div>
              <button
                onClick={fecharModal}
                disabled={salvando}
                className="mesas-admin__fechar"
                aria-label="Fechar"
              >
                <LuX size={20} />
              </button>
            </div>

            <div className="mesas-admin__campos">
              {/* Número / Nome */}
              <div>
                <div className="mesas-admin__campo-label">
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
                  aria-invalid={!!formErro && !form.numero.trim() && !editando}
                />
                {editando && (
                  <div className="mesas-admin__campo-ajuda">
                    O número é chave primária e não pode ser alterado.
                  </div>
                )}
              </div>

              {/* Capacidade */}
              <div>
                <div className="mesas-admin__campo-label">
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
                />
              </div>

              {formErro && (
                <div className="mesas-admin__erro-texto mesas-admin__erro mesas-admin__erro--janela" role="alert">
                  {formErro}
                </div>
              )}
            </div>

            {/* Botões */}
            <div className="mesas-admin__botoes">
              <button
                onClick={fecharModal}
                disabled={salvando}
                className="mesas-admin__modal-botao mesas-admin__modal-botao--cancelar"
              >
                Cancelar
              </button>
              <button
                onClick={salvar}
                disabled={((!form.numero.trim() && !editando)) || salvando}
                className="mesas-admin__modal-botao mesas-admin__modal-botao--confirmar"
              >
                {salvando ? "Salvando…" : editando ? "Salvar alterações" : "Criar mesa"}
              </button>
            </div>
          </div>
        </div>,
        document.body
  );
}
