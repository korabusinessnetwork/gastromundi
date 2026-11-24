import C from "@/constants/colors";
import { varColor } from "@/lib/tema";
import { alfa } from "@/constants/colorAlfa";
import {
  compraParaEstoque, estoqueParaConsumo, labelEstoque, labelConsumo, temConversaoConsumo, getUnidadesCompra, fmtQtd
} from "@/utils/conversaoUnidades";
import {
  controlaEstoque
} from "@/lib/estoqueSituacao";
import {
  LuPackage, LuTriangleAlert, LuCircleAlert, LuMinus, LuPlus, LuShoppingCart, LuBox, LuLock, LuLockOpen, LuChevronUp, LuChevronDown, LuChevronsUpDown
} from "react-icons/lu";
import { MINIMO_FALLBACK, COLUNAS, estoqueColor } from "./estoque/apoio";
import { useEstoque } from "@/features/estoque/hooks/useEstoque";
import PopupAutorizacaoEstoque from "./estoque/PopupAutorizacaoEstoque";
// O teste da tela lê estes dois daqui desde antes da refatoração 3.
export { lerQuantidade } from "./estoque/apoio";
export { controlaEstoque } from "@/lib/estoqueSituacao";
import "./EstoqueView.css";

export default function EstoqueView() {
  const tela = useEstoque();
  const {
    busca, setBusca, categoria, setCategoria, salvando, sortKey, sortDir, rascunhoSaldo, setRascunhoSaldo, rascunhoMinimo, setRascunhoMinimo, erro, setErro, estoque, estoqueMinimos, width, autorizado, showAuth, carregando, sz, categorias, lista, toggleSort, totalSaldo, semEstoque, estoqueBaixo, getModo, setModo, getQtd, setQtd, handleDireto, confirmarSaldo, confirmarMinimo, handleAdicionar, abrirAuth, bloquear,
  } = tela;

  return (
    <div className="estoque-view" style={{ background: varColor(C.bg) }}>

      {/* Header */}
      <div className="estoque-view__header" style={{ padding: `${sz.pad - 4}px ${sz.pad}px` }}>
        <div>
          <div className="estoque-view__titulo" style={{ fontWeight: 800 }}>Estoque</div>
          <div className="estoque-view__subtitulo" style={{ color: varColor(C.muted) }}>Controle de quantidade dos produtos</div>
        </div>

        {/* Botão de liberar / bloquear entrada */}
        {autorizado ? (
          <button
            onClick={bloquear}
            className="estoque-view__btn-liberar"
            style={{
              borderColor: alfa(C.green, "55"),
              background: alfa(C.green, "10"),
              color: varColor(C.green),
            }}
          >
            <LuLockOpen size={15} /> Entrada liberada · Bloquear
          </button>
        ) : (
          <button
            onClick={abrirAuth}
            className="estoque-view__btn-liberar"
            style={{
              borderColor: varColor(C.border),
              background: varColor(C.surface),
              color: varColor(C.muted),
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = alfa(C.accent, "88"); e.currentTarget.style.color = varColor(C.text); }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = varColor(C.border); e.currentTarget.style.color = varColor(C.muted); }}
          >
            <LuLock size={15} /> Liberar Entrada
          </button>
        )}
      </div>

      {/* Aviso de gravação que não foi — sem ele o número voltava sozinho e o
          operador achava que tinha salvo. */}
      {erro && (
        <div className="estoque-view__erro" role="alert">
          <LuTriangleAlert size={16} />
          <span className="estoque-view__erro-texto">{erro}</span>
          <button onClick={() => setErro(null)} className="estoque-view__erro-fechar" aria-label="Fechar aviso">×</button>
        </div>
      )}

      {/* KPIs */}
      <div className="estoque-view__kpis" style={{ gridTemplateColumns: width < 600 ? "1fr" : "repeat(3, 1fr)", gap: sz.gap, padding: `${sz.pad}px ${sz.pad}px ${sz.padSm}px` }}>
        {[
          { label: "Total em estoque", value: carregando ? "—" : totalSaldo,   color: varColor(C.green),   Icon: LuPackage       },
          { label: "Sem estoque",       value: carregando ? "—" : semEstoque,   color: varColor(C.red),     Icon: LuTriangleAlert },
          { label: "Estoque baixo",     value: carregando ? "—" : estoqueBaixo, color: varColor(C.warn), Icon: LuCircleAlert   },
        ].map(k => (
          <div key={k.label} className="estoque-view__kpi" style={{ padding: `${sz.padSm + 2}px ${sz.pad - 4}px` }}>
            <k.Icon size={sz.fontXl - 4} color={k.color} />
            <div>
              <div className="estoque-view__kpi-valor" style={{ color: k.color }}>{k.value}</div>
              <div className="estoque-view__kpi-label">{k.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Busca + categorias */}
      <div className="estoque-view__filtros" style={{ padding: `0 ${sz.pad}px ${sz.padSm}px`, gap: sz.gap }}>
        <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar produto..." className="estoque-view__busca" style={{ padding: "9px 14px", width: Math.min(220, width - sz.pad * 2 - 32), minWidth: 120 }} />
        <div className="estoque-view__categorias">
          {categorias.map(cat => (
            <button key={cat} onClick={() => setCategoria(cat)} className="estoque-view__categoria" style={{ background: categoria === cat ? varColor(C.accent) : varColor(C.surface), color: categoria === cat ? "#fff" : varColor(C.muted) }}>
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Tabela */}
      <div className="estoque-view__tabela-area" style={{ padding: `0 ${sz.pad}px ${sz.pad}px` }}>
        {carregando ? (
          <div className="estoque-view__vazio" role="status">
            <div className="estoque-view__vazio-emoji" style={{ opacity: 0.3 }}>⏳</div>
            <div className="estoque-view__vazio-texto" style={{ fontWeight: 600 }}>Carregando o estoque…</div>
          </div>
        ) : lista.length === 0 ? (
          <div className="estoque-view__vazio">
            <div className="estoque-view__vazio-emoji" style={{ opacity: 0.3 }}>📦</div>
            <div className="estoque-view__vazio-texto" style={{ fontWeight: 600 }}>Nenhum produto encontrado</div>
          </div>
        ) : (
          <div className="estoque-view__tabela-moldura">
            <div className="estoque-view__tabela-scroll">
            <table className="estoque-view__tabela">
              <thead>
                <tr style={{ borderBottom: `1px solid var(${C.border})` }}>
                  {COLUNAS.map(col => {
                    const ativo = sortKey === col.key;
                    const sortable = col.sortable !== false;
                    return (
                      <th
                        key={col.key}
                        onClick={sortable ? () => toggleSort(col.key) : undefined}
                        className="estoque-view__th"
                        style={{
                          textAlign: col.align,
                          color: ativo ? varColor(C.accent) : varColor(C.muted),
                          cursor: sortable ? "pointer" : "default",
                        }}
                        onMouseEnter={sortable ? e => { if (!ativo) e.currentTarget.style.color = varColor(C.text); } : undefined}
                        onMouseLeave={sortable ? e => { e.currentTarget.style.color = ativo ? varColor(C.accent) : varColor(C.muted); } : undefined}
                      >
                        <span className="estoque-view__th-conteudo">
                          {col.label}
                          {sortable && (
                            ativo
                              ? (sortDir === "asc" ? <LuChevronUp size={13} /> : <LuChevronDown size={13} />)
                              : <LuChevronsUpDown size={13} style={{ opacity: 0.35 }} />
                          )}
                        </span>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {lista.map(p => {
                  const qty    = estoque[p.id] ?? 0;
                  const minimo = estoqueMinimos[p.id] ?? MINIMO_FALLBACK;
                  const controlado = controlaEstoque(estoque, p.id);
                  const cor    = estoqueColor(qty, minimo, controlado);
                  const busy   = !!salvando[p.id];
                  const ue     = labelEstoque(p);
                  const uc     = labelConsumo(p);
                  const temC   = temConversaoConsumo(p);
                  const units  = getUnidadesCompra(p);
                  const temP   = units.length > 0;
                  const modo   = getModo(p);
                  const rawInput = getQtd(p.id);
                  const rawNum   = parseFloat(String(rawInput).replace(",", ".")) || 0;

                  const unidadeAtual = modo !== "estoque" ? units[modo] : null;
                  const previewEst   = unidadeAtual && rawNum > 0
                    ? compraParaEstoque(rawNum, unidadeAtual) : null;

                  // Inclui zerado — mesmo critério de "Baixo"/"Sem estoque" acima.
                  // Quem não controla estoque não pinta de vermelho: antes o
                  // cardápio inteiro ficava marcado como problema.
                  const abaixoDoMinimo = controlado && qty <= minimo;

                  return (
                    <tr
                      key={p.id}
                      className="estoque-view__tr"
                      onMouseEnter={e => e.currentTarget.style.background = varColor(C.surface)}
                      onMouseLeave={e => e.currentTarget.style.background = abaixoDoMinimo ? alfa(cor, "0c") : "transparent"}
                      style={{
                        borderBottom: `1px solid var(${C.border})`,
                        borderLeft: abaixoDoMinimo ? `3px solid ${cor}` : "3px solid transparent",
                        background: abaixoDoMinimo ? alfa(cor, "0c") : "transparent",
                      }}
                    >

                      {/* Produto */}
                      <td className="estoque-view__td">
                        <div className="estoque-view__produto">
                          <span className="estoque-view__produto-emoji">{p.emoji ?? "📦"}</span>
                          <div>
                            <div className="estoque-view__produto-nome">{p.name}</div>
                            {(temP || temC) && (
                              <div className="estoque-view__produto-conversoes">
                                {temC && <span>consumo: {uc}</span>}
                                {temP && <span>compra: {units.map(u => u.unidade).join(", ")}</span>}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Categoria */}
                      <td className="estoque-view__td">
                        {p.category && (
                          <span className="estoque-view__categoria-tag" style={{ background: alfa(C.accent, "18"), color: varColor(C.accent) }}>{p.category}</span>
                        )}
                      </td>

                      {/* Preço */}
                      <td className="estoque-view__td estoque-view__preco-cel" style={{ color: varColor(C.muted), whiteSpace: "nowrap" }}>
                        R$ {Number(p.price).toFixed(2)}
                      </td>

                      {/* Saldo atual */}
                      <td className="estoque-view__td" style={{ textAlign: "center" }}>
                        <div className="estoque-view__saldo">
                          <div className="estoque-view__saldo-valor" style={{ color: cor }}>{controlado ? fmtQtd(qty) : "—"}</div>
                          <div className="estoque-view__saldo-unidade" style={{ color: cor }}>{ue}</div>
                          {temC && qty > 0 && (
                            <div className="estoque-view__saldo-consumo">
                              ≈ {fmtQtd(estoqueParaConsumo(qty, p))} {uc}
                            </div>
                          )}
                          <div className="estoque-view__saldo-status" style={{ color: cor }}>
                            {!controlado ? "Não controla" : qty === 0 ? "Sem estoque" : qty <= minimo ? "Baixo" : "OK"}
                          </div>
                          <div className="estoque-view__minimo">
                            <span className="estoque-view__minimo-label">mín:</span>
                            <input
                              type="number"
                              min="0"
                              value={rascunhoMinimo[p.id] ?? String(minimo)}
                              onChange={e => setRascunhoMinimo(prev => ({ ...prev, [p.id]: e.target.value }))}
                              onBlur={() => confirmarMinimo(p)}
                              onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }}
                              aria-label={`Estoque mínimo de ${p.name}`}
                              className="estoque-view__minimo-input"
                            />
                          </div>
                        </div>
                      </td>

                      {/* Entrada */}
                      <td className="estoque-view__td">
                        {!autorizado ? (
                          /* Bloqueado — mostra cadeado clicável */
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                            <button
                              onClick={abrirAuth}
                              title="Liberar entrada de estoque"
                              className="estoque-view__btn-cadeado"
                              onMouseEnter={e => { e.currentTarget.style.borderColor = alfa(C.accent, "66"); e.currentTarget.style.color = varColor(C.accent); e.currentTarget.style.background = alfa(C.accent, "0c"); }}
                              onMouseLeave={e => { e.currentTarget.style.borderColor = varColor(C.border); e.currentTarget.style.color = varColor(C.muted); e.currentTarget.style.background = varColor(C.surface); }}
                            >
                              <LuLock size={16} />
                            </button>
                          </div>
                        ) : temP ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "center" }}>
                            {/* Tabs: uma por unidade de compra + estoque direto */}
                            <div className="estoque-view__entrada-tabs">
                              {units.map((u, idx) => (
                                // TD015: aqui o índice É a seleção, `setModo(p.id, idx)` guarda a posição da aba.
                                <button
                                  key={idx}
                                  onClick={() => setModo(p.id, idx)}
                                  className="estoque-view__entrada-tab"
                                  style={{ background: modo === idx ? varColor(C.accent) : "none", color: modo === idx ? "#fff" : varColor(C.muted) }}
                                >
                                  <LuShoppingCart size={11} /> {u.unidade}
                                </button>
                              ))}
                              <button
                                onClick={() => setModo(p.id, "estoque")}
                                className="estoque-view__entrada-tab"
                                style={{ background: modo === "estoque" ? varColor(C.surface) : "none", color: modo === "estoque" ? varColor(C.text) : varColor(C.muted), borderRight: "none" }}
                              >
                                <LuBox size={11} /> {ue}
                              </button>
                            </div>

                            {/* Input + unidade */}
                            <div className="estoque-view__entrada-input-wrap">
                              <input
                                type="number"
                                min="0"
                                step="any"
                                value={rawInput}
                                onChange={e => setQtd(p.id, e.target.value)}
                                onKeyDown={e => e.key === "Enter" && handleAdicionar(p)}
                                placeholder="0"
                                aria-label={`Entrada de ${p.name}`}
                                className="estoque-view__entrada-input"
                              />
                              <span className="estoque-view__entrada-unidade">
                                {modo === "estoque" ? ue : (units[modo]?.unidade ?? ue)}
                              </span>
                            </div>

                            {/* Preview de conversão */}
                            {previewEst !== null && (
                              <div className="estoque-view__entrada-preview">
                                = {fmtQtd(previewEst)} {ue}
                              </div>
                            )}

                            <button
                              onClick={() => handleAdicionar(p)}
                              disabled={busy || !rawInput || rawNum <= 0}
                              className="estoque-view__btn-adicionar"
                              style={{ background: rawNum > 0 ? varColor(C.accent) : varColor(C.faint), color: rawNum > 0 ? "#fff" : varColor(C.muted), cursor: rawNum > 0 ? "pointer" : "not-allowed" }}
                            >
                              {busy ? "..." : "+ Adicionar"}
                            </button>
                          </div>
                        ) : (
                          /* Modo simples: +/- com label */
                          <div className="estoque-view__direto">
                            <button onClick={() => handleDireto(p, qty - 1)} disabled={qty === 0 || busy} className="estoque-view__direto-btn" style={{ cursor: qty > 0 ? "pointer" : "not-allowed", opacity: qty === 0 ? 0.4 : 1 }}>
                              <LuMinus size={14} />
                            </button>
                            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                              <input
                                type="number"
                                min="0"
                                step="any"
                                value={rascunhoSaldo[p.id] ?? String(qty)}
                                onChange={e => setRascunhoSaldo(prev => ({ ...prev, [p.id]: e.target.value }))}
                                onBlur={() => confirmarSaldo(p)}
                                onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }}
                                aria-label={`Saldo em estoque de ${p.name}`}
                                className="estoque-view__direto-input"
                                style={{ border: `1.5px solid ${alfa(cor, "66")}`, background: alfa(cor, "12"), color: cor }}
                              />
                              <span className="estoque-view__direto-unidade">{ue}</span>
                            </div>
                            <button onClick={() => handleDireto(p, qty + 1)} disabled={busy} className="estoque-view__direto-btn" style={{ cursor: "pointer" }}>
                              <LuPlus size={14} />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          </div>
        )}
      </div>

      {/* ── Modal de autenticação ─────────────────────────────────── */}
      {showAuth && <PopupAutorizacaoEstoque tela={tela} />}
    </div>
  );
}
