import { useMemo, useState } from "react";
import { LuSearch, LuTriangleAlert } from "react-icons/lu";
import { useApp } from "@/context/AppContext";
import "./SecaoRadar.css";

/**
 * SecaoRadar — "o que é comida, bebida e sobremesa" no Palm.
 *
 * Espelha a aba Radar de Oportunidades do desktop (CategoriasGrupoTab em
 * ConfiguracoesView.jsx): associa cada categoria de produto (texto livre) a um
 * grupo vindo de `grupos_categoria`. É esse mapa que o Painel do garçom usa
 * para sugerir a venda que falta. Categoria sem grupo é ignorada pelo radar —
 * por isso a tela mostra, em cima, quantas ainda estão sem.
 *
 * Salvamento imediato ao escolher (sem botão Salvar): é uma escolha por linha,
 * e um botão global aqui só criaria a dúvida "será que gravou?".
 *
 * Corpo puro: o cabeçalho (título + voltar) é do hub.
 */

export default function SecaoRadar() {
  const { products, gruposCategoria, categoriaGrupos, setCategoriaGrupo } = useApp();
  const [salvandoCat, setSalvandoCat] = useState(null);
  const [busca, setBusca] = useState("");

  const categorias = useMemo(
    () =>
      [...new Set((products ?? []).map((p) => p.category).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b, "pt-BR")
      ),
    [products]
  );

  const grupoPorCategoria = useMemo(() => {
    const mapa = {};
    for (const linha of categoriaGrupos ?? []) mapa[linha.category] = linha.grupo_id;
    return mapa;
  }, [categoriaGrupos]);

  const semGrupo = categorias.filter((cat) => !grupoPorCategoria[cat]).length;

  const termo = busca.trim().toLowerCase();
  const visiveis = termo
    ? categorias.filter((cat) => cat.toLowerCase().includes(termo))
    : categorias;

  const escolher = async (categoria, valor) => {
    setSalvandoCat(categoria);
    await setCategoriaGrupo(categoria, valor === "" ? null : Number(valor));
    setSalvandoCat(null);
  };

  return (
    <div className="mod-lista">
      <div className="cfg-card cfg-card--coluna">
        <div className="cfg-card__titulo">Como o radar funciona</div>
        <div className="cfg-card__ajuda">
          Diga o que é comida, bebida e sobremesa. Com isso o Painel avisa a venda que
          falta na mesa — por exemplo: pediu comida e não pediu bebida nem sobremesa.
        </div>
      </div>

      {/* O que falta preencher vem antes da lista: sem isso o dono não tem
          como saber que o radar está cego em parte do cardápio. */}
      {semGrupo > 0 ? (
        <div className="cfg-nota">
          <LuTriangleAlert aria-hidden="true" />
          <span>
            {semGrupo === 1
              ? "1 categoria ainda está sem grupo e o radar não a enxerga."
              : `${semGrupo} categorias ainda estão sem grupo e o radar não as enxerga.`}
          </span>
        </div>
      ) : null}

      {categorias.length === 0 ? (
        <div className="mod-vazio">
          <div className="mod-vazio__titulo">Nenhuma categoria ainda</div>
          <p className="mod-vazio__texto">
            As categorias aparecem aqui assim que houver produtos cadastrados no cardápio.
          </p>
        </div>
      ) : (
        <>
          {categorias.length > 6 ? (
            <div className="mod-busca">
              <LuSearch aria-hidden="true" />
              <input
                type="search"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar categoria"
                aria-label="Buscar categoria"
              />
            </div>
          ) : null}

          {visiveis.length === 0 ? (
            <div className="mod-vazio">
              <div className="mod-vazio__titulo">Nada encontrado</div>
              <p className="mod-vazio__texto">Nenhuma categoria com “{busca.trim()}”.</p>
            </div>
          ) : (
            visiveis.map((cat) => (
              <div className="cfg-card cfg-card--coluna cfg-radar__item" key={cat}>
                <div className="cfg-radar__nome">{cat}</div>
                <select
                  className={`cfg-select${grupoPorCategoria[cat] ? " cfg-radar__select--definido" : ""}`}
                  value={grupoPorCategoria[cat] ?? ""}
                  onChange={(e) => escolher(cat, e.target.value)}
                  disabled={salvandoCat === cat}
                  aria-label={`Grupo da categoria ${cat}`}
                >
                  <option value="">— sem grupo —</option>
                  {(gruposCategoria ?? []).map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.nome}
                    </option>
                  ))}
                </select>
              </div>
            ))
          )}
        </>
      )}
    </div>
  );
}
