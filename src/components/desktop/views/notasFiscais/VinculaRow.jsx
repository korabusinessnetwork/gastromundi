import { useState, useEffect, useRef } from "react";
import { arredondarQtd } from "@/utils/conversaoUnidades";
import {
  LuX, LuSearch
} from "react-icons/lu";
import { fmtR } from "./apoio";

export default function VinculaRow({ item, products, onChange }) {
  const [busca,  setBusca]  = useState(item.produto?.name || "");
  const [aberto, setAberto] = useState(false);
  const ref = useRef(null);

  const filtrados = busca.length > 1
    ? products.filter(p => p.name.toLowerCase().includes(busca.toLowerCase())).slice(0, 8)
    : [];

  const selectProduto = (p) => {
    setBusca(p.name);
    setAberto(false);
    const same = p.unidade_estoque && item.unidadeXml &&
      p.unidade_estoque.toLowerCase() === item.unidadeXml.toLowerCase();
    const fator = same ? 1 : 1;
    onChange({ ...item, produto: p, fator, fatorAuto: same, qtdEstoque: arredondarQtd(item.quantidade * fator) });
  };

  const clearProduto = () => {
    setBusca("");
    onChange({ ...item, produto: null, fator: 1, fatorAuto: false, qtdEstoque: arredondarQtd(item.quantidade) });
  };

  const setFator = (val) => {
    const f = parseFloat(String(val).replace(",", ".")) || 0;
    onChange({ ...item, fator: f, qtdEstoque: arredondarQtd(item.quantidade * f) });
  };

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setAberto(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const linked = !!item.produto;

  return (
    <tr className={linked ? "nf-tab__tr" : "nf-tab__tr nf-tab__tr--pendente"}>
      {/* # */}
      <td className="nf-tab__td nf-tab__num nf-tab__td--indice">{item.numero}</td>

      {/* Descrição */}
      <td className="nf-tab__td nf-tab__td--descricao">
        <div className="nf-tab__sub nf-tab__vinculo-desc">{item.descricaoXml}</div>
        <div className="nf-tab__mono nf-tab__muted">{item.codigoXml}</div>
      </td>

      {/* Qtd + Unid XML */}
      <td className="nf-tab__td nf-tab__sub-num nf-tab__td--qtd">
        {item.quantidade} <span className="nf-tab__cap nf-tab__muted">{item.unidadeXml}</span>
      </td>

      {/* Preço unit */}
      <td className="nf-tab__td nf-tab__num nf-tab__td--preco">
        {fmtR(item.precoUnitario)}
      </td>

      {/* Produto vinculado */}
      <td className="nf-tab__td nf-tab__td--produto">
        <div ref={ref} className="nf-tab__ancora">
          {linked ? (
            <div className="nf-tab__vinculado-chip">
              <span className="nf-tab__emoji">{item.produto.emoji || "📦"}</span>
              <span className="nf-tab__vinculado-nome">
                {item.produto.name}
              </span>
              <button onClick={clearProduto} className="nf-tab__chip-x">
                <LuX size={12} />
              </button>
            </div>
          ) : (
            <>
              <div className="nf-tab__ancora">
                <LuSearch size={12} className="nf-tab__busca-icone" />
                <input
                  value={busca}
                  onChange={e => { setBusca(e.target.value); setAberto(true); }}
                  onFocus={() => setAberto(true)}
                  placeholder="Buscar produto..."
                  className="nf-tab__sub nf-tab__busca-input"
                />
              </div>
              {aberto && filtrados.length > 0 && (
                <div className="nf-tab__dropdown nf-tab__dropdown--forte">
                  {filtrados.map(p => (
                    <button
                      key={p.id}
                      onMouseDown={() => selectProduto(p)}
                      className="nf-tab__dropdown-item nf-tab__dropdown-item--denso"
                    >
                      <span className="nf-tab__emoji">{p.emoji || "📦"}</span>
                      <div>
                        <div className="nf-tab__sub nf-tab__dropdown-nome">{p.name}</div>
                        <div className="nf-tab__cap nf-tab__muted">{p.unidade_estoque}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </td>

      {/* Unid estoque */}
      <td className="nf-tab__td nf-tab__cap nf-tab__td--centro-muted">
        {item.produto?.unidade_estoque || "—"}
      </td>

      {/* Fator */}
      <td className="nf-tab__td nf-tab__td--centro">
        {item.produto ? (
          item.fatorAuto ? (
            <span className="nf-tab__cap nf-tab__inerte">1 (auto)</span>
          ) : (
            <input
              type="number"
              min="0"
              step="any"
              value={item.fator}
              onChange={e => setFator(e.target.value)}
              aria-label={`Fator de conversão de ${item.descricaoXml}`}
              className="nf-tab__sub nf-tab__fator-input"
            />
          )
        ) : "—"}
      </td>

      {/* Qtd convertida */}
      <td className={`nf-tab__td nf-tab__body-num nf-tab__td--convertida${linked ? " nf-tab__td--convertida-ok" : ""}`}>
        {linked ? item.qtdEstoque.toFixed(3) : "—"}
      </td>
    </tr>
  );
}

// ── Componente principal ──────────────────────────────────────────
