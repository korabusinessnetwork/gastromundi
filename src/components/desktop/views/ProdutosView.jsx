import { useState, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import { useApp } from "@/context/AppContext";
import { supabase } from "@/lib/supabase";
import { logAction } from "@/lib/logger";
import { useResponsive } from "@/utils/hooks";
import { getSizes } from "@/constants/sizes";
import C from "@/constants/colors";
import { LuTriangleAlert, LuTag, LuPencil, LuTrash2, LuCheck, LuX as LuXIcon } from "react-icons/lu";

const EMOJIS = ["🍺","🥤","💧","🍹","🍸","🥂","🍷","🍵","☕","🍔","🍟","🍕","🌭","🥪","🥗","🍝","🍣","🍜","🌮","🥩","🍗","🍖","🥚","🧀","🍰","🍦","🍫","🍿","🧂","🍱"];

const EMPTY_FORM = { name: "", price: "", category: "", emoji: "" };

export default function ProdutosView() {
  const { products, addProduct, updateProduct, removeProduct, currentUser } = useApp();
  const { width } = useResponsive();
  const sz = getSizes(width);

  const [modal, setModal]       = useState(null); // null | "novo" | "editar"
  const [form, setForm]         = useState(EMPTY_FORM);
  const [editId, setEditId]     = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro]         = useState("");
  const [deleteId, setDeleteId] = useState(null);
  const [deletando, setDeletando] = useState(false);
  const [catFiltro, setCatFiltro] = useState("Todos");
  const [busca, setBusca]       = useState("");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  // ── Gerenciamento de categorias ──────────────────────────────
  const [showCatModal,  setShowCatModal]  = useState(false);
  const [catExtra,      setCatExtra]      = useState([]);   // categorias pré-criadas (sem produtos)
  const [catEditando,   setCatEditando]   = useState(null); // { name, input }
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
    const novoNome = catEditando.input.trim();
    const nomeAntigo = catEditando.name;
    if (!novoNome || novoNome === nomeAntigo) { setCatEditando(null); return; }
    setCatOpLoading(true);
    const novosExtras = catExtra.map(c => c === nomeAntigo ? novoNome : c);
    await salvarCatExtra(novosExtras);
    const afetados = products.filter(p => p.category === nomeAntigo);
    await Promise.all(afetados.map(p => updateProduct(p.id, { category: novoNome })));
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

  const abrirNovo = () => {
    setForm(EMPTY_FORM);
    setErro("");
    setEditId(null);
    setModal("novo");
  };

  const abrirEditar = (p) => {
    setForm({ name: p.name, price: String(p.price), category: p.category ?? "", emoji: p.emoji ?? "" });
    setErro("");
    setEditId(p.id);
    setModal("editar");
  };

  const fecharModal = () => {
    setModal(null);
    setShowEmojiPicker(false);
    setErro("");
  };

  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const validar = () => {
    if (!form.name.trim())        return "Informe o nome do produto.";
    if (!form.price)              return "Informe o preço.";
    const p = parseFloat(String(form.price).replace(",", "."));
    if (isNaN(p) || p <= 0)      return "Preço deve ser maior que zero.";
    if (!form.category.trim())    return "Informe a categoria.";
    return null;
  };

  const salvar = async () => {
    const err = validar();
    if (err) { setErro(err); return; }
    setSalvando(true);
    const payload = {
      name:     form.name.trim(),
      price:    parseFloat(String(form.price).replace(",", ".")),
      category: form.category.trim(),
      emoji:    form.emoji || null,
    };
    if (modal === "novo") {
      await addProduct({ id: crypto.randomUUID(), ...payload });
      logAction(currentUser?.username, "produto:criar", { msg: `Produto cadastrado: ${payload.name} · R$ ${payload.price.toFixed(2)} · ${payload.category}`, name: currentUser?.name, role: currentUser?.role, produto: payload.name, preco: payload.price, categoria: payload.category });
    } else {
      await updateProduct(editId, payload);
      logAction(currentUser?.username, "produto:editar", { msg: `Produto editado: ${payload.name} · R$ ${payload.price.toFixed(2)} · ${payload.category}`, name: currentUser?.name, role: currentUser?.role, produto: payload.name, preco: payload.price, categoria: payload.category });
    }
    setSalvando(false);
    fecharModal();
  };

  const confirmarDelete = async () => {
    if (!deleteId || deletando) return;
    setDeletando(true);
    const p = products.find(x => x.id === deleteId);
    await removeProduct(deleteId);
    logAction(currentUser?.username, "produto:remover", { msg: `Produto removido: ${p?.name ?? deleteId}`, name: currentUser?.name, role: currentUser?.role, produto: p?.name ?? deleteId });
    setDeletando(false);
    setDeleteId(null);
  };

  const isAdmin = currentUser?.role === "admin" || currentUser?.role === "gerente";

  return (
    <div style={{
      flex: 1, display: "flex", flexDirection: "column",
      background: C.bg, overflow: "hidden",
    }}>

      {/* ── Header ── */}
      <div style={{
        padding: `${sz.pad - 4}px ${sz.pad}px`,
        borderBottom: `1px solid ${C.border}`,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        flexShrink: 0, gap: 16,
      }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: sz.fontLg }}>Produtos</div>
          <div style={{ color: C.muted, fontSize: sz.fontSm, marginTop: 2 }}>
            {products.length} cadastrado{products.length !== 1 ? "s" : ""}
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {/* Busca */}
          <input
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar produto..."
            style={{
              padding: "9px 14px", borderRadius: 10,
              border: `1px solid ${C.border}`, background: C.surface,
              color: C.text, fontSize: sz.fontBase, outline: "none",
              fontFamily: "inherit", width: 220,
            }}
          />

          {isAdmin && (
            <>
              <button
                onClick={() => setShowCatModal(true)}
                style={{
                  padding: `9px ${sz.pad - 8}px`, borderRadius: 10,
                  border: `1px solid ${C.border}`, background: C.surface,
                  color: C.text, fontWeight: 700, fontSize: sz.fontBase,
                  cursor: "pointer", whiteSpace: "nowrap",
                  display: "flex", alignItems: "center", gap: 6,
                }}
              >
                <LuTag size={15} /> Categorias
              </button>
              <button
                onClick={abrirNovo}
                style={{
                  padding: `9px ${sz.pad - 8}px`, borderRadius: 10, border: "none",
                  background: C.accent, color: "#fff",
                  fontWeight: 700, fontSize: sz.fontBase, cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                + Novo Produto
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Filtros de categoria ── */}
      <div style={{
        display: "flex", gap: 8, padding: `12px ${sz.pad}px`,
        borderBottom: `1px solid ${C.border}`,
        overflowX: "auto", flexShrink: 0,
      }}>
        {["Todos", ...categorias].map(cat => (
          <button
            key={cat}
            onClick={() => setCatFiltro(cat)}
            style={{
              padding: "7px 18px", borderRadius: 20, border: "none",
              background: catFiltro === cat ? C.accent : C.surface,
              color: catFiltro === cat ? "#fff" : C.muted,
              cursor: "pointer", fontWeight: 600, fontSize: sz.fontBase,
              whiteSpace: "nowrap", flexShrink: 0,
              transition: "background 0.15s, color 0.15s",
            }}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* ── Tabela ── */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {produtosFiltrados.length === 0 ? (
          <div style={{
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            gap: 10, color: C.muted, padding: 60,
          }}>
            <div style={{ fontSize: 48, opacity: 0.3 }}>📦</div>
            <div style={{ fontSize: sz.fontBase + 1, fontWeight: 600 }}>
              {busca ? "Nenhum produto encontrado" : "Nenhum produto cadastrado"}
            </div>
            {isAdmin && !busca && (
              <div style={{ fontSize: sz.fontSm }}>
                Clique em "+ Novo Produto" para adicionar
              </div>
            )}
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                {["", "Nome", "Categoria", "Preço", ""].map((h, i) => (
                  <th
                    key={i}
                    style={{
                      padding: `12px ${i === 0 ? sz.pad : 16}px`,
                      textAlign: i === 3 ? "right" : i === 4 ? "right" : "left",
                      fontSize: 11, fontWeight: 700, color: C.muted,
                      textTransform: "uppercase", letterSpacing: 1,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {produtosFiltrados.map(p => (
                <tr
                  key={p.id}
                  style={{
                    borderBottom: `1px solid ${C.border}`,
                    transition: "background 0.1s",
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = C.surface}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                >
                  {/* Emoji */}
                  <td style={{ padding: `14px ${sz.pad}px 14px ${sz.pad}px`, width: 56 }}>
                    <div style={{
                      width: 44, height: 44, borderRadius: 12,
                      background: C.card, border: `1px solid ${C.border}`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 22,
                    }}>
                      {p.emoji || "📦"}
                    </div>
                  </td>

                  {/* Nome */}
                  <td style={{ padding: "14px 16px" }}>
                    <div style={{ fontWeight: 700, fontSize: sz.fontBase + 1 }}>{p.name}</div>
                  </td>

                  {/* Categoria */}
                  <td style={{ padding: "14px 16px" }}>
                    <span style={{
                      fontSize: sz.fontSm + 1, fontWeight: 600,
                      background: C.surface, padding: "4px 12px",
                      borderRadius: 20, color: C.muted,
                      border: `1px solid ${C.border}`,
                    }}>
                      {p.category}
                    </span>
                  </td>

                  {/* Preço */}
                  <td style={{ padding: "14px 16px", textAlign: "right" }}>
                    <span style={{ fontWeight: 800, fontSize: sz.fontBase + 2, color: C.green }}>
                      R$ {Number(p.price).toFixed(2)}
                    </span>
                  </td>

                  {/* Ações */}
                  <td style={{ padding: "14px 24px 14px 16px", textAlign: "right", whiteSpace: "nowrap" }}>
                    {isAdmin && (
                      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                        <button
                          onClick={() => abrirEditar(p)}
                          style={{
                            padding: "7px 16px", borderRadius: 8,
                            border: `1px solid ${C.border}`, background: "none",
                            color: C.text, cursor: "pointer",
                            fontWeight: 600, fontSize: sz.fontSm + 1,
                          }}
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => setDeleteId(p.id)}
                          style={{
                            padding: "7px 16px", borderRadius: 8,
                            border: `1px solid ${C.red}44`,
                            background: `${C.red}0f`,
                            color: C.red, cursor: "pointer",
                            fontWeight: 600, fontSize: sz.fontSm + 1,
                          }}
                        >
                          Excluir
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Modal Novo / Editar ── */}
      {modal && (
        <div
          onClick={e => { if (e.target === e.currentTarget) fecharModal(); }}
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 300,
          }}
        >
          <div style={{
            background: C.card, borderRadius: 20, padding: sz.pad + 4,
            width: 480, border: `1px solid ${C.border}`,
            display: "flex", flexDirection: "column", gap: 20,
          }}>
            <div style={{ fontWeight: 800, fontSize: sz.fontLg }}>
              {modal === "novo" ? "Novo Produto" : "Editar Produto"}
            </div>

            {/* Emoji picker */}
            <div>
              <Label>Emoji</Label>
              <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 8 }}>
                <button
                  onClick={() => setShowEmojiPicker(v => !v)}
                  style={{
                    width: 56, height: 56, borderRadius: 14,
                    border: `1.5px solid ${showEmojiPicker ? C.accent : C.border}`,
                    background: C.surface, fontSize: 28, cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >
                  {form.emoji || "📦"}
                </button>
                <span style={{ fontSize: sz.fontSm, color: C.muted }}>
                  Clique para escolher um emoji
                </span>
                {form.emoji && (
                  <button
                    onClick={() => setField("emoji", "")}
                    style={{
                      background: "none", border: "none",
                      color: C.muted, cursor: "pointer", fontSize: sz.fontSm,
                    }}
                  >
                    ✕ limpar
                  </button>
                )}
              </div>
              {showEmojiPicker && (
                <div style={{
                  marginTop: 10, padding: 12,
                  background: C.surface, borderRadius: 12,
                  border: `1px solid ${C.border}`,
                  display: "flex", flexWrap: "wrap", gap: 6,
                }}>
                  {EMOJIS.map(e => (
                    <button
                      key={e}
                      onClick={() => { setField("emoji", e); setShowEmojiPicker(false); }}
                      style={{
                        width: 38, height: 38, borderRadius: 8, border: "none",
                        background: form.emoji === e ? C.alow : "transparent",
                        cursor: "pointer", fontSize: 20,
                        outline: form.emoji === e ? `2px solid ${C.accent}` : "none",
                      }}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Nome */}
            <div>
              <Label>Nome *</Label>
              <Input
                value={form.name}
                onChange={v => setField("name", v)}
                placeholder="Ex: Cerveja 600ml"
                maxLength={60}
              />
            </div>

            {/* Categoria */}
            <div>
              <Label>Categoria *</Label>
              <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                {categorias.map(cat => (
                  <button
                    key={cat}
                    onClick={() => setField("category", cat)}
                    style={{
                      padding: "6px 14px", borderRadius: 20,
                      border: `1.5px solid ${form.category === cat ? C.accent : C.border}`,
                      background: form.category === cat ? C.alow : C.surface,
                      color: form.category === cat ? C.accent : C.muted,
                      cursor: "pointer", fontWeight: 600, fontSize: sz.fontSm + 1,
                    }}
                  >
                    {cat}
                  </button>
                ))}
              </div>
              <Input
                value={form.category}
                onChange={v => setField("category", v)}
                placeholder="Ou digite uma nova categoria"
                maxLength={40}
                style={{ marginTop: 8 }}
              />
            </div>

            {/* Preço */}
            <div>
              <Label>Preço (R$) *</Label>
              <div style={{ position: "relative", marginTop: 8 }}>
                <span style={{
                  position: "absolute", left: 14, top: "50%",
                  transform: "translateY(-50%)",
                  color: C.muted, fontSize: sz.fontBase, fontWeight: 600,
                }}>
                  R$
                </span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.price}
                  onChange={e => setField("price", e.target.value)}
                  placeholder="0,00"
                  style={{
                    width: "100%", padding: `11px 14px 11px 42px`,
                    borderRadius: 10, border: `1px solid ${C.border}`,
                    background: C.surface, color: C.text,
                    fontSize: sz.fontBase + 2, fontWeight: 700,
                    boxSizing: "border-box", fontFamily: "inherit", outline: "none",
                  }}
                />
              </div>
            </div>

            {/* Erro */}
            {erro && (
              <div style={{
                padding: "10px 14px", borderRadius: 8,
                background: `${C.red}15`, border: `1px solid ${C.red}44`,
                color: C.red, fontSize: sz.fontSm + 1, fontWeight: 600,
              }}>
                ⚠️ {erro}
              </div>
            )}

            {/* Botões */}
            <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
              <button
                onClick={fecharModal}
                style={{
                  flex: 1, padding: 13, borderRadius: 10,
                  border: `1px solid ${C.border}`, background: "none",
                  color: C.muted, cursor: "pointer", fontWeight: 600, fontSize: sz.fontBase,
                }}
              >
                Cancelar
              </button>
              <button
                onClick={salvar}
                disabled={salvando}
                style={{
                  flex: 2, padding: 13, borderRadius: 10, border: "none",
                  background: salvando ? C.faint : C.accent,
                  color: "#fff", cursor: salvando ? "not-allowed" : "pointer",
                  fontWeight: 700, fontSize: sz.fontBase,
                }}
              >
                {salvando ? "Salvando..." : modal === "novo" ? "Cadastrar Produto" : "Salvar Alterações"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Gerenciar Categorias ── */}
      {showCatModal && createPortal(
        <div
          onClick={e => { if (e.target === e.currentTarget) { setShowCatModal(false); setCatEditando(null); setCatNova(""); } }}
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 9000, padding: 24, fontFamily: "'Inter',system-ui,sans-serif",
          }}
        >
          <div style={{
            background: C.card, borderRadius: 20, padding: 28,
            width: "100%", maxWidth: 480,
            border: `1px solid ${C.border}`,
            boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
            color: C.text, display: "flex", flexDirection: "column", gap: 20,
            maxHeight: "85vh",
          }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 18, display: "flex", alignItems: "center", gap: 8 }}>
                  <LuTag size={18} color={C.accent} /> Categorias
                </div>
                <div style={{ fontSize: 13, color: C.muted, marginTop: 2 }}>
                  {categorias.length} categoria{categorias.length !== 1 ? "s" : ""} cadastrada{categorias.length !== 1 ? "s" : ""}
                </div>
              </div>
              <button
                onClick={() => { setShowCatModal(false); setCatEditando(null); setCatNova(""); }}
                style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", lineHeight: 0, padding: 4 }}
              >
                <LuXIcon size={20} />
              </button>
            </div>

            {/* Lista de categorias */}
            <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6, minHeight: 0 }}>
              {categorias.length === 0 && (
                <div style={{ color: C.muted, fontSize: 14, textAlign: "center", padding: 24 }}>
                  Nenhuma categoria ainda. Crie uma abaixo.
                </div>
              )}
              {categorias.map(cat => {
                const qtdProdutos = products.filter(p => p.category === cat).length;
                const emEdicao    = catEditando?.name === cat;
                const podeExcluir = qtdProdutos === 0;
                return (
                  <div
                    key={cat}
                    style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "11px 14px", borderRadius: 12,
                      background: emEdicao ? C.alow : C.surface,
                      border: `1px solid ${emEdicao ? C.accent + "66" : C.border}`,
                      transition: "all 0.15s",
                    }}
                  >
                    {emEdicao ? (
                      <>
                        <input
                          autoFocus
                          value={catEditando.input}
                          onChange={e => setCatEditando(v => ({ ...v, input: e.target.value }))}
                          onKeyDown={e => { if (e.key === "Enter") renomearCategoria(); if (e.key === "Escape") setCatEditando(null); }}
                          style={{
                            flex: 1, padding: "6px 10px", borderRadius: 8,
                            border: `1.5px solid ${C.accent}`,
                            background: C.card, color: C.text,
                            fontSize: 14, fontWeight: 600, fontFamily: "inherit", outline: "none",
                          }}
                        />
                        <button
                          onClick={renomearCategoria}
                          disabled={catOpLoading}
                          style={{ background: C.accent, border: "none", borderRadius: 8, color: "#fff", cursor: "pointer", padding: "6px 10px", lineHeight: 0 }}
                        >
                          <LuCheck size={15} />
                        </button>
                        <button
                          onClick={() => setCatEditando(null)}
                          style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 8, color: C.muted, cursor: "pointer", padding: "6px 10px", lineHeight: 0 }}
                        >
                          <LuXIcon size={15} />
                        </button>
                      </>
                    ) : (
                      <>
                        <span style={{ flex: 1, fontWeight: 700, fontSize: 14 }}>{cat}</span>
                        <span style={{
                          fontSize: 11, fontWeight: 700, padding: "2px 9px", borderRadius: 10,
                          background: C.card, color: C.muted, border: `1px solid ${C.border}`,
                        }}>
                          {qtdProdutos} {qtdProdutos === 1 ? "produto" : "produtos"}
                        </span>
                        <button
                          onClick={() => setCatEditando({ name: cat, input: cat })}
                          title="Renomear"
                          style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 8, color: C.muted, cursor: "pointer", padding: "6px 9px", lineHeight: 0 }}
                        >
                          <LuPencil size={14} />
                        </button>
                        <button
                          onClick={() => excluirCategoria(cat)}
                          disabled={!podeExcluir || catOpLoading}
                          title={podeExcluir ? "Excluir categoria" : `Remova os ${qtdProdutos} produto(s) antes de excluir`}
                          style={{
                            background: "none",
                            border: `1px solid ${podeExcluir ? C.red + "55" : C.border}`,
                            borderRadius: 8,
                            color: podeExcluir ? C.red : C.border,
                            cursor: podeExcluir ? "pointer" : "not-allowed",
                            padding: "6px 9px", lineHeight: 0,
                            opacity: podeExcluir ? 1 : 0.4,
                          }}
                        >
                          <LuTrash2 size={14} />
                        </button>
                      </>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Nova categoria */}
            <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 18 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>
                Nova Categoria
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  value={catNova}
                  onChange={e => setCatNova(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && criarCategoria()}
                  placeholder="Ex: Bebidas, Lanches, Sobremesas..."
                  maxLength={40}
                  style={{
                    flex: 1, padding: "11px 14px", borderRadius: 10,
                    border: `1.5px solid ${catNova.trim() ? C.accent : C.border}`,
                    background: C.surface, color: C.text,
                    fontSize: 14, fontFamily: "inherit", outline: "none",
                    transition: "border-color 0.15s",
                  }}
                />
                <button
                  onClick={criarCategoria}
                  disabled={!catNova.trim() || catOpLoading || categorias.includes(catNova.trim())}
                  style={{
                    padding: "11px 20px", borderRadius: 10, border: "none",
                    background: catNova.trim() && !categorias.includes(catNova.trim()) ? C.accent : C.surface,
                    color: catNova.trim() && !categorias.includes(catNova.trim()) ? "#fff" : C.muted,
                    fontWeight: 700, fontSize: 14, cursor: catNova.trim() && !categorias.includes(catNova.trim()) ? "pointer" : "not-allowed",
                    whiteSpace: "nowrap", fontFamily: "inherit",
                    transition: "background 0.15s",
                  }}
                >
                  {catOpLoading ? "..." : "Adicionar"}
                </button>
              </div>
              {catNova.trim() && categorias.includes(catNova.trim()) && (
                <div style={{ fontSize: 12, color: C.muted, marginTop: 6 }}>Esta categoria já existe.</div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Modal Confirmar Exclusão ── */}
      {deleteId && createPortal(
        (() => {
          const p = products.find(x => x.id === deleteId);
          return (
            <div
              onClick={e => { if (e.target === e.currentTarget) setDeleteId(null); }}
              style={{
                position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
                display: "flex", alignItems: "center", justifyContent: "center",
                zIndex: 9000, padding: 24,
                fontFamily: "'Inter',system-ui,sans-serif",
              }}
            >
              <div style={{
                background: C.card, borderRadius: 20, padding: 28,
                width: "100%", maxWidth: 400,
                border: `1px solid ${C.border}`,
                boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
                color: C.text,
              }}>
                {/* Ícone + título */}
                <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
                  <div style={{
                    width: 48, height: 48, borderRadius: 14, flexShrink: 0,
                    background: `${C.red}18`, border: `1.5px solid ${C.red}44`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <LuTriangleAlert size={22} color={C.red} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 900, fontSize: 17 }}>Excluir produto?</div>
                    <div style={{ fontSize: 13, color: C.muted, marginTop: 2 }}>
                      {p?.emoji} <strong style={{ color: C.text }}>{p?.name}</strong>
                    </div>
                  </div>
                </div>

                <div style={{
                  padding: "12px 16px", borderRadius: 10, marginBottom: 20,
                  background: `${C.red}0d`, border: `1px solid ${C.red}33`,
                  fontSize: 13, color: C.muted, lineHeight: 1.5,
                }}>
                  Esta ação <strong style={{ color: C.red }}>não pode ser desfeita</strong>. O produto será removido permanentemente do cardápio.
                </div>

                <div style={{ display: "flex", gap: 10 }}>
                  <button
                    onClick={() => setDeleteId(null)}
                    style={{
                      flex: 1, padding: "13px 0", borderRadius: 12,
                      border: `1px solid ${C.border}`, background: "none",
                      color: C.muted, cursor: "pointer", fontWeight: 600, fontSize: 14,
                    }}
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={confirmarDelete}
                    disabled={deletando}
                    style={{
                      flex: 1, padding: "13px 0", borderRadius: 12, border: "none",
                      background: deletando ? C.faint : C.red,
                      color: "#fff", cursor: deletando ? "not-allowed" : "pointer",
                      fontWeight: 800, fontSize: 15,
                    }}
                  >
                    {deletando ? "Excluindo..." : "Sim, excluir"}
                  </button>
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
  return (
    <div style={{
      fontSize: 11, fontWeight: 700, color: C.muted,
      textTransform: "uppercase", letterSpacing: 1.2,
    }}>
      {children}
    </div>
  );
}

function Input({ value, onChange, placeholder, maxLength, style }) {
  return (
    <input
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      maxLength={maxLength}
      style={{
        display: "block", width: "100%", marginTop: 8,
        padding: "11px 14px", borderRadius: 10,
        border: `1px solid ${C.border}`,
        background: C.surface, color: C.text,
        fontSize: 15, boxSizing: "border-box",
        fontFamily: "inherit", outline: "none",
        ...style,
      }}
    />
  );
}
