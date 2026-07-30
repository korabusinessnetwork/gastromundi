import { fecharAoClicarFora } from "@/lib/overlayFechar";
import { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabase";
import { useApp } from "@/context/AppContext";
import C from "@/constants/colors";
import { varColor } from "@/lib/tema";
import { alfa } from "@/constants/colorAlfa";
import {
  LuPlus, LuPencil, LuX, LuMinus, LuSearch, LuPackage,
  LuLayers, LuToggleLeft, LuToggleRight, LuTrash2, LuTriangleAlert,
} from "react-icons/lu";
import "./CombosView.css";

// Categorias que NÃO são produto de venda: insumo (matéria-prima) e item
// de produção (preparo interno). O combo só pode ter um produto vendável
// como principal, então esses ficam fora do picker (mesma convenção de
// ImpostosAdmin/AdminView, onde essas categorias também são excluídas).
const CATS_NAO_VENDAVEIS = ["Insumo", "Produção"];

// ── Helpers ────────────────────────────────────────────────────────

function Toggle({ value, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className="combos-view__toggle"
      style={{ background: value ? varColor(C.green) : varColor(C.faint) }}
    >
      <span className="combos-view__toggle-bolinha" style={{ left: value ? 22 : 2 }} />
    </button>
  );
}

function fmtBRL(v) {
  return `R$ ${Number(v || 0).toFixed(2)}`;
}

// ── Modal de criar/editar combo ────────────────────────────────────

function ModalCombo({ combo, products, subprodutos, onClose, onSalvo, sz }) {
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
    supabase
      .from("combo_subprodutos")
      .select("*, subprodutos(*)")
      .eq("combo_id", combo.id)
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
    supabase
      .from("combo_produtos")
      .select("*, products(id, name, price, emoji, category)")
      .eq("combo_id", combo.id)
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
    return q ? vendaveis.filter(p => p.name.toLowerCase().includes(q)) : vendaveis;
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
      (!q || p.name.toLowerCase().includes(q))
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
      const payload = {
        nome:              nome.trim(),
        item_principal_id: Number(principal.id),
        modo,
        preco_total:       precoTotal,
        updated_at:        new Date().toISOString(),
      };

      let comboId = combo?.id;
      if (isEdit) {
        const { error } = await supabase.from("combos").update(payload).eq("id", comboId);
        if (error) throw error;
        // Recria a composição (subprodutos + produtos adicionais). O delete
        // PRECISA ser conferido: se ele falha e os inserts seguem, o combo
        // fica com a composição antiga somada à nova — o cliente recebe (e o
        // estoque baixa) o dobro dos itens.
        const { error: errDelSubs } = await supabase.from("combo_subprodutos").delete().eq("combo_id", comboId);
        if (errDelSubs) throw errDelSubs;
        const { error: errDelProds } = await supabase.from("combo_produtos").delete().eq("combo_id", comboId);
        if (errDelProds) throw errDelProds;
      } else {
        const { data, error } = await supabase.from("combos").insert({ ...payload, ativo: true }).select().single();
        if (error) throw error;
        comboId = data.id;
      }

      if (itens.length > 0) {
        const subs = itens.map(it => ({
          combo_id:          comboId,
          subproduto_id:     it.subproduto.id,
          quantidade:        it.quantidade,
          preco_customizado: it.usarCustom ? (parseFloat(String(it.precoCustom).replace(",", ".")) || null) : null,
        }));
        const { error: errSubs } = await supabase.from("combo_subprodutos").insert(subs);
        if (errSubs) throw errSubs;
      }

      if (itensProd.length > 0) {
        const prods = itensProd.map(it => ({
          combo_id:          comboId,
          produto_id:        Number(it.produto.id),
          quantidade:        it.quantidade,
          preco_customizado: it.usarCustom ? (parseFloat(String(it.precoCustom).replace(",", ".")) || null) : null,
        }));
        const { error: errProds } = await supabase.from("combo_produtos").insert(prods);
        if (errProds) throw errProds;
      }

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
            Produtos do catálogo que também compõem o combo — cada um baixa o próprio estoque. Ex.: Hambúrguer (principal) + Coca Zero.
          </div>

          {itensProd.length > 0 && (
            <div className="combos-view__itens-lista">
              {itensProd.map((it, idx) => (
                <div key={idx} className="combos-view__item-card">
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
                <div key={idx} className="combos-view__item-card">
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

export default function CombosView({ sz }) {
  const { products } = useApp();
  const [combos,      setCombos]      = useState([]);
  const [subprodutos, setSubprodutos] = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [modal,       setModal]       = useState(false);
  const [editando,    setEditando]    = useState(null);
  const [busca,       setBusca]       = useState("");
  const [excluindo,   setExcluindo]   = useState(null); // combo pendente de exclusão
  const [deletando,   setDeletando]   = useState(false);
  const [erroDelete,  setErroDelete]  = useState("");
  const [erroTela,    setErroTela]    = useState("");

  const carregar = async () => {
    setLoading(true);
    setErroTela("");
    const [{ data: c, error: erroCombos }, { data: s, error: erroSubs }] = await Promise.all([
      supabase.from("combos").select("*, combo_subprodutos(quantidade, subprodutos(nome, preco)), combo_produtos(quantidade, products(name))").order("created_at", { ascending: false }),
      supabase.from("subprodutos").select("*").eq("ativo", true).order("nome"),
    ]);
    // Sem isto, uma falha de leitura virava "Nenhum combo cadastrado" — e o
    // usuário recriava combos que já existem.
    if (erroCombos || erroSubs) {
      setErroTela("Não deu para carregar os combos. Recarregue a página.");
    } else {
      setCombos(c ?? []);
      setSubprodutos(s ?? []);
    }
    setLoading(false);
  };

  useEffect(() => { carregar(); }, []);

  const abrirNovo   = () => { setEditando(null); setModal(true); };
  const abrirEditar = (c) => { setEditando(c); setModal(true); };
  const fecharModal = () => { setModal(false); setEditando(null); };
  const aoSalvar    = () => { fecharModal(); carregar(); };

  // Otimista com desfazer: o toggle responde na hora, mas se o banco recusa a
  // chave volta para onde estava. Antes ela ficava mostrando "ativo" para um
  // combo que continuava desativado no cardápio do cliente.
  const toggleAtivo = async (c) => {
    setErroTela("");
    setCombos(prev => prev.map(x => x.id === c.id ? { ...x, ativo: !x.ativo } : x));
    const { error } = await supabase.from("combos").update({ ativo: !c.ativo, updated_at: new Date().toISOString() }).eq("id", c.id);
    if (error) {
      setCombos(prev => prev.map(x => x.id === c.id ? { ...x, ativo: c.ativo } : x));
      setErroTela("Não deu para mudar a situação do combo. Tente de novo.");
    }
  };

  // Excluir combo — as junções (combo_subprodutos/combo_produtos) somem em
  // cascata (FK ON DELETE CASCADE); os produtos/subprodutos do catálogo em si
  // não são tocados. Ação destrutiva → confirmação obrigatória.
  const confirmarExcluir = async () => {
    if (!excluindo || deletando) return;
    setDeletando(true);
    setErroDelete("");
    const { error } = await supabase.from("combos").delete().eq("id", excluindo.id);
    if (error) {
      setErroDelete(error.message ?? "Não foi possível excluir o combo.");
      setDeletando(false);
      return;
    }
    setCombos(prev => prev.filter(x => x.id !== excluindo.id));
    setDeletando(false);
    setExcluindo(null);
  };

  const listafiltrada = combos.filter(c =>
    !busca || c.nome.toLowerCase().includes(busca.toLowerCase())
  );

  const prodMap = useMemo(() => Object.fromEntries(products.map(p => [p.id, p])), [products]);

  return (
    <div className="combos-view">

      {/* Header */}
      <div className="combos-view__header" style={{ padding: `${sz.padSm}px ${sz.pad}px` }}>
        <div className="combos-view__header-esquerda">
          <div className="combos-view__contagem">{combos.length} combo{combos.length !== 1 ? "s" : ""}</div>
          <input
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar combo..."
            className="combos-view__busca"
          />
        </div>
        <button
          onClick={abrirNovo}
          className="combos-view__btn-criar"
        >
          <LuPlus size={15} /> Criar Combo
        </button>
      </div>

      {/* Lista */}
      <div className="combos-view__lista-area" style={{ padding: `${sz.padSm}px ${sz.pad}px` }}>
        {erroTela && (
          <div className="combos-view__erro" role="alert">{erroTela}</div>
        )}
        {loading ? (
          <div className="combos-view__estado">Carregando…</div>
        ) : erroTela && combos.length === 0 ? (
          // Lista vazia por falha de leitura não é lista vazia: o aviso acima
          // já explica. Dizer "Nenhum combo criado" aqui contradiz o aviso.
          null
        ) : listafiltrada.length === 0 ? (
          <div className="combos-view__vazio">
            <LuPackage size={40} style={{ opacity: 0.2 }} />
            <div className="combos-view__vazio-texto" style={{ fontWeight: 600 }}>{busca ? "Nenhum resultado" : "Nenhum combo criado"}</div>
          </div>
        ) : (
          <div className="combos-view__lista">
            {listafiltrada.map(c => {
              const prod = prodMap[c.item_principal_id];
              const qtdSubs = c.combo_subprodutos?.length ?? 0;
              const qtdProds = c.combo_produtos?.length ?? 0;
              const compParts = [];
              if (qtdProds > 0) compParts.push(`${qtdProds} produto${qtdProds !== 1 ? "s" : ""}`);
              if (qtdSubs > 0) compParts.push(`${qtdSubs} subproduto${qtdSubs !== 1 ? "s" : ""}`);
              const composicao = compParts.join(" · ") || "só o principal";
              return (
                <div
                  key={c.id}
                  className="combos-view__card"
                  style={{ padding: `${sz.padSm}px ${sz.pad}px`, opacity: c.ativo ? 1 : 0.55 }}
                >
                  {/* Ícone */}
                  <div className="combos-view__card-icone" style={{ background: alfa(C.accent, "15"), border: `1px solid ${alfa(C.accent, "33")}` }}>
                    {prod?.emoji ?? "🍽️"}
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="combos-view__card-nome">{c.nome}</div>
                    <div className="combos-view__card-info">
                      {prod?.name ?? "Produto removido"} · {composicao}
                    </div>
                  </div>

                  {/* Preço */}
                  <div className="combos-view__card-preco">
                    {fmtBRL(c.preco_total)}
                  </div>

                  {/* Modo badge */}
                  <span className="combos-view__badge" style={{ background: c.modo === "substituir" ? alfa(C.blue, "18") : alfa(C.accent, "18"), color: c.modo === "substituir" ? varColor(C.blue) : varColor(C.accent) }}>
                    {c.modo === "substituir" ? "Substitui" : "Combo"}
                  </span>

                  {/* Status */}
                  <button
                    onClick={() => toggleAtivo(c)}
                    className="combos-view__badge-status"
                    style={{ background: c.ativo ? alfa(C.green, "18") : varColor(C.surface), color: c.ativo ? varColor(C.green) : varColor(C.muted) }}
                  >
                    {c.ativo ? "Ativo" : "Inativo"}
                  </button>

                  {/* Editar */}
                  <button
                    onClick={() => abrirEditar(c)}
                    className="combos-view__btn-editar"
                    title="Editar combo"
                  >
                    <LuPencil size={15} />
                  </button>

                  {/* Excluir */}
                  <button
                    onClick={() => { setErroDelete(""); setExcluindo(c); }}
                    className="combos-view__btn-excluir"
                    style={{ borderColor: alfa(C.red, "33"), background: alfa(C.red, "0c"), color: varColor(C.red) }}
                    title="Excluir combo"
                  >
                    <LuTrash2 size={15} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {modal && (
        <ModalCombo
          combo={editando}
          products={products}
          subprodutos={subprodutos}
          onClose={fecharModal}
          onSalvo={aoSalvar}
          sz={sz}
        />
      )}

      {/* Confirmação de exclusão */}
      {excluindo && createPortal(
        <div {...fecharAoClicarFora(() => !deletando && setExcluindo(null))} className="combos-view__confirm-overlay">
          <div className="combos-view__confirm-modal">
            <div className="combos-view__confirm-topo">
              <div className="combos-view__confirm-icone" style={{ background: alfa(C.red, "18"), border: `1.5px solid ${alfa(C.red, "44")}` }}>
                <LuTriangleAlert size={22} color={varColor(C.red)} />
              </div>
              <div>
                <div className="combos-view__confirm-titulo">Excluir combo?</div>
                <div className="combos-view__confirm-sub">{prodMap[excluindo.item_principal_id]?.emoji ?? "🍽️"} <strong style={{ color: varColor(C.text) }}>{excluindo.nome}</strong></div>
              </div>
            </div>
            <div className="combos-view__confirm-aviso" style={{ background: alfa(C.red, "0d"), border: `1px solid ${alfa(C.red, "33")}` }}>
              Esta ação <strong style={{ color: varColor(C.red) }}>não pode ser desfeita</strong>. O combo será removido permanentemente. Os produtos e subprodutos do catálogo <strong>não</strong> são afetados.
            </div>
            {erroDelete && <div className="combos-view__erro" style={{ marginBottom: 12 }}>⚠ {erroDelete}</div>}
            <div className="combos-view__confirm-botoes">
              <button onClick={() => setExcluindo(null)} disabled={deletando} className="combos-view__confirm-btn-cancelar">Cancelar</button>
              <button onClick={confirmarExcluir} disabled={deletando} className="combos-view__confirm-btn-excluir" style={{ background: deletando ? varColor(C.faint) : varColor(C.red), cursor: deletando ? "not-allowed" : "pointer" }}>{deletando ? "Excluindo…" : "Sim, excluir"}</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
