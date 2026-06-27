import { useState } from "react";
import { createPortal } from "react-dom";
import C from "@/constants/colors";
import { useResponsive } from "@/utils/hooks";
import { getSizes } from "@/constants/sizes";
import { LuMinus, LuPlus, LuFileText, LuTrash2, LuCheck, LuWallet, LuUser, LuX } from "react-icons/lu";

const fmtComanda = (name) =>
  /^\d+$/.test(String(name ?? "").trim()) ? `Comanda ${name}` : name;

export default function CartPanel({ comanda, items, onChangeQty, onChangeObs, onLancar, onFinalizar, salvando }) {
  const { width } = useResponsive();
  const sz = getSizes(width);
  const total           = items.reduce((s, i) => s + i.price * i.qty, 0);
  const itensAcumulados = Array.isArray(comanda?.items) ? comanda.items : [];
  const totalAcumulado  = itensAcumulados.reduce((s, i) => s + i.price * (i.qty ?? 1), 0);
  const totalGeral      = totalAcumulado + total;
  const qtdGeral        = itensAcumulados.reduce((s, i) => s + (i.qty ?? 1), 0)
                        + items.reduce((s, i) => s + i.qty, 0);
  const temItens = items.length > 0 || itensAcumulados.length > 0;
  const [confirmando, setConfirmando] = useState(false);
  // drafts: { [itemIdx]: string } — texto sendo digitado antes de confirmar
  const [drafts, setDrafts] = useState({});

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
          <div style={{ fontSize: sz.fontBase - 1, color: C.muted, marginTop: 4, display: "flex", alignItems: "center", gap: 4 }}><LuUser size={12} /> {comanda.garcom}</div>
        )}
      </div>

      {/* Lista de itens */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {!temItens ? (
          <div style={{ color: C.muted, fontSize: sz.fontBase, textAlign: "center", padding: "32px 16px" }}>
            Clique nos produtos para adicionar
          </div>
        ) : (
          items.map((item, i) => {
            const obsArr = getObs(item);
            const hasDraft = drafts[i] !== undefined;
            const hasObs = obsArr.length > 0 || hasDraft;
            return (
              <div
                key={item._key ?? i}
                style={{
                  padding: "12px 16px",
                  borderBottom: `1px solid ${C.border}`,
                  display: "flex", flexDirection: "column", gap: 7,
                }}
              >
                {/* Linha 1: nome + obs icon + qty + excluir */}
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {/* Nome + botão obs agrupados */}
                  <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 4 }}>
                    <div style={{
                      fontSize: sz.fontBase + 1, fontWeight: 700,
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
                        cursor: "pointer", padding: "2px 2px",
                        borderRadius: 6, flexShrink: 0,
                        display: "flex", alignItems: "center",
                      }}
                    >
                      <LuFileText size={14} />
                    </button>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                    <QtyBtn onClick={() => onChangeQty(i, item.qty - 1)} label="−" />
                    <span style={{ width: 24, textAlign: "center", fontWeight: 800, fontSize: sz.fontBase + 1 }}>
                      {item.qty}
                    </span>
                    <QtyBtn onClick={() => onChangeQty(i, item.qty + 1)} label="+" />
                    <button
                      onClick={() => onChangeQty(i, 0)}
                      title="Remover item"
                      style={{
                        background: "none", border: "none",
                        color: C.red, cursor: "pointer",
                        padding: "2px 4px", borderRadius: 6, flexShrink: 0,
                        display: "flex", alignItems: "center",
                      }}
                    >
                      <LuTrash2 size={14} />
                    </button>
                  </div>
                </div>

                {/* Linha 2: preço · subtotal */}
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: sz.fontSm + 1, color: C.muted, flex: 1 }}>
                    R$ {Number(item.price).toFixed(2)} cada
                  </span>
                  <span style={{ fontSize: sz.fontBase + 1, fontWeight: 800, color: C.text, flexShrink: 0 }}>
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
                      title="Confirmar observação"
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
          })
        )}
      </div>

      {/* Rodapé */}
      <div style={{ padding: `${sz.padSm + 2}px ${sz.pad - 4}px`, borderTop: `1px solid ${C.border}` }}>
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          marginBottom: sz.padSm,
        }}>
          <span style={{ fontSize: sz.fontBase + 1, fontWeight: 800 }}>Total</span>
          <span style={{ fontSize: sz.fontLg, fontWeight: 900, color: C.green }}>
            R$ {total.toFixed(2)}
          </span>
        </div>

        <button
          onClick={onLancar}
          disabled={!temItens || salvando}
          style={{
            width: "100%", padding: 13, borderRadius: 10, border: "none",
            background: temItens ? C.accent : C.faint,
            color: "#fff", cursor: temItens ? "pointer" : "not-allowed",
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

      {/* Modal de confirmação — renderizado no body para evitar clip do overflow */}
      {confirmando && createPortal(
        <div
          onClick={e => { if (e.target === e.currentTarget) setConfirmando(false); }}
          style={{
            position: "fixed", inset: 0, zIndex: 9000,
            background: "rgba(0,0,0,0.7)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 24,
            fontFamily: "'Inter',system-ui,sans-serif",
          }}
        >
          <div style={{
            background: C.card,
            borderRadius: 20,
            padding: 28,
            width: "100%",
            maxWidth: 400,
            border: `1px solid ${C.border}`,
            boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
            color: C.text,
          }}>
            {/* Título */}
            <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 4 }}>
              Finalizar Comanda?
            </div>
            <div style={{ fontSize: 13, color: C.muted, marginBottom: 20 }}>
              {fmtComanda(comanda?.comanda)}
            </div>

            {/* Card do total */}
            <div style={{
              background: C.surface,
              border: `1px solid ${C.border}`,
              borderRadius: 14,
              padding: "18px 20px",
              marginBottom: 20,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
            }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 4 }}>
                  {qtdGeral} {qtdGeral === 1 ? "item" : "itens"} consumidos
                </div>
                <div style={{ fontSize: 12, color: C.muted }}>
                  Vai para a tela de pagamento
                </div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 }}>
                  Total
                </div>
                <div style={{ fontSize: 26, fontWeight: 900, color: C.green, lineHeight: 1 }}>
                  R$ {totalGeral.toFixed(2)}
                </div>
              </div>
            </div>

            {/* Botões */}
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => setConfirmando(false)}
                style={{
                  flex: 1, padding: "13px 0", borderRadius: 12,
                  border: `1px solid ${C.border}`, background: "none",
                  color: C.muted, cursor: "pointer", fontWeight: 600, fontSize: 14,
                }}
              >
                Cancelar
              </button>
              <button
                onClick={() => { setConfirmando(false); onFinalizar(); }}
                style={{
                  flex: 1, padding: "13px 0", borderRadius: 12, border: "none",
                  background: C.green, color: "#fff",
                  cursor: "pointer", fontWeight: 800, fontSize: 15,
                }}
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
        width: 26, height: 26, borderRadius: 6,
        border: `1px solid ${C.border}`, background: C.surface,
        color: C.text, cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0,
      }}
    >
      {label === "−" ? <LuMinus size={13} /> : <LuPlus size={13} />}
    </button>
  );
}
