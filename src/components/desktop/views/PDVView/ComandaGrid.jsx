import { useState } from "react";
import C from "@/constants/colors";
import { useResponsive } from "@/utils/hooks";
import { getSizes } from "@/constants/sizes";
import { LuUser, LuClock } from "react-icons/lu";

const TOTAL = 1000;
const PAGE  = 50;
const AMBER = "#f59e0b";

function fmtComanda(name) {
  return /^\d+$/.test(String(name ?? "").trim()) ? `Comanda ${name}` : name;
}

function getElapsed(dateStr) {
  if (!dateStr) return { label: "", color: C.muted, warn: false };
  const diff = Date.now() - new Date(dateStr).getTime();
  const m    = Math.floor(diff / 60000);
  if (m < 1)  return { label: "agora",             color: C.green, warn: false };
  if (m < 30) return { label: `${m}min`,            color: C.muted, warn: false };
  if (m < 60) return { label: `${m}min`,            color: AMBER,   warn: true  };
  const h = Math.floor(m / 60);
  const r = m % 60;
  return { label: `${h}h${r > 0 ? `${r}min` : ""}`, color: "#ef4444", warn: true };
}

export default function ComandaGrid({ abertas, visitadas = new Set(), selected, onSelect, onOpenEmpty, busca = "" }) {
  const { width } = useResponsive();
  const sz = getSizes(width);
  const [limite, setLimite] = useState(PAGE);

  const mapa = {};
  (abertas ?? []).forEach(o => { mapa[String(o.comanda)] = o; });

  // ── Modo busca ────────────────────────────────────────────────
  if (busca.trim()) {
    const q = busca.trim().toLowerCase();
    const aberasFiltradas = (abertas ?? []).filter(o =>
      String(o.comanda ?? "").toLowerCase().includes(q) ||
      fmtComanda(o.comanda).toLowerCase().includes(q) ||
      (o.garcom ?? "").toLowerCase().includes(q)
    );
    const numBusca      = /^\d+$/.test(busca.trim()) ? parseInt(busca.trim(), 10) : null;
    const slotDisponivel = numBusca && !mapa[String(numBusca)] ? numBusca : null;
    const vazio          = aberasFiltradas.length === 0 && !slotDisponivel;

    return (
      <div style={{ height: "100%", overflowY: "auto", padding: `${sz.pad}px ${sz.pad + 4}px` }}>
        {vazio ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, color: C.muted, paddingTop: 60 }}>
            <div style={{ fontSize: 44, opacity: 0.3 }}>🔍</div>
            <div style={{ fontSize: sz.fontBase + 1, fontWeight: 600 }}>Nenhuma comanda encontrada</div>
            <div style={{ fontSize: sz.fontSm + 1 }}>"{busca}" não corresponde a nenhuma comanda em aberto</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 580, margin: "0 auto" }}>
            {slotDisponivel && (
              <button
                onClick={() => onOpenEmpty(String(slotDisponivel))}
                style={{
                  display: "flex", alignItems: "center", gap: 14,
                  padding: "16px 20px", borderRadius: 14,
                  border: `1.5px dashed ${C.accent}66`,
                  background: `${C.accent}08`,
                  color: C.text, cursor: "pointer", textAlign: "left",
                  fontFamily: "inherit", transition: "background 0.15s, border-color 0.15s",
                }}
                onMouseEnter={e => { e.currentTarget.style.background = `${C.accent}14`; e.currentTarget.style.borderColor = C.accent; }}
                onMouseLeave={e => { e.currentTarget.style.background = `${C.accent}08`; e.currentTarget.style.borderColor = `${C.accent}66`; }}
              >
                <div style={{
                  width: 44, height: 44, borderRadius: 12,
                  background: `${C.accent}18`, border: `1.5px solid ${C.accent}44`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 22, flexShrink: 0, color: C.accent, fontWeight: 900,
                }}>+</div>
                <div>
                  <div style={{ fontWeight: 800, fontSize: sz.fontBase + 2, color: C.accent }}>Abrir Comanda {slotDisponivel}</div>
                  <div style={{ fontSize: sz.fontSm + 1, color: C.muted, marginTop: 2 }}>Disponível · clique para abrir</div>
                </div>
              </button>
            )}

            {aberasFiltradas.map(order => {
              const items      = Array.isArray(order.items) ? order.items : [];
              const ativos     = items.filter(i => !i.cancelado);
              const qtdTotal   = ativos.reduce((s, i) => s + (i.qty || 1), 0);
              const total      = ativos.reduce((s, i) => s + i.price * (i.qty || 1), 0);
              const hasItems   = qtdTotal > 0;
              const isVisitada = visitadas.has(order.id);
              const isSelected = selected?.id === order.id;
              const elapsed    = getElapsed(order.created_at);

              const borderColor = isSelected ? C.accent : isVisitada ? AMBER : hasItems ? `${C.blue}55` : C.border;
              const bgColor     = isSelected ? `${C.accent}0d` : isVisitada ? `${AMBER}10` : C.card;

              return (
                <button
                  key={order.id}
                  onClick={() => onSelect(order)}
                  style={{
                    display: "flex", alignItems: "center", gap: 14,
                    padding: "14px 18px", borderRadius: 14,
                    border: `1.5px solid ${borderColor}`,
                    background: bgColor,
                    color: C.text, cursor: "pointer", textAlign: "left",
                    fontFamily: "inherit",
                    boxShadow: isSelected ? `0 4px 20px ${C.accent}22` : isVisitada ? `0 2px 12px ${AMBER}18` : "none",
                    transition: "border-color 0.15s, background 0.15s, box-shadow 0.15s",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.boxShadow = `0 4px 16px rgba(0,0,0,0.15)`; e.currentTarget.style.borderColor = isSelected ? C.accent : C.accent + "66"; }}
                  onMouseLeave={e => { e.currentTarget.style.boxShadow = isSelected ? `0 4px 20px ${C.accent}22` : isVisitada ? `0 2px 12px ${AMBER}18` : "none"; e.currentTarget.style.borderColor = borderColor; }}
                >
                  {/* Badge número */}
                  <div style={{
                    width: 44, height: 44, borderRadius: 11, flexShrink: 0,
                    background: isSelected ? C.accent : isVisitada ? AMBER : hasItems ? `${C.blue}18` : C.surface,
                    border: `1.5px solid ${isSelected ? C.accent : isVisitada ? AMBER : hasItems ? `${C.blue}44` : C.border}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontWeight: 900, fontSize: 18,
                    color: isSelected ? "#fff" : isVisitada ? "#fff" : hasItems ? C.blue : C.muted,
                  }}>
                    {/^\d+$/.test(String(order.comanda ?? "").trim()) ? order.comanda : "C"}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 800, fontSize: sz.fontBase + 1, marginBottom: 2 }}>
                      {fmtComanda(order.comanda) || `#${String(order.id).slice(-4).toUpperCase()}`}
                    </div>
                    <div style={{ fontSize: sz.fontSm + 1, color: C.muted, display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
                      {order.mesa && (
                        <span style={{ background: `${C.accent}14`, color: C.accent, fontWeight: 700, borderRadius: 5, padding: "1px 6px", fontSize: sz.fontSm }}>
                          🪑 {order.mesa}{order.apelido ? ` · ${order.apelido}` : ""}
                        </span>
                      )}
                      {!order.mesa && order.apelido && (
                        <span style={{ background: `${C.accent}14`, color: C.accent, fontWeight: 700, borderRadius: 5, padding: "1px 6px", fontSize: sz.fontSm }}>
                          {order.apelido}
                        </span>
                      )}
                      {order.garcom && (
                        <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
                          <LuUser size={10} /> {order.garcom}
                        </span>
                      )}
                    </div>
                  </div>

                  <div style={{ textAlign: "right", flexShrink: 0, display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
                    <div style={{ fontWeight: 800, fontSize: sz.fontBase + 1, color: hasItems ? C.green : C.muted }}>
                      {hasItems ? `R$ ${total.toFixed(2)}` : "Vazio"}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: sz.fontSm, color: elapsed.color }}>
                      <LuClock size={10} /> {elapsed.label}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ── Modo normal: grid numerado ────────────────────────────────
  return (
    <div style={{ height: "100%", overflowY: "auto" }}>
      <div style={{
        display: "grid",
        gridTemplateColumns: `repeat(auto-fill, minmax(${sz.comandaCardMin}px, 1fr))`,
        gap: sz.gap,
        padding: `${sz.pad}px ${sz.pad + 4}px`,
        alignContent: "start",
      }}>
        {Array.from({ length: limite }, (_, i) => i + 1).map(num => {
          const order = mapa[String(num)];
          return (
            <ComandaCard
              key={num}
              num={num}
              order={order}
              isSelected={selected?.id === order?.id}
              isVisitada={order ? visitadas.has(order.id) : false}
              onClick={() => order ? onSelect(order) : onOpenEmpty(String(num))}
              sz={sz}
            />
          );
        })}
      </div>

      {limite < TOTAL && (
        <div style={{ display: "flex", justifyContent: "center", padding: `4px 0 ${sz.pad}px` }}>
          <button
            onClick={() => setLimite(l => Math.min(l + PAGE, TOTAL))}
            style={{
              padding: "10px 36px", borderRadius: 10,
              border: `1px solid ${C.border}`, background: C.card,
              color: C.muted, cursor: "pointer", fontWeight: 600,
              fontSize: sz.fontBase, transition: "background 0.15s",
            }}
            onMouseEnter={e => e.currentTarget.style.background = C.surface}
            onMouseLeave={e => e.currentTarget.style.background = C.card}
          >
            Ver mais · {limite}/{TOTAL}
          </button>
        </div>
      )}
    </div>
  );
}

function ComandaCard({ num, order, isSelected, isVisitada, onClick, sz }) {
  const [hovered, setHovered] = useState(false);

  if (!order) {
    return (
      <button
        onClick={onClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          background: hovered ? `${C.accent}0a` : C.card,
          border: `1.5px ${hovered ? "solid" : "dashed"} ${hovered ? C.accent + "88" : C.border}`,
          borderRadius: 16,
          padding: `${sz.pad}px ${sz.padSm + 4}px`,
          cursor: "pointer", textAlign: "left",
          color: hovered ? C.text : C.muted,
          width: "100%",
          display: "flex", flexDirection: "column", gap: sz.gap - 2,
          opacity: hovered ? 1 : 0.45,
          transition: "opacity 0.15s, border-color 0.15s, background 0.15s, border-style 0.1s",
        }}
      >
        {/* Header: número + tempo placeholder */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 6 }}>
          <div style={{ fontWeight: 900, fontSize: sz.fontLg - 1, lineHeight: 1.1, color: hovered ? C.accent : C.muted }}>
            {num}
          </div>
          <span style={{
            fontSize: sz.fontSm - 1, fontWeight: 700, color: C.faint,
            background: C.surface, border: `1px solid ${C.border}`,
            padding: "3px 8px", borderRadius: 8,
            whiteSpace: "nowrap", flexShrink: 0,
            display: "flex", alignItems: "center", gap: 3, opacity: 0,
          }}>
            <LuClock size={10} /> —
          </span>
        </div>

        {/* Mesa/garçom placeholder — ocupa mesmo espaço */}
        <div style={{ fontSize: sz.fontSm, color: C.faint, minHeight: sz.fontSm + 4 }}>
          {hovered ? "Clique para abrir" : "Disponível"}
        </div>

        {/* Rodapé placeholder */}
        <div style={{
          borderTop: `1px solid ${C.border}`, paddingTop: sz.padSm - 2, marginTop: "auto",
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <span style={{ fontSize: sz.fontSm, color: C.faint }}>—</span>
          <span style={{ fontWeight: 800, fontSize: sz.fontBase + 1, color: C.faint }}>—</span>
        </div>
      </button>
    );
  }

  const items    = Array.isArray(order.items) ? order.items : [];
  const ativos   = items.filter(i => !i.cancelado);
  const qtdTotal = ativos.reduce((s, i) => s + (i.qty || 1), 0);
  const total    = ativos.reduce((s, i) => s + (i.price * (i.qty || 1)), 0);
  const hasItems = qtdTotal > 0;
  const elapsed  = getElapsed(order.created_at);

  const borderColor = isSelected ? C.accent
                    : isVisitada ? AMBER
                    : hasItems   ? `${C.blue}55`
                    : C.border;
  const bgColor     = isSelected ? `${C.accent}0d`
                    : isVisitada ? `${AMBER}10`
                    : C.card;
  const shadow      = isSelected ? `0 4px 24px ${C.accent}28`
                    : isVisitada ? `0 2px 12px ${AMBER}20`
                    : hovered    ? "0 4px 16px rgba(0,0,0,0.14)"
                    : "none";

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: bgColor,
        border: `1.5px solid ${hovered && !isSelected ? C.accent + "55" : borderColor}`,
        borderRadius: 16,
        padding: `${sz.pad}px ${sz.padSm + 4}px`,
        cursor: "pointer", textAlign: "left",
        color: C.text, width: "100%",
        display: "flex", flexDirection: "column", gap: sz.gap - 2,
        boxShadow: shadow,
        transition: "border-color 0.15s, background 0.15s, box-shadow 0.2s",
      }}
    >
      {/* Header: número + tempo */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 6 }}>
        <div style={{ fontWeight: 900, fontSize: sz.fontLg - 1, lineHeight: 1.1, color: isSelected ? C.accent : C.text }}>
          {num}
        </div>
        <span style={{
          fontSize: sz.fontSm - 1, fontWeight: 700, color: elapsed.color,
          background: elapsed.warn ? `${elapsed.color}14` : C.surface,
          border: elapsed.warn ? `1px solid ${elapsed.color}33` : `1px solid ${C.border}`,
          padding: "3px 8px", borderRadius: 8,
          whiteSpace: "nowrap", flexShrink: 0,
          display: "flex", alignItems: "center", gap: 3,
        }}>
          <LuClock size={10} /> {elapsed.label}
        </span>
      </div>

      {/* Nome da comanda (se diferente do número) */}
      {!/^\d+$/.test(String(order.comanda ?? "").trim()) && (
        <div style={{ fontWeight: 700, fontSize: sz.fontBase, color: C.text, marginTop: -4 }}>
          {order.comanda}
        </div>
      )}

      {/* Mesa + apelido + garçom */}
      {(order.mesa || order.apelido || order.garcom) && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, alignItems: "center" }}>
          {order.mesa && (
            <span style={{
              fontSize: sz.fontSm, fontWeight: 700, color: C.accent,
              background: `${C.accent}14`, borderRadius: 6, padding: "2px 7px",
            }}>
              🪑 {order.mesa}{order.apelido ? ` · ${order.apelido}` : ""}
            </span>
          )}
          {!order.mesa && order.apelido && (
            <span style={{
              fontSize: sz.fontSm, fontWeight: 700, color: C.accent,
              background: `${C.accent}14`, borderRadius: 6, padding: "2px 7px",
            }}>
              {order.apelido}
            </span>
          )}
          {order.garcom && (
            <span style={{ fontSize: sz.fontSm, color: C.muted, display: "flex", alignItems: "center", gap: 3 }}>
              <LuUser size={10} /> {order.garcom}
            </span>
          )}
        </div>
      )}

      {/* Rodapé: itens + total */}
      <div style={{
        borderTop: `1px solid ${C.border}`, paddingTop: sz.padSm - 2, marginTop: "auto",
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <span style={{
          fontSize: sz.fontSm, color: hasItems ? C.muted : C.faint,
          background: hasItems ? C.surface : "transparent",
          borderRadius: 6, padding: hasItems ? "2px 7px" : "0",
        }}>
          {hasItems ? `${qtdTotal} ${qtdTotal === 1 ? "item" : "itens"}` : "Vazio"}
        </span>
        <span style={{
          fontWeight: 800, fontSize: sz.fontBase + 1,
          color: hasItems ? C.green : C.faint,
        }}>
          {hasItems ? `R$ ${total.toFixed(2)}` : "—"}
        </span>
      </div>
    </button>
  );
}
