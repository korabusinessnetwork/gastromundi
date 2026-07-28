import { useState } from "react";
import PerfilImpressora from "./PerfilImpressora";
import PonteLocalConfig from "./PonteLocalConfig";
import "./ConfiguracaoImpressao.css";

// Leva "Impressão do zero, sem QZ Tray" (2026-07): o QZ Tray morreu, e com
// ele foram Locais de Impressão, Roteamento por Categoria, Impressoras e
// Histórico — tudo isso vivia da fila no banco + QZ, que não existem mais.
// Sobra só o que o dono pediu pra ficar: o layout da comanda impressa
// (agora falando com a Ponte KORA em vez do QZ Tray) e a Ponte em si
// (que não é sistema de impressão — é o QR/token do Palm pra pedido
// offline, uma feature viva e separada).
const ABAS = [
  { id: "comanda", label: "Layout da comanda" },
  { id: "ponte",   label: "Pedidos sem Internet" },
];

export default function ConfiguracaoImpressao({ sz }) {
  const [aba, setAba] = useState("comanda");

  return (
    <div>
      <div className="configuracao-impressao__abas">
        {ABAS.map(a => (
          <button
            key={a.id}
            onClick={() => setAba(a.id)}
            className={`configuracao-impressao__aba${aba === a.id ? " configuracao-impressao__aba--ativa" : ""}`}
          >
            {a.label}
          </button>
        ))}
      </div>

      {aba === "comanda" && <PerfilImpressora sz={sz} />}
      {aba === "ponte"   && <PonteLocalConfig sz={sz} />}
    </div>
  );
}
