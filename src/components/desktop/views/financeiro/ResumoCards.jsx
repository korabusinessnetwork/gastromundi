import C from "@/constants/colors";
import { varColor } from "@/lib/tema";
import { LuTrendingUp, LuTrendingDown, LuWallet, LuClock, LuPiggyBank } from "react-icons/lu";
import "./ResumoCards.css";

function fmtR(v) {
  return "R$ " + Number(v ?? 0).toFixed(2);
}

export default function ResumoCards({ fluxo, lucro, width, sz }) {
  const cards = [
    { label: "Entradas realizadas", value: fmtR(fluxo.realizado.entradas), color: varColor(C.green), Icon: LuTrendingUp },
    { label: "Saídas realizadas",   value: fmtR(fluxo.realizado.saidas),   color: varColor(C.red),   Icon: LuTrendingDown },
    { label: "Saldo",               value: fmtR(fluxo.realizado.saldo),    color: fluxo.realizado.saldo >= 0 ? varColor(C.green) : varColor(C.red), Icon: LuWallet },
    { label: "Previsto (a receber / a pagar)", value: `${fmtR(fluxo.previsto.entradas)} / ${fmtR(fluxo.previsto.saidas)}`, color: varColor(C.blue), Icon: LuClock },
  ];

  // Leva 15.6 — lucro = entradas − custo das fichas técnicas − saídas pagas.
  // Quando há itens vendidos sem ficha cadastrada, o rótulo avisa que o
  // custo está parcial em vez de mostrar um lucro inflado como se fosse exato.
  if (lucro) {
    cards.push({
      label: lucro.unidadesSemFicha > 0
        ? `Lucro (parcial — ${lucro.unidadesSemFicha} ${lucro.unidadesSemFicha === 1 ? "item vendido sem ficha técnica" : "itens vendidos sem ficha técnica"})`
        : "Lucro (vendas − custo das fichas − saídas pagas)",
      value: fmtR(lucro.valor),
      color: lucro.valor >= 0 ? varColor(C.green) : varColor(C.red),
      Icon: LuPiggyBank,
    });
  }

  return (
    <div className="resumo-cards" style={{
      gridTemplateColumns: width < 600 ? "1fr" : width < 1024 ? "1fr 1fr" : `repeat(${cards.length}, 1fr)`,
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
