import { useState } from "react";
import { fecharAoClicarFora } from "@/lib/overlayFechar";
import { createPortal } from "react-dom";
import C from "@/constants/colors";
import { varColor } from "@/lib/tema";
import { useResponsive } from "@/utils/hooks";
import { getSizes } from "@/constants/sizes";
import { verificarSenhaAdmin } from "@/features/sessao/dados/adminAuth";
import { LuMinus, LuPlus, LuFileText, LuTrash2, LuCheck, LuWallet, LuUser, LuX, LuLock, LuEye, LuEyeOff } from "react-icons/lu";
import "./CartPanel.css";
import { fmtComanda } from "@/features/comandas/regras/rotuloComanda";
import { itensNaoCancelados } from "@/features/comandas/regras/comandaItens";


export default function CartPanel({ comanda, items, onChangeQty, onChangeObs, onLancar, onFinalizar, salvando, onRemoveAcumulado }) {
  const { width } = useResponsive();
  const sz = getSizes(width);

  const itensAcumulados = Array.isArray(comanda?.items) ? comanda.items : [];
  // para totais e contagens, exclui cancelados
  const itensAtivos     = itensNaoCancelados(itensAcumulados);
  const total           = items.reduce((s, i) => s + i.price * i.qty, 0);
  const totalAcumulado  = itensAtivos.reduce((s, i) => s + i.price * (i.qty ?? 1), 0);
  const totalGeral      = totalAcumulado + total;
  const qtdGeral        = itensAtivos.reduce((s, i) => s + (i.qty ?? 1), 0)
                        + items.reduce((s, i) => s + i.qty, 0);
  const temItens        = items.length > 0 || itensAcumulados.length > 0;
  const temItensNovos   = items.length > 0;

  const [confirmando,    setConfirmando]    = useState(false);
  const [drafts,         setDrafts]         = useState({});
  // popup de exclusão: { tipo: "carrinho"|"lancado", idx, qtyMax, qtySel, motivo, item }
  const [confirmExcluir, setConfirmExcluir] = useState(null);
  const [qtyInputStr,    setQtyInputStr]    = useState("");
  // senha para cancelamento de item lançado
  const [itemSenha,    setItemSenha]    = useState("");
  // Texto: "senha errada" e "não deu para verificar agora" são coisas diferentes.
  const [itemSenhaErro, setItemSenhaErro] = useState("");
  const [itemSenhaVis, setItemSenhaVis] = useState(false);
  const [itemSenhaOk,  setItemSenhaOk]  = useState(false);

  const getObs = (item) => Array.isArray(item.obs) ? item.obs : (item.obs ? [item.obs] : []);

  // B4 — composição do combo visível no carrinho (o operador confere o que
  // acompanha sem precisar decorar a receita)
  const resumoCombo = (item) => {
    const fmt = (x) => (Number(x?.quantidade ?? 1) > 1 ? `${x.quantidade}× ${x.nome}` : x.nome);
    const prods = (item?.combo?.produtos ?? []).filter(p => p?.nome).map(fmt);
    const subs  = (item?.combo?.subprodutos ?? []).filter(s => s?.nome).map(fmt);
    const partes = [...prods, ...subs];
    return partes.length ? partes.join(" + ") : null;
  };

  const addObsDraft = (i) => setDrafts(prev => ({ ...prev, [i]: prev[i] !== undefined ? prev[i] : "" }));

  const removeObs = (itemIdx, obsIdx) => {
    const arr = getObs(items[itemIdx]);
    onChangeObs(itemIdx, arr.filter((_, j) => j !== obsIdx));
  };

  const confirmDraft = (itemIdx) => {
    const text = (drafts[itemIdx] ?? "").trim();
    if (!text) { setDrafts(prev => { const n = { ...prev }; delete n[itemIdx]; return n; }); return; }
    const arr = getObs(items[itemIdx]);
    onChangeObs(itemIdx, [...arr, text]);
    setDrafts(prev => { const n = { ...prev }; delete n[itemIdx]; return n; });
  };

  const abrirExcluir = (tipo, idx, item) => {
    const qtyMax = item.qty ?? 1;
    setConfirmExcluir({ tipo, idx, qtyMax, qtySel: 1, motivo: "", item });
    setQtyInputStr("1");
    setItemSenha(""); setItemSenhaErro(""); setItemSenhaVis(false); setItemSenhaOk(false);
  };

  const confirmarExclusao = async () => {
    if (!confirmExcluir) return;
    const { tipo, idx, qtySel, motivo } = confirmExcluir;
    if (tipo === "carrinho") {
      onChangeQty(idx, (items[idx]?.qty ?? 0) - qtySel);
      setConfirmExcluir(null);
      return;
    }
    // Itens lançados: motivo e senha obrigatórios
    if (!motivo.trim()) return;
    if (!itemSenhaOk) {
      if (!itemSenha) return;
      const { ok, erro } = await verificarSenhaAdmin(itemSenha);
      if (!ok) { setItemSenhaErro(erro || "Senha incorreta. Apenas admin ou gerente pode cancelar itens."); return; }
      setItemSenhaOk(true);
      setItemSenhaErro("");
    }
    onRemoveAcumulado(idx, qtySel, motivo.trim());
    setConfirmExcluir(null);
  };

  const isMob = sz.cartWidth === 0;

  return (
    <div
      className={`cart-panel${isMob ? " cart-panel--mob" : ""}`}
      style={{
        "--cart-largura": isMob ? "100%" : `${sz.cartWidth}px`,
        "--cart-pad": `${sz.pad}px`,
        "--cart-pad-sm": `${sz.padSm}px`,
      }}
    >

      {/* Header */}
      <div className="cart-panel__header">
        <div className="cart-panel__header-titulo">{fmtComanda(comanda?.comanda)}</div>
        {comanda?.garcom && (
          <div className="cart-panel__garcom">
            <LuUser size={12} /> {comanda.garcom}
          </div>
        )}
      </div>

      {/* Lista de itens */}
      <div className="cart-panel__lista">
        {!temItens ? (
          <div className="cart-panel__vazio">
            Clique nos produtos para adicionar
          </div>
        ) : (
          <>
          {/* Itens já lançados */}
          {itensAcumulados.length > 0 && (
            <>
              <div className="cart-panel__secao-titulo">
                Lançados ({itensAtivos.reduce((s, i) => s + (i.qty ?? 1), 0)})
                {itensAcumulados.some(i => i.cancelado) && (
                  <span className="cart-panel__secao-cancelados">
                    · {itensAcumulados.filter(i => i.cancelado).reduce((s, i) => s + (i.qty ?? 1), 0)} cancelado(s)
                  </span>
                )}
              </div>
              {itensAcumulados.map((item, idx) => {
                const qty      = item.qty ?? 1;
                const obsArr   = Array.isArray(item.obs) ? item.obs : (item.obs ? [item.obs] : []);
                const cancelado = !!item.cancelado;
                return (
                  <div key={item.uid ?? idx} className={`cart-panel__item cart-panel__item--transicao cart-panel__item--lancado${cancelado ? " cart-panel__item--cancelado" : ""}`}>
                    <div className="cart-panel__item-linha">
                      <div className="cart-panel__item-corpo">
                        <div className="cart-panel__item-nome-texto">
                          {item.name}
                          <span className="cart-panel__item-qty-mult"> × {qty}</span>
                        </div>
                        {resumoCombo(item) && (
                          <div className="cart-panel__combo-resumo">
                            ↳ {resumoCombo(item)}
                          </div>
                        )}
                        {obsArr.map((obs, j) => (
                          <div key={j} className="cart-panel__obs-lancado">↳ {obs}</div>
                        ))}
                        {cancelado && item.motivoCancelamento && (
                          <div className="cart-panel__motivo-cancelado">
                            Motivo: {item.motivoCancelamento}
                          </div>
                        )}
                      </div>
                      <div className="cart-panel__item-acoes">
                        <div className="cart-panel__item-preco-cancelado">
                          R$ {(item.price * qty).toFixed(2)}
                        </div>
                        {onRemoveAcumulado && !cancelado && (
                          <button
                            onClick={() => abrirExcluir("lancado", idx, item)}
                            title="Cancelar item"
                            className="cart-panel__btn-remover"
                          >
                            <LuTrash2 size={15} />
                          </button>
                        )}
                        {cancelado && (
                          <div className="cart-panel__badge-cancelado">
                            Cancelado
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </>
          )}

          {/* Itens no carrinho (novos) */}
          {items.length > 0 && (
            <div className="cart-panel__secao-titulo">
              Adicionando ({items.reduce((s, i) => s + i.qty, 0)})
            </div>
          )}
          {items.map((item, i) => {
            const obsArr   = getObs(item);
            const hasDraft = drafts[i] !== undefined;
            const hasObs   = obsArr.length > 0 || hasDraft;
            return (
              <div key={item._key ?? i} className="cart-panel__item cart-panel__item--novo">
                {/* Linha 1: nome + obs icon + qty + excluir */}
                <div className="cart-panel__item-linha">
                  <div className="cart-panel__item-nome">
                    <div className="cart-panel__item-nome-texto">
                      {item.name}
                    </div>
                    <button
                      onClick={() => addObsDraft(i)}
                      title="Adicionar observação"
                      className={`cart-panel__btn-obs${hasObs ? " cart-panel__btn-obs--ativo" : ""}`}
                    >
                      <LuFileText size={16} />
                    </button>
                  </div>
                  <div className="cart-panel__qty-controles">
                    <QtyBtn onClick={() => onChangeQty(i, item.qty - 1)} label="−" />
                    <span className="cart-panel__qty-valor">
                      {item.qty}
                    </span>
                    <QtyBtn onClick={() => onChangeQty(i, item.qty + 1)} label="+" />
                    <button
                      onClick={() => abrirExcluir("carrinho", i, item)}
                      title="Remover item"
                      className="cart-panel__btn-remover"
                    >
                      <LuTrash2 size={15} />
                    </button>
                  </div>
                </div>

                {resumoCombo(item) && (
                  <div className="cart-panel__combo-resumo">
                    ↳ {resumoCombo(item)}
                  </div>
                )}

                {/* Linha 2: preço · subtotal */}
                <div className="cart-panel__preco-linha">
                  <span className="cart-panel__preco-unitario">
                    R$ {Number(item.price).toFixed(2)} cada
                  </span>
                  <span className="cart-panel__subtotal-item">
                    R$ {(item.price * item.qty).toFixed(2)}
                  </span>
                </div>

                {/* Observações confirmadas */}
                {obsArr.map((obs, j) => (
                  <div key={j} className="cart-panel__obs-chip">
                    <span className="cart-panel__obs-chip-texto">
                      {obs}
                    </span>
                    <button onClick={() => removeObs(i, j)} className="cart-panel__obs-remover">
                      <LuX size={12} />
                    </button>
                  </div>
                ))}

                {/* Campo de nova obs (draft) */}
                {hasDraft && (
                  <div className="cart-panel__obs-draft">
                    <input
                      autoFocus
                      value={drafts[i]}
                      onChange={e => setDrafts(prev => ({ ...prev, [i]: e.target.value }))}
                      onKeyDown={e => { if (e.key === "Enter") confirmDraft(i); if (e.key === "Escape") setDrafts(prev => { const n = { ...prev }; delete n[i]; return n; }); }}
                      placeholder="Observação do item..."
                      maxLength={120}
                      className="cart-panel__obs-input"
                    />
                    <button onClick={() => confirmDraft(i)} className="cart-panel__obs-confirmar">
                      <LuCheck size={15} />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
          </>
        )}
      </div>

      {/* Rodapé */}
      <div className="cart-panel__rodape">
        {/* Este "Total" somava só o que ainda NÃO tinha sido lançado. Depois de
            "Lançar Pedido" ele zerava e a tela mostrava "Total: R$ 0,00" numa
            comanda de R$ 69,00 — o operador lia como se nada tivesse sido
            cobrado. Agora cada número diz de quem ele é, e o valor grande é o
            mesmo que o botão "Finalizar Comanda" vai cobrar. */}
        {temItensNovos && (
          <div className="cart-panel__subtotal-linha">
            <span className="cart-panel__subtotal-label">
              Novos itens (a lançar)
            </span>
            <span className="cart-panel__subtotal-valor">
              R$ {total.toFixed(2)}
            </span>
          </div>
        )}
        <div className="cart-panel__total-linha">
          <span className="cart-panel__total-label">Total da comanda</span>
          <span className="cart-panel__total-valor">
            R$ {totalGeral.toFixed(2)}
          </span>
        </div>

        <button
          onClick={onLancar}
          disabled={!temItensNovos || salvando}
          className={`cart-panel__btn-lancar${temItensNovos ? " cart-panel__btn-lancar--pode" : ""}`}
        >
          {salvando ? "Salvando..." : <><LuCheck size={15} className="cart-panel__icone-botao" />Lançar Pedido</>}
        </button>

        <button
          onClick={() => setConfirmando(true)}
          disabled={!temItens}
          className={`cart-panel__btn-finalizar${temItens ? " cart-panel__btn-finalizar--pode" : ""}`}
        >
          <LuWallet size={15} className="cart-panel__icone-botao" />
          Finalizar Comanda{totalGeral > 0 ? ` · R$ ${totalGeral.toFixed(2)}` : ""}
        </button>
      </div>

      {/* ── Popup: Confirmar exclusão / cancelamento ──────────────── */}
      {confirmExcluir && createPortal(
        <div
          {...fecharAoClicarFora(() => { setConfirmExcluir(null); setItemSenha(""); setItemSenhaErro(""); setItemSenhaOk(false); })}
          className="cart-panel__overlay cart-panel__overlay--acima"
        >
          <div className="cart-panel__modal">
            {/* Título */}
            <div className="cart-panel__modal-topo">
              <div className="cart-panel__modal-icone">
                <LuTrash2 size={20} color={varColor(C.red)} />
              </div>
              <div>
                <div className="cart-panel__modal-titulo">
                  {confirmExcluir.tipo === "lancado" ? "Cancelar item?" : "Remover item?"}
                </div>
                <div className="cart-panel__modal-nome-item">
                  {confirmExcluir.item.name}
                </div>
              </div>
            </div>

            {/* Seletor de quantidade (só se qty > 1) */}
            {confirmExcluir.qtyMax > 1 && (
              <div className="cart-panel__stepper">
                <div className="cart-panel__stepper-legenda">
                  Quantos deseja {confirmExcluir.tipo === "lancado" ? "cancelar" : "remover"}? (total: {confirmExcluir.qtyMax})
                </div>
                <div className="cart-panel__stepper-linha">
                  <button
                    onClick={() => { setConfirmExcluir(prev => { const n = Math.max(1, prev.qtySel - 1); setQtyInputStr(String(n)); return { ...prev, qtySel: n }; }); }}
                    disabled={confirmExcluir.qtySel <= 1}
                    className="cart-panel__stepper-btn"
                  >
                    <LuMinus size={15} />
                  </button>
                  <input
                    type="number"
                    min={1}
                    max={confirmExcluir.qtyMax}
                    value={qtyInputStr}
                    onChange={e => {
                      const raw = e.target.value;
                      if (raw !== "" && !/^\d+$/.test(raw)) return;
                      setQtyInputStr(raw);
                      const v = parseInt(raw, 10);
                      if (!isNaN(v) && v >= 1 && v <= confirmExcluir.qtyMax) {
                        setConfirmExcluir(prev => ({ ...prev, qtySel: v }));
                      }
                    }}
                    onBlur={() => {
                      const v = parseInt(qtyInputStr, 10);
                      const clamped = isNaN(v) ? 1 : Math.min(confirmExcluir.qtyMax, Math.max(1, v));
                      setConfirmExcluir(prev => ({ ...prev, qtySel: clamped }));
                      setQtyInputStr(String(clamped));
                    }}
                    className="cart-panel__stepper-input"
                  />
                  <button
                    onClick={() => { setConfirmExcluir(prev => { const n = Math.min(prev.qtyMax, prev.qtySel + 1); setQtyInputStr(String(n)); return { ...prev, qtySel: n }; }); }}
                    disabled={confirmExcluir.qtySel >= confirmExcluir.qtyMax}
                    className="cart-panel__stepper-btn"
                  >
                    <LuPlus size={15} />
                  </button>
                </div>
                {confirmExcluir.qtySel === confirmExcluir.qtyMax && (
                  <div className="cart-panel__stepper-aviso">
                    Todos os itens serão {confirmExcluir.tipo === "lancado" ? "cancelados" : "removidos"}
                  </div>
                )}
              </div>
            )}

            {/* Motivo — apenas para itens lançados */}
            {confirmExcluir.tipo === "lancado" && (
              <div className="cart-panel__campo">
                <label className="cart-panel__label">
                  Motivo do cancelamento
                  <span className="cart-panel__obrigatorio">*</span>
                </label>
                <textarea
                  autoFocus={confirmExcluir.qtyMax <= 1}
                  value={confirmExcluir.motivo}
                  onChange={e => setConfirmExcluir(prev => ({ ...prev, motivo: e.target.value }))}
                  placeholder="Ex: cliente desistiu, pedido errado..."
                  maxLength={200}
                  rows={3}
                  className={`cart-panel__textarea${confirmExcluir.motivo ? " cart-panel__textarea--preenchido" : ""}`}
                />
                <div className="cart-panel__contador">
                  {confirmExcluir.motivo.length}/200
                </div>
              </div>
            )}

            {/* Senha admin/gerente — apenas para itens lançados */}
            {confirmExcluir.tipo === "lancado" && (
              <div className="cart-panel__campo">
                <label className="cart-panel__label">
                  <LuLock size={13} /> Senha do administrador / gerente
                </label>
                <div className="cart-panel__senha-wrap">
                  <input
                    type={itemSenhaVis ? "text" : "password"}
                    value={itemSenha}
                    onChange={e => { setItemSenha(e.target.value); setItemSenhaErro(""); setItemSenhaOk(false); }}
                    onKeyDown={e => { if (e.key === "Enter") confirmarExclusao(); }}
                    placeholder="Digite a senha..."
                    className={`cart-panel__senha-input${itemSenhaOk ? " cart-panel__senha-input--ok" : ""}`}
                    aria-invalid={!!itemSenhaErro}
                  />
                  <button onClick={() => setItemSenhaVis(v => !v)} className="cart-panel__senha-olho">
                    {itemSenhaVis ? <LuEyeOff size={16} /> : <LuEye size={16} />}
                  </button>
                </div>
                {itemSenhaErro && (
                  <div role="alert" className="cart-panel__senha-erro">{itemSenhaErro}</div>
                )}
                {itemSenhaOk && (
                  <div className="cart-panel__senha-ok">✓ Autorizado</div>
                )}
              </div>
            )}

            {/* Botões */}
            <div className="cart-panel__modal-botoes">
              <button
                onClick={() => setConfirmExcluir(null)}
                className="cart-panel__modal-botao"
              >
                Cancelar
              </button>
              <button
                onClick={confirmarExclusao}
                disabled={confirmExcluir.tipo === "lancado" && (!confirmExcluir.motivo.trim() || !itemSenha)}
                className="cart-panel__modal-botao cart-panel__modal-botao--primario"
              >
                <LuTrash2 size={15} />
                {confirmExcluir.tipo === "lancado"
                  ? (confirmExcluir.qtyMax === 1 || confirmExcluir.qtySel === confirmExcluir.qtyMax ? "Cancelar tudo" : `Cancelar ${confirmExcluir.qtySel}`)
                  : (confirmExcluir.qtyMax === 1 || confirmExcluir.qtySel === confirmExcluir.qtyMax ? "Remover tudo" : `Remover ${confirmExcluir.qtySel}`)}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Popup: Confirmar finalização ───────────────────────────── */}
      {confirmando && createPortal(
        <div
          {...fecharAoClicarFora(() => setConfirmando(false))}
          className="cart-panel__overlay"
        >
          <div className="cart-panel__modal cart-panel__modal--finalizar">
            <div className="cart-panel__modal-titulo">Finalizar Comanda?</div>
            <div className="cart-panel__modal-subtexto">{fmtComanda(comanda?.comanda)}</div>

            <div className="cart-panel__resumo-finalizar">
              <div>
                <div className="cart-panel__resumo-linha-titulo">
                  {qtdGeral} {qtdGeral === 1 ? "item" : "itens"} consumidos
                </div>
                <div className="cart-panel__resumo-linha-sub">Vai para a tela de pagamento</div>
              </div>
              <div className="cart-panel__resumo-total">
                <div className="cart-panel__resumo-total-label">Total</div>
                <div className="cart-panel__resumo-total-valor">R$ {totalGeral.toFixed(2)}</div>
              </div>
            </div>

            <div className="cart-panel__modal-botoes">
              <button
                onClick={() => setConfirmando(false)}
                className="cart-panel__modal-botao"
              >
                Cancelar
              </button>
              <button
                onClick={() => { setConfirmando(false); onFinalizar(); }}
                className="cart-panel__modal-botao cart-panel__modal-botao--destaque"
              >
                Sim, finalizar
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

function QtyBtn({ onClick, label }) {
  return (
    <button
      onClick={onClick}
      className="cart-panel__qty-btn"
    >
      {label === "−" ? <LuMinus size={15} /> : <LuPlus size={15} />}
    </button>
  );
}
