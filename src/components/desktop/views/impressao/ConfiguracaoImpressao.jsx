import { useState } from "react";
import C from "@/constants/colors";
import LocaisImpressao from "./LocaisImpressao";
import RoteamentoCategorias from "./RoteamentoCategorias";
import ImpressorasConfig from "./ImpressorasConfig";

const ABAS = [
  { id: "locais",       label: "Locais de Impressão"      },
  { id: "roteamento",   label: "Roteamento por Categoria" },
  { id: "impressoras",  label: "Impressoras"              },
];

export default function ConfiguracaoImpressao({ sz }) {
  const [aba, setAba] = useState("locais");

  return (
    <div>
      {/* Sub-tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: sz.pad, borderBottom: `1px solid ${C.border}`, paddingBottom: sz.padSm }}>
        {ABAS.map(a => (
          <button
            key={a.id}
            onClick={() => setAba(a.id)}
            style={{
              padding: "7px 16px", borderRadius: 8, border: "none",
              background: aba === a.id ? `${C.accent}18` : "transparent",
              color: aba === a.id ? C.accent : C.muted,
              cursor: "pointer", fontWeight: aba === a.id ? 700 : 500,
              fontSize: sz.fontSm + 1, fontFamily: "inherit",
              transition: "background 0.15s, color 0.15s",
              borderBottom: aba === a.id ? `2px solid ${C.accent}` : "2px solid transparent",
              borderRadius: "8px 8px 0 0",
            }}
          >
            {a.label}
          </button>
        ))}
      </div>

      {aba === "locais"      && <LocaisImpressao sz={sz} />}
      {aba === "roteamento"  && <RoteamentoCategorias sz={sz} />}
      {aba === "impressoras" && <ImpressorasConfig sz={sz} />}
    </div>
  );
}
