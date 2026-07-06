import { useState } from "react";
import C from "@/constants/colors";
import { alfa } from "@/constants/colorAlfa";
import { useResponsive } from "@/utils/hooks";
import { getSizes } from "@/constants/sizes";
import { LuUser, LuClock } from "react-icons/lu";
import "./ComandaGrid.css";

const TOTAL = 1000;
const PAGE  = 50;
const AMBER = "#f59e0b";

function fmtComanda(name) {
  return /^\d+$/.test(String(name ?? "").trim()) ? `Comanda ${name}` : name;
}

// Nota (F018, leva 1 fechamento): os blends com transparência abaixo
// usam `alfa(cor, "HH")` (src/constants/colorAlfa.js) — color-mix()
// sobre `var(--gm-*)` quando `cor` é um token de marca (segue o tema
// do tenant, decisão 017), preservando a opacidade do antigo sufixo
// hex (ADR-007). `AMBER` e o vermelho literal de tempo esgotado em
// `getElapsed` são cores semânticas fixas (alerta de tempo), não de
// marca — `alfa()` cai para a cor literal nesses casos, o que é
// esperado (não fazem parte do tema do tenant).
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
      <div style={{ height: "100%", overflowY: "auto", padding: `${sz.pad}px ${sz.pad + 4}px ${sz.pad}px ${sz.pad + 20}px` }}>
        {vazio ? (
          <div className="comanda-grid__vazio" style={{ color: C.muted }}>
            <div className="comanda-grid__vazio-icone">🔍</div>
            <div style={{ fontSize: sz.fontBase + 1, fontWeight: 600 }}>Nenhuma comanda encontrada</div>
            <div style={{ fontSize: sz.fontSm + 1 }}>"{busca}" não corresponde a nenhuma comanda em aberto</div>
          </div>
        ) : (
          <div className="comanda-grid__lista-busca" style={{ maxWidth: Math.min(580, width - sz.pad * 2) }}>
            {slotDisponivel && (
              <button
                onClick={() => onOpenEmpty(String(slotDisponivel))}
                className="comanda-grid__slot-disponivel"
                style={{ border: `1.5px dashed ${alfa(C.accent, "66")}`, background: alfa(C.accent, "08"), color: C.text }}
                onMouseEnter={e => { e.currentTarget.style.background = alfa(C.accent, "14"); e.currentTarget.style.borderColor = C.accent; }}
                onMouseLeave={e => { e.currentTarget.style.background = alfa(C.accent, "08"); e.currentTarget.style.borderColor = alfa(C.accent, "66"); }}
              >
                <div className="comanda-grid__slot-icone" style={{ background: alfa(C.accent, "18"), border: `1.5px solid ${alfa(C.accent, "44")}`, color: C.accent }}>+</div>
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

              const borderColor = isSelected ? C.accent : isVisitada ? AMBER : hasItems ? alfa(C.blue, "55") : C.border;
              const bgColor     = isSelected ? alfa(C.accent, "0d") : isVisitada ? alfa(AMBER, "10") : C.card;

              return (
                <button
                  key={order.id}
                  onClick={() => onSelect(order)}
                  className="comanda-grid__item-busca"
                  style={{
                    border: `1.5px solid ${borderColor}`,
                    background: bgColor,
                    color: C.text,
                    boxShadow: isSelected ? `0 4px 20px ${alfa(C.accent, "22")}` : isVisitada ? `0 2px 12px ${alfa(AMBER, "18")}` : "none",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.boxShadow = `0 4px 16px rgba(0,0,0,0.15)`; e.currentTarget.style.borderColor = isSelected ? C.accent : alfa(C.accent, "66"); }}
                  onMouseLeave={e => { e.currentTarget.style.boxShadow = isSelected ? `0 4px 20px ${alfa(C.accent, "22")}` : isVisitada ? `0 2px 12px ${alfa(AMBER, "18")}` : "none"; e.currentTarget.style.borderColor = borderColor; }}
                >
                  {/* Badge número */}
                  <div className="comanda-grid__badge" style={{
                    background: isSelected ? C.accent : isVisitada ? AMBER : hasItems ? alfa(C.blue, "18") : C.surface,
                    border: `1.5px solid ${isSelected ? C.accent : isVisitada ? AMBER : hasItems ? alfa(C.blue, "44") : C.border}`,
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
                        <span className="comanda-grid__tag-mesa" style={{ background: alfa(C.accent, "14"), color: C.accent, fontSize: sz.fontSm }}>
                          🪑 {order.mesa}{order.apelido ? ` · ${order.apelido}` : ""}
                        </span>
                      )}
                      {!order.mesa && order.apelido && (
                        <span className="comanda-grid__tag-mesa" style={{ background: alfa(C.accent, "14"), color: C.accent, fontSize: sz.fontSm }}>
                          {order.apelido}
                        </span>
                      )}
                      {order.garcom && (
                        <span className="comanda-grid__garcom">
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
        padding: `${sz.pad}px ${sz.pad + 4}px ${sz.pad}px ${sz.pad + 20}px`,
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
        <div className="comanda-grid__paginacao" style={{ padding: `4px 0 ${sz.pad}px` }}>
          <button
            onClick={() => setLimite(l => Math.min(l + PAGE, TOTAL))}
            className="comanda-grid__ver-mais"
            style={{ fontSize: sz.fontBase }}
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
        className="comanda-card"
        style={{
          background: hovered ? alfa(C.accent, "0a") : C.card,
          border: `1.5px ${hovered ? "solid" : "dashed"} ${hovered ? alfa(C.accent, "88") : C.border}`,
          padding: `${sz.pad}px ${sz.padSm + 4}px`,
          color: hovered ? C.text : C.muted,
          gap: sz.gap - 2,
          opacity: hovered ? 1 : 0.45,
        }}
      >
        {/* Header: número + tempo placeholder */}
        <div className="comanda-card__topo">
          <div className="comanda-card__numero" style={{ fontSize: sz.fontLg - 1, color: hovered ? C.accent : C.muted }}>
            {num}
          </div>
          <span className="comanda-card__tempo" style={{
            fontSize: sz.fontSm - 1, color: C.faint,
            background: C.surface, border: `1px solid ${C.border}`,
            opacity: 0,
          }}>
            <LuClock size={10} /> —
          </span>
        </div>

        {/* Mesa/garçom placeholder — ocupa mesmo espaço */}
        <div style={{ fontSize: sz.fontSm, color: C.faint, minHeight: sz.fontSm + 4 }}>
          {hovered ? "Clique para abrir" : "Disponível"}
        </div>

        {/* Rodapé placeholder */}
        <div className="comanda-card__rodape" style={{ paddingTop: sz.padSm - 2 }}>
          <span style={{ fontSize: sz.fontSm, color: C.faint }}>—</span>
          <span className="comanda-card__rodape-total" style={{ fontSize: sz.fontBase + 1, color: C.faint }}>—</span>
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
                    : hasItems   ? alfa(C.blue, "55")
                    : C.border;
  const bgColor     = isSelected ? alfa(C.accent, "0d")
                    : isVisitada ? alfa(AMBER, "10")
                    : C.card;
  const shadow      = isSelected ? `0 4px 24px ${alfa(C.accent, "28")}`
                    : isVisitada ? `0 2px 12px ${alfa(AMBER, "20")}`
                    : hovered    ? "0 4px 16px rgba(0,0,0,0.14)"
                    : "none";

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="comanda-card"
      style={{
        background: bgColor,
        border: `1.5px solid ${hovered && !isSelected ? alfa(C.accent, "55") : borderColor}`,
        padding: `${sz.pad}px ${sz.padSm + 4}px`,
        color: C.text,
        gap: sz.gap - 2,
        boxShadow: shadow,
      }}
    >
      {/* Header: número + tempo */}
      <div className="comanda-card__topo">
        <div className="comanda-card__numero" style={{ fontSize: sz.fontLg - 1, color: isSelected ? C.accent : C.text }}>
          {num}
        </div>
        <span className="comanda-card__tempo" style={{
          fontSize: sz.fontSm - 1, color: elapsed.color,
          background: elapsed.warn ? alfa(elapsed.color, "14") : C.surface,
          border: elapsed.warn ? `1px solid ${alfa(elapsed.color, "33")}` : `1px solid ${C.border}`,
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
              background: alfa(C.accent, "14"), borderRadius: 6, padding: "2px 7px",
            }}>
              🪑 {order.mesa}{order.apelido ? ` · ${order.apelido}` : ""}
            </span>
          )}
          {!order.mesa && order.apelido && (
            <span style={{
              fontSize: sz.fontSm, fontWeight: 700, color: C.accent,
              background: alfa(C.accent, "14"), borderRadius: 6, padding: "2px 7px",
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
      <div className="comanda-card__rodape" style={{ paddingTop: sz.padSm - 2 }}>
        <span className="comanda-card__rodape-tag" style={{
          fontSize: sz.fontSm, color: hasItems ? C.muted : C.faint,
          background: hasItems ? C.surface : "transparent",
          padding: hasItems ? "2px 7px" : "0",
        }}>
          {hasItems ? `${qtdTotal} ${qtdTotal === 1 ? "item" : "itens"}` : "Vazio"}
        </span>
        <span className="comanda-card__rodape-total" style={{
          fontSize: sz.fontBase + 1,
          color: hasItems ? C.green : C.faint,
        }}>
          {hasItems ? `R$ ${total.toFixed(2)}` : "—"}
        </span>
      </div>
    </button>
  );
}
