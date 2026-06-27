import { useState } from "react";
import C from "@/constants/colors";
import { useResponsive } from "@/utils/hooks";
import { getSizes } from "@/constants/sizes";
import { LuUser } from "react-icons/lu";

const TOTAL = 1000;
const PAGE  = 50;
const AMBER = "#f59e0b";

function fmtComanda(name) {
  return /^\d+$/.test(String(name ?? "").trim()) ? `Comanda ${name}` : name;
}

function getElapsed(dateStr) {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const m    = Math.floor(diff / 60000);
  if (m < 1)  return "agora";
  if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return `${h}h${r > 0 ? `${r}min` : ""}`;
}

export default function ComandaGrid({ abertas, visitadas = new Set(), selected, onSelect, onOpenEmpty, busca = "" }) {
  const { width } = useResponsive();
  const sz = getSizes(width);
  const [limite, setLimite] = useState(PAGE);

  // lookup: comanda number string → order
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

    // Se a busca for um número e não há comanda aberta com esse número, mostra o slot para abrir
    const numBusca = /^\d+$/.test(busca.trim()) ? parseInt(busca.trim(), 10) : null;
    const slotDisponivel = numBusca && !mapa[String(numBusca)] ? numBusca : null;

    const vazio = aberasFiltradas.length === 0 && !slotDisponivel;

    return (
      <div style={{ height: "100%", overflowY: "auto", padding: `${sz.pad}px ${sz.pad + 4}px` }}>
        {vazio ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, color: C.muted, paddingTop: 60 }}>
            <div style={{ fontSize: 44, opacity: 0.3 }}>🔍</div>
            <div style={{ fontSize: sz.fontBase + 1, fontWeight: 600 }}>Nenhuma comanda encontrada</div>
            <div style={{ fontSize: sz.fontSm + 1 }}>"{busca}" não corresponde a nenhuma comanda em aberto</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 560, margin: "0 auto" }}>
            {slotDisponivel && (
              <button
                onClick={() => onOpenEmpty(String(slotDisponivel))}
                style={{ display: "flex", alignItems: "center", gap: 14, padding: "16px 20px", borderRadius: 14, border: `1.5px dashed ${C.accent}55`, background: `${C.accent}07`, color: C.text, cursor: "pointer", textAlign: "left", fontFamily: "inherit", transition: "background 0.15s" }}
                onMouseEnter={e => e.currentTarget.style.background = `${C.accent}12`}
                onMouseLeave={e => e.currentTarget.style.background = `${C.accent}07`}
              >
                <div style={{ width: 40, height: 40, borderRadius: 10, background: `${C.accent}18`, border: `1.5px solid ${C.accent}44`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>+</div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: sz.fontBase + 1, color: C.accent }}>Abrir Comanda {slotDisponivel}</div>
                  <div style={{ fontSize: sz.fontSm + 1, color: C.muted, marginTop: 2 }}>Disponível · clique para abrir</div>
                </div>
              </button>
            )}

            {aberasFiltradas.map(order => {
              const items    = Array.isArray(order.items) ? order.items : [];
              const qtdTotal = items.reduce((s, i) => s + (i.qty || 1), 0);
              const total    = order.total ?? items.reduce((s, i) => s + i.price * (i.qty || 1), 0);
              const hasItems = qtdTotal > 0;
              const isVisitada = visitadas.has(order.id);
              const isSelected = selected?.id === order.id;
              const borderColor = isSelected ? C.accent : isVisitada ? AMBER : hasItems ? `${C.blue}66` : C.border;
              const bgColor     = isSelected ? C.alow    : isVisitada ? `${AMBER}14` : C.card;
              return (
                <button
                  key={order.id}
                  onClick={() => onSelect(order)}
                  style={{ display: "flex", alignItems: "center", gap: 14, padding: "16px 20px", borderRadius: 14, border: `1.5px solid ${borderColor}`, background: bgColor, color: C.text, cursor: "pointer", textAlign: "left", fontFamily: "inherit", transition: "border-color 0.15s, background 0.15s" }}
                >
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: C.surface, border: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 16, color: C.muted, flexShrink: 0 }}>
                    {/^\d+$/.test(String(order.comanda ?? "").trim()) ? order.comanda : "C"}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 800, fontSize: sz.fontBase + 1 }}>{fmtComanda(order.comanda) || `#${String(order.id).slice(-4).toUpperCase()}`}</div>
                    {order.garcom && <div style={{ fontSize: sz.fontSm + 1, color: C.muted, marginTop: 2 }}>{order.garcom}</div>}
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: sz.fontBase + 1, color: hasItems ? C.green : C.muted }}>
                      {hasItems ? `R$ ${total.toFixed(2)}` : "Vazio"}
                    </div>
                    <div style={{ fontSize: sz.fontSm, color: C.muted, marginTop: 2 }}>
                      {hasItems ? `${qtdTotal} ${qtdTotal === 1 ? "item" : "itens"}` : ""}
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
  if (!order) {
    return (
      <button
        onClick={onClick}
        style={{
          background: C.card,
          border: `1.5px dashed ${C.border}`,
          borderRadius: 16,
          padding: `${sz.pad}px ${sz.padSm + 4}px`,
          cursor: "pointer", textAlign: "left",
          color: C.muted, width: "100%",
          display: "flex", flexDirection: "column", gap: sz.gap - 6,
          opacity: 0.55, transition: "opacity 0.15s, border-color 0.15s",
        }}
        onMouseEnter={e => {
          e.currentTarget.style.opacity = "1";
          e.currentTarget.style.borderColor = C.accent + "88";
          e.currentTarget.style.borderStyle = "solid";
        }}
        onMouseLeave={e => {
          e.currentTarget.style.opacity = "0.55";
          e.currentTarget.style.borderColor = C.border;
          e.currentTarget.style.borderStyle = "dashed";
        }}
      >
        <div style={{ fontWeight: 800, fontSize: sz.fontLg - 2 }}>Comanda {num}</div>
        <div style={{ fontSize: sz.fontSm, color: C.muted }}>Disponível · clique para abrir</div>
      </button>
    );
  }

  const items    = Array.isArray(order.items) ? order.items : [];
  const qtdTotal = items.reduce((s, i) => s + (i.qty || 1), 0);
  const total    = order.total ?? items.reduce((s, i) => s + (i.price * (i.qty || 1)), 0);
  const hasItems = qtdTotal > 0;
  const elapsed  = getElapsed(order.created_at);

  const borderColor = isSelected ? C.accent
                    : isVisitada ? AMBER
                    : hasItems   ? `${C.blue}66`
                    : C.border;
  const bgColor     = isSelected ? C.alow
                    : isVisitada ? `${AMBER}14`
                    : C.card;

  return (
    <button
      onClick={onClick}
      style={{
        background: bgColor,
        border: `1.5px solid ${borderColor}`,
        borderRadius: 16,
        padding: `${sz.pad}px ${sz.padSm + 4}px`,
        cursor: "pointer", textAlign: "left",
        color: C.text, width: "100%",
        display: "flex", flexDirection: "column", gap: sz.gap - 2,
        transition: "border-color 0.15s, background 0.15s",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 6 }}>
        <div style={{ fontWeight: 800, fontSize: sz.fontLg - 2, lineHeight: 1.2 }}>
          {fmtComanda(order.comanda) || `#${String(order.id).slice(-4).toUpperCase()}`}
        </div>
        <span style={{
          fontSize: sz.fontSm - 1, fontWeight: 600, color: C.muted,
          background: C.surface, padding: "3px 8px", borderRadius: 8,
          whiteSpace: "nowrap", flexShrink: 0,
        }}>
          {elapsed}
        </span>
      </div>

      {order.garcom && (
        <div style={{ fontSize: sz.fontSm, color: C.muted, display: "flex", alignItems: "center", gap: 5 }}>
          <LuUser size={11} />
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {order.garcom}
          </span>
        </div>
      )}

      <div style={{
        borderTop: `1px solid ${C.border}`, paddingTop: sz.padSm - 2,
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <span style={{ fontSize: sz.fontSm, color: C.muted }}>
          {hasItems ? `${qtdTotal} ${qtdTotal === 1 ? "item" : "itens"}` : "Vazio"}
        </span>
        <span style={{ fontWeight: 700, fontSize: sz.fontBase + 1, color: hasItems ? C.green : C.muted }}>
          {hasItems ? `R$ ${total.toFixed(2)}` : "—"}
        </span>
      </div>
    </button>
  );
}
