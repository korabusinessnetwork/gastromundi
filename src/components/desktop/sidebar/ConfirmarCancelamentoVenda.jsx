import { fecharAoClicarFora } from "@/lib/overlayFechar";
import { createPortal } from "react-dom";
import { LuLock, LuTrash2 } from "react-icons/lu";

// Confirmação do cancelamento de uma venda fechada, com motivo e senha.
export default function ConfirmarCancelamentoVenda({ tela }) {
  const {
    cancelVenda, setCancelVenda, cancelMotivo, setCancelMotivo, cancelSenha, setCancelSenha, cancelSenhaErro, setCancelSenhaErro, cancelErro, cancelando, confirmarCancelamento,
  } = tela;
  return createPortal(
        <div
          {...fecharAoClicarFora(() => setCancelVenda(null), !cancelando)}
          className="sidebar-janela__overlay sidebar-janela__overlay--margem"
        >
          <div className="sidebar-janela sidebar-janela--cancelar-venda">
            <div>
              <div className="sidebar__modal-titulo sidebar-janela__titulo sidebar-janela__titulo--perigo">
                <LuTrash2 size={18} /> Cancelar venda
              </div>
              <div className="sidebar__modal-subtitulo sidebar-janela__subtitulo sidebar-janela__subtitulo--afastado">
                {(/^\d+$/.test(String(cancelVenda.comanda ?? "").trim()) ? `Comanda ${cancelVenda.comanda}` : cancelVenda.comanda) || `#${String(cancelVenda.id).slice(-6).toUpperCase()}`}
                {" · "}R$ {Number(cancelVenda.total ?? 0).toFixed(2)}
              </div>
              <div className="sidebar__aviso-irreversivel sidebar-janela__aviso">
                A venda sai do saldo do dia, dos relatórios e do financeiro. Essa ação não pode ser desfeita.
              </div>
            </div>

            <div>
              <div className="sidebar__form-label sidebar-janela__label">Motivo (obrigatório)</div>
              <textarea
                value={cancelMotivo}
                onChange={e => setCancelMotivo(e.target.value)}
                placeholder="Ex: cobrança duplicada, pagamento não confirmado..."
                maxLength={200}
                rows={2}
                className="sidebar__input sidebar-janela__input sidebar-janela__input--motivo"
              />
            </div>

            <div>
              <div className="sidebar__form-label sidebar-janela__label sidebar-janela__label--icone">
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
                aria-invalid={!!cancelSenhaErro}
                className="sidebar__input sidebar-janela__input sidebar-janela__input--senha-gerente"
              />
              {cancelSenhaErro && (
                <div role="alert" className="sidebar__campo-erro sidebar-janela__campo-erro">
                  {cancelSenhaErro}
                </div>
              )}
            </div>

            {cancelErro && (
              <div role="alert" className="sidebar__erro-generico sidebar-janela__erro">{cancelErro}</div>
            )}

            <div className="sidebar-janela__botoes">
              <button
                onClick={() => { if (!cancelando) setCancelVenda(null); }}
                disabled={cancelando}
                className="sidebar__modal-btn sidebar-janela__btn sidebar-janela__btn--voltar"
              >
                Voltar
              </button>
              <button
                onClick={confirmarCancelamento}
                disabled={cancelando || !cancelMotivo.trim() || !cancelSenha.trim()}
                className={`sidebar__modal-btn sidebar-janela__btn sidebar-janela__btn--perigo${(!cancelMotivo.trim() || !cancelSenha.trim()) ? " sidebar-janela__btn--incompleto" : ""}`}
              >
                {cancelando ? "Cancelando..." : "Cancelar venda"}
              </button>
            </div>
          </div>
        </div>,
        document.body
  );
}
