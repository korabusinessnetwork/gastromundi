import { useState } from "react";
import { createPortal } from "react-dom";
import C from "@/constants/colors";
import { useResponsive } from "@/utils/hooks";
import { getSizes } from "@/constants/sizes";
import { useApp } from "@/context/AppContext";
import { hashPassword } from "@/utils/crypto";
import { LuMinus, LuPlus, LuFileText, LuTrash2, LuCheck, LuWallet, LuUser, LuX, LuLock, LuEye, LuEyeOff } from "react-icons/lu";

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
      const hashed = await hashPassword(itemSenha);
      const autorizado = users.some(u =>
        ["admin", "gerente"].includes(u.role) && u.password === hashed
      );
      if (!autorizado) { setItemSenhaErro(true); return; }
      setItemSenhaOk(true);
      setItemSenhaErro(false);
    }
    onRemoveAcumulado(idx, qtySel, motivo.trim());
    setConfirmExcluir(null);
  };

  const isMob = sz.cartWidth === 0;

  return (
    <div style={{
      width: isMob ? "100%" : sz.cartWidth,
      flex: isMob ? 1 : undefined,
      flexShrink: 0,
      borderLeft: isMob ? "none" : `1px solid ${C.border}`,
      borderTop: isMob ? `1px solid ${C.border}` : "none",
      background: C.card,
      display: "flex", flexDirection: "column",
      overflow: "hidden",
    }}>

      {/* Header */}
      <div style={{ padding: `${sz.padSm + 4}px ${sz.pad - 4}px`, borderBottom: `1px solid ${C.border}` }}>
        <div style={{ fontWeight: 800, fontSize: sz.fontLg }}>{fmtComanda(comanda?.comanda)}</div>
        {comanda?.garcom && (
          <div style={{ fontSize: sz.fontBase - 1, color: C.muted, marginTop: 4, display: "flex", alignItems: "center", gap: 4 }}>
            <LuUser size={12} /> {comanda.garcom}
          </div>
        )}
      </div>

      {/* Lista de itens */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {!temItens ? (
          <div style={{ color: C.muted, fontSize: sz.fontBase, textAlign: "center", padding: "32px 16px" }}>
            Clique nos produtos para adicionar
          </div>
        ) : (
          <>
          {/* Itens já lançados */}
          {itensAcumulados.length > 0 && (
            <>
              <div style={{
                padding: "10px 18px",
                fontSize: 18, fontWeight: 700, color: C.muted,
                textTransform: "uppercase", letterSpacing: 1,
                borderBottom: `1px solid ${C.border}`,
                background: C.bg,
              }}>
                Lançados ({itensAtivos.reduce((s, i) => s + (i.qty ?? 1), 0)})
                {itensAcumulados.some(i => i.cancelado) && (
                  <span style={{ color: C.red, marginLeft: 8 }}>
                    · {itensAcumulados.filter(i => i.cancelado).reduce((s, i) => s + (i.qty ?? 1), 0)} cancelado(s)
                  </span>
                )}
              </div>
              {itensAcumulados.map((item, idx) => {
                const qty      = item.qty ?? 1;
                const obsArr   = Array.isArray(item.obs) ? item.obs : (item.obs ? [item.obs] : []);
                const cancelado = !!item.cancelado;
                return (
                  <div key={idx} style={{
                    padding: "14px 18px",
                    borderBottom: `1px solid ${C.border}`,
                    display: "flex", flexDirection: "column", gap: 8,
                    background: cancelado ? `${C.red}08` : C.surface,
                    opacity: cancelado ? 0.7 : 1,
                    transition: "opacity 0.2s",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      {item.emoji && (
                        <span style={{ fontSize: 22, flexShrink: 0, filter: cancelado ? "grayscale(1)" : "none" }}>
                          {item.emoji}
                        </span>
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: sz.fontBase + 2, fontWeight: 700,
                          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                          textDecoration: cancelado ? "line-through" : "none",
                          color: cancelado ? C.muted : C.text,
                        }}>
                          {item.name}
                          <span style={{ fontWeight: 500 }}> × {qty}</span>
                        </div>
                        {obsArr.map((obs, j) => (
                          <div key={j} style={{ fontSize: 18, color: cancelado ? C.muted : C.accent, marginTop: 2, textDecoration: cancelado ? "line-through" : "none" }}>↳ {obs}</div>
                        ))}
                        {cancelado && item.motivoCancelamento && (
                          <div style={{
                            fontSize: 14, color: C.red, marginTop: 4,
                            background: `${C.red}14`, borderRadius: 6,
                            padding: "3px 8px", display: "inline-block", fontWeight: 600,
                          }}>
                            Motivo: {item.motivoCancelamento}
                          </div>
                        )}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                        <div style={{
                          fontWeight: 800, fontSize: sz.fontBase + 2,
                          color: cancelado ? C.muted : C.green,
                          textDecoration: cancelado ? "line-through" : "none",
                        }}>
                          R$ {(item.price * qty).toFixed(2)}
                        </div>
                        {onRemoveAcumulado && !cancelado && (
                          <button
                            onClick={() => abrirExcluir("lancado", idx, item)}
                            title="Cancelar item"
                            style={{
                              width: 34, height: 34, borderRadius: 8,
                              border: `1px solid ${C.red}44`,
                              background: `${C.red}10`,
                              color: C.red, cursor: "pointer",
                              display: "flex", alignItems: "center", justifyContent: "center",
                              transition: "background 0.15s",
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = `${C.red}22`}
                            onMouseLeave={e => e.currentTarget.style.background = `${C.red}10`}
                          >
                            <LuTrash2 size={15} />
                          </button>
                        )}
                        {cancelado && (
                          <div style={{
                            fontSize: 13, fontWeight: 800, color: C.red,
                            background: `${C.red}14`, border: `1px solid ${C.red}33`,
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
            <div style={{
              padding: "10px 18px",
              fontSize: 18, fontWeight: 700, color: C.muted,
              textTransform: "uppercase", letterSpacing: 1,
              borderBottom: `1px solid ${C.border}`,
              background: C.bg,
            }}>
              Adicionando ({items.reduce((s, i) => s + i.qty, 0)})
            </div>
          )}
          {items.map((item, i) => {
            const obsArr   = getObs(item);
            const hasDraft = drafts[i] !== undefined;
            const hasObs   = obsArr.length > 0 || hasDraft;
            return (
              <div key={item._key ?? i} style={{
                padding: "14px 18px",
                borderBottom: `1px solid ${C.border}`,
                display: "flex", flexDirection: "column", gap: 10,
              }}>
                {/* Linha 1: nome + obs icon + qty + excluir */}
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{
                      fontSize: sz.fontBase + 2, fontWeight: 700,
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                      minWidth: 0,
                    }}>
                      {item.name}
                    </div>
                    <button
                      onClick={() => addObsDraft(i)}
                      title="Adicionar observação"
                      style={{
                        background: "none", border: "none",
                        color: hasObs ? C.accent : C.muted,
                        cursor: "pointer", padding: "3px 3px",
                        borderRadius: 6, flexShrink: 0,
                        display: "flex", alignItems: "center",
                      }}
                    >
                      <LuFileText size={16} />
                    </button>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                    <QtyBtn onClick={() => onChangeQty(i, item.qty - 1)} label="−" />
                    <span style={{ width: 28, textAlign: "center", fontWeight: 800, fontSize: sz.fontBase + 2 }}>
                      {item.qty}
                    </span>
                    <QtyBtn onClick={() => onChangeQty(i, item.qty + 1)} label="+" />
                    <button
                      onClick={() => abrirExcluir("carrinho", i, item)}
                      title="Remover item"
                      style={{
                        width: 34, height: 34, borderRadius: 8,
                        border: `1px solid ${C.red}44`,
                        background: `${C.red}10`,
                        color: C.red, cursor: "pointer",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        flexShrink: 0,
                        transition: "background 0.15s",
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = `${C.red}22`}
                      onMouseLeave={e => e.currentTarget.style.background = `${C.red}10`}
                    >
                      <LuTrash2 size={15} />
                    </button>
                  </div>
                </div>

                {/* Linha 2: preço · subtotal */}
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: sz.fontSm + 2, color: C.muted, flex: 1 }}>
                    R$ {Number(item.price).toFixed(2)} cada
                  </span>
                  <span style={{ fontSize: sz.fontBase + 2, fontWeight: 800, color: C.text, flexShrink: 0 }}>
                    R$ {(item.price * item.qty).toFixed(2)}
                  </span>
                </div>

                {/* Observações confirmadas */}
                {obsArr.map((obs, j) => (
                  <div key={j} style={{
                    display: "flex", alignItems: "center", gap: 6,
                    background: C.alow, border: `1px solid ${C.accent}44`,
                    borderRadius: 8, padding: "5px 8px",
                  }}>
                    <span style={{ flex: 1, fontSize: sz.fontSm + 1, color: C.accent, fontWeight: 600, lineHeight: 1.4 }}>
                      {obs}
                    </span>
                    <button
                      onClick={() => removeObs(i, j)}
                      style={{
                        background: "none", border: "none", color: C.muted,
                        cursor: "pointer", padding: "1px 2px", flexShrink: 0,
                        display: "flex", alignItems: "center", borderRadius: 4,
                      }}
                    >
                      <LuX size={12} />
                    </button>
                  </div>
                ))}

                {/* Campo de nova obs (draft) */}
                {hasDraft && (
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <input
                      autoFocus
                      value={drafts[i]}
                      onChange={e => setDrafts(prev => ({ ...prev, [i]: e.target.value }))}
                      onKeyDown={e => { if (e.key === "Enter") confirmDraft(i); if (e.key === "Escape") setDrafts(prev => { const n = { ...prev }; delete n[i]; return n; }); }}
                      placeholder="Observação do item..."
                      maxLength={120}
                      style={{
                        flex: 1, padding: "7px 10px",
                        borderRadius: 8, border: `1px solid ${C.border}`,
                        background: C.surface, color: C.text,
                        fontSize: sz.fontSm + 1, fontFamily: "inherit", outline: "none",
                        boxSizing: "border-box",
                      }}
                    />
                    <button
                      onClick={() => confirmDraft(i)}
                      style={{
                        width: 32, height: 32, borderRadius: 8, border: "none",
                        background: C.green, color: "#fff",
                        cursor: "pointer", flexShrink: 0,
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}
                    >
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
      <div style={{ padding: `${sz.padSm + 2}px ${sz.pad - 4}px`, borderTop: `1px solid ${C.border}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: sz.padSm }}>
          <span style={{ fontSize: sz.fontBase + 1, fontWeight: 800 }}>Total</span>
          <span style={{ fontSize: sz.fontLg, fontWeight: 900, color: C.green }}>
            R$ {total.toFixed(2)}
          </span>
        </div>

        <button
          onClick={onLancar}
          disabled={!temItensNovos || salvando}
          style={{
            width: "100%", padding: 13, borderRadius: 10, border: "none",
            background: temItensNovos ? C.accent : C.faint,
            color: "#fff", cursor: temItensNovos ? "pointer" : "not-allowed",
            fontWeight: 700, fontSize: sz.fontBase + 1, marginBottom: 8,
            transition: "background 0.2s",
          }}
        >
          {salvando ? "Salvando..." : <><LuCheck size={15} style={{ marginRight: 6 }} />Lançar Pedido</>}
        </button>

        <button
          onClick={() => setConfirmando(true)}
          disabled={!temItens}
          style={{
            width: "100%", padding: 12, borderRadius: 10,
            border: `1px solid ${temItens ? C.green + "55" : C.border}`,
            background: temItens ? `${C.green}0f` : C.surface,
            color: temItens ? C.green : C.muted,
            cursor: temItens ? "pointer" : "not-allowed",
            fontSize: sz.fontBase + 1, fontWeight: 700,
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
          style={{
            position: "fixed", inset: 0, zIndex: 9100,
            background: "rgba(0,0,0,0.7)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 24, fontFamily: "'Inter',system-ui,sans-serif",
          }}
        >
          <div style={{
            background: C.card, borderRadius: 20, padding: 28,
            width: "100%", maxWidth: 400,
            border: `1px solid ${C.border}`,
            boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
            color: C.text,
            display: "flex", flexDirection: "column", gap: 20,
          }}>
            {/* Título */}
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{
                width: 44, height: 44, borderRadius: 12, flexShrink: 0,
                background: `${C.red}18`, border: `1.5px solid ${C.red}44`,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <LuTrash2 size={20} color={C.red} />
              </div>
              <div>
                <div style={{ fontWeight: 900, fontSize: 16 }}>
                  {confirmExcluir.tipo === "lancado" ? "Cancelar item?" : "Remover item?"}
                </div>
                <div style={{ fontSize: 16, color: C.muted, marginTop: 2, maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {confirmExcluir.item.emoji} {confirmExcluir.item.name}
                </div>
              </div>
            </div>

            {/* Seletor de quantidade (só se qty > 1) */}
            {confirmExcluir.qtyMax > 1 && (
              <div style={{
                background: C.surface, border: `1px solid ${C.border}`,
                borderRadius: 12, padding: "14px 18px",
              }}>
                <div style={{ fontSize: 18, color: C.muted, marginBottom: 10, fontWeight: 600 }}>
                  Quantos deseja {confirmExcluir.tipo === "lancado" ? "cancelar" : "remover"}? (total: {confirmExcluir.qtyMax})
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "center" }}>
                  <button
                    onClick={() => { setConfirmExcluir(prev => { const n = Math.max(1, prev.qtySel - 1); setQtyInputStr(String(n)); return { ...prev, qtySel: n }; }); }}
                    disabled={confirmExcluir.qtySel <= 1}
                    style={{ width: 36, height: 36, borderRadius: 9, border: `1px solid ${C.border}`, background: C.card, color: C.text, cursor: confirmExcluir.qtySel > 1 ? "pointer" : "not-allowed", display: "flex", alignItems: "center", justifyContent: "center", opacity: confirmExcluir.qtySel <= 1 ? 0.4 : 1 }}
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
                    style={{ width: 64, textAlign: "center", fontWeight: 900, fontSize: 22, color: C.text, background: C.card, border: `1.5px solid ${C.border}`, borderRadius: 9, padding: "4px 6px", outline: "none", fontFamily: "inherit", boxSizing: "border-box" }}
                  />
                  <button
                    onClick={() => { setConfirmExcluir(prev => { const n = Math.min(prev.qtyMax, prev.qtySel + 1); setQtyInputStr(String(n)); return { ...prev, qtySel: n }; }); }}
                    disabled={confirmExcluir.qtySel >= confirmExcluir.qtyMax}
                    style={{ width: 36, height: 36, borderRadius: 9, border: `1px solid ${C.border}`, background: C.card, color: C.text, cursor: confirmExcluir.qtySel < confirmExcluir.qtyMax ? "pointer" : "not-allowed", display: "flex", alignItems: "center", justifyContent: "center", opacity: confirmExcluir.qtySel >= confirmExcluir.qtyMax ? 0.4 : 1 }}
                  >
                    <LuPlus size={15} />
                  </button>
                </div>
                {confirmExcluir.qtySel === confirmExcluir.qtyMax && (
                  <div style={{ fontSize: 14, color: C.red, textAlign: "center", marginTop: 8, fontWeight: 600 }}>
                    Todos os itens serão {confirmExcluir.tipo === "lancado" ? "cancelados" : "removidos"}
                  </div>
                )}
              </div>
            )}

            {/* Motivo — apenas para itens lançados */}
            {confirmExcluir.tipo === "lancado" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <label style={{ fontSize: 18, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 0.8, display: "flex", alignItems: "center", gap: 4 }}>
                  Motivo do cancelamento
                  <span style={{ color: C.red }}>*</span>
                </label>
                <textarea
                  autoFocus={confirmExcluir.qtyMax <= 1}
                  value={confirmExcluir.motivo}
                  onChange={e => setConfirmExcluir(prev => ({ ...prev, motivo: e.target.value }))}
                  placeholder="Ex: cliente desistiu, pedido errado..."
                  maxLength={200}
                  rows={3}
                  style={{
                    width: "100%", padding: "10px 14px",
                    borderRadius: 10, border: `1.5px solid ${confirmExcluir.motivo ? C.accent + "88" : C.border}`,
                    background: C.surface, color: C.text,
                    fontSize: 17, fontFamily: "inherit", outline: "none",
                    resize: "none", boxSizing: "border-box",
                    transition: "border-color 0.15s",
                    lineHeight: 1.5,
                  }}
                  onFocus={e => e.currentTarget.style.borderColor = C.accent + "88"}
                  onBlur={e => e.currentTarget.style.borderColor = confirmExcluir.motivo ? C.accent + "88" : C.border}
                />
                <div style={{ fontSize: 14, color: C.muted, textAlign: "right" }}>
                  {confirmExcluir.motivo.length}/200
                </div>
              </div>
            )}

            {/* Senha admin/gerente — apenas para itens lançados */}
            {confirmExcluir.tipo === "lancado" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <label style={{ fontSize: 14, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 0.8, display: "flex", alignItems: "center", gap: 6 }}>
                  <LuLock size={13} /> Senha do administrador / gerente
                </label>
                <div style={{ position: "relative" }}>
                  <input
                    type={itemSenhaVis ? "text" : "password"}
                    value={itemSenha}
                    onChange={e => { setItemSenha(e.target.value); setItemSenhaErro(false); setItemSenhaOk(false); }}
                    onKeyDown={e => { if (e.key === "Enter") confirmarExclusao(); }}
                    placeholder="Digite a senha..."
                    style={{
                      width: "100%", padding: "11px 42px 11px 14px",
                      borderRadius: 10, border: `1.5px solid ${itemSenhaErro ? C.red : itemSenhaOk ? C.green : C.border}`,
                      background: C.surface, color: C.text,
                      fontSize: 16, fontFamily: "inherit", outline: "none",
                      boxSizing: "border-box", transition: "border-color 0.15s",
                    }}
                  />
                  <button
                    onClick={() => setItemSenhaVis(v => !v)}
                    style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: C.muted, cursor: "pointer", padding: 0, display: "flex" }}
                  >
                    {itemSenhaVis ? <LuEyeOff size={16} /> : <LuEye size={16} />}
                  </button>
                </div>
                {itemSenhaErro && (
                  <div style={{ fontSize: 14, color: C.red, fontWeight: 600 }}>Senha incorreta. Apenas admin ou gerente pode cancelar itens.</div>
                )}
                {itemSenhaOk && (
                  <div style={{ fontSize: 14, color: C.green, fontWeight: 600 }}>✓ Autorizado</div>
                )}
              </div>
            )}

            {/* Botões */}
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => setConfirmExcluir(null)}
                style={{
                  flex: 1, padding: "13px 0", borderRadius: 12,
                  border: `1px solid ${C.border}`, background: "none",
                  color: C.muted, cursor: "pointer", fontWeight: 600, fontSize: 17,
                }}
              >
                Cancelar
              </button>
              <button
                onClick={confirmarExclusao}
                disabled={confirmExcluir.tipo === "lancado" && (!confirmExcluir.motivo.trim() || !itemSenha)}
                style={{
                  flex: 1, padding: "13px 0", borderRadius: 12, border: "none",
                  background: (confirmExcluir.tipo === "lancado" && (!confirmExcluir.motivo.trim() || !itemSenha)) ? C.faint : C.red,
                  color: "#fff",
                  cursor: (confirmExcluir.tipo === "lancado" && (!confirmExcluir.motivo.trim() || !itemSenha)) ? "not-allowed" : "pointer",
                  fontWeight: 800, fontSize: 17,
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
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
          style={{
            position: "fixed", inset: 0, zIndex: 9000,
            background: "rgba(0,0,0,0.7)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 24, fontFamily: "'Inter',system-ui,sans-serif",
          }}
        >
          <div style={{
            background: C.card, borderRadius: 20, padding: 28,
            width: "100%", maxWidth: 400,
            border: `1px solid ${C.border}`,
            boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
            color: C.text,
          }}>
            <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 4 }}>Finalizar Comanda?</div>
            <div style={{ fontSize: 16, color: C.muted, marginBottom: 20 }}>{fmtComanda(comanda?.comanda)}</div>

            <div style={{
              background: C.surface, border: `1px solid ${C.border}`,
              borderRadius: 14, padding: "18px 20px", marginBottom: 20,
              display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12,
            }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 4 }}>
                  {qtdGeral} {qtdGeral === 1 ? "item" : "itens"} consumidos
                </div>
                <div style={{ fontSize: 18, color: C.muted }}>Vai para a tela de pagamento</div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.muted, letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 }}>Total</div>
                <div style={{ fontSize: 26, fontWeight: 900, color: C.green, lineHeight: 1 }}>R$ {totalGeral.toFixed(2)}</div>
              </div>
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => setConfirmando(false)}
                style={{ flex: 1, padding: "13px 0", borderRadius: 12, border: `1px solid ${C.border}`, background: "none", color: C.muted, cursor: "pointer", fontWeight: 600, fontSize: 17 }}
              >
                Cancelar
              </button>
              <button
                onClick={() => { setConfirmando(false); onFinalizar(); }}
                style={{ flex: 1, padding: "13px 0", borderRadius: 12, border: "none", background: C.green, color: "#fff", cursor: "pointer", fontWeight: 800, fontSize: 18 }}
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
      style={{
        width: 32, height: 32, borderRadius: 8,
        border: `1px solid ${C.border}`, background: C.surface,
        color: C.text, cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0,
      }}
    >
      {label === "−" ? <LuMinus size={15} /> : <LuPlus size={15} />}
    </button>
  );
}
