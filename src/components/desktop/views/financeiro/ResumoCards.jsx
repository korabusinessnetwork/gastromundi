import C from "@/constants/colors";
import { varColor } from "@/lib/tema";
import { LuTrendingUp, LuTrendingDown, LuWallet, LuClock } from "react-icons/lu";
import "./ResumoCards.css";

function fmtR(v) {
  return "R$ " + Number(v ?? 0).toFixed(2);
}

export default function ResumoCards({ fluxo, width, sz }) {
  const cards = [
    { label: "Entradas realizadas", value: fmtR(fluxo.realizado.entradas), color: varColor(C.green), Icon: LuTrendingUp },
    { label: "Saídas realizadas",   value: fmtR(fluxo.realizado.saidas),   color: varColor(C.red),   Icon: LuTrendingDown },
    { label: "Saldo",               value: fmtR(fluxo.realizado.saldo),    color: fluxo.realizado.saldo >= 0 ? varColor(C.green) : varColor(C.red), Icon: LuWallet },
    { label: "Previsto (a receber / a pagar)", value: `${fmtR(fluxo.previsto.entradas)} / ${fmtR(fluxo.previsto.saidas)}`, color: varColor(C.blue), Icon: LuClock },
  ];

  return (
    <div className="resumo-cards" style={{
      gridTemplateColumns: width < 600 ? "1fr" : width < 1024 ? "1fr 1fr" : "repeat(4, 1fr)",
      gap: sz.gap, padding: `${sz.pad}px ${sz.pad}px ${sz.padSm}px`,
    }}>
      {cards.map((c) => (
        <div key={c.label} className="resumo-cards__card" style={{ padding: `${sz.padSm + 2}px ${sz.pad - 4}px` }}>
          <c.Icon size={sz.fontXl - 4} color={c.color} />
          <div style={{ minWidth: 0 }}>
            <div className="resumo-cards__valor" style={{ fontSize: sz.fontXl - 10, color: c.color }}>{c.value}</div>
            <div className="resumo-cards__label" style={{ fontSize: sz.fontSm }}>{c.label}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
