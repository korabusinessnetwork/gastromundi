import C from "@/constants/colors";
import { varColor } from "@/lib/tema";
import { alfa } from "@/constants/colorAlfa";
import {
  LuChevronRight
} from "react-icons/lu";

export default function GradeInicial({ secoes, onSelecionar, onNavegar, fichas, fornecedores, compras, impostos, notasFiscaisCount }) {
  const contadores = { fichas: fichas.length, fornecedores: fornecedores.length, compras: compras.length, impostos: impostos.length, notas_fiscais: notasFiscaisCount };
  return (
    <div className="grade-inicial">
      <div className="grade-inicial__grid">
        {secoes.map(s => (
          <button
            key={s.id}
            onClick={() => s.to ? onNavegar(s.to) : onSelecionar(s.id)}
            className="grade-inicial__card"
            style={{ borderColor: varColor(C.border) }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = alfa(s.color, "66"); e.currentTarget.style.background = alfa(s.color, "08"); }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = varColor(C.border); e.currentTarget.style.background = varColor(C.card); }}
          >
            <div className="grade-inicial__icone" style={{ background: alfa(s.color, "18"), borderColor: alfa(s.color, "44") }}>
              <s.Icon size={20} color={s.color} />
            </div>
            <div style={{ flex: 1 }}>
              <div className="grade-inicial__titulo">{s.label}</div>
              <div className="grade-inicial__desc">{s.desc}</div>
            </div>
            <div className="grade-inicial__rodape">
              <span className="grade-inicial__contador">
                {s.to
                  ? "Abrir"
                  : `${contadores[s.id]} ${contadores[s.id] === 1 ? "registro" : "registros"}`}
              </span>
              <LuChevronRight size={16} color={varColor(C.muted)} />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── View principal ────────────────────────────────────────────────
