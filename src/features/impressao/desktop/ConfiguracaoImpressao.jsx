import { useState } from "react";
import PerfilImpressora from "./PerfilImpressora";
import LayoutComanda from "./LayoutComanda";
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
//
// Leva "Layout da comanda" (2026-08): a aba que se chamava "Layout da
// comanda" na verdade configurava o EQUIPAMENTO (driver, largura do
// papel, fonte) — virou "Impressora e papel", que é o que ela sempre
// fez. O nome ficou livre para a página nova, que configura o que sai
// impresso no papel: logo, endereço, CNPJ e a mensagem do rodapé.
// Duas telas com o mesmo nome quebram o Princípio nº1 antes mesmo de o
// dono clicar. Ordem proposital: primeiro a impressora (sem ela não sai
// papel nenhum), depois o que vai escrito nele.
const ABAS = [
  { id: "impressora", label: "Impressora e papel" },
  { id: "layout",     label: "Layout da comanda" },
  { id: "pontos",     label: "Onde cada item imprime" },
  { id: "ponte",      label: "Pedidos sem Internet" },
];

export default function ConfiguracaoImpressao({ sz }) {
  const [aba, setAba] = useState("impressora");

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

      {aba === "impressora" && <PerfilImpressora sz={sz} />}
      {aba === "layout"     && <LayoutComanda />}
      {aba === "pontos"     && <PontosImpressao sz={sz} />}
      {aba === "ponte"      && <PonteLocalConfig sz={sz} />}
    </div>
  );
}
