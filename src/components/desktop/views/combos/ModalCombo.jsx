import { fecharAoClicarFora } from "@/lib/overlayFechar";
import { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  salvarCombo, carregarSubprodutosDoCombo, carregarProdutosDoCombo
} from "@/features/cardapio/dados/combos";
import C from "@/constants/colors";
import { varColor } from "@/lib/tema";
import { alfa } from "@/constants/colorAlfa";
import {
  LuPlus, LuX, LuMinus, LuSearch, LuLayers, LuToggleRight
} from "react-icons/lu";
import Toggle from "./Toggle";
import { CATS_NAO_VENDAVEIS, fmtBRL } from "./apoio";
import { nomeBateComBusca } from "@/lib/busca";

export default function ModalCombo({ combo, products, subprodutos, onClose, onSalvo }) {
  const isEdit = !!combo;

  const [nome,       setNome]      = useState(combo?.nome ?? "");
  const [principal,  setPrincipal] = useState(
    combo ? products.find(p => p.id === combo.item_principal_id) ?? null : null
  );
  const [modo,       setModo]      = useState(combo?.modo ?? "combo");
  const [itens,      setItens]     = useState([]); // [{ subproduto, quantidade, precoCustom, usarCustom }]
  const [salvando,   setSalvando]  = useState(false);
  const [erro,       setErro]      = useState("");

  // busca produto principal
  const [buscaProd,  setBuscaProd] = useState("");
  const [showProd,   setShowProd]  = useState(false);

  // busca subproduto
  const [buscaSub,   setBuscaSub]  = useState("");
  const [showSub,    setShowSub]   = useState(false);

  // outros produtos do catálogo (além do principal) — [{ cpId, produto, quantidade, precoCustom, usarCustom }]
  const [itensProd,  setItensProd] = useState([]);
  const [buscaComp,  setBuscaComp] = useState("");
  const [showComp,   setShowComp]  = useState(false);

  // ao editar — carrega combo_subprodutos
  useEffect(() => {
    if (!combo) return;
    carregarSubprodutosDoCombo(combo.id)
      .then(({ data }) => {
        if (!data) return;
        setItens(data.map(r => ({
          csId:       r.id,
          subproduto: r.subprodutos,
          quantidade: r.quantidade,
          precoCustom: r.preco_customizado != null ? String(r.preco_customizado) : "",
          usarCustom:  r.preco_customizado != null,
        })));
      });
  }, [combo]);

  // ao editar — carrega combo_produtos (produtos adicionais do catálogo)
  useEffect(() => {
    if (!combo) return;
    carregarProdutosDoCombo(combo.id)
      .then(({ data }) => {
        if (!data) return;
        setItensProd(data.filter(r => r.products).map(r => ({
          cpId:       r.id,
          produto:    r.products,
          quantidade: r.quantidade,
          precoCustom: r.preco_customizado != null ? String(r.preco_customizado) : "",
          usarCustom:  r.preco_customizado != null,
        })));
      });
  }, [combo]);

  // produtos filtrados pela busca — só produtos vendáveis (sem insumos nem
  // itens de produção), pois só eles podem ser o principal de um combo
  const prodsFiltrados = useMemo(() => {
    const q = buscaProd.toLowerCase();
    const vendaveis = products.filter(p => !CATS_NAO_VENDAVEIS.includes(p.category));
    return q ? vendaveis.filter(p => nomeBateComBusca(p.name, q)) : vendaveis;
  }, [products, buscaProd]);

  // subprodutos filtrados (excluindo já adicionados)
  const subsFiltrados = useMemo(() => {
    const adicionados = new Set(itens.map(i => i.subproduto.id));
    const q = buscaSub.toLowerCase();
    return subprodutos.filter(s => s.ativo && !adicionados.has(s.id) && (!q || s.nome.toLowerCase().includes(q)));
  }, [subprodutos, itens, buscaSub]);

  // produtos do catálogo disponíveis como adicionais: vendáveis, que não
  // sejam o principal nem já estejam na lista de adicionais
  const compFiltrados = useMemo(() => {
    const jaAdd = new Set(itensProd.map(i => i.produto.id));
    const q = buscaComp.toLowerCase();
    return products.filter(p =>
      !CATS_NAO_VENDAVEIS.includes(p.category) &&
      p.id !== principal?.id &&
      !jaAdd.has(p.id) &&
      (!q || nomeBateComBusca(p.name, q))
    );
  }, [products, itensProd, principal, buscaComp]);

  // ao escolher o principal, ele sai da lista de produtos adicionais
  // (não faz sentido o mesmo produto ser principal e adicional do combo)
  const escolherPrincipal = (p) => {
    setPrincipal(p);
    setItensProd(prev => prev.filter(it => it.produto.id !== p.id));
    setBuscaProd("");
    setShowProd(false);
  };

  const addComp = (p) => {
    setItensProd(prev => [...prev, { produto: p, quantidade: 1, precoCustom: "", usarCustom: false }]);
    setBuscaComp("");
    setShowComp(false);
  };

  const removeComp = (idx) => setItensProd(prev => prev.filter((_, i) => i !== idx));

  const setQtdComp = (idx, v) => setItensProd(prev => prev.map((it, i) =>
    i === idx ? { ...it, quantidade: Math.max(1, v) } : it
  ));

  const setCustomComp = (idx, v) => setItensProd(prev => prev.map((it, i) =>
    i === idx ? { ...it, precoCustom: v } : it
  ));

  const toggleCustomComp = (idx) => setItensProd(prev => prev.map((it, i) =>
    i === idx ? { ...it, usarCustom: !it.usarCustom, precoCustom: it.usarCustom ? "" : String(it.produto.price) } : it
  ));

  const addSubproduto = (s) => {
    setItens(prev => [...prev, { subproduto: s, quantidade: 1, precoCustom: "", usarCustom: false }]);
    setBuscaSub("");
    setShowSub(false);
  };

  const removeItem = (idx) => setItens(prev => prev.filter((_, i) => i !== idx));

  const setQtd = (idx, v) => setItens(prev => prev.map((it, i) =>
    i === idx ? { ...it, quantidade: Math.max(1, v) } : it
  ));

  const setCustom = (idx, v) => setItens(prev => prev.map((it, i) =>
    i === idx ? { ...it, precoCustom: v } : it
  ));

  const toggleCustom = (idx) => setItens(prev => prev.map((it, i) =>
    i === idx ? { ...it, usarCustom: !it.usarCustom, precoCustom: it.usarCustom ? "" : String(it.subproduto.preco) } : it
  ));

  // preço total calculado
  const precoTotal = useMemo(() => {
    const base = Number(principal?.price ?? 0);
    const subs = itens.reduce((acc, it) => {
      const p = it.usarCustom ? parseFloat(String(it.precoCustom).replace(",", ".")) || 0 : Number(it.subproduto.preco);
      return acc + p * it.quantidade;
    }, 0);
    const prods = itensProd.reduce((acc, it) => {
      const p = it.usarCustom ? parseFloat(String(it.precoCustom).replace(",", ".")) || 0 : Number(it.produto.price);
      return acc + p * it.quantidade;
    }, 0);
    return base + subs + prods;
  }, [principal, itens, itensProd]);

  const salvar = async () => {
    if (!nome.trim())  { setErro("Informe o nome do combo.");         return; }
    if (!principal)    { setErro("Selecione o produto principal.");   return; }
    if (itens.length + itensProd.length === 0) { setErro("Adicione ao menos um produto ou subproduto ao combo."); return; }
    setSalvando(true);
    setErro("");
    try {
      // Combo e composição numa transação só (tarefa 1.1 do plano de
      // refatoração): antes eram até cinco chamadas soltas, e uma queda de
      // rede depois dos deletes deixava o combo gravado sem itens.
      await salvarCombo({ comboId: combo?.id, nome, principal, modo, precoTotal, itens, itensProd });
      onSalvo();
    } catch (e) {
      setErro(e.message ?? "Erro ao salvar.");
    } finally {
      setSalvando(false);
    }
  };

  return createPortal(
    <div
      {...fecharAoClicarFora(onClose)}
      className="combos-view__modal-overlay"
    >
      <div className="combos-view__modal">

        {/* Título */}
        <div className="combos-view__modal-topo">
          <div className="combos-view__modal-titulo" style={{ fontWeight: 800 }}>{isEdit ? "Editar Combo" : "Criar Combo"}</div>
          <button onClick={onClose} className="combos-view__modal-fechar"><LuX size={20} /></button>
        </div>

        {/* Nome */}
        <div>
          <div className="combos-view__label">Nome do combo *</div>
          <input
            autoFocus
            value={nome}
            onChange={e => setNome(e.target.value)}
            placeholder="Ex: Combo X-Burguer Clássico"
            maxLength={100}
            className="combos-view__input"
          />
        </div>

        {/* Produto principal */}
        <div className="combos-view__principal-wrap">
          <div className="combos-view__label">Produto principal *</div>
          {principal ? (
            <div className="combos-view__principal-selecionado" style={{ background: alfa(C.accent, "10"), border: `1.5px solid ${alfa(C.accent, "44")}` }}>
              <span className="combos-view__principal-emoji">{principal.emoji ?? "📦"}</span>
              <div style={{ flex: 1 }}>
                <div className="combos-view__principal-nome">{principal.name}</div>
                <div className="combos-view__principal-preco">R$ {Number(principal.price).toFixed(2)}</div>
              </div>
              <button onClick={() => setPrincipal(null)} className="combos-view__principal-remover"><LuX size={16} /></button>
            </div>
          ) : (
            <div>
              <div className="combos-view__busca-wrap">
                <LuSearch size={15} className="combos-view__busca-icone" />
                <input
                  value={buscaProd}
                  onChange={e => { setBuscaProd(e.target.value); setShowProd(true); }}
                  onFocus={() => setShowProd(true)}
                  placeholder="Buscar produto..."
                  className="combos-view__input"
                  style={{ paddingLeft: 36 }}
                />
              </div>
              {showProd && prodsFiltrados.length > 0 && (
                <div className="combos-view__dropdown">
                  {prodsFiltrados.slice(0, 20).map(p => (
                    <button
                      key={p.id}
                      onClick={() => escolherPrincipal(p)}
                      className="combos-view__dropdown-item"
                      onMouseEnter={e => e.currentTarget.style.background = varColor(C.surface)}
                      onMouseLeave={e => e.currentTarget.style.background = "none"}
                    >
                      <span className="combos-view__dropdown-item-emoji">{p.emoji ?? "📦"}</span>
                      <div style={{ flex: 1 }}>
                        <div className="combos-view__dropdown-item-nome">{p.name}</div>
                        <div className="combos-view__dropdown-item-preco">R$ {Number(p.price).toFixed(2)}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Outros produtos do combo (além do principal) */}
        <div>
          <div className="combos-view__label">Outros produtos <span style={{ color: varColor(C.muted), fontWeight: 400 }}>(opcional)</span></div>
          <div className="combos-view__ajuda" style={{ color: varColor(C.muted), fontSize: 12, marginBottom: 8 }}>
            Produtos do catálogo que também compõem o combo, cada um baixa o próprio estoque. Ex.: Hambúrguer (principal) + Coca Zero.
          </div>

          {itensProd.length > 0 && (
            <div className="combos-view__itens-lista">
              {itensProd.map((it, idx) => (
                <div key={it.produto.id} className="combos-view__item-card">
                  <div className="combos-view__item-linha" style={{ marginBottom: it.usarCustom ? 8 : 0 }}>
                    {/* Nome */}
                    <div style={{ flex: 1 }}>
                      <div className="combos-view__item-nome">{it.produto.emoji ?? "📦"} {it.produto.name}</div>
                      <div className="combos-view__item-info">{it.produto.category ?? "Produto"} · {!it.usarCustom ? fmtBRL(it.produto.price) : "preço custom"}</div>
                    </div>
                    {/* Quantidade */}
                    <div className="combos-view__item-qtd-controles">
                      <button onClick={() => setQtdComp(idx, it.quantidade - 1)} className="combos-view__qtd-btn"><LuMinus size={11} /></button>
                      <span className="combos-view__item-qtd-valor">{it.quantidade}</span>
                      <button onClick={() => setQtdComp(idx, it.quantidade + 1)} className="combos-view__qtd-btn"><LuPlus size={11} /></button>
                    </div>
                    {/* Toggle custom */}
                    <div className="combos-view__item-custom-toggle">
                      <span className="combos-view__item-custom-label">Custom</span>
                      <Toggle value={it.usarCustom} onChange={() => toggleCustomComp(idx)} />
                    </div>
                    {/* Remover */}
                    <button onClick={() => removeComp(idx)} className="combos-view__item-remover"><LuX size={15} /></button>
                  </div>
                  {/* Campo preço custom */}
                  {it.usarCustom && (
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={it.precoCustom}
                      onChange={e => setCustomComp(idx, e.target.value)}
                      placeholder="Preço para este combo (R$)"
                      className="combos-view__input"
                      style={{ marginTop: 4 }}
                    />
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Busca produto adicional */}
          <div className="combos-view__busca-wrap">
            <LuSearch size={15} className="combos-view__busca-icone" />
            <input
              value={buscaComp}
              onChange={e => { setBuscaComp(e.target.value); setShowComp(true); }}
              onFocus={() => setShowComp(true)}
              placeholder="Buscar e adicionar produto..."
              className="combos-view__input"
              style={{ paddingLeft: 36 }}
            />
            {showComp && compFiltrados.length > 0 && (
              <div className="combos-view__dropdown">
                {compFiltrados.slice(0, 20).map(p => (
                  <button
                    key={p.id}
                    onClick={() => addComp(p)}
                    className="combos-view__dropdown-item"
                    onMouseEnter={e => e.currentTarget.style.background = varColor(C.surface)}
                    onMouseLeave={e => e.currentTarget.style.background = "none"}
                  >
                    <span className="combos-view__dropdown-item-emoji">{p.emoji ?? "📦"}</span>
                    <div style={{ flex: 1 }}>
                      <div className="combos-view__dropdown-item-nome">{p.name}</div>
                      <div className="combos-view__dropdown-item-preco">R$ {Number(p.price).toFixed(2)}</div>
                    </div>
                    <LuPlus size={14} color={varColor(C.accent)} />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Modo */}
        <div>
          <div className="combos-view__label">Comportamento do combo</div>
          <div className="combos-view__modo-grid">
            {[
              { id: "combo",      icon: LuLayers,      title: "Exibir como combo",           desc: "Aparece como opção adicional ao lado do produto" },
              { id: "substituir", icon: LuToggleRight,  title: "Substituir produto",          desc: "Enquanto ativo, substitui o produto principal" },
            ].map(m => {
              const ativo = modo === m.id;
              return (
                <button
                  key={m.id}
                  onClick={() => setModo(m.id)}
                  className="combos-view__modo-card"
                  style={{ borderColor: ativo ? varColor(C.accent) : varColor(C.border), background: ativo ? alfa(C.accent, "10") : varColor(C.surface) }}
                >
                  <m.icon size={20} color={ativo ? varColor(C.accent) : varColor(C.muted)} />
                  <div className="combos-view__modo-titulo" style={{ color: ativo ? varColor(C.accent) : varColor(C.text) }}>{m.title}</div>
                  <div className="combos-view__modo-desc">{m.desc}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Subprodutos */}
        <div>
          <div className="combos-view__label">Subprodutos <span style={{ color: varColor(C.muted), fontWeight: 400 }}>(opcional)</span></div>

          {itens.length > 0 && (
            <div className="combos-view__itens-lista">
              {itens.map((it, idx) => (
                <div key={it.subproduto.id} className="combos-view__item-card">
                  <div className="combos-view__item-linha" style={{ marginBottom: it.usarCustom ? 8 : 0 }}>
                    {/* Nome */}
                    <div style={{ flex: 1 }}>
                      <div className="combos-view__item-nome">{it.subproduto.nome}</div>
                      <div className="combos-view__item-info">{it.subproduto.categoria} · {!it.usarCustom ? fmtBRL(it.subproduto.preco) : "preço custom"}</div>
                    </div>
                    {/* Quantidade */}
                    <div className="combos-view__item-qtd-controles">
                      <button onClick={() => setQtd(idx, it.quantidade - 1)} className="combos-view__qtd-btn"><LuMinus size={11} /></button>
                      <span className="combos-view__item-qtd-valor">{it.quantidade}</span>
                      <button onClick={() => setQtd(idx, it.quantidade + 1)} className="combos-view__qtd-btn"><LuPlus size={11} /></button>
                    </div>
                    {/* Toggle custom */}
                    <div className="combos-view__item-custom-toggle">
                      <span className="combos-view__item-custom-label">Custom</span>
                      <Toggle value={it.usarCustom} onChange={() => toggleCustom(idx)} />
                    </div>
                    {/* Remover */}
                    <button onClick={() => removeItem(idx)} className="combos-view__item-remover"><LuX size={15} /></button>
                  </div>
                  {/* Campo preço custom */}
                  {it.usarCustom && (
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={it.precoCustom}
                      onChange={e => setCustom(idx, e.target.value)}
                      placeholder="Preço para este combo (R$)"
                      className="combos-view__input"
                      style={{ marginTop: 4 }}
                    />
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Busca subproduto */}
          <div className="combos-view__busca-wrap">
            <LuSearch size={15} className="combos-view__busca-icone" />
            <input
              value={buscaSub}
              onChange={e => { setBuscaSub(e.target.value); setShowSub(true); }}
              onFocus={() => setShowSub(true)}
              placeholder="Buscar e adicionar subproduto..."
              className="combos-view__input"
              style={{ paddingLeft: 36 }}
            />
            {showSub && subsFiltrados.length > 0 && (
              <div className="combos-view__dropdown">
                {subsFiltrados.slice(0, 20).map(s => (
                  <button
                    key={s.id}
                    onClick={() => addSubproduto(s)}
                    className="combos-view__dropdown-item"
                    onMouseEnter={e => e.currentTarget.style.background = varColor(C.surface)}
                    onMouseLeave={e => e.currentTarget.style.background = "none"}
                  >
                    <div style={{ flex: 1 }}>
                      <div className="combos-view__dropdown-item-nome">{s.nome}</div>
                      <div className="combos-view__dropdown-item-preco">{s.categoria} · {fmtBRL(s.preco)}</div>
                    </div>
                    <LuPlus size={14} color={varColor(C.accent)} />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Preço total */}
        <div className="combos-view__preco-total" style={{ background: alfa(C.green, "0c"), border: `1px solid ${alfa(C.green, "33")}` }}>
          <div className="combos-view__preco-total-label">Preço total calculado</div>
          <div className="combos-view__preco-total-valor">{fmtBRL(precoTotal)}</div>
        </div>

        {erro && <div className="combos-view__erro">⚠ {erro}</div>}

        <div className="combos-view__modal-botoes">
          <button onClick={onClose} className="combos-view__btn-cancelar">Cancelar</button>
          <button onClick={salvar} disabled={salvando} className="combos-view__btn-salvar" style={{ background: salvando ? varColor(C.faint) : varColor(C.accent), cursor: salvando ? "not-allowed" : "pointer" }}>
            {salvando ? "Salvando…" : isEdit ? "Salvar alterações" : "Criar combo"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ── View principal ─────────────────────────────────────────────────
