import C from "@/constants/colors";
import { LuTrendingUp, LuTrendingDown, LuWallet, LuClock } from "react-icons/lu";

function fmtR(v) {
  return "R$ " + Number(v ?? 0).toFixed(2);
}

export default function ResumoCards({ fluxo, width, sz }) {
  const cards = [
    { label: "Entradas realizadas", value: fmtR(fluxo.realizado.entradas), color: C.green, Icon: LuTrendingUp },
    { label: "Saídas realizadas",   value: fmtR(fluxo.realizado.saidas),   color: C.red,   Icon: LuTrendingDown },
    { label: "Saldo",               value: fmtR(fluxo.realizado.saldo),    color: fluxo.realizado.saldo >= 0 ? C.green : C.red, Icon: LuWallet },
    { label: "Previsto (a receber / a pagar)", value: `${fmtR(fluxo.previsto.entradas)} / ${fmtR(fluxo.previsto.saidas)}`, color: C.blue, Icon: LuClock },
  ];

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: width < 600 ? "1fr" : width < 1024 ? "1fr 1fr" : "repeat(4, 1fr)",
      gap: sz.gap, padding: `${sz.pad}px ${sz.pad}px ${sz.padSm}px`, flexShrink: 0,
    }}>
      {cards.map((c) => (
        <div key={c.label} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: `${sz.padSm + 2}px ${sz.pad - 4}px`, display: "flex", alignItems: "center", gap: 14 }}>
          <c.Icon size={sz.fontXl - 4} color={c.color} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 900, fontSize: sz.fontXl - 10, color: c.color, whiteSpace: "nowrap" }}>{c.value}</div>
            <div style={{ fontSize: sz.fontSm, color: C.muted, marginTop: 2 }}>{c.label}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
