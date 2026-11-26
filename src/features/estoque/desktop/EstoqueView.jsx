import {
  compraParaEstoque, estoqueParaConsumo, labelEstoque, labelConsumo, temConversaoConsumo, getUnidadesCompra, fmtQtd
} from "@/utils/conversaoUnidades";
import {
  controlaEstoque, situacaoDoSaldo
} from "@/features/estoque/regras/estoqueSituacao";
import { LuPackage, LuTriangleAlert, LuCircleAlert, LuMinus, LuPlus, LuShoppingCart, LuBox, LuLock, LuLockOpen, LuChevronUp, LuChevronDown, LuChevronsUpDown, LuHourglass } from "react-icons/lu";
import { MINIMO_FALLBACK, COLUNAS } from "./apoio";
import { useEstoque } from "@/features/estoque/hooks/useEstoque";
import PopupAutorizacaoEstoque from "./PopupAutorizacaoEstoque";
// O teste da tela lê estes dois daqui desde antes da refatoração 3.
export { lerQuantidade } from "./apoio";
export { controlaEstoque } from "@/features/estoque/regras/estoqueSituacao";
import "./EstoqueView.css";

export default function EstoqueView() {
  const tela = useEstoque();
  const {
    busca, setBusca, categoria, setCategoria, salvando, sortKey, sortDir, rascunhoSaldo, setRascunhoSaldo, rascunhoMinimo, setRascunhoMinimo, erro, setErro, estoque, estoqueMinimos, width, autorizado, showAuth, carregando, sz, categorias, lista, toggleSort, totalSaldo, semEstoque, estoqueBaixo, getModo, setModo, getQtd, setQtd, handleDireto, confirmarSaldo, confirmarMinimo, handleAdicionar, abrirAuth, bloquear,
  } = tela;

  return (
    <div className="estoque-view" style={{
      "--estoque-pad": `${sz.pad}px`, "--estoque-pad-sm": `${sz.padSm}px`, "--estoque-gap": `${sz.gap}px`,
      "--estoque-busca": `${Math.min(220, width - sz.pad * 2 - 32)}px`,
    }}>

      {/* Header */}
      <div className="estoque-view__header">
        <div>
          <div className="estoque-view__titulo">Estoque</div>
          <div className="estoque-view__subtitulo">Controle de quantidade dos produtos</div>
        </div>

        {/* Botão de liberar / bloquear entrada */}
        {autorizado ? (
          <button
            onClick={bloquear}
            className="estoque-view__btn-liberar estoque-view__btn-liberar--liberado"
          >
            <LuLockOpen size={15} /> Entrada liberada · Bloquear
          </button>
        ) : (
          <button
            onClick={abrirAuth}
            className="estoque-view__btn-liberar estoque-view__btn-liberar--bloqueado"
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
      <div className={`estoque-view__kpis${width < 600 ? " estoque-view__kpis--uma" : ""}`}>
        {[
          { label: "Total em estoque", value: carregando ? "—" : totalSaldo,   tom: "ok",          Icon: LuPackage       },
          { label: "Sem estoque",       value: carregando ? "—" : semEstoque,   tom: "sem_estoque", Icon: LuTriangleAlert },
          { label: "Estoque baixo",     value: carregando ? "—" : estoqueBaixo, tom: "baixo",       Icon: LuCircleAlert   },
        ].map(k => (
          <div key={k.label} className={`estoque-view__kpi estoque-tom--${k.tom}`}>
            <k.Icon size={sz.fontXl - 4} className="estoque-view__kpi-icone" />
            <div>
              <div className="estoque-view__kpi-valor">{k.value}</div>
              <div className="estoque-view__kpi-label">{k.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Busca + categorias */}
      <div className="estoque-view__filtros">
        <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar produto..." className="estoque-view__busca" />
        <div className="estoque-view__categorias">
          {categorias.map(cat => (
            <button key={cat} onClick={() => setCategoria(cat)} className={`estoque-view__categoria${categoria === cat ? " estoque-view__categoria--ativa" : ""}`}>
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Tabela */}
      <div className="estoque-view__tabela-area">
        {carregando ? (
          <div className="estoque-view__vazio" role="status">
            <div className="estoque-view__vazio-emoji"><LuHourglass aria-hidden="true" /></div>
            <div className="estoque-view__vazio-texto">Carregando o estoque…</div>
          </div>
        ) : lista.length === 0 ? (
          <div className="estoque-view__vazio">
            <div className="estoque-view__vazio-emoji"><LuPackage aria-hidden="true" /></div>
            <div className="estoque-view__vazio-texto">Nenhum produto encontrado</div>
          </div>
        ) : (
          <div className="estoque-view__tabela-moldura">
            <div className="estoque-view__tabela-scroll">
            <table className="estoque-view__tabela">
              <thead>
                <tr className="estoque-view__thead-tr">
                  {COLUNAS.map(col => {
                    const ativo = sortKey === col.key;
                    const sortable = col.sortable !== false;
                    return (
                      <th
                        key={col.key}
                        onClick={sortable ? () => toggleSort(col.key) : undefined}
                        className={`estoque-view__th estoque-view__th--${col.align}${sortable ? " estoque-view__th--ordenavel" : ""}${ativo ? " estoque-view__th--ativo" : ""}`}
                      >
                        <span className="estoque-view__th-conteudo">
                          {col.label}
                          {sortable && (
                            ativo
                              ? (sortDir === "asc" ? <LuChevronUp size={13} /> : <LuChevronDown size={13} />)
                              : <LuChevronsUpDown size={13} className="estoque-view__th-seta" />
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
                  const situacao = situacaoDoSaldo(qty, minimo, controlado);
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
                      className={`estoque-view__tr estoque-tom--${situacao}${abaixoDoMinimo ? " estoque-view__tr--abaixo" : ""}`}
                    >

                      {/* Produto */}
                      <td className="estoque-view__td">
                        <div className="estoque-view__produto">
                          <span className="estoque-view__produto-emoji"><LuPackage aria-hidden="true" /></span>
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
                          <span className="estoque-view__categoria-tag">{p.category}</span>
                        )}
                      </td>

                      {/* Preço */}
                      <td className="estoque-view__td estoque-view__preco-cel">
                        R$ {Number(p.price).toFixed(2)}
                      </td>

                      {/* Saldo atual */}
                      <td className="estoque-view__td estoque-view__td--centro">
                        <div className="estoque-view__saldo">
                          <div className="estoque-view__saldo-valor">{controlado ? fmtQtd(qty) : "—"}</div>
                          <div className="estoque-view__saldo-unidade">{ue}</div>
                          {temC && qty > 0 && (
                            <div className="estoque-view__saldo-consumo">
                              ≈ {fmtQtd(estoqueParaConsumo(qty, p))} {uc}
                            </div>
                          )}
                          <div className="estoque-view__saldo-status">
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
                          <div className="estoque-view__cadeado-celula">
                            <button
                              onClick={abrirAuth}
                              title="Liberar entrada de estoque"
                              className="estoque-view__btn-cadeado"
                            >
                              <LuLock size={16} />
                            </button>
                          </div>
                        ) : temP ? (
                          <div className="estoque-view__entrada">
                            {/* Tabs: uma por unidade de compra + estoque direto */}
                            <div className="estoque-view__entrada-tabs">
                              {units.map((u, idx) => (
                                // TD015: aqui o índice É a seleção, `setModo(p.id, idx)` guarda a posição da aba.
                                <button
                                  key={idx}
                                  onClick={() => setModo(p.id, idx)}
                                  className={`estoque-view__entrada-tab${modo === idx ? " estoque-view__entrada-tab--compra" : ""}`}
                                >
                                  <LuShoppingCart size={11} /> {u.unidade}
                                </button>
                              ))}
                              <button
                                onClick={() => setModo(p.id, "estoque")}
                                className={`estoque-view__entrada-tab estoque-view__entrada-tab--ultima${modo === "estoque" ? " estoque-view__entrada-tab--estoque" : ""}`}
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
                              className={`estoque-view__btn-adicionar${rawNum > 0 ? " estoque-view__btn-adicionar--pode" : ""}`}
                            >
                              {busy ? "..." : "+ Adicionar"}
                            </button>
                          </div>
                        ) : (
                          /* Modo simples: +/- com label */
                          <div className="estoque-view__direto">
                            <button onClick={() => handleDireto(p, qty - 1)} disabled={qty === 0 || busy} className={`estoque-view__direto-btn${qty > 0 ? "" : " estoque-view__direto-btn--zerado"}`}>
                              <LuMinus size={14} />
                            </button>
                            <div className="estoque-view__direto-saldo">
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
                              />
                              <span className="estoque-view__direto-unidade">{ue}</span>
                            </div>
                            <button onClick={() => handleDireto(p, qty + 1)} disabled={busy} className="estoque-view__direto-btn">
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
