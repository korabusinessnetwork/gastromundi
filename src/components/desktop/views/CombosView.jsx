import { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabase";
import { useApp } from "@/context/AppContext";
import C from "@/constants/colors";
import { alfa } from "@/constants/colorAlfa";
import {
  LuPlus, LuPencil, LuX, LuMinus, LuSearch, LuPackage,
  LuLayers, LuToggleLeft, LuToggleRight,
} from "react-icons/lu";
import "./CombosView.css";

// ── Helpers ────────────────────────────────────────────────────────

function Toggle({ value, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className="combos-view__toggle"
      style={{ background: value ? C.green : C.faint }}
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

  // produtos filtrados pela busca
  const prodsFiltrados = useMemo(() => {
    const q = buscaProd.toLowerCase();
    return q ? products.filter(p => p.name.toLowerCase().includes(q)) : products;
  }, [products, buscaProd]);

  // subprodutos filtrados (excluindo já adicionados)
  const subsFiltrados = useMemo(() => {
    const adicionados = new Set(itens.map(i => i.subproduto.id));
    const q = buscaSub.toLowerCase();
    return subprodutos.filter(s => s.ativo && !adicionados.has(s.id) && (!q || s.nome.toLowerCase().includes(q)));
  }, [subprodutos, itens, buscaSub]);

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
    return base + subs;
  }, [principal, itens]);

  const salvar = async () => {
    if (!nome.trim())  { setErro("Informe o nome do combo.");         return; }
    if (!principal)    { setErro("Selecione o produto principal.");   return; }
    if (itens.length === 0) { setErro("Adicione ao menos um subproduto."); return; }
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
        // recria os subprodutos
        await supabase.from("combo_subprodutos").delete().eq("combo_id", comboId);
      } else {
        const { data, error } = await supabase.from("combos").insert({ ...payload, ativo: true }).select().single();
        if (error) throw error;
        comboId = data.id;
      }

      const subs = itens.map(it => ({
        combo_id:          comboId,
        subproduto_id:     it.subproduto.id,
        quantidade:        it.quantidade,
        preco_customizado: it.usarCustom ? (parseFloat(String(it.precoCustom).replace(",", ".")) || null) : null,
      }));
      const { error: errSubs } = await supabase.from("combo_subprodutos").insert(subs);
      if (errSubs) throw errSubs;

      onSalvo();
    } catch (e) {
      setErro(e.message ?? "Erro ao salvar.");
    } finally {
      setSalvando(false);
    }
  };

  return createPortal(
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      className="combos-view__modal-overlay"
    >
      <div className="combos-view__modal">

        {/* Título */}
        <div className="combos-view__modal-topo">
          <div style={{ fontWeight: 800, fontSize: sz.fontBase + 2 }}>{isEdit ? "Editar Combo" : "Criar Combo"}</div>
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
            style={{ fontSize: sz.fontBase }}
          />
        </div>

        {/* Produto principal */}
        <div className="combos-view__principal-wrap">
          <div className="combos-view__label">Produto principal *</div>
          {principal ? (
            <div className="combos-view__principal-selecionado" style={{ background: alfa(C.accent, "10"), border: `1.5px solid ${alfa(C.accent, "44")}` }}>
              <span className="combos-view__principal-emoji">{principal.emoji ?? "📦"}</span>
              <div style={{ flex: 1 }}>
                <div className="combos-view__principal-nome" style={{ fontSize: sz.fontBase }}>{principal.name}</div>
                <div className="combos-view__principal-preco" style={{ fontSize: sz.fontSm }}>R$ {Number(principal.price).toFixed(2)}</div>
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
                  style={{ fontSize: sz.fontBase, paddingLeft: 36 }}
                />
              </div>
              {showProd && prodsFiltrados.length > 0 && (
                <div className="combos-view__dropdown">
                  {prodsFiltrados.slice(0, 20).map(p => (
                    <button
                      key={p.id}
                      onClick={() => { setPrincipal(p); setBuscaProd(""); setShowProd(false); }}
                      className="combos-view__dropdown-item"
                      onMouseEnter={e => e.currentTarget.style.background = C.surface}
                      onMouseLeave={e => e.currentTarget.style.background = "none"}
                    >
                      <span style={{ fontSize: 18 }}>{p.emoji ?? "📦"}</span>
                      <div style={{ flex: 1 }}>
                        <div className="combos-view__dropdown-item-nome" style={{ fontSize: sz.fontBase }}>{p.name}</div>
                        <div className="combos-view__dropdown-item-preco" style={{ fontSize: sz.fontSm }}>R$ {Number(p.price).toFixed(2)}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
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
                  style={{ borderColor: ativo ? C.accent : C.border, background: ativo ? alfa(C.accent, "10") : C.surface }}
                >
                  <m.icon size={20} color={ativo ? C.accent : C.muted} />
                  <div className="combos-view__modo-titulo" style={{ fontSize: sz.fontBase, color: ativo ? C.accent : C.text }}>{m.title}</div>
                  <div className="combos-view__modo-desc" style={{ fontSize: sz.fontSm }}>{m.desc}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Subprodutos */}
        <div>
          <div className="combos-view__label">Subprodutos *</div>

          {itens.length > 0 && (
            <div className="combos-view__itens-lista">
              {itens.map((it, idx) => (
                <div key={idx} className="combos-view__item-card">
                  <div className="combos-view__item-linha" style={{ marginBottom: it.usarCustom ? 8 : 0 }}>
                    {/* Nome */}
                    <div style={{ flex: 1 }}>
                      <div className="combos-view__item-nome" style={{ fontSize: sz.fontBase }}>{it.subproduto.nome}</div>
                      <div className="combos-view__item-info" style={{ fontSize: sz.fontSm }}>{it.subproduto.categoria} · {!it.usarCustom ? fmtBRL(it.subproduto.preco) : "preço custom"}</div>
                    </div>
                    {/* Quantidade */}
                    <div className="combos-view__item-qtd-controles">
                      <button onClick={() => setQtd(idx, it.quantidade - 1)} className="combos-view__qtd-btn"><LuMinus size={11} /></button>
                      <span className="combos-view__item-qtd-valor" style={{ fontSize: sz.fontBase }}>{it.quantidade}</span>
                      <button onClick={() => setQtd(idx, it.quantidade + 1)} className="combos-view__qtd-btn"><LuPlus size={11} /></button>
                    </div>
                    {/* Toggle custom */}
                    <div className="combos-view__item-custom-toggle">
                      <span className="combos-view__item-custom-label" style={{ fontSize: sz.fontSm }}>Custom</span>
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
                      style={{ fontSize: sz.fontBase, marginTop: 4 }}
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
              style={{ fontSize: sz.fontBase, paddingLeft: 36 }}
            />
            {showSub && subsFiltrados.length > 0 && (
              <div className="combos-view__dropdown">
                {subsFiltrados.slice(0, 20).map(s => (
                  <button
                    key={s.id}
                    onClick={() => addSubproduto(s)}
                    className="combos-view__dropdown-item"
                    onMouseEnter={e => e.currentTarget.style.background = C.surface}
                    onMouseLeave={e => e.currentTarget.style.background = "none"}
                  >
                    <div style={{ flex: 1 }}>
                      <div className="combos-view__dropdown-item-nome" style={{ fontSize: sz.fontBase }}>{s.nome}</div>
                      <div className="combos-view__dropdown-item-preco" style={{ fontSize: sz.fontSm }}>{s.categoria} · {fmtBRL(s.preco)}</div>
                    </div>
                    <LuPlus size={14} color={C.accent} />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Preço total */}
        <div className="combos-view__preco-total" style={{ background: alfa(C.green, "0c"), border: `1px solid ${alfa(C.green, "33")}` }}>
          <div className="combos-view__preco-total-label" style={{ fontSize: sz.fontBase }}>Preço total calculado</div>
          <div className="combos-view__preco-total-valor" style={{ fontSize: sz.fontLg }}>{fmtBRL(precoTotal)}</div>
        </div>

        {erro && <div className="combos-view__erro" style={{ fontSize: sz.fontSm }}>⚠ {erro}</div>}

        <div className="combos-view__modal-botoes">
          <button onClick={onClose} className="combos-view__btn-cancelar" style={{ fontSize: sz.fontBase }}>Cancelar</button>
          <button onClick={salvar} disabled={salvando} className="combos-view__btn-salvar" style={{ background: salvando ? C.faint : C.accent, cursor: salvando ? "not-allowed" : "pointer", fontSize: sz.fontBase }}>
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

  const carregar = async () => {
    setLoading(true);
    const [{ data: c }, { data: s }] = await Promise.all([
      supabase.from("combos").select("*, combo_subprodutos(quantidade, subprodutos(nome, preco))").order("created_at", { ascending: false }),
      supabase.from("subprodutos").select("*").eq("ativo", true).order("nome"),
    ]);
    setCombos(c ?? []);
    setSubprodutos(s ?? []);
    setLoading(false);
  };

  useEffect(() => { carregar(); }, []);

  const abrirNovo   = () => { setEditando(null); setModal(true); };
  const abrirEditar = (c) => { setEditando(c); setModal(true); };
  const fecharModal = () => { setModal(false); setEditando(null); };
  const aoSalvar    = () => { fecharModal(); carregar(); };

  const toggleAtivo = async (c) => {
    await supabase.from("combos").update({ ativo: !c.ativo, updated_at: new Date().toISOString() }).eq("id", c.id);
    setCombos(prev => prev.map(x => x.id === c.id ? { ...x, ativo: !x.ativo } : x));
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
          <div className="combos-view__contagem" style={{ fontSize: sz.fontSm + 1 }}>{combos.length} combo{combos.length !== 1 ? "s" : ""}</div>
          <input
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar combo..."
            className="combos-view__busca"
            style={{ fontSize: sz.fontBase }}
          />
        </div>
        <button
          onClick={abrirNovo}
          className="combos-view__btn-criar"
          style={{ fontSize: sz.fontBase }}
        >
          <LuPlus size={15} /> Criar Combo
        </button>
      </div>

      {/* Lista */}
      <div className="combos-view__lista-area" style={{ padding: `${sz.padSm}px ${sz.pad}px` }}>
        {loading ? (
          <div className="combos-view__estado">Carregando…</div>
        ) : listafiltrada.length === 0 ? (
          <div className="combos-view__vazio">
            <LuPackage size={40} style={{ opacity: 0.2 }} />
            <div style={{ fontWeight: 600, fontSize: sz.fontBase }}>{busca ? "Nenhum resultado" : "Nenhum combo criado"}</div>
          </div>
        ) : (
          <div className="combos-view__lista">
            {listafiltrada.map(c => {
              const prod = prodMap[c.item_principal_id];
              const qtdSubs = c.combo_subprodutos?.length ?? 0;
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
                    <div className="combos-view__card-nome" style={{ fontSize: sz.fontBase }}>{c.nome}</div>
                    <div className="combos-view__card-info" style={{ fontSize: sz.fontSm }}>
                      {prod?.name ?? "Produto removido"} · {qtdSubs} subproduto{qtdSubs !== 1 ? "s" : ""}
                    </div>
                  </div>

                  {/* Preço */}
                  <div className="combos-view__card-preco" style={{ fontSize: sz.fontBase + 1 }}>
                    {fmtBRL(c.preco_total)}
                  </div>

                  {/* Modo badge */}
                  <span className="combos-view__badge" style={{ fontSize: sz.fontSm - 1, background: c.modo === "substituir" ? alfa(C.blue, "18") : alfa(C.accent, "18"), color: c.modo === "substituir" ? C.blue : C.accent }}>
                    {c.modo === "substituir" ? "Substitui" : "Combo"}
                  </span>

                  {/* Status */}
                  <button
                    onClick={() => toggleAtivo(c)}
                    className="combos-view__badge-status"
                    style={{ fontSize: sz.fontSm - 1, background: c.ativo ? alfa(C.green, "18") : C.surface, color: c.ativo ? C.green : C.muted }}
                  >
                    {c.ativo ? "Ativo" : "Inativo"}
                  </button>

                  {/* Editar */}
                  <button
                    onClick={() => abrirEditar(c)}
                    className="combos-view__btn-editar"
                  >
                    <LuPencil size={15} />
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
    </div>
  );
}
