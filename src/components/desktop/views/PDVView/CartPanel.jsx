import { useState } from "react";
import { createPortal } from "react-dom";
import C from "@/constants/colors";
import { varColor } from "@/lib/tema";
import { alfa } from "@/constants/colorAlfa";
import { useResponsive } from "@/utils/hooks";
import { getSizes } from "@/constants/sizes";
import { useApp } from "@/context/AppContext";
import { verificarSenhaAdmin } from "@/lib/adminAuth";
import { LuMinus, LuPlus, LuFileText, LuTrash2, LuCheck, LuWallet, LuUser, LuX, LuLock, LuEye, LuEyeOff } from "react-icons/lu";
import "./CartPanel.css";

const fmtComanda = (name) =>
  /^\d+$/.test(String(name ?? "").trim()) ? `Comanda ${name}` : name;

export default function CartPanel({ comanda, items, onChangeQty, onChangeObs, onLancar, onFinalizar, salvando, onRemoveAcumulado }) {
  const { width } = useResponsive();
  const sz = getSizes(width);
  const { users } = useApp();

  const itensAcumulados = Array.isArray(comanda?.items) ? comanda.items : [];
  // para totais e contagens, exclui cancelados
  const itensAtivos     = itensAcumulados.filter(i => !i.cancelado);
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
  const [itemSenhaErro, setItemSenhaErro] = useState(false);
  const [itemSenhaVis, setItemSenhaVis] = useState(false);
  const [itemSenhaOk,  setItemSenhaOk]  = useState(false);

  const getObs = (item) => Array.isArray(item.obs) ? item.obs : (item.obs ? [item.obs] : []);

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
    setItemSenha(""); setItemSenhaErro(false); setItemSenhaVis(false); setItemSenhaOk(false);
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
      const autorizado = await verificarSenhaAdmin(itemSenha);
      if (!autorizado) { setItemSenhaErro(true); return; }
      setItemSenhaOk(true);
      setItemSenhaErro(false);
    }
    onRemoveAcumulado(idx, qtySel, motivo.trim());
    setConfirmExcluir(null);
  };

  const isMob = sz.cartWidth === 0;

  return (
    <div className="cart-panel" style={{
      width: isMob ? "100%" : sz.cartWidth,
      flex: isMob ? 1 : undefined,
      borderLeft: isMob ? "none" : `1px solid var(${C.border})`,
      borderTop: isMob ? `1px solid var(${C.border})` : "none",
      background: varColor(C.card),
    }}>

      {/* Header */}
      <div className="cart-panel__header" style={{ padding: `${sz.padSm + 4}px ${sz.pad - 4}px` }}>
        <div style={{ fontWeight: 800, fontSize: sz.fontLg }}>{fmtComanda(comanda?.comanda)}</div>
        {comanda?.garcom && (
          <div className="cart-panel__garcom" style={{ fontSize: sz.fontBase - 1, color: varColor(C.muted), marginTop: 4 }}>
            <LuUser size={12} /> {comanda.garcom}
          </div>
        )}
      </div>

      {/* Lista de itens */}
      <div className="cart-panel__lista">
        {!temItens ? (
          <div className="cart-panel__vazio" style={{ color: varColor(C.muted), fontSize: sz.fontBase }}>
            Clique nos produtos para adicionar
          </div>
        ) : (
          <>
          {/* Itens já lançados */}
          {itensAcumulados.length > 0 && (
            <>
              <div className="cart-panel__secao-titulo" style={{ fontSize: 18, color: varColor(C.muted), background: varColor(C.bg) }}>
                Lançados ({itensAtivos.reduce((s, i) => s + (i.qty ?? 1), 0)})
                {itensAcumulados.some(i => i.cancelado) && (
                  <span style={{ color: varColor(C.red), marginLeft: 8 }}>
                    · {itensAcumulados.filter(i => i.cancelado).reduce((s, i) => s + (i.qty ?? 1), 0)} cancelado(s)
                  </span>
                )}
              </div>
              {itensAcumulados.map((item, idx) => {
                const qty      = item.qty ?? 1;
                const obsArr   = Array.isArray(item.obs) ? item.obs : (item.obs ? [item.obs] : []);
                const cancelado = !!item.cancelado;
                return (
                  <div key={idx} className="cart-panel__item cart-panel__item--transicao" style={{
                    background: cancelado ? alfa(C.red, "08") : varColor(C.surface),
                    opacity: cancelado ? 0.7 : 1,
                  }}>
                    <div className="cart-panel__item-linha">
                      {item.emoji && (
                        <span style={{ fontSize: 22, flexShrink: 0, filter: cancelado ? "grayscale(1)" : "none" }}>
                          {item.emoji}
                        </span>
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="cart-panel__item-nome-texto" style={{
                          fontSize: sz.fontBase + 2,
                          textDecoration: cancelado ? "line-through" : "none",
                          color: cancelado ? varColor(C.muted) : varColor(C.text),
                        }}>
                          {item.name}
                          <span style={{ fontWeight: 500 }}> × {qty}</span>
                        </div>
                        {obsArr.map((obs, j) => (
                          <div key={j} style={{ fontSize: 18, color: cancelado ? varColor(C.muted) : varColor(C.accent), marginTop: 2, textDecoration: cancelado ? "line-through" : "none" }}>↳ {obs}</div>
                        ))}
                        {cancelado && item.motivoCancelamento && (
                          <div style={{
                            fontSize: 14, color: varColor(C.red), marginTop: 4,
                            background: alfa(C.red, "14"), borderRadius: 6,
                            padding: "3px 8px", display: "inline-block", fontWeight: 600,
                          }}>
                            Motivo: {item.motivoCancelamento}
                          </div>
                        )}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                        <div style={{
                          fontWeight: 800, fontSize: sz.fontBase + 2,
                          color: cancelado ? varColor(C.muted) : varColor(C.green),
                          textDecoration: cancelado ? "line-through" : "none",
                        }}>
                          R$ {(item.price * qty).toFixed(2)}
                        </div>
                        {onRemoveAcumulado && !cancelado && (
                          <button
                            onClick={() => abrirExcluir("lancado", idx, item)}
                            title="Cancelar item"
                            className="cart-panel__btn-remover"
                            style={{ border: `1px solid ${alfa(C.red, "44")}`, background: alfa(C.red, "10"), color: varColor(C.red) }}
                            onMouseEnter={e => e.currentTarget.style.background = alfa(C.red, "22")}
                            onMouseLeave={e => e.currentTarget.style.background = alfa(C.red, "10")}
                          >
                            <LuTrash2 size={15} />
                          </button>
                        )}
                        {cancelado && (
                          <div style={{
                            fontSize: 13, fontWeight: 800, color: varColor(C.red),
                            background: alfa(C.red, "14"), border: `1px solid ${alfa(C.red, "33")}`,
                            borderRadius: 6, padding: "3px 8px", textTransform: "uppercase", letterSpacing: 0.5,
                          }}>
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
            <div className="cart-panel__secao-titulo" style={{ fontSize: 18, color: varColor(C.muted), background: varColor(C.bg) }}>
              Adicionando ({items.reduce((s, i) => s + i.qty, 0)})
            </div>
          )}
          {items.map((item, i) => {
            const obsArr   = getObs(item);
            const hasDraft = drafts[i] !== undefined;
            const hasObs   = obsArr.length > 0 || hasDraft;
            return (
              <div key={item._key ?? i} className="cart-panel__item" style={{ gap: 10 }}>
                {/* Linha 1: nome + obs icon + qty + excluir */}
                <div className="cart-panel__item-linha">
                  <div className="cart-panel__item-nome">
                    <div className="cart-panel__item-nome-texto" style={{ fontSize: sz.fontBase + 2, minWidth: 0 }}>
                      {item.name}
                    </div>
                    <button
                      onClick={() => addObsDraft(i)}
                      title="Adicionar observação"
                      className="cart-panel__btn-obs"
                      style={{ color: hasObs ? varColor(C.accent) : varColor(C.muted) }}
                    >
                      <LuFileText size={16} />
                    </button>
                  </div>
                  <div className="cart-panel__qty-controles">
                    <QtyBtn onClick={() => onChangeQty(i, item.qty - 1)} label="−" />
                    <span className="cart-panel__qty-valor" style={{ fontSize: sz.fontBase + 2 }}>
                      {item.qty}
                    </span>
                    <QtyBtn onClick={() => onChangeQty(i, item.qty + 1)} label="+" />
                    <button
                      onClick={() => abrirExcluir("carrinho", i, item)}
                      title="Remover item"
                      className="cart-panel__btn-remover"
                      style={{ border: `1px solid ${alfa(C.red, "44")}`, background: alfa(C.red, "10"), color: varColor(C.red) }}
                      onMouseEnter={e => e.currentTarget.style.background = alfa(C.red, "22")}
                      onMouseLeave={e => e.currentTarget.style.background = alfa(C.red, "10")}
                    >
                      <LuTrash2 size={15} />
                    </button>
                  </div>
                </div>

                {/* Linha 2: preço · subtotal */}
                <div className="cart-panel__preco-linha">
                  <span style={{ fontSize: sz.fontSm + 2, color: varColor(C.muted), flex: 1 }}>
                    R$ {Number(item.price).toFixed(2)} cada
                  </span>
                  <span style={{ fontSize: sz.fontBase + 2, fontWeight: 800, color: varColor(C.text), flexShrink: 0 }}>
                    R$ {(item.price * item.qty).toFixed(2)}
                  </span>
                </div>

                {/* Observações confirmadas */}
                {obsArr.map((obs, j) => (
                  <div key={j} className="cart-panel__obs-chip" style={{ background: "var(--gm-alow)", border: `1px solid ${alfa(C.accent, "44")}` }}>
                    <span style={{ flex: 1, fontSize: sz.fontSm + 1, color: varColor(C.accent), fontWeight: 600, lineHeight: 1.4 }}>
                      {obs}
                    </span>
                    <button onClick={() => removeObs(i, j)} className="cart-panel__obs-remover" style={{ color: varColor(C.muted) }}>
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
                      style={{ border: `1px solid var(${C.border})`, background: varColor(C.surface), color: varColor(C.text), fontSize: sz.fontSm + 1 }}
                    />
                    <button onClick={() => confirmDraft(i)} className="cart-panel__obs-confirmar" style={{ background: varColor(C.green), color: "#fff" }}>
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
      <div className="cart-panel__rodape" style={{ padding: `${sz.padSm + 2}px ${sz.pad - 4}px` }}>
        <div className="cart-panel__total-linha" style={{ marginBottom: sz.padSm }}>
          <span style={{ fontSize: sz.fontBase + 1, fontWeight: 800 }}>Total</span>
          <span style={{ fontSize: sz.fontLg, fontWeight: 900, color: varColor(C.green) }}>
            R$ {total.toFixed(2)}
          </span>
        </div>

        <button
          onClick={onLancar}
          disabled={!temItensNovos || salvando}
          className="cart-panel__btn-lancar"
          style={{
            background: temItensNovos ? varColor(C.accent) : varColor(C.faint),
            cursor: temItensNovos ? "pointer" : "not-allowed",
            fontSize: sz.fontBase + 1,
          }}
        >
          {salvando ? "Salvando..." : <><LuCheck size={15} style={{ marginRight: 6 }} />Lançar Pedido</>}
        </button>

        <button
          onClick={() => setConfirmando(true)}
          disabled={!temItens}
          className="cart-panel__btn-finalizar"
          style={{
            border: `1px solid ${temItens ? alfa(C.green, "55") : varColor(C.border)}`,
            background: temItens ? alfa(C.green, "0f") : varColor(C.surface),
            color: temItens ? varColor(C.green) : varColor(C.muted),
            cursor: temItens ? "pointer" : "not-allowed",
            fontSize: sz.fontBase + 1,
          }}
        >
          <LuWallet size={15} style={{ marginRight: 6 }} />
          Finalizar Comanda{totalGeral > 0 ? ` · R$ ${totalGeral.toFixed(2)}` : ""}
        </button>
      </div>

      {/* ── Popup: Confirmar exclusão / cancelamento ──────────────── */}
      {confirmExcluir && createPortal(
        <div
          onClick={e => { if (e.target === e.currentTarget) { setConfirmExcluir(null); setItemSenha(""); setItemSenhaErro(false); setItemSenhaOk(false); } }}
          className="cart-panel__overlay"
          style={{ zIndex: 9100 }}
        >
          <div className="cart-panel__modal">
            {/* Título */}
            <div className="cart-panel__modal-topo">
              <div className="cart-panel__modal-icone" style={{ background: alfa(C.red, "18"), border: `1.5px solid ${alfa(C.red, "44")}` }}>
                <LuTrash2 size={20} color={varColor(C.red)} />
              </div>
              <div>
                <div style={{ fontWeight: 900, fontSize: 16 }}>
                  {confirmExcluir.tipo === "lancado" ? "Cancelar item?" : "Remover item?"}
                </div>
                <div className="cart-panel__modal-nome-item" style={{ fontSize: 16, color: varColor(C.muted), marginTop: 2 }}>
                  {confirmExcluir.item.emoji} {confirmExcluir.item.name}
                </div>
              </div>
            </div>

            {/* Seletor de quantidade (só se qty > 1) */}
            {confirmExcluir.qtyMax > 1 && (
              <div className="cart-panel__stepper" style={{ background: varColor(C.surface), border: `1px solid var(${C.border})` }}>
                <div style={{ fontSize: 18, color: varColor(C.muted), marginBottom: 10, fontWeight: 600 }}>
                  Quantos deseja {confirmExcluir.tipo === "lancado" ? "cancelar" : "remover"}? (total: {confirmExcluir.qtyMax})
                </div>
                <div className="cart-panel__stepper-linha">
                  <button
                    onClick={() => { setConfirmExcluir(prev => { const n = Math.max(1, prev.qtySel - 1); setQtyInputStr(String(n)); return { ...prev, qtySel: n }; }); }}
                    disabled={confirmExcluir.qtySel <= 1}
                    className="cart-panel__stepper-btn"
                    style={{ border: `1px solid var(${C.border})`, background: varColor(C.card), color: varColor(C.text), cursor: confirmExcluir.qtySel > 1 ? "pointer" : "not-allowed", opacity: confirmExcluir.qtySel <= 1 ? 0.4 : 1 }}
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
                    style={{ fontSize: 22, color: varColor(C.text), background: varColor(C.card), border: `1.5px solid var(${C.border})` }}
                  />
                  <button
                    onClick={() => { setConfirmExcluir(prev => { const n = Math.min(prev.qtyMax, prev.qtySel + 1); setQtyInputStr(String(n)); return { ...prev, qtySel: n }; }); }}
                    disabled={confirmExcluir.qtySel >= confirmExcluir.qtyMax}
                    className="cart-panel__stepper-btn"
                    style={{ border: `1px solid var(${C.border})`, background: varColor(C.card), color: varColor(C.text), cursor: confirmExcluir.qtySel < confirmExcluir.qtyMax ? "pointer" : "not-allowed", opacity: confirmExcluir.qtySel >= confirmExcluir.qtyMax ? 0.4 : 1 }}
                  >
                    <LuPlus size={15} />
                  </button>
                </div>
                {confirmExcluir.qtySel === confirmExcluir.qtyMax && (
                  <div style={{ fontSize: 14, color: varColor(C.red), textAlign: "center", marginTop: 8, fontWeight: 600 }}>
                    Todos os itens serão {confirmExcluir.tipo === "lancado" ? "cancelados" : "removidos"}
                  </div>
                )}
              </div>
            )}

            {/* Motivo — apenas para itens lançados */}
            {confirmExcluir.tipo === "lancado" && (
              <div className="cart-panel__campo">
                <label className="cart-panel__label" style={{ fontSize: 18, color: varColor(C.muted) }}>
                  Motivo do cancelamento
                  <span style={{ color: varColor(C.red) }}>*</span>
                </label>
                <textarea
                  autoFocus={confirmExcluir.qtyMax <= 1}
                  value={confirmExcluir.motivo}
                  onChange={e => setConfirmExcluir(prev => ({ ...prev, motivo: e.target.value }))}
                  placeholder="Ex: cliente desistiu, pedido errado..."
                  maxLength={200}
                  rows={3}
                  className="cart-panel__textarea"
                  style={{
                    border: `1.5px solid ${confirmExcluir.motivo ? alfa(C.accent, "88") : varColor(C.border)}`,
                    background: varColor(C.surface), color: varColor(C.text), fontSize: 17,
                  }}
                  onFocus={e => e.currentTarget.style.borderColor = alfa(C.accent, "88")}
                  onBlur={e => e.currentTarget.style.borderColor = confirmExcluir.motivo ? alfa(C.accent, "88") : varColor(C.border)}
                />
                <div style={{ fontSize: 14, color: varColor(C.muted), textAlign: "right" }}>
                  {confirmExcluir.motivo.length}/200
                </div>
              </div>
            )}

            {/* Senha admin/gerente — apenas para itens lançados */}
            {confirmExcluir.tipo === "lancado" && (
              <div className="cart-panel__campo">
                <label className="cart-panel__label" style={{ fontSize: 14, color: varColor(C.muted) }}>
                  <LuLock size={13} /> Senha do administrador / gerente
                </label>
                <div className="cart-panel__senha-wrap">
                  <input
                    type={itemSenhaVis ? "text" : "password"}
                    value={itemSenha}
                    onChange={e => { setItemSenha(e.target.value); setItemSenhaErro(false); setItemSenhaOk(false); }}
                    onKeyDown={e => { if (e.key === "Enter") confirmarExclusao(); }}
                    placeholder="Digite a senha..."
                    className="cart-panel__senha-input"
                    style={{
                      border: `1.5px solid ${itemSenhaErro ? varColor(C.red) : itemSenhaOk ? varColor(C.green) : varColor(C.border)}`,
                      background: varColor(C.surface), color: varColor(C.text), fontSize: 16,
                    }}
                  />
                  <button onClick={() => setItemSenhaVis(v => !v)} className="cart-panel__senha-olho" style={{ color: varColor(C.muted) }}>
                    {itemSenhaVis ? <LuEyeOff size={16} /> : <LuEye size={16} />}
                  </button>
                </div>
                {itemSenhaErro && (
                  <div style={{ fontSize: 14, color: varColor(C.red), fontWeight: 600 }}>Senha incorreta. Apenas admin ou gerente pode cancelar itens.</div>
                )}
                {itemSenhaOk && (
                  <div style={{ fontSize: 14, color: varColor(C.green), fontWeight: 600 }}>✓ Autorizado</div>
                )}
              </div>
            )}

            {/* Botões */}
            <div className="cart-panel__modal-botoes">
              <button
                onClick={() => setConfirmExcluir(null)}
                className="cart-panel__modal-botao"
                style={{ border: `1px solid var(${C.border})`, background: "none", color: varColor(C.muted), cursor: "pointer", fontSize: 17 }}
              >
                Cancelar
              </button>
              <button
                onClick={confirmarExclusao}
                disabled={confirmExcluir.tipo === "lancado" && (!confirmExcluir.motivo.trim() || !itemSenha)}
                className="cart-panel__modal-botao cart-panel__modal-botao--primario"
                style={{
                  border: "none",
                  background: (confirmExcluir.tipo === "lancado" && (!confirmExcluir.motivo.trim() || !itemSenha)) ? varColor(C.faint) : varColor(C.red),
                  color: "#fff",
                  cursor: (confirmExcluir.tipo === "lancado" && (!confirmExcluir.motivo.trim() || !itemSenha)) ? "not-allowed" : "pointer",
                  fontSize: 17,
                }}
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
          onClick={e => { if (e.target === e.currentTarget) setConfirmando(false); }}
          className="cart-panel__overlay"
          style={{ zIndex: 9000 }}
        >
          <div className="cart-panel__modal" style={{ gap: 0 }}>
            <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 4 }}>Finalizar Comanda?</div>
            <div style={{ fontSize: 16, color: varColor(C.muted), marginBottom: 20 }}>{fmtComanda(comanda?.comanda)}</div>

            <div className="cart-panel__resumo-finalizar" style={{ background: varColor(C.surface), border: `1px solid var(${C.border})`, marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: varColor(C.text), marginBottom: 4 }}>
                  {qtdGeral} {qtdGeral === 1 ? "item" : "itens"} consumidos
                </div>
                <div style={{ fontSize: 18, color: varColor(C.muted) }}>Vai para a tela de pagamento</div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: varColor(C.muted), letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 }}>Total</div>
                <div style={{ fontSize: 26, fontWeight: 900, color: varColor(C.green), lineHeight: 1 }}>R$ {totalGeral.toFixed(2)}</div>
              </div>
            </div>

            <div className="cart-panel__modal-botoes">
              <button
                onClick={() => setConfirmando(false)}
                className="cart-panel__modal-botao"
                style={{ border: `1px solid var(${C.border})`, background: "none", color: varColor(C.muted), cursor: "pointer", fontSize: 17 }}
              >
                Cancelar
              </button>
              <button
                onClick={() => { setConfirmando(false); onFinalizar(); }}
                className="cart-panel__modal-botao"
                style={{ border: "none", background: varColor(C.green), color: "#fff", cursor: "pointer", fontWeight: 800, fontSize: 18 }}
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
      style={{ border: `1px solid var(${C.border})`, background: varColor(C.surface), color: varColor(C.text) }}
    >
      {label === "−" ? <LuMinus size={15} /> : <LuPlus size={15} />}
    </button>
  );
}
