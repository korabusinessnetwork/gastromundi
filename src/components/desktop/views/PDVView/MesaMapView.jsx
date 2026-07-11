import C from "@/constants/colors";
import { alfa } from "@/constants/colorAlfa";
import { varColor } from "@/lib/tema";
import { useResponsive } from "@/utils/hooks";
import { getSizes } from "@/constants/sizes";

function statusMesa(mesa, abertas) {
  if (mesa.status_manual === "manutencao") return "manutencao";
  const temPedidoAtivo = abertas.some(
    (o) => String(o.mesa) === String(mesa.numero)
         && o.status !== "closed"
         && Array.isArray(o.items) && o.items.length > 0
  );
  if (temPedidoAtivo) return "aberta";
  if (mesa.status_manual === "reservada") return "reservada";
  return "livre";
}

const STATUS = {
  livre:      { label: "Livre",      bg: `${alfa(C.green, "14")}`,  border: `${alfa(C.green, "44")}`,  cor: varColor(C.green)   },
  aberta:     { label: "Aberta",     bg: "#eab30814",     border: "#eab30855",     cor: "#eab308" },
  reservada:  { label: "Reservada",  bg: "#f59e0b14",     border: "#f59e0b55",     cor: "#f59e0b" },
  manutencao: { label: "Manutenção", bg: `${alfa(C.red, "10")}`,    border: `${alfa(C.red, "44")}`,    cor: varColor(C.red)     },
};

export default function MesaMapView({ mesas, loading, abertas, onSelectComanda, onOpenEmpty }) {
  const { width } = useResponsive();
  const sz = getSizes(width);

  if (loading) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: varColor(C.muted), fontSize: sz.fontBase }}>
        Carregando mesas...
      </div>
    );
  }

  if (mesas.length === 0) {
    return (
      <div style={{
        flex: 1, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        gap: 14, color: varColor(C.muted), padding: 40, textAlign: "center",
      }}>
        <div style={{ fontSize: 52 }}>🪑</div>
        <div style={{ fontWeight: 800, fontSize: sz.fontBase + 2, color: varColor(C.text) }}>
          Nenhuma mesa cadastrada
        </div>
        <div style={{ fontSize: sz.fontBase, maxWidth: 340, lineHeight: 1.6 }}>
          Cadastre mesas em Configurações para visualizá-las no mapa.
          As vendas funcionam normalmente pelo modo Lista.
        </div>
      </div>
    );
  }

  const cardW = width >= 1024 ? 110 : 90;
  const cardH = width >= 1024 ? 96  : 78;
  const gap   = 12;

  const handleClick = (mesa) => {
    const st = statusMesa(mesa, abertas);
    if (st === "manutencao") return;
    if (st === "aberta") {
      const pedido = abertas.find(
        (o) => String(o.mesa) === String(mesa.numero)
             && o.status !== "closed"
             && Array.isArray(o.items) && o.items.length > 0
      );
      if (pedido) onSelectComanda(pedido);
    } else {
      onOpenEmpty(mesa.numero, { mesa: mesa.numero });
    }
  };

  const temPosicao = mesas.some((m) => m.posicao_x != null && m.posicao_y != null);

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: `${sz.pad}px ${sz.pad + 4}px` }}>
      {/* Legenda de status */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {Object.entries(STATUS).map(([key, s]) => (
          <span key={key} style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            padding: "3px 10px", borderRadius: 20,
            background: s.bg, border: `1px solid ${s.border}`,
            fontSize: 12, fontWeight: 700, color: s.cor,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: s.cor, display: "inline-block", flexShrink: 0 }} />
            {s.label}
          </span>
        ))}
      </div>

      {temPosicao ? (
        <LayoutAbsoluto
          mesas={mesas} abertas={abertas}
          cardW={cardW} cardH={cardH} gap={gap}
          onClickMesa={handleClick} sz={sz}
        />
      ) : (
        <LayoutGrid
          mesas={mesas} abertas={abertas}
          cardW={cardW} cardH={cardH} gap={gap}
          totalWidth={width - (sz.pad + 4) * 2}
          onClickMesa={handleClick} sz={sz}
        />
      )}
    </div>
  );
}

function LayoutGrid({ mesas, abertas, cardW, cardH, gap, totalWidth, onClickMesa, sz }) {
  const cols = Math.max(2, Math.min(10, Math.floor((totalWidth + gap) / (cardW + gap))));
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: `repeat(${cols}, ${cardW}px)`,
      gap,
    }}>
      {mesas.map((m) => (
        <CardMesa key={m.numero} mesa={m} abertas={abertas} w={cardW} h={cardH} sz={sz} onClick={onClickMesa} />
      ))}
    </div>
  );
}

function LayoutAbsoluto({ mesas, abertas, cardW, cardH, gap, onClickMesa, sz }) {
  const maxX = Math.max(...mesas.map((m) => m.posicao_x ?? 1));
  const maxY = Math.max(...mesas.map((m) => m.posicao_y ?? 1));
  const containerW = maxX * (cardW + gap) - gap;
  const containerH = maxY * (cardH + gap) - gap;
  return (
    <div style={{ position: "relative", width: containerW, height: containerH, margin: "0 auto" }}>
      {mesas.map((m) => {
        const x = ((m.posicao_x ?? 1) - 1) * (cardW + gap);
        const y = ((m.posicao_y ?? 1) - 1) * (cardH + gap);
        return (
          <div key={m.numero} style={{ position: "absolute", left: x, top: y }}>
            <CardMesa mesa={m} abertas={abertas} w={cardW} h={cardH} sz={sz} onClick={onClickMesa} />
          </div>
        );
      })}
    </div>
  );
}

function CardMesa({ mesa, abertas, w, h, sz, onClick }) {
  const st    = statusMesa(mesa, abertas);
  const s     = STATUS[st];
  const pedido = st === "aberta"
    ? abertas.find((o) => String(o.mesa) === String(mesa.numero) && o.status !== "closed" && Array.isArray(o.items) && o.items.length > 0)
    : null;
  const total = pedido
    ? (Array.isArray(pedido.items) ? pedido.items : [])
        .filter((i) => !i.cancelado)
        .reduce((acc, i) => acc + (i.price ?? 0) * (i.qty ?? 1), 0)
    : 0;

  return (
    <div
      onClick={() => onClick(mesa)}
      title={`Mesa ${mesa.numero} — ${s.label}${pedido?.garcom ? ` · ${pedido.garcom}` : ""}`}
      style={{
        width: w, height: h, borderRadius: 14, boxSizing: "border-box",
        background: s.bg, border: `2px solid ${s.border}`,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        gap: 2, padding: "6px 4px", userSelect: "none",
        cursor: st === "manutencao" ? "not-allowed" : "pointer",
        transition: "transform 0.1s, box-shadow 0.1s",
      }}
      onMouseEnter={(e) => {
        if (st === "manutencao") return;
        e.currentTarget.style.transform = "translateY(-2px)";
        e.currentTarget.style.boxShadow = `0 6px 18px ${s.border}`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "";
        e.currentTarget.style.boxShadow = "";
      }}
    >
      <div style={{ fontSize: sz.fontBase + 2, fontWeight: 900, color: s.cor, lineHeight: 1 }}>
        {mesa.numero}
      </div>
      <div style={{ fontSize: 10, fontWeight: 700, color: s.cor, textTransform: "uppercase", letterSpacing: 0.5, opacity: 0.85 }}>
        {s.label}
      </div>
      {total > 0 && (
        <div style={{ fontSize: 11, fontWeight: 800, color: s.cor }}>
          R$ {total.toFixed(2)}
        </div>
      )}
      {pedido?.garcom && (
        <div style={{
          fontSize: 10, color: s.cor, opacity: 0.7,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          maxWidth: w - 12,
        }}>
          {pedido.garcom}
        </div>
      )}
      {st === "livre" && mesa.capacidade != null && (
        <div style={{ fontSize: 10, color: s.cor, opacity: 0.6 }}>
          {mesa.capacidade}p
        </div>
      )}
    </div>
  );
}
