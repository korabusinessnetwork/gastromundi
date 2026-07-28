import { useState } from "react";
import PerfilImpressora from "./PerfilImpressora";
import PontosImpressao from "./PontosImpressao";
import PonteLocalConfig from "./PonteLocalConfig";
import "./ConfiguracaoImpressao.css";

// Leva "Impressão do zero, sem QZ Tray" (2026-07): o QZ Tray morreu, e com
// ele foram Locais de Impressão, Roteamento por Categoria, Impressoras e
// Histórico — tudo isso vivia da fila no banco + QZ, que não existem mais.
// Sobra só o que o dono pediu pra ficar: o layout da comanda impressa
// (agora falando com a Ponte KORA em vez do QZ Tray) e a Ponte em si
// (que não é sistema de impressão — é o QR/token do Palm pra pedido
// offline, uma feature viva e separada).
//
// Leva "Pontos de impressão" (2026-07-28): volta a existir mais de um
// destino de impressão (cozinha, bar, chapa…), mas agora do jeito certo —
// multi-tenant, sem tabela órfã, com um ponto padrão que nunca deixa o
// dono sem impressão. O rótulo da aba já diz o que ela resolve ("onde
// cada item imprime"), não como ela resolve ("roteamento") — é o mesmo
// motivo do Princípio nº1: a tela fala a língua do restaurante.
const ABAS = [
  { id: "comanda", label: "Layout da comanda" },
  { id: "pontos",  label: "Onde cada item imprime" },
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
      {aba === "pontos"  && <PontosImpressao sz={sz} />}
      {aba === "ponte"   && <PonteLocalConfig sz={sz} />}
    </div>
  );
}
