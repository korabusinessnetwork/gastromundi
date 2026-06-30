import { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabase";
import { useApp } from "@/context/AppContext";
import C from "@/constants/colors";
import {
  LuPlus, LuPencil, LuX, LuMinus, LuSearch, LuPackage,
  LuLayers, LuToggleLeft, LuToggleRight,
} from "react-icons/lu";

// ── Helpers ────────────────────────────────────────────────────────

function Toggle({ value, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      style={{
        width: 44, height: 24, borderRadius: 12, border: "none", padding: 0,
        background: value ? C.green : C.faint, cursor: "pointer",
        position: "relative", transition: "background 0.2s", flexShrink: 0,
      }}
    >
      <span style={{
        position: "absolute", top: "50%", transform: "translateY(-50%)",
        left: value ? 22 : 2, width: 20, height: 20, borderRadius: "50%",
        background: "#fff", transition: "left 0.2s", display: "block",
        boxShadow: "0 1px 3px #0004",
      }} />
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
      style={{ position: "fixed", inset: 0, zIndex: 9100, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "'Inter',system-ui,sans-serif" }}
    >
      <div style={{ background: C.card, borderRadius: 20, width: "100%", maxWidth: 580, maxHeight: "92vh", overflowY: "auto", border: `1px solid ${C.border}`, boxShadow: "0 24px 64px rgba(0,0,0,0.55)", display: "flex", flexDirection: "column", gap: 20, padding: 28 }}>

        {/* Título */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontWeight: 800, fontSize: sz.fontBase + 2 }}>{isEdit ? "Editar Combo" : "Criar Combo"}</div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", lineHeight: 0 }}><LuX size={20} /></button>
        </div>

        {/* Nome */}
        <div>
          <div style={lbl}>Nome do combo *</div>
          <input
            autoFocus
            value={nome}
            onChange={e => setNome(e.target.value)}
            placeholder="Ex: Combo X-Burguer Clássico"
            maxLength={100}
            style={inp(sz)}
          />
        </div>

        {/* Produto principal */}
        <div style={{ position: "relative" }}>
          <div style={lbl}>Produto principal *</div>
          {principal ? (
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 10, background: `${C.accent}10`, border: `1.5px solid ${C.accent}44` }}>
              <span style={{ fontSize: 22 }}>{principal.emoji ?? "📦"}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: sz.fontBase }}>{principal.name}</div>
                <div style={{ fontSize: sz.fontSm, color: C.muted }}>R$ {Number(principal.price).toFixed(2)}</div>
              </div>
              <button onClick={() => setPrincipal(null)} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", lineHeight: 0 }}><LuX size={16} /></button>
            </div>
          ) : (
            <div>
              <div style={{ position: "relative" }}>
                <LuSearch size={15} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: C.muted, pointerEvents: "none" }} />
                <input
                  value={buscaProd}
                  onChange={e => { setBuscaProd(e.target.value); setShowProd(true); }}
                  onFocus={() => setShowProd(true)}
                  placeholder="Buscar produto..."
                  style={{ ...inp(sz), paddingLeft: 36 }}
                />
              </div>
              {showProd && prodsFiltrados.length > 0 && (
                <div style={{ position: "absolute", left: 0, right: 0, top: "100%", zIndex: 10, background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, maxHeight: 200, overflowY: "auto", boxShadow: "0 8px 24px rgba(0,0,0,0.25)", marginTop: 4 }}>
                  {prodsFiltrados.slice(0, 20).map(p => (
                    <button
                      key={p.id}
                      onClick={() => { setPrincipal(p); setBuscaProd(""); setShowProd(false); }}
                      style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", textAlign: "left", borderBottom: `1px solid ${C.border}` }}
                      onMouseEnter={e => e.currentTarget.style.background = C.surface}
                      onMouseLeave={e => e.currentTarget.style.background = "none"}
                    >
                      <span style={{ fontSize: 18 }}>{p.emoji ?? "📦"}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: sz.fontBase, color: C.text }}>{p.name}</div>
                        <div style={{ fontSize: sz.fontSm, color: C.muted }}>R$ {Number(p.price).toFixed(2)}</div>
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
          <div style={lbl}>Comportamento do combo</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {[
              { id: "combo",      icon: LuLayers,      title: "Exibir como combo",           desc: "Aparece como opção adicional ao lado do produto" },
              { id: "substituir", icon: LuToggleRight,  title: "Substituir produto",          desc: "Enquanto ativo, substitui o produto principal" },
            ].map(m => {
              const ativo = modo === m.id;
              return (
                <button
                  key={m.id}
                  onClick={() => setModo(m.id)}
                  style={{ display: "flex", flexDirection: "column", gap: 6, padding: "12px 14px", borderRadius: 12, border: `2px solid ${ativo ? C.accent : C.border}`, background: ativo ? `${C.accent}10` : C.surface, cursor: "pointer", fontFamily: "inherit", textAlign: "left", transition: "border-color 0.15s, background 0.15s" }}
                >
                  <m.icon size={20} color={ativo ? C.accent : C.muted} />
                  <div style={{ fontWeight: 700, fontSize: sz.fontBase, color: ativo ? C.accent : C.text }}>{m.title}</div>
                  <div style={{ fontSize: sz.fontSm, color: C.muted, lineHeight: 1.4 }}>{m.desc}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Subprodutos */}
        <div>
          <div style={lbl}>Subprodutos *</div>

          {itens.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 10 }}>
              {itens.map((it, idx) => (
                <div key={idx} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "10px 14px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: it.usarCustom ? 8 : 0 }}>
                    {/* Nome */}
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: sz.fontBase }}>{it.subproduto.nome}</div>
                      <div style={{ fontSize: sz.fontSm, color: C.muted }}>{it.subproduto.categoria} · {!it.usarCustom ? fmtBRL(it.subproduto.preco) : "preço custom"}</div>
                    </div>
                    {/* Quantidade */}
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <button onClick={() => setQtd(idx, it.quantidade - 1)} style={qBtn}><LuMinus size={11} /></button>
                      <span style={{ fontWeight: 700, fontSize: sz.fontBase, minWidth: 20, textAlign: "center" }}>{it.quantidade}</span>
                      <button onClick={() => setQtd(idx, it.quantidade + 1)} style={qBtn}><LuPlus size={11} /></button>
                    </div>
                    {/* Toggle custom */}
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: sz.fontSm, color: C.muted }}>Custom</span>
                      <Toggle value={it.usarCustom} onChange={() => toggleCustom(idx)} />
                    </div>
                    {/* Remover */}
                    <button onClick={() => removeItem(idx)} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", lineHeight: 0, padding: 4 }}><LuX size={15} /></button>
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
                      style={{ ...inp(sz), marginTop: 4 }}
                    />
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Busca subproduto */}
          <div style={{ position: "relative" }}>
            <LuSearch size={15} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: C.muted, pointerEvents: "none" }} />
            <input
              value={buscaSub}
              onChange={e => { setBuscaSub(e.target.value); setShowSub(true); }}
              onFocus={() => setShowSub(true)}
              placeholder="Buscar e adicionar subproduto..."
              style={{ ...inp(sz), paddingLeft: 36 }}
            />
            {showSub && subsFiltrados.length > 0 && (
              <div style={{ position: "absolute", left: 0, right: 0, top: "100%", zIndex: 10, background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, maxHeight: 200, overflowY: "auto", boxShadow: "0 8px 24px rgba(0,0,0,0.25)", marginTop: 4 }}>
                {subsFiltrados.slice(0, 20).map(s => (
                  <button
                    key={s.id}
                    onClick={() => addSubproduto(s)}
                    style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", textAlign: "left", borderBottom: `1px solid ${C.border}` }}
                    onMouseEnter={e => e.currentTarget.style.background = C.surface}
                    onMouseLeave={e => e.currentTarget.style.background = "none"}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: sz.fontBase, color: C.text }}>{s.nome}</div>
                      <div style={{ fontSize: sz.fontSm, color: C.muted }}>{s.categoria} · {fmtBRL(s.preco)}</div>
                    </div>
                    <LuPlus size={14} color={C.accent} />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Preço total */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderRadius: 12, background: `${C.green}0c`, border: `1px solid ${C.green}33` }}>
          <div style={{ fontWeight: 700, fontSize: sz.fontBase }}>Preço total calculado</div>
          <div style={{ fontWeight: 900, fontSize: sz.fontLg, color: C.green }}>{fmtBRL(precoTotal)}</div>
        </div>

        {erro && <div style={{ fontSize: sz.fontSm, color: C.red, fontWeight: 600 }}>⚠ {erro}</div>}

        <div style={{ display: "flex", gap: 10, paddingTop: 4, borderTop: `1px solid ${C.border}` }}>
          <button onClick={onClose} style={{ flex: 1, padding: 12, borderRadius: 10, border: `1px solid ${C.border}`, background: "none", color: C.muted, cursor: "pointer", fontWeight: 600, fontSize: sz.fontBase, fontFamily: "inherit" }}>Cancelar</button>
          <button onClick={salvar} disabled={salvando} style={{ flex: 2, padding: 12, borderRadius: 10, border: "none", background: salvando ? C.faint : C.accent, color: "#fff", cursor: salvando ? "not-allowed" : "pointer", fontWeight: 700, fontSize: sz.fontBase, fontFamily: "inherit" }}>
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
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

      {/* Header */}
      <div style={{ padding: `${sz.padSm}px ${sz.pad}px`, borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ color: C.muted, fontSize: sz.fontSm + 1 }}>{combos.length} combo{combos.length !== 1 ? "s" : ""}</div>
          <input
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar combo..."
            style={{ padding: "7px 14px", borderRadius: 10, border: `1px solid ${C.border}`, background: C.surface, color: C.text, fontSize: sz.fontBase, outline: "none", fontFamily: "inherit", width: 220 }}
          />
        </div>
        <button
          onClick={abrirNovo}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 18px", borderRadius: 10, border: "none", background: C.accent, color: "#fff", fontWeight: 700, fontSize: sz.fontBase, cursor: "pointer", fontFamily: "inherit" }}
        >
          <LuPlus size={15} /> Criar Combo
        </button>
      </div>

      {/* Lista */}
      <div style={{ flex: 1, overflowY: "auto", padding: `${sz.padSm}px ${sz.pad}px` }}>
        {loading ? (
          <div style={{ color: C.muted, padding: 40, textAlign: "center" }}>Carregando…</div>
        ) : listafiltrada.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, color: C.muted, padding: 60 }}>
            <LuPackage size={40} style={{ opacity: 0.2 }} />
            <div style={{ fontWeight: 600, fontSize: sz.fontBase }}>{busca ? "Nenhum resultado" : "Nenhum combo criado"}</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {listafiltrada.map(c => {
              const prod = prodMap[c.item_principal_id];
              const qtdSubs = c.combo_subprodutos?.length ?? 0;
              return (
                <div
                  key={c.id}
                  style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: `${sz.padSm}px ${sz.pad}px`, display: "flex", alignItems: "center", gap: 14, opacity: c.ativo ? 1 : 0.55 }}
                >
                  {/* Ícone */}
                  <div style={{ width: 44, height: 44, borderRadius: 12, flexShrink: 0, background: `${C.accent}15`, border: `1px solid ${C.accent}33`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>
                    {prod?.emoji ?? "🍽️"}
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: sz.fontBase }}>{c.nome}</div>
                    <div style={{ fontSize: sz.fontSm, color: C.muted, marginTop: 2 }}>
                      {prod?.name ?? "Produto removido"} · {qtdSubs} subproduto{qtdSubs !== 1 ? "s" : ""}
                    </div>
                  </div>

                  {/* Preço */}
                  <div style={{ fontWeight: 800, fontSize: sz.fontBase + 1, whiteSpace: "nowrap" }}>
                    {fmtBRL(c.preco_total)}
                  </div>

                  {/* Modo badge */}
                  <span style={{ fontSize: sz.fontSm - 1, fontWeight: 700, padding: "3px 10px", borderRadius: 20, border: "none", whiteSpace: "nowrap", background: c.modo === "substituir" ? `${C.blue}18` : `${C.accent}18`, color: c.modo === "substituir" ? C.blue : C.accent }}>
                    {c.modo === "substituir" ? "Substitui" : "Combo"}
                  </span>

                  {/* Status */}
                  <button
                    onClick={() => toggleAtivo(c)}
                    style={{ fontSize: sz.fontSm - 1, fontWeight: 700, padding: "3px 10px", borderRadius: 20, border: "none", cursor: "pointer", fontFamily: "inherit", background: c.ativo ? `${C.green}18` : C.surface, color: c.ativo ? C.green : C.muted }}
                  >
                    {c.ativo ? "Ativo" : "Inativo"}
                  </button>

                  {/* Editar */}
                  <button
                    onClick={() => abrirEditar(c)}
                    style={{ padding: "7px 9px", borderRadius: 9, border: `1px solid ${C.border}`, background: C.surface, color: C.muted, cursor: "pointer", lineHeight: 0 }}
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

// ── Estilos utilitários ────────────────────────────────────────────
const lbl = { fontSize: 12, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 };
const inp = (sz) => ({ width: "100%", padding: "11px 14px", borderRadius: 10, border: `1.5px solid ${C.border}`, background: C.surface, color: C.text, fontSize: sz.fontBase, boxSizing: "border-box", fontFamily: "inherit", outline: "none" });
const qBtn = { width: 26, height: 26, borderRadius: 7, border: `1px solid ${C.border}`, background: C.surface, color: C.text, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" };
