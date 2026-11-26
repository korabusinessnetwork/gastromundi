import { LuTrendingUp, LuTrendingDown, LuWallet, LuClock, LuPiggyBank } from "react-icons/lu";
import "./ResumoCards.css";

function fmtR(v) {
  return "R$ " + Number(v ?? 0).toFixed(2);
}

export default function ResumoCards({ fluxo, lucro, width, sz }) {
  const cards = [
    { label: "Entradas realizadas", value: fmtR(fluxo.realizado.entradas), tom: "verde", Icon: LuTrendingUp },
    { label: "Saídas realizadas",   value: fmtR(fluxo.realizado.saidas),   tom: "vermelho", Icon: LuTrendingDown },
    { label: "Saldo",               value: fmtR(fluxo.realizado.saldo),    tom: fluxo.realizado.saldo >= 0 ? "verde" : "vermelho", Icon: LuWallet },
    { label: "Previsto (a receber / a pagar)", value: `${fmtR(fluxo.previsto.entradas)} / ${fmtR(fluxo.previsto.saidas)}`, tom: "azul", Icon: LuClock },
  ];

  // Leva 15.6 — lucro = entradas − custo das fichas técnicas − saídas pagas.
  // Quando há itens vendidos sem ficha cadastrada, o rótulo avisa que o
  // custo está parcial em vez de mostrar um lucro inflado como se fosse exato.
  if (lucro) {
    cards.push({
      label: lucro.unidadesSemFicha > 0
        ? `Lucro (parcial, ${lucro.unidadesSemFicha} ${lucro.unidadesSemFicha === 1 ? "item vendido sem ficha técnica" : "itens vendidos sem ficha técnica"})`
        : "Lucro (vendas − custo das fichas − saídas pagas)",
      value: fmtR(lucro.valor),
      tom: lucro.valor >= 0 ? "verde" : "vermelho",
      Icon: LuPiggyBank,
    });
  }

  return (
    <div className="resumo-cards" style={{ "--resumo-cols": width < 600 ? 1 : width < 1024 ? 2 : cards.length }}>
      {cards.map((c) => (
        <div key={c.label} className={`resumo-cards__card resumo-cards__card--${c.tom}`}>
          <c.Icon size={sz.fontXl - 4} className="resumo-cards__icone" />
          <div className="resumo-cards__texto">
            <div className="resumo-cards__valor">{c.value}</div>
            <div className="resumo-cards__label">{c.label}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
