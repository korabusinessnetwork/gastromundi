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
// Leva "Layout da comanda" (2026-08-27): a aba `comanda` nunca foi layout —
// é largura do papel, corte e tamanho da letra, ou seja, característica do
// EQUIPAMENTO. Passa a se chamar "Papel e impressora", que é o que ela faz,
// e o nome "Layout da comanda" vai para a aba nova, que decide o CONTEÚDO do
// papel (logo, endereço/CNPJ e mensagem do rodapé). Duas abas chamadas
// "layout" seria exatamente o tipo de rótulo que obriga a abrir as duas pra
// descobrir qual é qual — o oposto do Princípio nº1.
//
// A aba padrão continua sendo `comanda`: quem já usa o sistema abre a tela e
// cai onde sempre caiu, mesmo com o rótulo novo.
const ABAS = [
  { id: "comanda", label: "Papel e impressora" },
  { id: "layout",  label: "Layout da comanda" },
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
      {aba === "layout"  && <LayoutComanda />}
      {aba === "pontos"  && <PontosImpressao sz={sz} />}
      {aba === "ponte"   && <PonteLocalConfig sz={sz} />}
    </div>
  );
}
