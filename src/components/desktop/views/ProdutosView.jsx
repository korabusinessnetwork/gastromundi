import { useState, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import { useApp } from "@/context/AppContext";
import { supabase } from "@/lib/supabase";
import { logAction } from "@/lib/logger";
import { useResponsive } from "@/utils/hooks";
import { getSizes } from "@/constants/sizes";
import C from "@/constants/colors";
import { labelEstoque, getUnidadesCompra, fmtQtd } from "@/utils/conversaoUnidades";
import { LuTriangleAlert, LuTag, LuPencil, LuTrash2, LuCheck, LuX as LuXIcon, LuRuler, LuPlus } from "react-icons/lu";

const EMOJIS = ["🍺","🥤","💧","🍹","🍸","🥂","🍷","🍵","☕","🍔","🍟","🍕","🌭","🥪","🥗","🍝","🍣","🍜","🌮","🥩","🍗","🍖","🥚","🧀","🍰","🍦","🍫","🍿","🧂","🍱"];

const SUGESTOES_ESTOQUE = ["un", "kg", "g", "L", "ml", "cx", "pct", "dt"];

const EMPTY_UC = { unidade: "", fator: "", detalhamento: "", unidade_destino: "" };

const EMPTY_FORM = {
  name: "", price: "", category: "", emoji: "",
  unidade_estoque: "un",
  unidade_consumo: "",
  fator_consumo_estoque: "",
  unidades_compra: [],
};

export default function ProdutosView() {
  const { products, addProduct, updateProduct, removeProduct, currentUser } = useApp();
  const { width } = useResponsive();
  const sz = getSizes(width);

  const [modal,     setModal]     = useState(null);
  const [form,      setForm]      = useState(EMPTY_FORM);
  const [editId,    setEditId]    = useState(null);
  const [salvando,  setSalvando]  = useState(false);
  const [erro,      setErro]      = useState("");
  const [deleteId,  setDeleteId]  = useState(null);
  const [deletando, setDeletando] = useState(false);
  const [catFiltro,    setCatFiltro]    = useState("Todos");
  const [editingUC,    setEditingUC]    = useState(null); // índice do card com nome em edição
  const [busca,     setBusca]     = useState("");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const [consumoDiferente, setConsumoDiferente] = useState(false);
  const [compraDiferente,  setCompraDiferente]  = useState(false);

  // ── Categorias ────────────────────────────────────────────────
  const [showCatModal,  setShowCatModal]  = useState(false);
  const [catExtra,      setCatExtra]      = useState([]);
  const [catEditando,   setCatEditando]   = useState(null);
  const [catNova,       setCatNova]       = useState("");
  const [catOpLoading,  setCatOpLoading]  = useState(false);

  useEffect(() => {
    supabase.from("config").select("value").eq("key", "categorias_extra").single()
      .then(({ data }) => { if (data?.value && Array.isArray(data.value)) setCatExtra(data.value); });
  }, []);

  const salvarCatExtra = async (lista) => {
    setCatExtra(lista);
    await supabase.from("config").upsert({ key: "categorias_extra", value: lista });
  };

  const criarCategoria = async () => {
    const nome = catNova.trim();
    if (!nome || catOpLoading || categorias.includes(nome)) return;
    setCatOpLoading(true);
    await salvarCatExtra([...catExtra, nome]);
    setCatNova("");
    setCatOpLoading(false);
  };

  const renomearCategoria = async () => {
    if (!catEditando || catOpLoading) return;
    const novoNome   = catEditando.input.trim();
    const nomeAntigo = catEditando.name;
    if (!novoNome || novoNome === nomeAntigo) { setCatEditando(null); return; }
    setCatOpLoading(true);
    await salvarCatExtra(catExtra.map(c => c === nomeAntigo ? novoNome : c));
    await Promise.all(products.filter(p => p.category === nomeAntigo).map(p => updateProduct(p.id, { category: novoNome })));
    if (catFiltro === nomeAntigo) setCatFiltro(novoNome);
    setCatEditando(null);
    setCatOpLoading(false);
  };

  const excluirCategoria = async (nome) => {
    if (catOpLoading || products.some(p => p.category === nome)) return;
    setCatOpLoading(true);
    await salvarCatExtra(catExtra.filter(c => c !== nome));
    setCatOpLoading(false);
  };

  const categorias = useMemo(() => {
    const fromProducts = products.map(p => p.category).filter(Boolean);
    return [...new Set([...catExtra, ...fromProducts])].sort();
  }, [products, catExtra]);

  const produtosFiltrados = useMemo(() => {
    return products
      .filter(p => catFiltro === "Todos" || p.category === catFiltro)
      .filter(p => !busca || p.name.toLowerCase().includes(busca.toLowerCase()));
  }, [products, catFiltro, busca]);

  // ── Modal ─────────────────────────────────────────────────────

  const resetToggles = () => { setConsumoDiferente(false); setCompraDiferente(false); };

  const abrirNovo = () => {
    setForm(EMPTY_FORM);
    setErro("");
    setEditId(null);
    resetToggles();
    setModal("novo");
  };

  const abrirEditar = (p) => {
    let unidades_compra = [];
    if (Array.isArray(p.unidades_compra) && p.unidades_compra.length > 0) {
      unidades_compra = p.unidades_compra.map(u => ({
        unidade:         u.unidade ?? "",
        fator:           u.fator != null ? String(u.fator) : "",
        detalhamento:    u.detalhamento ?? "",
        unidade_destino: u.unidade_destino ?? "",
      }));
    } else if (p.unidade_compra) {
      unidades_compra = [{
        unidade:         p.unidade_compra,
        fator:           p.fator_compra_estoque ? String(p.fator_compra_estoque) : "",
        detalhamento:    p.detalhamento_compra ?? "",
        unidade_destino: "",
      }];
    }

    setForm({
      name:                  p.name,
      price:                 String(p.price),
      category:              p.category ?? "",
      emoji:                 p.emoji ?? "",
      unidade_estoque:       p.unidade_estoque ?? p.unidade ?? "un",
      unidade_consumo:       p.unidade_consumo ?? "",
      fator_consumo_estoque: p.fator_consumo_estoque ? String(p.fator_consumo_estoque) : "",
      unidades_compra,
    });
    setConsumoDiferente(!!p.unidade_consumo);
    setCompraDiferente(unidades_compra.length > 0);
    setErro("");
    setEditId(p.id);
    setModal("editar");
  };

  const fecharModal = () => {
    setModal(null);
    setShowEmojiPicker(false);
    setErro("");
    resetToggles();
  };

  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const setUnidadeEstoque = (v) => setField("unidade_estoque", v);

  const toggleConsumoDiferente = () => {
    if (consumoDiferente) {
      setConsumoDiferente(false);
      setForm(f => ({ ...f, unidade_consumo: "" }));
    } else {
      setConsumoDiferente(true);
    }
  };

  // ── Helpers de unidades de compra ─────────────────────────────
  const addUnidadeCompra = () =>
    setForm(f => ({ ...f, unidades_compra: [...f.unidades_compra, { ...EMPTY_UC, unidade: `Fornecedor ${f.unidades_compra.length + 1}` }] }));

  const setUC = (idx, k, v) =>
    setForm(f => ({
      ...f,
      unidades_compra: f.unidades_compra.map((u, i) => i === idx ? { ...u, [k]: v } : u),
    }));

  const removeUC = (idx) =>
    setForm(f => ({ ...f, unidades_compra: f.unidades_compra.filter((_, i) => i !== idx) }));

  // ── Validação ─────────────────────────────────────────────────
  const validar = () => {
    if (!form.name.trim())             return "Informe o nome do produto.";
    if (!form.price)                   return "Informe o preço.";
    const p = parseFloat(String(form.price).replace(",", "."));
    if (isNaN(p) || p <= 0)           return "Preço deve ser maior que zero.";
    if (!form.category.trim())         return "Informe a categoria.";
    if (!form.unidade_estoque.trim())  return "Informe a unidade de estoque.";
    if (consumoDiferente && !form.unidade_consumo.trim()) return "Informe a unidade de consumo ou desative o toggle.";
    if (consumoDiferente && !form.fator_consumo_estoque)  return "Informe o fator de conversão de consumo.";
    if (compraDiferente) {
      if (form.unidades_compra.length === 0) return "Adicione ao menos uma unidade de compra.";
      for (const u of form.unidades_compra) {
        if (!u.unidade.trim()) return "Preencha o nome de todas as unidades de compra.";
        if (!u.fator)          return "Preencha o fator de conversão de todas as unidades de compra.";
      }
    }
    return null;
  };

  const salvar = async () => {
    const err = validar();
    if (err) { setErro(err); return; }
    setSalvando(true);
    const payload = {
      name:                  form.name.trim(),
      price:                 parseFloat(String(form.price).replace(",", ".")),
      category:              form.category.trim(),
      emoji:                 form.emoji || null,
      unidade_estoque:       form.unidade_estoque.trim() || "un",
      unidade_consumo:       consumoDiferente && form.unidade_consumo.trim() ? form.unidade_consumo.trim() : null,
      fator_consumo_estoque: consumoDiferente && form.fator_consumo_estoque ? parseFloat(form.fator_consumo_estoque) : 1,
      unidades_compra:       compraDiferente
        ? form.unidades_compra
            .filter(u => u.unidade.trim() && u.fator)
            .map(u => ({ unidade: u.unidade.trim(), fator: parseFloat(u.fator), detalhamento: u.detalhamento.trim() || null, unidade_destino: u.unidade_destino || null }))
        : [],
      unidade_compra:       null,
      fator_compra_estoque: null,
      detalhamento_compra:  null,
    };
    let dbError = null;
    if (modal === "novo") {
      const { error } = await addProduct({ id: crypto.randomUUID(), ...payload });
      dbError = error;
      if (!error) logAction(currentUser?.username, "produto:criar", { msg: `Produto cadastrado: ${payload.name}`, name: currentUser?.name, role: currentUser?.role });
    } else {
      const { error } = await updateProduct(editId, payload);
      dbError = error;
      if (!error) logAction(currentUser?.username, "produto:editar", { msg: `Produto editado: ${payload.name}`, name: currentUser?.name, role: currentUser?.role });
    }
    setSalvando(false);
    if (dbError) { setErro(dbError.message ?? "Erro ao salvar. Verifique o console."); return; }
    fecharModal();
  };

  const confirmarDelete = async () => {
    if (!deleteId || deletando) return;
    setDeletando(true);
    const p = products.find(x => x.id === deleteId);
    await removeProduct(deleteId);
    logAction(currentUser?.username, "produto:remover", { msg: `Produto removido: ${p?.name ?? deleteId}`, name: currentUser?.name, role: currentUser?.role });
    setDeletando(false);
    setDeleteId(null);
  };

  const isAdmin = currentUser?.role === "admin" || currentUser?.role === "gerente";

  const fcFator = parseFloat(form.fator_consumo_estoque) || 0;
  const ue = form.unidade_estoque || "…";
  const uc = form.unidade_consumo || "…";

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", background: C.bg, overflow: "hidden" }}>

      {/* Header */}
      <div style={{ padding: `${sz.pad - 4}px ${sz.pad}px`, borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0, gap: 16 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: sz.fontLg }}>Produtos</div>
          <div style={{ color: C.muted, fontSize: sz.fontSm, marginTop: 2 }}>{products.length} cadastrado{products.length !== 1 ? "s" : ""}</div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar produto..." style={{ padding: "9px 14px", borderRadius: 10, border: `1px solid ${C.border}`, background: C.surface, color: C.text, fontSize: sz.fontBase, outline: "none", fontFamily: "inherit", width: 220 }} />
          {isAdmin && (
            <>
              <button onClick={() => setShowCatModal(true)} style={{ padding: `9px ${sz.pad - 8}px`, borderRadius: 10, border: `1px solid ${C.border}`, background: C.surface, color: C.text, fontWeight: 700, fontSize: sz.fontBase, cursor: "pointer", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 6 }}>
                <LuTag size={15} /> Categorias
              </button>
              <button onClick={abrirNovo} style={{ padding: `9px ${sz.pad - 8}px`, borderRadius: 10, border: "none", background: C.accent, color: "#fff", fontWeight: 700, fontSize: sz.fontBase, cursor: "pointer", whiteSpace: "nowrap" }}>
                + Novo Produto
              </button>
            </>
          )}
        </div>
      </div>

      {/* Filtros de categoria */}
      <div style={{ display: "flex", gap: 8, padding: `12px ${sz.pad}px`, borderBottom: `1px solid ${C.border}`, overflowX: "auto", flexShrink: 0 }}>
        {["Todos", ...categorias].map(cat => (
          <button key={cat} onClick={() => setCatFiltro(cat)} style={{ padding: "7px 18px", borderRadius: 20, border: "none", background: catFiltro === cat ? C.accent : C.surface, color: catFiltro === cat ? "#fff" : C.muted, cursor: "pointer", fontWeight: 600, fontSize: sz.fontBase, whiteSpace: "nowrap", flexShrink: 0, transition: "background 0.15s, color 0.15s" }}>
            {cat}
          </button>
        ))}
      </div>

      {/* Tabela */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {produtosFiltrados.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, color: C.muted, padding: 60 }}>
            <div style={{ fontSize: 48, opacity: 0.3 }}>📦</div>
            <div style={{ fontSize: sz.fontBase + 1, fontWeight: 600 }}>{busca ? "Nenhum produto encontrado" : "Nenhum produto cadastrado"}</div>
            {isAdmin && !busca && <div style={{ fontSize: sz.fontSm }}>Clique em "+ Novo Produto" para adicionar</div>}
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                {["", "Nome", "Categoria", "Unidade", "Preço", ""].map((h, i) => (
                  <th key={i} style={{ padding: `12px ${i === 0 ? sz.pad : 16}px`, textAlign: i >= 4 ? "right" : "left", fontSize: 14, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 1, whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {produtosFiltrados.map(p => {
                const units = getUnidadesCompra(p);
                return (
                  <tr key={p.id} style={{ borderBottom: `1px solid ${C.border}`, transition: "background 0.1s" }} onMouseEnter={e => e.currentTarget.style.background = C.surface} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    <td style={{ padding: `14px ${sz.pad}px`, width: 56 }}>
                      <div style={{ width: 44, height: 44, borderRadius: 12, background: C.card, border: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>{p.emoji || "📦"}</div>
                    </td>
                    <td style={{ padding: "14px 16px" }}>
                      <div style={{ fontWeight: 700, fontSize: sz.fontBase + 1 }}>{p.name}</div>
                      {(p.unidade_consumo || units.length > 0) && (
                        <div style={{ fontSize: 14, color: C.muted, marginTop: 2, display: "flex", gap: 8 }}>
                          {p.unidade_consumo && <span>consumo: {p.unidade_consumo}</span>}
                          {units.length > 0 && <span>compra: {units.map(u => u.unidade).join(", ")}</span>}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: "14px 16px" }}>
                      <span style={{ fontSize: sz.fontSm + 1, fontWeight: 600, background: C.surface, padding: "4px 12px", borderRadius: 20, color: C.muted, border: `1px solid ${C.border}` }}>{p.category}</span>
                    </td>
                    <td style={{ padding: "14px 16px" }}>
                      <span style={{ fontSize: sz.fontSm + 1, fontWeight: 700, background: `${C.accent}12`, padding: "4px 12px", borderRadius: 20, color: C.accent, border: `1px solid ${C.accent}33` }}>{labelEstoque(p)}</span>
                    </td>
                    <td style={{ padding: "14px 16px", textAlign: "right" }}>
                      <span style={{ fontWeight: 800, fontSize: sz.fontBase + 2, color: C.green }}>R$ {Number(p.price).toFixed(2)}</span>
                    </td>
                    <td style={{ padding: "14px 24px 14px 16px", textAlign: "right", whiteSpace: "nowrap" }}>
                      {isAdmin && (
                        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                          <button onClick={() => abrirEditar(p)} style={{ padding: "7px 16px", borderRadius: 8, border: `1px solid ${C.border}`, background: "none", color: C.text, cursor: "pointer", fontWeight: 600, fontSize: sz.fontSm + 1 }}>Editar</button>
                          <button onClick={() => setDeleteId(p.id)} style={{ padding: "7px 16px", borderRadius: 8, border: `1px solid ${C.red}44`, background: `${C.red}0f`, color: C.red, cursor: "pointer", fontWeight: 600, fontSize: sz.fontSm + 1 }}>Excluir</button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Modal Novo / Editar ── */}
      {modal && (
        <div onClick={e => { if (e.target === e.currentTarget) fecharModal(); }} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.72)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 300, padding: 16 }}>
          <div style={{ background: C.card, borderRadius: 20, padding: 24, width: "100%", maxWidth: 560, border: `1px solid ${C.border}`, display: "flex", flexDirection: "column", gap: 20, maxHeight: "92vh", overflowY: "auto", color: C.text, fontFamily: "inherit", boxSizing: "border-box" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontWeight: 800, fontSize: sz.fontLg }}>{modal === "novo" ? "Novo Produto" : "Editar Produto"}</div>
              <button onClick={fecharModal} style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 8, color: C.muted, cursor: "pointer", padding: "6px 8px", display: "flex", alignItems: "center", justifyContent: "center" }}><LuXIcon size={16} /></button>
            </div>

            {/* Emoji */}
            <div>
              <Label>Emoji</Label>
              <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 8 }}>
                <button onClick={() => setShowEmojiPicker(v => !v)} style={{ width: 56, height: 56, borderRadius: 14, border: `1.5px solid ${showEmojiPicker ? C.accent : C.border}`, background: C.surface, fontSize: 28, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {form.emoji || "📦"}
                </button>
                <span style={{ fontSize: sz.fontSm, color: C.muted }}>Clique para escolher um emoji</span>
                {form.emoji && <button onClick={() => setField("emoji", "")} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: sz.fontSm }}>✕ limpar</button>}
              </div>
              {showEmojiPicker && (
                <div style={{ marginTop: 10, padding: 12, background: C.surface, borderRadius: 12, border: `1px solid ${C.border}`, display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {EMOJIS.map(e => (
                    <button key={e} onClick={() => { setField("emoji", e); setShowEmojiPicker(false); }} style={{ width: 38, height: 38, borderRadius: 8, border: "none", background: form.emoji === e ? C.alow : "transparent", cursor: "pointer", fontSize: 20, outline: form.emoji === e ? `2px solid ${C.accent}` : "none" }}>{e}</button>
                  ))}
                </div>
              )}
            </div>

            {/* Nome */}
            <div>
              <Label>Nome *</Label>
              <Input value={form.name} onChange={v => setField("name", v)} placeholder="Ex: Cerveja 600ml" maxLength={60} />
            </div>

            {/* Categoria */}
            <div>
              <Label>Categoria *</Label>
              <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                {categorias.map(cat => (
                  <button key={cat} onClick={() => setField("category", cat)} style={{ padding: "6px 14px", borderRadius: 20, border: `1.5px solid ${form.category === cat ? C.accent : C.border}`, background: form.category === cat ? C.alow : C.surface, color: form.category === cat ? C.accent : C.muted, cursor: "pointer", fontWeight: 600, fontSize: sz.fontSm + 1 }}>
                    {cat}
                  </button>
                ))}
              </div>
              <Input value={form.category} onChange={v => setField("category", v)} placeholder="Ou digite uma nova categoria" maxLength={40} style={{ marginTop: 8 }} />
            </div>

            {/* Preço */}
            <div>
              <Label>Preço (R$) *</Label>
              <div style={{ position: "relative", marginTop: 8 }}>
                <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: C.muted, fontSize: sz.fontBase, fontWeight: 600 }}>R$</span>
                <input type="number" min="0" step="0.01" value={form.price} onChange={e => setField("price", e.target.value)} placeholder="0,00" style={{ width: "100%", padding: `11px 14px 11px 42px`, borderRadius: 10, border: `1px solid ${C.border}`, background: C.surface, color: C.text, fontSize: sz.fontBase + 2, fontWeight: 700, boxSizing: "border-box", fontFamily: "inherit", outline: "none" }} />
              </div>
            </div>

            {/* ── Seção: Unidades de medida ── */}
            <div style={{ background: C.surface, borderRadius: 14, border: `1px solid ${C.border}`, padding: 16, display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <LuRuler size={15} color={C.accent} />
                <span style={{ fontWeight: 800, fontSize: sz.fontBase, color: C.text }}>Unidades de medida</span>
              </div>

              {/* Bloco 1: Unidade de estoque */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <Label>Unidade de estoque *</Label>
                <input value={form.unidade_estoque} onChange={e => setUnidadeEstoque(e.target.value)} placeholder="ex: L, kg, un, g, ml" style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: `1.5px solid ${form.unidade_estoque ? C.accent + "55" : C.border}`, background: C.card, color: C.text, fontSize: sz.fontBase, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }} />
                <div style={{ fontSize: 14, color: C.muted }}>Como este insumo será armazenado no estoque.</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {SUGESTOES_ESTOQUE.map(u => (
                    <button key={u} onClick={() => setUnidadeEstoque(u)} style={{ padding: "4px 12px", borderRadius: 20, border: `1px solid ${form.unidade_estoque === u ? C.accent : C.border}`, background: form.unidade_estoque === u ? C.alow : "none", color: form.unidade_estoque === u ? C.accent : C.muted, cursor: "pointer", fontSize: 18, fontWeight: 600, fontFamily: "inherit" }}>{u}</button>
                  ))}
                </div>
              </div>

              <div style={{ borderTop: `1px solid ${C.border}` }} />

              {/* Bloco 2: Unidade de consumo */}
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <Label>Unidade de consumo</Label>
                  <ToggleBtn on={consumoDiferente} onToggle={toggleConsumoDiferente} label={consumoDiferente ? "Diferente" : "Igual ao estoque"} />
                </div>
                {!consumoDiferente ? (
                  <div style={{ fontSize: 16, color: C.muted, padding: "8px 12px", background: C.card, borderRadius: 8, border: `1px solid ${C.border}` }}>
                    Consumo registrado em: <strong style={{ color: C.text }}>{ue}</strong>
                  </div>
                ) : (
                  <div style={{ background: C.card, borderRadius: 12, border: `1.5px solid ${C.green}33`, padding: "16px" }}>
                    {/* Equação — linha única com scroll se necessário */}
                    <div style={{ overflowX: "auto", paddingBottom: 4 }}>
                      <div style={{ display: "flex", alignItems: "flex-end", gap: 10, minWidth: "max-content" }}>
                        {/* Esquerdo: sincronizado */}
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                          <span style={{ fontSize: 13, color: C.accent, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>sincronizado</span>
                          <div style={{ fontSize: 18, fontWeight: 800, color: C.accent, background: C.alow, padding: "10px 18px", borderRadius: 10, border: `2px solid ${C.accent}55`, minWidth: 76, textAlign: "center" }}>
                            {form.unidade_estoque || "—"}
                          </div>
                        </div>
                        <span style={{ fontSize: 16, color: C.muted, fontWeight: 600, paddingBottom: 12 }}>é equivalente a</span>
                        {/* Número */}
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                          <span style={{ fontSize: 13, color: C.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>quantidade</span>
                          <input
                            type="number"
                            step="0.001"
                            min="0"
                            value={form.fator_consumo_estoque}
                            onChange={e => setField("fator_consumo_estoque", e.target.value)}
                            placeholder="0"
                            style={{ width: 96, padding: "10px 12px", borderRadius: 10, border: `2px solid ${form.fator_consumo_estoque ? C.green + "88" : C.border}`, background: C.surface, color: C.text, fontSize: 16, fontWeight: 700, fontFamily: "inherit", outline: "none", textAlign: "center" }}
                          />
                        </div>
                        {/* Direito: badge da unidade escolhida */}
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                          <span style={{ fontSize: 13, color: form.unidade_consumo ? C.green : C.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>
                            {form.unidade_consumo ? "selecionado" : "selecione"}
                          </span>
                          <div style={{ fontSize: 18, fontWeight: 800, color: form.unidade_consumo ? C.green : C.muted, background: form.unidade_consumo ? `${C.green}15` : C.surface, padding: "10px 18px", borderRadius: 10, border: `2px solid ${form.unidade_consumo ? C.green + "55" : C.border}`, minWidth: 76, textAlign: "center" }}>
                            {form.unidade_consumo || "—"}
                          </div>
                        </div>
                      </div>
                    </div>
                    {/* Grid de seleção */}
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 12 }}>
                      {SUGESTOES_ESTOQUE.map(u => (
                        <button key={u} onClick={() => setField("unidade_consumo", u)} style={{ padding: "6px 14px", borderRadius: 8, border: `2px solid ${form.unidade_consumo === u ? C.green : C.border}`, background: form.unidade_consumo === u ? `${C.green}18` : C.surface, color: form.unidade_consumo === u ? C.green : C.muted, cursor: "pointer", fontSize: 16, fontWeight: 700, fontFamily: "inherit", transition: "all 0.12s" }}>
                          {u}
                        </button>
                      ))}
                    </div>
                    {/* Confirmação */}
                    {form.unidade_estoque && fcFator > 0 && form.unidade_consumo && (
                      <div style={{ fontSize: 18, color: C.green, padding: "6px 10px", background: `${C.green}10`, borderRadius: 8, border: `1px solid ${C.green}33`, marginTop: 12 }}>
                        ✓ 1 {form.unidade_estoque} = {fmtQtd(fcFator)} {form.unidade_consumo} · ex: 10 {form.unidade_estoque} = {fmtQtd(10 * fcFator)} {form.unidade_consumo}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div style={{ borderTop: `1px solid ${C.border}` }} />

              {/* Bloco 3: Unidades de compra (múltiplas) */}
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <Label>Unidades de compra</Label>
                  <ToggleBtn
                    on={compraDiferente}
                    onToggle={() => {
                      if (compraDiferente) {
                        setCompraDiferente(false);
                        setForm(f => ({ ...f, unidades_compra: [] }));
                      } else {
                        setCompraDiferente(true);
                        setForm(f => ({ ...f, unidades_compra: f.unidades_compra.length ? f.unidades_compra : [{ ...EMPTY_UC, unidade: "Fornecedor 1" }] }));
                      }
                    }}
                    label={compraDiferente ? `${form.unidades_compra.length} configurada${form.unidades_compra.length !== 1 ? "s" : ""}` : "Igual ao estoque"}
                  />
                </div>

                {!compraDiferente ? (
                  <div style={{ fontSize: 16, color: C.muted, padding: "8px 12px", background: C.card, borderRadius: 8, border: `1px solid ${C.border}` }}>
                    Comprado em: <strong style={{ color: C.text }}>{ue}</strong>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {form.unidades_compra.length === 0 && (
                      <div style={{ fontSize: 16, color: C.muted, textAlign: "center", padding: "14px 0", border: `1.5px dashed ${C.border}`, borderRadius: 10 }}>
                        Nenhuma unidade adicionada
                      </div>
                    )}

                    {form.unidades_compra.map((u, idx) => {
                      const fp = parseFloat(u.fator) || 0;
                      return (
                        <div key={idx} style={{ background: C.card, borderRadius: 12, border: `1.5px solid ${C.blue}33`, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
                          {/* Cabeçalho do card */}
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                            {editingUC === idx ? (
                              <input
                                autoFocus
                                value={u.unidade}
                                onChange={e => setUC(idx, "unidade", e.target.value)}
                                onBlur={() => setEditingUC(null)}
                                onKeyDown={e => e.key === "Enter" && setEditingUC(null)}
                                placeholder="fornecedor"
                                style={{ flex: 1, padding: "6px 10px", borderRadius: 8, border: `1.5px solid ${C.blue}66`, background: C.surface, color: C.text, fontSize: 16, fontWeight: 700, fontFamily: "inherit", outline: "none" }}
                              />
                            ) : (
                              <span style={{ flex: 1, fontSize: 16, fontWeight: 700, color: u.unidade ? C.text : C.muted }}>
                                {u.unidade ? u.unidade.toUpperCase() : "FORNECEDOR"}
                              </span>
                            )}
                            <button
                              onClick={() => setEditingUC(editingUC === idx ? null : idx)}
                              title="Editar nome"
                              style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 8, cursor: "pointer", color: editingUC === idx ? C.blue : C.muted, padding: "4px 7px", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
                            >
                              <LuPencil size={12} />
                            </button>
                            <button
                              onClick={() => removeUC(idx)}
                              style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 8, cursor: "pointer", color: C.muted, padding: "4px 7px", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
                            >
                              <LuXIcon size={13} />
                            </button>
                          </div>

                          {/* Equação visual — igual ao bloco de consumo */}
                          <div style={{ overflowX: "auto", paddingBottom: 4 }}>
                            <div style={{ display: "flex", alignItems: "flex-end", gap: 10, minWidth: "max-content" }}>
                              {/* Esquerdo: sincronizado com unidade_estoque */}
                              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                                <span style={{ fontSize: 13, color: C.blue, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>sincronizado</span>
                                <div style={{ fontSize: 18, fontWeight: 800, color: C.blue, background: `${C.blue}15`, padding: "10px 18px", borderRadius: 10, border: `2px solid ${C.blue}55`, minWidth: 76, textAlign: "center" }}>
                                  {ue || "—"}
                                </div>
                              </div>
                              <span style={{ fontSize: 16, color: C.muted, fontWeight: 600, paddingBottom: 12 }}>é equivalente a</span>
                              {/* Número */}
                              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                                <span style={{ fontSize: 13, color: C.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>quantidade</span>
                                <input
                                  type="number"
                                  step="0.001"
                                  min="0"
                                  value={u.fator}
                                  onChange={e => setUC(idx, "fator", e.target.value)}
                                  placeholder="0"
                                  style={{ width: 96, padding: "10px 12px", borderRadius: 10, border: `2px solid ${u.fator ? C.blue + "88" : C.border}`, background: C.surface, color: C.text, fontSize: 16, fontWeight: 700, fontFamily: "inherit", outline: "none", textAlign: "center" }}
                                />
                              </div>
                              {/* Direito: badge da unidade escolhida no grid */}
                              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                                <span style={{ fontSize: 13, color: u.unidade_destino ? C.blue : C.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>
                                  {u.unidade_destino ? "selecionado" : "selecione"}
                                </span>
                                <div style={{ fontSize: 18, fontWeight: 800, color: u.unidade_destino ? C.blue : C.muted, background: u.unidade_destino ? `${C.blue}15` : C.surface, padding: "10px 18px", borderRadius: 10, border: `2px solid ${u.unidade_destino ? C.blue + "55" : C.border}`, minWidth: 76, textAlign: "center" }}>
                                  {u.unidade_destino || "—"}
                                </div>
                              </div>
                            </div>
                          </div>
                          {/* Grid de seleção da unidade destino */}
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            {SUGESTOES_ESTOQUE.map(s => (
                              <button key={s} onClick={() => setUC(idx, "unidade_destino", s)} style={{ padding: "6px 14px", borderRadius: 8, border: `2px solid ${u.unidade_destino === s ? C.blue : C.border}`, background: u.unidade_destino === s ? `${C.blue}18` : C.surface, color: u.unidade_destino === s ? C.blue : C.muted, cursor: "pointer", fontSize: 16, fontWeight: 700, fontFamily: "inherit", transition: "all 0.12s" }}>
                                {s}
                              </button>
                            ))}
                          </div>
                          {/* Confirmação / preview */}
                          {u.unidade && fp > 0 && u.unidade_destino && (
                            <div style={{ fontSize: 18, color: C.blue, padding: "6px 10px", background: `${C.blue}10`, borderRadius: 8, border: `1px solid ${C.blue}33` }}>
                              ✓ 1 {u.unidade} = {fmtQtd(fp)} {u.unidade_destino} · entrada de 1 {u.unidade} → +{fmtQtd(fp)} {u.unidade_destino} ao estoque
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* Botão adicionar */}
                    <button
                      onClick={addUnidadeCompra}
                      style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "10px 0", borderRadius: 10, border: `1.5px dashed ${C.accent}55`, background: `${C.accent}07`, color: C.accent, cursor: "pointer", fontWeight: 700, fontSize: 16, fontFamily: "inherit", width: "100%" }}
                    >
                      <LuPlus size={14} /> Adicionar unidade de compra
                    </button>
                  </div>
                )}
              </div>

              {/* Resumo final */}
              {form.unidade_estoque && (consumoDiferente || (compraDiferente && form.unidades_compra.some(u => u.unidade && u.fator))) && (
                <div style={{ background: C.card, borderRadius: 10, border: `1px solid ${C.border}`, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 2 }}>Resumo das conversões</div>
                  {compraDiferente && form.unidades_compra.filter(u => u.unidade && u.fator).map((u, idx) => (
                    <div key={idx} style={{ fontSize: 18, display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: C.muted }}>Compra ({u.unidade}):</span>
                      <span>1 {u.unidade} → <strong style={{ color: C.blue }}>{fmtQtd(parseFloat(u.fator))} {ue}</strong></span>
                    </div>
                  ))}
                  {consumoDiferente && form.unidade_consumo && (
                    <div style={{ fontSize: 18, display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: C.muted }}>Consumo:</span>
                      <span>1 {ue} → <strong style={{ color: C.green }}>{fcFator || "?"} {uc}</strong></span>
                    </div>
                  )}
                  <div style={{ fontSize: 18, display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: C.muted }}>Estoque:</span>
                    <span style={{ color: C.muted }}>referência → <strong style={{ color: C.text }}>{ue}</strong></span>
                  </div>
                </div>
              )}
            </div>

            {/* Erro */}
            {erro && (
              <div style={{ padding: "10px 14px", borderRadius: 8, background: `${C.red}15`, border: `1px solid ${C.red}44`, color: C.red, fontSize: sz.fontSm + 1, fontWeight: 600 }}>
                ⚠️ {erro}
              </div>
            )}

            {/* Botões */}
            <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
              <button onClick={fecharModal} style={{ flex: 1, padding: 13, borderRadius: 10, border: `1px solid ${C.border}`, background: "none", color: C.muted, cursor: "pointer", fontWeight: 600, fontSize: sz.fontBase }}>Cancelar</button>
              <button onClick={salvar} disabled={salvando} style={{ flex: 2, padding: 13, borderRadius: 10, border: "none", background: salvando ? C.faint : C.accent, color: "#fff", cursor: salvando ? "not-allowed" : "pointer", fontWeight: 700, fontSize: sz.fontBase }}>
                {salvando ? "Salvando..." : modal === "novo" ? "Cadastrar Produto" : "Salvar Alterações"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Gerenciar Categorias */}
      {showCatModal && createPortal(
        <div onClick={e => { if (e.target === e.currentTarget) { setShowCatModal(false); setCatEditando(null); setCatNova(""); } }} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9000, padding: 24, fontFamily: "'Inter',system-ui,sans-serif" }}>
          <div style={{ background: C.card, borderRadius: 20, padding: 28, width: "100%", maxWidth: 480, border: `1px solid ${C.border}`, boxShadow: "0 24px 64px rgba(0,0,0,0.5)", color: C.text, display: "flex", flexDirection: "column", gap: 20, maxHeight: "85vh" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 18, display: "flex", alignItems: "center", gap: 8 }}><LuTag size={18} color={C.accent} /> Categorias</div>
                <div style={{ fontSize: 16, color: C.muted, marginTop: 2 }}>{categorias.length} categoria{categorias.length !== 1 ? "s" : ""}</div>
              </div>
              <button onClick={() => { setShowCatModal(false); setCatEditando(null); setCatNova(""); }} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", lineHeight: 0, padding: 4 }}><LuXIcon size={20} /></button>
            </div>
            <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6, minHeight: 0 }}>
              {categorias.length === 0 && <div style={{ color: C.muted, fontSize: 17, textAlign: "center", padding: 24 }}>Nenhuma categoria ainda.</div>}
              {categorias.map(cat => {
                const qtdProdutos = products.filter(p => p.category === cat).length;
                const emEdicao    = catEditando?.name === cat;
                const podeExcluir = qtdProdutos === 0;
                return (
                  <div key={cat} style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", borderRadius: 12, background: emEdicao ? C.alow : C.surface, border: `1px solid ${emEdicao ? C.accent + "66" : C.border}`, transition: "all 0.15s" }}>
                    {emEdicao ? (
                      <>
                        <input autoFocus value={catEditando.input} onChange={e => setCatEditando(v => ({ ...v, input: e.target.value }))} onKeyDown={e => { if (e.key === "Enter") renomearCategoria(); if (e.key === "Escape") setCatEditando(null); }} style={{ flex: 1, padding: "6px 10px", borderRadius: 8, border: `1.5px solid ${C.accent}`, background: C.card, color: C.text, fontSize: 17, fontWeight: 600, fontFamily: "inherit", outline: "none" }} />
                        <button onClick={renomearCategoria} disabled={catOpLoading} style={{ background: C.accent, border: "none", borderRadius: 8, color: "#fff", cursor: "pointer", padding: "6px 10px", lineHeight: 0 }}><LuCheck size={15} /></button>
                        <button onClick={() => setCatEditando(null)} style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 8, color: C.muted, cursor: "pointer", padding: "6px 10px", lineHeight: 0 }}><LuXIcon size={15} /></button>
                      </>
                    ) : (
                      <>
                        <span style={{ flex: 1, fontWeight: 700, fontSize: 17 }}>{cat}</span>
                        <span style={{ fontSize: 14, fontWeight: 700, padding: "2px 9px", borderRadius: 10, background: C.card, color: C.muted, border: `1px solid ${C.border}` }}>{qtdProdutos} {qtdProdutos === 1 ? "produto" : "produtos"}</span>
                        <button onClick={() => setCatEditando({ name: cat, input: cat })} style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 8, color: C.muted, cursor: "pointer", padding: "6px 9px", lineHeight: 0 }}><LuPencil size={14} /></button>
                        <button onClick={() => excluirCategoria(cat)} disabled={!podeExcluir || catOpLoading} style={{ background: "none", border: `1px solid ${podeExcluir ? C.red + "55" : C.border}`, borderRadius: 8, color: podeExcluir ? C.red : C.border, cursor: podeExcluir ? "pointer" : "not-allowed", padding: "6px 9px", lineHeight: 0, opacity: podeExcluir ? 1 : 0.4 }}><LuTrash2 size={14} /></button>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
            <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 18 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Nova Categoria</div>
              <div style={{ display: "flex", gap: 8 }}>
                <input value={catNova} onChange={e => setCatNova(e.target.value)} onKeyDown={e => e.key === "Enter" && criarCategoria()} placeholder="Ex: Bebidas, Lanches..." maxLength={40} style={{ flex: 1, padding: "11px 14px", borderRadius: 10, border: `1.5px solid ${catNova.trim() ? C.accent : C.border}`, background: C.surface, color: C.text, fontSize: 17, fontFamily: "inherit", outline: "none" }} />
                <button onClick={criarCategoria} disabled={!catNova.trim() || catOpLoading || categorias.includes(catNova.trim())} style={{ padding: "11px 20px", borderRadius: 10, border: "none", background: catNova.trim() && !categorias.includes(catNova.trim()) ? C.accent : C.surface, color: catNova.trim() && !categorias.includes(catNova.trim()) ? "#fff" : C.muted, fontWeight: 700, fontSize: 17, cursor: catNova.trim() && !categorias.includes(catNova.trim()) ? "pointer" : "not-allowed", fontFamily: "inherit" }}>
                  {catOpLoading ? "..." : "Adicionar"}
                </button>
              </div>
              {catNova.trim() && categorias.includes(catNova.trim()) && <div style={{ fontSize: 18, color: C.muted, marginTop: 6 }}>Esta categoria já existe.</div>}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modal Confirmar Exclusão */}
      {deleteId && createPortal(
        (() => {
          const p = products.find(x => x.id === deleteId);
          return (
            <div onClick={e => { if (e.target === e.currentTarget) setDeleteId(null); }} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9000, padding: 24, fontFamily: "'Inter',system-ui,sans-serif" }}>
              <div style={{ background: C.card, borderRadius: 20, padding: 28, width: "100%", maxWidth: 400, border: `1px solid ${C.border}`, boxShadow: "0 24px 64px rgba(0,0,0,0.5)", color: C.text }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
                  <div style={{ width: 48, height: 48, borderRadius: 14, flexShrink: 0, background: `${C.red}18`, border: `1.5px solid ${C.red}44`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <LuTriangleAlert size={22} color={C.red} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 900, fontSize: 17 }}>Excluir produto?</div>
                    <div style={{ fontSize: 16, color: C.muted, marginTop: 2 }}>{p?.emoji} <strong style={{ color: C.text }}>{p?.name}</strong></div>
                  </div>
                </div>
                <div style={{ padding: "12px 16px", borderRadius: 10, marginBottom: 20, background: `${C.red}0d`, border: `1px solid ${C.red}33`, fontSize: 16, color: C.muted, lineHeight: 1.5 }}>
                  Esta ação <strong style={{ color: C.red }}>não pode ser desfeita</strong>. O produto será removido permanentemente.
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <button onClick={() => setDeleteId(null)} style={{ flex: 1, padding: "13px 0", borderRadius: 12, border: `1px solid ${C.border}`, background: "none", color: C.muted, cursor: "pointer", fontWeight: 600, fontSize: 17 }}>Cancelar</button>
                  <button onClick={confirmarDelete} disabled={deletando} style={{ flex: 1, padding: "13px 0", borderRadius: 12, border: "none", background: deletando ? C.faint : C.red, color: "#fff", cursor: deletando ? "not-allowed" : "pointer", fontWeight: 800, fontSize: 18 }}>{deletando ? "Excluindo..." : "Sim, excluir"}</button>
                </div>
              </div>
            </div>
          );
        })(),
        document.body
      )}
    </div>
  );
}

function Label({ children }) {
  return <div style={{ fontSize: 14, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 1.2 }}>{children}</div>;
}

function Input({ value, onChange, placeholder, maxLength, style }) {
  return (
    <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} maxLength={maxLength} style={{ display: "block", width: "100%", marginTop: 8, padding: "11px 14px", borderRadius: 10, border: `1px solid ${C.border}`, background: C.surface, color: C.text, fontSize: 18, boxSizing: "border-box", fontFamily: "inherit", outline: "none", ...style }} />
  );
}

function ToggleBtn({ on, onToggle, label }) {
  return (
    <button onClick={onToggle} style={{ display: "flex", alignItems: "center", gap: 7, background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "inherit" }}>
      <span style={{ fontSize: 14, color: on ? C.accent : C.muted, fontWeight: 600 }}>{label}</span>
      <div style={{ width: 36, height: 20, borderRadius: 10, background: on ? C.accent : C.faint, padding: 2, display: "flex", alignItems: "center", justifyContent: on ? "flex-end" : "flex-start", transition: "all 0.2s", flexShrink: 0 }}>
        <div style={{ width: 16, height: 16, borderRadius: "50%", background: "#fff" }} />
      </div>
    </button>
  );
}
