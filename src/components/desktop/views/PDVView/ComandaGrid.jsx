import { useState } from "react";
import C from "@/constants/colors";
import { varColor } from "@/lib/tema";
import { alfa } from "@/constants/colorAlfa";
import { useResponsive } from "@/utils/hooks";
import { getSizes } from "@/constants/sizes";
import { LuUser, LuClock, LuLock } from "react-icons/lu";
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
  if (!dateStr) return { label: "", color: varColor(C.muted), warn: false };
  const diff = Date.now() - new Date(dateStr).getTime();
  const m    = Math.floor(diff / 60000);
  if (m < 1)  return { label: "agora",             color: varColor(C.green), warn: false };
  if (m < 30) return { label: `${m}min`,            color: varColor(C.muted), warn: false };
  if (m < 60) return { label: `${m}min`,            color: AMBER,   warn: true  };
  const h = Math.floor(m / 60);
  const r = m % 60;
  return { label: `${h}h${r > 0 ? `${r}min` : ""}`, color: "#ef4444", warn: true };
}

export default function ComandaGrid({ abertas, visitadas = new Set(), selected, onSelect, onOpenEmpty, busca = "", somenteAbertas = false, emUsoPor = () => null }) {
  const { width } = useResponsive();
  const sz = getSizes(width);
  const [limite, setLimite] = useState(PAGE);

  const mapa = {};
  (abertas ?? []).forEach(o => { mapa[String(o.comanda)] = o; });

  // ── Modo busca / somente abertas ──────────────────────────────
  // `somenteAbertas` (aba "Comandas abertas"): mesma lista compacta da
  // busca, mas SEM slots vazios — só o que existe e ainda não foi pago,
  // da mais antiga pra mais nova (quem espera há mais tempo primeiro).
  if (busca.trim() || somenteAbertas) {
    const q = busca.trim().toLowerCase();
    const aberasFiltradas = (abertas ?? [])
      .filter(o =>
        !q ||
        String(o.comanda ?? "").toLowerCase().includes(q) ||
        fmtComanda(o.comanda).toLowerCase().includes(q) ||
        (o.garcom ?? "").toLowerCase().includes(q)
      )
      .sort((a, b) => somenteAbertas
        ? new Date(a.created_at ?? 0) - new Date(b.created_at ?? 0)
        : 0);
    const numBusca      = !somenteAbertas && /^\d+$/.test(busca.trim()) ? parseInt(busca.trim(), 10) : null;
    const slotDisponivel = numBusca && !mapa[String(numBusca)] ? numBusca : null;
    const vazio          = aberasFiltradas.length === 0 && !slotDisponivel;

    return (
      <div style={{ height: "100%", overflowY: "auto", padding: `${sz.pad}px ${sz.pad + 4}px ${sz.pad}px ${sz.pad + 20}px` }}>
        {vazio ? (
          <div className="comanda-grid__vazio" style={{ color: varColor(C.muted) }}>
            <div className="comanda-grid__vazio-icone">{somenteAbertas && !q ? "✅" : "🔍"}</div>
            <div className="comanda-grid__vazio-titulo" style={{ fontWeight: 600 }}>
              {somenteAbertas && !q ? "Nenhuma comanda em aberto" : "Nenhuma comanda encontrada"}
            </div>
            <div className="comanda-grid__vazio-texto">
              {somenteAbertas && !q
                ? "Todas as comandas foram pagas"
                : `"${busca}" não corresponde a nenhuma comanda em aberto`}
            </div>
          </div>
        ) : (
          <div className="comanda-grid__lista-busca" style={{ maxWidth: Math.min(580, width - sz.pad * 2) }}>
            {slotDisponivel && (
              <button
                onClick={() => onOpenEmpty(String(slotDisponivel))}
                className="comanda-grid__slot-disponivel"
                style={{ border: `1.5px dashed ${alfa(C.accent, "66")}`, background: alfa(C.accent, "08"), color: varColor(C.text) }}
                onMouseEnter={e => { e.currentTarget.style.background = alfa(C.accent, "14"); e.currentTarget.style.borderColor = varColor(C.accent); }}
                onMouseLeave={e => { e.currentTarget.style.background = alfa(C.accent, "08"); e.currentTarget.style.borderColor = alfa(C.accent, "66"); }}
              >
                <div className="comanda-grid__slot-icone" style={{ background: alfa(C.accent, "18"), border: `1.5px solid ${alfa(C.accent, "44")}`, color: varColor(C.accent) }}>+</div>
                <div>
                  <div className="comanda-grid__slot-titulo" style={{ fontWeight: 800, color: varColor(C.accent) }}>Abrir Comanda {slotDisponivel}</div>
                  <div className="comanda-grid__slot-subtexto" style={{ color: varColor(C.muted), marginTop: 2 }}>Disponível · clique para abrir</div>
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
              const emUso      = emUsoPor(order);

              const borderColor = isSelected ? varColor(C.accent) : isVisitada ? AMBER : hasItems ? alfa(C.blue, "55") : varColor(C.border);
              const bgColor     = isSelected ? alfa(C.accent, "0d") : isVisitada ? alfa(AMBER, "10") : varColor(C.card);

              return (
                <button
                  key={order.id}
                  onClick={() => onSelect(order)}
                  className="comanda-grid__item-busca"
                  style={{
                    border: `1.5px solid ${borderColor}`,
                    background: bgColor,
                    color: varColor(C.text),
                    boxShadow: isSelected ? `0 4px 20px ${alfa(C.accent, "22")}` : isVisitada ? `0 2px 12px ${alfa(AMBER, "18")}` : "none",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.boxShadow = `0 4px 16px rgba(0,0,0,0.15)`; e.currentTarget.style.borderColor = isSelected ? varColor(C.accent) : alfa(C.accent, "66"); }}
                  onMouseLeave={e => { e.currentTarget.style.boxShadow = isSelected ? `0 4px 20px ${alfa(C.accent, "22")}` : isVisitada ? `0 2px 12px ${alfa(AMBER, "18")}` : "none"; e.currentTarget.style.borderColor = borderColor; }}
                >
                  {/* Badge número */}
                  <div className="comanda-grid__badge" style={{
                    background: isSelected ? varColor(C.accent) : isVisitada ? AMBER : hasItems ? alfa(C.blue, "18") : varColor(C.surface),
                    border: `1.5px solid ${isSelected ? varColor(C.accent) : isVisitada ? AMBER : hasItems ? alfa(C.blue, "44") : varColor(C.border)}`,
                    color: isSelected ? "#fff" : isVisitada ? "#fff" : hasItems ? varColor(C.blue) : varColor(C.muted),
                  }}>
                    {/^\d+$/.test(String(order.comanda ?? "").trim()) ? order.comanda : "C"}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="comanda-grid__item-nome" style={{ fontWeight: 800, marginBottom: 2 }}>
                      {fmtComanda(order.comanda) || `#${String(order.id).slice(-4).toUpperCase()}`}
                    </div>
                    <div className="comanda-grid__item-meta" style={{ color: varColor(C.muted), display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
                      {emUso && (
                        <span className="comanda-grid__item-emuso" style={{ fontWeight: 700, color: AMBER, display: "flex", alignItems: "center", gap: 3 }}>
                          <LuLock size={10} /> Em uso · {emUso}
                        </span>
                      )}
                      {order.mesa && (
                        <span className="comanda-grid__tag-mesa" style={{ background: alfa(C.accent, "14"), color: varColor(C.accent) }}>
                          🪑 {order.mesa}{order.apelido ? ` · ${order.apelido}` : ""}
                        </span>
                      )}
                      {!order.mesa && order.apelido && (
                        <span className="comanda-grid__tag-mesa" style={{ background: alfa(C.accent, "14"), color: varColor(C.accent) }}>
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
                    <div className="comanda-grid__item-valor" style={{ fontWeight: 800, color: hasItems ? varColor(C.green) : varColor(C.muted) }}>
                      {hasItems ? `R$ ${total.toFixed(2)}` : "Vazio"}
                    </div>
                    <div className="comanda-grid__item-tempo" style={{ display: "flex", alignItems: "center", gap: 4, color: elapsed.color }}>
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
              emUso={order ? emUsoPor(order) : null}
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
            onMouseEnter={e => e.currentTarget.style.background = varColor(C.surface)}
            onMouseLeave={e => e.currentTarget.style.background = varColor(C.card)}
          >
            Ver mais · {limite}/{TOTAL}
          </button>
        </div>
      )}
    </div>
  );
}

function ComandaCard({ num, order, isSelected, isVisitada, emUso = null, onClick, sz }) {
  const [hovered, setHovered] = useState(false);

  if (!order) {
    return (
      <button
        onClick={onClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className="comanda-card"
        style={{
          background: hovered ? alfa(C.accent, "0a") : varColor(C.card),
          border: `1.5px ${hovered ? "solid" : "dashed"} ${hovered ? alfa(C.accent, "88") : varColor(C.border)}`,
          padding: sz.padSm + 2,
          color: hovered ? varColor(C.text) : varColor(C.muted),
          gap: Math.max(4, sz.gap - 5),
          opacity: hovered ? 1 : 0.45,
        }}
      >
        {/* Header: número + tempo placeholder */}
        <div className="comanda-card__topo">
          <div className="comanda-card__numero" style={{ color: hovered ? varColor(C.accent) : varColor(C.muted) }}>
            {num}
          </div>
          <span className="comanda-card__tempo" style={{
            color: varColor(C.faint),
            background: varColor(C.surface), border: `1px solid var(${C.border})`,
            opacity: 0,
          }}>
            <LuClock size={10} /> —
          </span>
        </div>

        {/* Mesa/garçom placeholder — ocupa mesmo espaço */}
        <div className="comanda-card__mensagem" style={{ color: varColor(C.faint), minHeight: sz.fontSm + 4 }}>
          {hovered ? "Clique para abrir" : "Disponível"}
        </div>

        {/* Rodapé placeholder */}
        <div className="comanda-card__rodape" style={{ paddingTop: sz.padSm - 2 }}>
          <span className="comanda-card__rodape-tag" style={{ color: varColor(C.faint) }}>—</span>
          <span className="comanda-card__rodape-total" style={{ color: varColor(C.faint) }}>—</span>
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

  const borderColor = isSelected ? varColor(C.accent)
                    : isVisitada ? AMBER
                    : hasItems   ? alfa(C.blue, "55")
                    : varColor(C.border);
  const bgColor     = isSelected ? alfa(C.accent, "0d")
                    : isVisitada ? alfa(AMBER, "10")
                    : varColor(C.card);
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
        padding: sz.padSm + 2,
        color: varColor(C.text),
        gap: Math.max(4, sz.gap - 5),
        boxShadow: shadow,
      }}
    >
      {/* Header: número + tempo */}
      <div className="comanda-card__topo">
        <div className="comanda-card__numero" style={{ color: isSelected ? varColor(C.accent) : varColor(C.text) }}>
          {num}
        </div>
        <span className="comanda-card__tempo" style={{
          color: elapsed.color,
          background: elapsed.warn ? alfa(elapsed.color, "14") : varColor(C.surface),
          border: elapsed.warn ? `1px solid ${alfa(elapsed.color, "33")}` : `1px solid var(${C.border})`,
        }}>
          <LuClock size={10} /> {elapsed.label}
        </span>
      </div>

      {/* Nome da comanda (se diferente do número) */}
      {!/^\d+$/.test(String(order.comanda ?? "").trim()) && (
        <div className="comanda-card__nome" style={{ fontWeight: 700, color: varColor(C.text), marginTop: -4 }}>
          {order.comanda}
        </div>
      )}

      {/* Em uso por outra pessoa (trava de edição) */}
      {emUso && (
        <div className="comanda-card__emuso" style={{
          fontWeight: 700, color: AMBER,
          display: "flex", alignItems: "center", gap: 4,
        }}>
          <LuLock size={10} /> Em uso · {emUso}
        </div>
      )}

      {/* Mesa + apelido + garçom */}
      {(order.mesa || order.apelido || order.garcom) && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, alignItems: "center" }}>
          {order.mesa && (
            <span className="comanda-card__tag-mesa" style={{
              fontWeight: 700, color: varColor(C.accent),
              background: alfa(C.accent, "14"), borderRadius: 6, padding: "2px 7px",
            }}>
              🪑 {order.mesa}{order.apelido ? ` · ${order.apelido}` : ""}
            </span>
          )}
          {!order.mesa && order.apelido && (
            <span className="comanda-card__tag-mesa" style={{
              fontWeight: 700, color: varColor(C.accent),
              background: alfa(C.accent, "14"), borderRadius: 6, padding: "2px 7px",
            }}>
              {order.apelido}
            </span>
          )}
          {order.garcom && (
            <span className="comanda-card__garcom" style={{ color: varColor(C.muted), display: "flex", alignItems: "center", gap: 3 }}>
              <LuUser size={10} /> {order.garcom}
            </span>
          )}
        </div>
      )}

      {/* Rodapé: itens + total */}
      <div className="comanda-card__rodape" style={{ paddingTop: sz.padSm - 2 }}>
        <span className="comanda-card__rodape-tag" style={{
          color: hasItems ? varColor(C.muted) : varColor(C.faint),
          background: hasItems ? varColor(C.surface) : "transparent",
          padding: hasItems ? "2px 7px" : "0",
        }}>
          {hasItems ? `${qtdTotal} ${qtdTotal === 1 ? "item" : "itens"}` : "Vazio"}
        </span>
        <span className="comanda-card__rodape-total" style={{
          color: hasItems ? varColor(C.green) : varColor(C.faint),
        }}>
          {hasItems ? `R$ ${total.toFixed(2)}` : "—"}
        </span>
      </div>
    </button>
  );
}
