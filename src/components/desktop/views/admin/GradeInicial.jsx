import { LuChevronRight } from "react-icons/lu";

export default function GradeInicial({ secoes, onSelecionar, onNavegar, fichas, fornecedores, compras, impostos, notasFiscaisCount }) {
  const contadores = { fichas: fichas.length, fornecedores: fornecedores.length, compras: compras.length, impostos: impostos.length, notas_fiscais: notasFiscaisCount };
  return (
    <div className="grade-inicial">
      <div className="grade-inicial__grid">
        {secoes.map(s => (
          <button
            key={s.id}
            onClick={() => s.to ? onNavegar(s.to) : onSelecionar(s.id)}
            className={`grade-inicial__card grade-inicial__card--${s.tom}`}
          >
            <div className="grade-inicial__icone">
              <s.Icon size={20} />
            </div>
            <div className="grade-inicial__texto">
              <div className="grade-inicial__titulo">{s.label}</div>
              <div className="grade-inicial__desc">{s.desc}</div>
            </div>
            <div className="grade-inicial__rodape">
              <span className="grade-inicial__contador">
                {s.to
                  ? "Abrir"
                  : `${contadores[s.id]} ${contadores[s.id] === 1 ? "registro" : "registros"}`}
              </span>
              <LuChevronRight size={16} className="grade-inicial__seta" />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── View principal ────────────────────────────────────────────────
