import { fecharAoClicarFora } from "@/lib/overlayFechar";
import { LuX, LuMinus, LuPlus, LuLock, LuEye, LuEyeOff } from "react-icons/lu";
import { createPortal } from "react-dom";
// TD015: no split, cada entrada de pagamento é adicionada e removida do meio da
// lista, e cada uma carrega estado próprio de tela (o método selecionado, o campo de
// valor com foco). A chave não pode ser a posição. O `uid` vive só no state daqui:
// `buildPayloadPagamentos` e `buildPrintPagamentos` montam campo a campo, então ele
// não chega à venda nem ao cupom.

// Janela de remover um item na finalização.
export default function PopupRemocao({ tela }) {
  const {
    remocao, setRemocao, remSenha, setRemSenha, remSenhaErro, setRemSenhaErro, remSenhaVis,
    setRemSenhaVis, remErro, removendo, sz, confirmarRemocao,
  } = tela;
  return createPortal(
        <div
          {...fecharAoClicarFora(() => setRemocao(null), !removendo)}
          className="checkout-view__overlay"
        >
          <div className="checkout-view__modal pag-janela" style={{
            "--pag-pad": `${sz.pad}px`, "--pag-pad-sm": `${sz.padSm}px`, "--pag-gap": `${sz.gap}px`,
          }}>
            <div className="checkout-view__modal-header pag-janela__topo">
              <div>
                <div className="checkout-view__modal-titulo remocao__titulo">Remover produto</div>
                <div className="checkout-view__modal-subtitulo pag-janela__subtitulo">
                  {remocao.item.name} · R$ {Number(remocao.item.price).toFixed(2)}
                </div>
              </div>
              <button onClick={() => { if (!removendo) setRemocao(null); }} className="checkout-view__modal-fechar pag-janela__fechar">
                <LuX size={sz.fontLg} />
              </button>
            </div>

            <div className="pag-janela__corpo">

              {/* Quantidade (só quando há mais de 1) */}
              {remocao.qtyMax > 1 && (
                <div>
                  <div className="checkout-view__modal-input-label pag-janela__rotulo">
                    Quantidade a remover
                  </div>
                  <div className="checkout-view__remocao-stepper">
                    <button
                      onClick={() => setRemocao(r => ({ ...r, qtySel: Math.max(1, r.qtySel - 1) }))}
                      className={`checkout-view__stepper-btn remocao__passo${remocao.qtySel <= 1 ? " checkout-view__stepper-btn--limite" : ""}`}
                    ><LuMinus size={16} /></button>
                    <input
                      type="number" min="1" max={remocao.qtyMax}
                      value={remocao.qtySel}
                      onChange={e => {
                        const v = parseInt(e.target.value, 10);
                        setRemocao(r => ({ ...r, qtySel: Math.min(r.qtyMax, Math.max(1, isNaN(v) ? 1 : v)) }));
                      }}
                      className="checkout-view__remocao-qty-input remocao__campo"
                    />
                    <button
                      onClick={() => setRemocao(r => ({ ...r, qtySel: Math.min(r.qtyMax, r.qtySel + 1) }))}
                      className={`checkout-view__stepper-btn remocao__passo${remocao.qtySel >= remocao.qtyMax ? " checkout-view__stepper-btn--limite" : ""}`}
                    ><LuPlus size={16} /></button>
                    <span className="checkout-view__remocao-qty-de pag-janela__apagado">de {remocao.qtyMax}</span>
                  </div>
                  {remocao.qtySel >= remocao.qtyMax && (
                    <div className="checkout-view__remocao-aviso pag-janela__erro pag-janela__senha-nota">
                      Todos os itens serão removidos
                    </div>
                  )}
                </div>
              )}

              {/* Motivo (obrigatório) */}
              <div>
                <div className="checkout-view__modal-input-label pag-janela__rotulo">
                  Motivo (obrigatório)
                </div>
                <textarea
                  value={remocao.motivo}
                  onChange={e => setRemocao(r => ({ ...r, motivo: e.target.value }))}
                  placeholder="Ex: cliente desistiu, pedido errado..."
                  maxLength={200}
                  rows={2}
                  className="checkout-view__remocao-motivo remocao__campo"
                />
                <div className="checkout-view__remocao-contador remocao__contador">
                  {remocao.motivo.length}/200
                </div>
              </div>

              {/* Senha de gerente/admin */}
              <div>
                <div className="checkout-view__modal-input-label pag-janela__rotulo pag-janela__rotulo--icone">
                  <LuLock size={13} /> Senha de gerente ou admin
                </div>
                <div className="pag-janela__senha-campo">
                  <input
                    type={remSenhaVis ? "text" : "password"}
                    value={remSenha}
                    onChange={e => { setRemSenha(e.target.value); setRemSenhaErro(""); }}
                    placeholder="Digite a senha"
                    // Ver o comentário do campo de autorização do desconto:
                    // autopreenchimento aqui vira remoção de item autorizada
                    // sem gerente nenhum.
                    name="autorizacao-gerente"
                    autoComplete="new-password"
                    data-1p-ignore
                    data-lpignore="true"
                    aria-invalid={remSenhaErro ? true : undefined}
                    className="checkout-view__remocao-senha pag-janela__senha"
                  />
                  <button
                    onClick={() => setRemSenhaVis(v => !v)}
                    className="checkout-view__remocao-senha-olho pag-janela__apagado"
                    aria-label={remSenhaVis ? "Ocultar senha" : "Mostrar senha"}
                  >
                    {remSenhaVis ? <LuEyeOff size={16} /> : <LuEye size={16} />}
                  </button>
                </div>
                {remSenhaErro && (
                  <div role="alert" className="checkout-view__remocao-senha-erro pag-janela__erro pag-janela__senha-nota">
                    {remSenhaErro}
                  </div>
                )}
              </div>

              {remErro && (
                <div role="alert" className="checkout-view__remocao-erro-geral remocao__erro-geral">
                  {remErro}
                </div>
              )}

              {/* Ações */}
              <div className="checkout-view__modal-acoes pag-janela__acoes">
                <button
                  onClick={() => setRemocao(null)}
                  disabled={removendo}
                  className="checkout-view__modal-btn-remover pag-janela__remover"
                >
                  Voltar
                </button>
                <button
                  onClick={confirmarRemocao}
                  disabled={!remocao.motivo.trim() || !remSenha.trim() || removendo}
                  className="checkout-view__modal-btn-aplicar remocao__confirmar"
                >
                  {removendo
                    ? "Removendo..."
                    : remocao.qtyMax > 1 && remocao.qtySel >= remocao.qtyMax
                    ? "Remover tudo"
                    : remocao.qtyMax > 1
                    ? `Remover ${remocao.qtySel}`
                    : "Remover"}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
  );
}
