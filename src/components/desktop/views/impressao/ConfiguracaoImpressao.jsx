import { useState } from "react";
import C from "@/constants/colors";
import { alfa } from "@/constants/colorAlfa";
import { varColor } from "@/lib/tema";
import LocaisImpressao from "./LocaisImpressao";
import RoteamentoCategorias from "./RoteamentoCategorias";
import ImpressorasConfig from "./ImpressorasConfig";
import PerfilImpressora from "./PerfilImpressora";
import PonteLocalConfig from "./PonteLocalConfig";
import HistoricoImpressao from "./HistoricoImpressao";

const ABAS = [
  { id: "locais",       label: "Locais de Impressão"      },
  { id: "roteamento",   label: "Roteamento por Categoria" },
  { id: "impressoras",  label: "Impressoras"              },
  { id: "perfil",       label: "Perfil de Impressão"      },
  { id: "ponte",        label: "Pedidos sem Internet"     },
  { id: "historico",    label: "Histórico de Impressão"   },
];

export default function ConfiguracaoImpressao({ sz }) {
  const [aba, setAba] = useState("locais");

  return (
    <div>
      {/* Sub-tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: sz.pad, borderBottom: `1px solid var(${C.border})`, paddingBottom: sz.padSm }}>
        {ABAS.map(a => (
          <button
            key={a.id}
            onClick={() => setAba(a.id)}
            style={{
              padding: "7px 16px", borderRadius: "8px 8px 0 0", border: "none",
              background: aba === a.id ? `${alfa(C.accent, "18")}` : "transparent",
              color: aba === a.id ? varColor(C.accent) : varColor(C.muted),
              cursor: "pointer", fontWeight: aba === a.id ? 700 : 500,
              fontSize: sz.fontSm + 1, fontFamily: "inherit",
              transition: "background 0.15s, color 0.15s",
              borderBottom: aba === a.id ? `2px solid var(${C.accent})` : "2px solid transparent",
            }}
          >
            {a.label}
          </button>
        ))}
      </div>

      {aba === "locais"      && <LocaisImpressao sz={sz} />}
      {aba === "roteamento"  && <RoteamentoCategorias sz={sz} />}
      {aba === "impressoras" && <ImpressorasConfig sz={sz} />}
      {aba === "perfil"      && <PerfilImpressora sz={sz} />}
      {aba === "ponte"       && <PonteLocalConfig sz={sz} />}
      {aba === "historico"   && <HistoricoImpressao sz={sz} />}
    </div>
  );
}
