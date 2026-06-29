import { useState, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabase";
import { useApp } from "@/context/AppContext";
import C from "@/constants/colors";
import { useResponsive } from "@/utils/hooks";
import { getSizes } from "@/constants/sizes";
import {
  LuPlus, LuPencil, LuTrash2, LuX, LuClipboardList,
  LuTruck, LuShoppingCart, LuCheck,
  LuCalendar, LuArrowLeft, LuChevronRight, LuChevronDown, LuSearch,
  LuLink, LuPackage, LuPercent, LuFileText, LuSlidersHorizontal,
} from "react-icons/lu";
import NotasFiscaisTab from "@/components/desktop/views/NotasFiscaisTab";
import {
  consumoParaEstoque, labelEstoque, labelConsumo,
  temConversaoConsumo, fmtQtd,
} from "@/utils/conversaoUnidades";

// ── Helpers ───────────────────────────────────────────────────────

const uid   = () => Date.now().toString(36) + Math.random().toString(36).slice(2);
const fmtR  = (v) => "R$ " + Number(v ?? 0).toFixed(2);
const fmtDt = (d) => d ? new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "—";


const STATUS_COMPRA = {
  pendente:  { label: "Pendente",  color: "#f59e0b" },
  pago:      { label: "Pago",      color: C.green   },
  cancelado: { label: "Cancelado", color: C.muted   },
};

// ── Shared UI ─────────────────────────────────────────────────────

function Field({ label, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 1 }}>
        {label}
      </div>
      {children}
    </div>
  );
}

function Inp({ value, onChange, placeholder, type = "text", disabled }) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      style={{
        width: "100%", padding: "10px 12px", borderRadius: 10,
        border: `1.5px solid ${C.border}`, background: disabled ? C.faint : C.surface,
        color: C.text, fontSize: 17, fontFamily: "inherit",
        outline: "none", boxSizing: "border-box",
        opacity: disabled ? 0.6 : 1,
      }}
    />
  );
}

function Txta({ value, onChange, placeholder, rows = 3 }) {
  return (
    <textarea
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      style={{
        width: "100%", padding: "10px 12px", borderRadius: 10,
        border: `1.5px solid ${C.border}`, background: C.surface,
        color: C.text, fontSize: 17, fontFamily: "inherit",
        outline: "none", resize: "vertical", boxSizing: "border-box", lineHeight: 1.5,
      }}
    />
  );
}

function ModalBase({ title, onClose, onSave, saveLabel = "Salvar", saving, width = 540, children }) {
  return createPortal(
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 500, fontFamily: "'Inter',system-ui,sans-serif",
        padding: "16px 12px",
      }}
    >
      <div style={{
        background: C.card, borderRadius: 20, padding: 28,
        maxWidth: width, width: "100%", border: `1px solid ${C.border}`,
        display: "flex", flexDirection: "column", gap: 18,
        maxHeight: "94vh", overflowY: "auto", color: C.text,
        boxSizing: "border-box",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 17 }}>{title}</div>
          <button
            onClick={onClose}
            style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 8, padding: "5px 7px", cursor: "pointer", color: C.muted, display: "flex" }}
          >
            <LuX size={16} />
          </button>
        </div>
        {children}
        <div style={{ display: "flex", gap: 10, flexShrink: 0 }}>
          <button onClick={onClose} style={{ flex: 1, padding: 12, borderRadius: 10, border: `1px solid ${C.border}`, background: "none", color: C.muted, cursor: "pointer", fontWeight: 600, fontSize: 17, fontFamily: "inherit" }}>
            Cancelar
          </button>
          <button
            onClick={onSave}
            disabled={saving}
            style={{
              flex: 2, padding: 12, borderRadius: 10, border: "none",
              background: saving ? C.faint : C.accent,
              color: "#fff", cursor: saving ? "not-allowed" : "pointer",
              fontWeight: 700, fontSize: 17, fontFamily: "inherit",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
            }}
          >
            {saving ? "Salvando..." : <><LuCheck size={14} />{saveLabel}</>}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function DeleteConfirm({ msg, onCancel, onConfirm }) {
  return createPortal(
    <div onClick={e => { if (e.target === e.currentTarget) onCancel(); }} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 600, fontFamily: "'Inter',system-ui,sans-serif" }}>
      <div style={{ background: C.card, borderRadius: 16, padding: 28, width: 380, border: `1px solid ${C.border}`, color: C.text, display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ fontWeight: 800, fontSize: 17 }}>Confirmar exclusão</div>
        <div style={{ color: C.muted, fontSize: 17 }} dangerouslySetInnerHTML={{ __html: msg }} />
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onCancel} style={{ flex: 1, padding: 11, borderRadius: 10, border: `1px solid ${C.border}`, background: "none", color: C.muted, cursor: "pointer", fontWeight: 600, fontFamily: "inherit" }}>Cancelar</button>
          <button onClick={onConfirm} style={{ flex: 1, padding: 11, borderRadius: 10, border: "none", background: C.red, color: "#fff", cursor: "pointer", fontWeight: 700, fontFamily: "inherit" }}>Excluir</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function CardBtn({ onClick, children }) {
  return (
    <button onClick={onClick} style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 8, padding: "5px 10px", cursor: "pointer", color: C.muted, display: "flex", alignItems: "center", gap: 4, fontSize: 18, fontWeight: 600, fontFamily: "inherit" }}>
      {children}
    </button>
  );
}

function EmptyMsg({ icon: Icon, msg }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, padding: 60, color: C.muted }}>
      <div style={{ opacity: 0.3 }}><Icon size={44} /></div>
      <div style={{ fontSize: 17, fontWeight: 600 }}>{msg}</div>
    </div>
  );
}

function AddBtn({ onClick, label }) {
  return (
    <button onClick={onClick} style={{ padding: "9px 18px", borderRadius: 10, border: "none", background: C.accent, color: "#fff", fontWeight: 700, fontSize: 17, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontFamily: "inherit" }}>
      <LuPlus size={15} /> {label}
    </button>
  );
}

// ── Aba: Fichas Técnicas ──────────────────────────────────────────

const FICHA_VAZIA = { id: "", produtoId: null, nome: "", categoria: "", rendimento: "1", ingredientes: [], preparo: "" };
const ING_VAZIO   = { produtoId: null, nome: "", emoji: "", qtd: "", unidade: "g", custoUnit: "" };

function FichasTecnicasTab({ sz, fichas, products, estoque, onSave, onDelete }) {
  const { width: vw } = useResponsive();
  const isNarrow = vw < 640;
  const [form,        setForm]        = useState(null);
  const [saving,      setSaving]      = useState(false);
  const [deleteId,    setDeleteId]    = useState(null);
  const [busca,          setBusca]          = useState("");
  const [buscaPrato,     setBuscaPrato]     = useState("");
  const [showPratoDD,    setShowPratoDD]    = useState(false);
  const [catFiltroIng,   setCatFiltroIng]   = useState("Todos");
  const [showFiltroIng,  setShowFiltroIng]  = useState(false);
  const buscaRef     = useRef(null);
  const buscaPratoRef = useRef(null);

  const abrirNova   = () => { setForm({ ...FICHA_VAZIA, id: uid() }); setBusca(""); setBuscaPrato(""); setShowPratoDD(false); setCatFiltroIng("Todos"); setShowFiltroIng(false); };
  const abrirEditar = (f) => { setForm({ ...f }); setBusca(""); setBuscaPrato(""); setShowPratoDD(false); setCatFiltroIng("Todos"); setShowFiltroIng(false); };
  const fechar      = () => { setForm(null); setBusca(""); setBuscaPrato(""); setShowPratoDD(false); setCatFiltroIng("Todos"); setShowFiltroIng(false); };
  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // Atualiza um campo de um ingrediente
  const setIng = (i, k, v) => setForm(f => ({
    ...f,
    ingredientes: f.ingredientes.map((ing, idx) => idx === i ? { ...ing, [k]: v } : ing),
  }));

  // Adiciona produto do estoque como ingrediente
  const adicionarDoProduto = (produto) => {
    const unidadePadrao = produto.unidade_consumo ?? produto.unidade_estoque ?? produto.unidade ?? "un";
    setForm(f => ({
      ...f,
      ingredientes: [
        ...f.ingredientes,
        { ...ING_VAZIO, produtoId: produto.id, nome: produto.name, emoji: produto.emoji || "", unidade: unidadePadrao },
      ],
    }));
    if (buscaRef.current) buscaRef.current.focus();
  };

  // Adicionar ingrediente manual
  const adicionarManual = () => setForm(f => ({
    ...f,
    ingredientes: [...f.ingredientes, { ...ING_VAZIO }],
  }));

  const removeIng = (i) => setForm(f => ({ ...f, ingredientes: f.ingredientes.filter((_, idx) => idx !== i) }));

  // Produtos filtrados pela busca (excluindo os já adicionados por produtoId)
  const adicionados = useMemo(() => new Set((form?.ingredientes ?? []).map(i => i.produtoId).filter(Boolean)), [form?.ingredientes]);

  const categoriasIng = useMemo(() => {
    const cats = [...new Set(products.filter(p => p.active !== false).map(p => p.category).filter(Boolean))].sort();
    return ["Todos", ...cats];
  }, [products]);

  const produtosFiltrados = useMemo(() => {
    let ativos = products.filter(p => p.active !== false);
    if (catFiltroIng !== "Todos") ativos = ativos.filter(p => p.category === catFiltroIng);
    if (!busca.trim()) return ativos;
    const q = busca.toLowerCase();
    return ativos.filter(p => p.name.toLowerCase().includes(q) || p.category?.toLowerCase().includes(q));
  }, [products, busca, catFiltroIng]);

  // Produtos elegíveis para ser o "prato" da ficha (excluindo Insumo)
  const pratoElegiveis = useMemo(() => {
    const ativos = products.filter(p => p.active !== false && p.category !== "Insumo");
    if (!buscaPrato.trim()) return ativos;
    const q = buscaPrato.toLowerCase();
    return ativos.filter(p => p.name.toLowerCase().includes(q) || p.category?.toLowerCase().includes(q));
  }, [products, buscaPrato]);

  const produtoVinculado = useMemo(() =>
    form?.produtoId ? products.find(p => p.id === form.produtoId) ?? null : null
  , [form?.produtoId, products]);

  // Custo total calculado
  const custoTotal  = (form?.ingredientes ?? []).reduce((s, ing) => s + (parseFloat(ing.qtd) || 0) * (parseFloat(ing.custoUnit) || 0), 0);
  const custoPorcao = custoTotal / (parseFloat(form?.rendimento) || 1);

  const salvar = async () => {
    if (!form?.produtoId) return;
    setSaving(true);
    const nova = [...fichas.filter(f => f.id !== form.id), { ...form }];
    await onSave("fichas_tecnicas", nova);
    setSaving(false);
    fechar();
  };

  const excluir = async () => {
    await onDelete("fichas_tecnicas", fichas.filter(f => f.id !== deleteId));
    setDeleteId(null);
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div style={{ color: C.muted, fontSize: sz.fontSm + 1 }}>
          {fichas.length} ficha{fichas.length !== 1 ? "s" : ""} cadastrada{fichas.length !== 1 ? "s" : ""}
        </div>
        <AddBtn onClick={abrirNova} label="Nova Ficha" />
      </div>

      {fichas.length === 0 ? (
        <EmptyMsg icon={LuClipboardList} msg="Nenhuma ficha técnica cadastrada" />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 16 }}>
          {fichas.map(f => {
            const ings          = f.ingredientes ?? [];
            const ct            = ings.reduce((s, ing) => s + (parseFloat(ing.qtd) || 0) * (parseFloat(ing.custoUnit) || 0), 0);
            const cp            = ct / (parseFloat(f.rendimento) || 1);
            const prodCard      = f.produtoId ? products.find(p => p.id === f.produtoId) : null;
            const nomeCard      = prodCard?.name ?? f.nome ?? "Sem produto";
            const emojiCard     = prodCard?.emoji;
            return (
              <div key={f.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 18, padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>

                {/* Cabeçalho */}
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                    {emojiCard && <span style={{ fontSize: 22, flexShrink: 0 }}>{emojiCard}</span>}
                    <div>
                      <div style={{ fontWeight: 800, fontSize: sz.fontBase + 2 }}>{nomeCard}</div>
                      {f.categoria && <div style={{ fontSize: sz.fontSm + 1, color: C.muted, marginTop: 2 }}>{f.categoria}</div>}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    <CardBtn onClick={() => abrirEditar(f)}><LuPencil size={12} /></CardBtn>
                    <CardBtn onClick={() => setDeleteId(f.id)}><LuTrash2 size={12} /></CardBtn>
                  </div>
                </div>

                {/* KPIs */}
                <div style={{ display: "flex", gap: 8 }}>
                  <div style={{ flex: 1, background: C.surface, borderRadius: 10, padding: "9px 12px" }}>
                    <div style={{ fontSize: 13, color: C.muted, fontWeight: 700, marginBottom: 2, textTransform: "uppercase", letterSpacing: 0.8 }}>Rendimento</div>
                    <div style={{ fontWeight: 800, fontSize: sz.fontBase + 1 }}>{f.rendimento || "—"} porç.</div>
                  </div>
                  <div style={{ flex: 1, background: `${C.green}10`, border: `1px solid ${C.green}33`, borderRadius: 10, padding: "9px 12px" }}>
                    <div style={{ fontSize: 13, color: C.muted, fontWeight: 700, marginBottom: 2, textTransform: "uppercase", letterSpacing: 0.8 }}>Custo/porção</div>
                    <div style={{ fontWeight: 800, fontSize: sz.fontBase + 1, color: C.green }}>{fmtR(cp)}</div>
                  </div>
                </div>

                {/* Lista de ingredientes */}
                {ings.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 0, borderRadius: 10, border: `1px solid ${C.border}`, overflow: "hidden" }}>
                    {/* Cabeçalho da tabela */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 60px", padding: "7px 12px", background: C.surface, borderBottom: `1px solid ${C.border}` }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 0.8 }}>Ingrediente</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 0.8, textAlign: "center" }}>Necessário</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 0.8, textAlign: "right" }}>Em estoque</div>
                    </div>

                    {ings.map((ing, i) => {
                      // Sempre deriva nome/emoji do produto atual se vinculado
                      const produto    = ing.produtoId ? products.find(p => p.id === ing.produtoId) : null;
                      const nomeShow   = produto?.name  ?? ing.nome;
                      const emojiShow  = produto?.emoji ?? ing.emoji;
                      const qtdNec     = parseFloat(ing.qtd) || 0;
                      // Converte qtd necessária (em unidade_consumo) para unidade_estoque para comparar
                      const qtdNecEst  = produto ? consumoParaEstoque(qtdNec, produto) : qtdNec;
                      const qtdEstq    = produto ? (estoque[produto.id] ?? 0) : null;
                      const suficiente = qtdEstq === null ? null : qtdEstq >= qtdNecEst;
                      const corEstq    = qtdEstq === null ? C.muted : qtdEstq === 0 ? C.red : suficiente ? C.green : "#f59e0b";
                      const ueLabel    = produto ? labelEstoque(produto) : "";
                      const ucLabel    = produto ? labelConsumo(produto) : (ing.unidade || "");
                      const temConv    = produto ? temConversaoConsumo(produto) : false;
                      return (
                        <div
                          key={i}
                          style={{
                            display: "grid", gridTemplateColumns: "1fr 80px 60px",
                            padding: "8px 12px", alignItems: "center",
                            borderBottom: i < ings.length - 1 ? `1px solid ${C.border}` : "none",
                            background: "transparent",
                          }}
                        >
                          {/* Nome */}
                          <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
                            {emojiShow
                              ? <span style={{ fontSize: 18, flexShrink: 0 }}>{emojiShow}</span>
                              : <LuPackage size={13} color={C.muted} style={{ flexShrink: 0 }} />}
                            <span style={{ fontSize: 16, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {nomeShow || <span style={{ color: C.muted, fontStyle: "italic" }}>sem nome</span>}
                            </span>
                            {produto && (
                              <LuLink size={10} color={C.accent} style={{ flexShrink: 0 }} title="Vinculado ao estoque" />
                            )}
                          </div>

                          {/* Qtd necessária */}
                          <div style={{ fontSize: 14, fontWeight: 700, color: C.text, textAlign: "center" }}>
                            {qtdNec > 0 ? (
                              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
                                <span>{fmtQtd(qtdNec)} {ucLabel}</span>
                                {temConv && (
                                  <span style={{ fontSize: 13, color: C.muted, fontWeight: 500 }}>
                                    ={fmtQtd(qtdNecEst)} {ueLabel}
                                  </span>
                                )}
                              </div>
                            ) : <span style={{ color: C.muted }}>—</span>}
                          </div>

                          {/* Qtd em estoque */}
                          <div style={{ textAlign: "right" }}>
                            {qtdEstq === null ? (
                              <span style={{ fontSize: 14, color: C.muted }}>—</span>
                            ) : (
                              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 1 }}>
                                <span style={{
                                  fontSize: 18, fontWeight: 700, color: corEstq,
                                  background: `${corEstq}15`, border: `1px solid ${corEstq}44`,
                                  borderRadius: 6, padding: "2px 7px",
                                }}>
                                  {fmtQtd(qtdEstq)} {ueLabel}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {ings.length === 0 && (
                  <div style={{ fontSize: 18, color: C.muted, textAlign: "center", padding: "10px 0", fontStyle: "italic" }}>
                    Nenhum ingrediente cadastrado
                  </div>
                )}

                {/* Custo total */}
                {ct > 0 && (
                  <div style={{ fontSize: 18, color: C.muted, textAlign: "right" }}>
                    Custo total dos ingredientes: <strong style={{ color: C.text }}>{fmtR(ct)}</strong>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal da Ficha */}
      {form && (
        <ModalBase
          title={fichas.find(f => f.id === form.id) ? "Editar Ficha Técnica" : "Nova Ficha Técnica"}
          onClose={fechar}
          onSave={salvar}
          saving={saving}
          width={860}
        >
          {/* Cabeçalho da ficha */}
          <div style={{ display: "grid", gridTemplateColumns: isNarrow ? "1fr" : "1fr 1fr 140px", gap: 12 }}>
            <Field label="Produto vinculado *">
              <div style={{ position: "relative" }}>
                {produtoVinculado ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 9, border: `1.5px solid ${C.accent}`, background: `${C.accent}10`, minHeight: 40 }}>
                    <span style={{ fontSize: 18, flexShrink: 0 }}>{produtoVinculado.emoji || "📦"}</span>
                    <span style={{ flex: 1, fontWeight: 700, fontSize: 16, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{produtoVinculado.name}</span>
                    <button type="button" onClick={() => { setF("produtoId", null); setF("nome", ""); setF("categoria", ""); setBuscaPrato(""); setShowPratoDD(false); }} style={{ background: "none", border: "none", cursor: "pointer", color: C.muted, display: "flex", padding: 2 }}><LuX size={13} /></button>
                  </div>
                ) : (
                  <div style={{ position: "relative" }}>
                    <LuSearch size={13} color={C.muted} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", zIndex: 1 }} />
                    <input
                      ref={buscaPratoRef}
                      value={buscaPrato}
                      onChange={e => { setBuscaPrato(e.target.value); setShowPratoDD(true); }}
                      onFocus={() => setShowPratoDD(true)}
                      onBlur={() => setTimeout(() => setShowPratoDD(false), 150)}
                      placeholder="Buscar produto..."
                      style={{ width: "100%", padding: "8px 10px 8px 30px", borderRadius: 9, border: `1.5px solid ${C.border}`, background: C.surface, color: C.text, fontSize: 16, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }}
                    />
                    {showPratoDD && (
                      <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, boxShadow: "0 8px 24px rgba(0,0,0,0.3)", zIndex: 200, maxHeight: 200, overflowY: "auto" }}>
                        {pratoElegiveis.length === 0 ? (
                          <div style={{ padding: "14px 12px", color: C.muted, fontSize: 15, textAlign: "center" }}>Nenhum produto encontrado</div>
                        ) : pratoElegiveis.map(p => (
                          <button
                            key={p.id}
                            type="button"
                            onMouseDown={() => { setF("produtoId", p.id); setF("nome", p.name); setF("categoria", p.category ?? ""); setBuscaPrato(""); setShowPratoDD(false); }}
                            style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", width: "100%", border: "none", background: "none", cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}
                            onMouseEnter={e => e.currentTarget.style.background = C.surface}
                            onMouseLeave={e => e.currentTarget.style.background = "none"}
                          >
                            <span style={{ fontSize: 17, flexShrink: 0 }}>{p.emoji || "📦"}</span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontWeight: 600, fontSize: 15, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
                              {p.category && <div style={{ fontSize: 13, color: C.muted }}>{p.category}</div>}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </Field>
            <Field label="Categoria">
              <div style={{ padding: "8px 10px", borderRadius: 9, border: `1.5px solid ${C.border}`, background: C.faint, color: form.categoria ? C.text : C.muted, fontSize: 16, minHeight: 40, display: "flex", alignItems: "center", userSelect: "none" }}>
                {form.categoria || "Preenchida ao vincular produto"}
              </div>
            </Field>
            <Field label="Rendimento">
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Inp type="number" value={form.rendimento} onChange={v => setF("rendimento", v)} placeholder="1" />
                <span style={{ fontSize: 15, fontWeight: 700, color: produtoVinculado ? C.accent : C.muted, whiteSpace: "nowrap", flexShrink: 0 }}>
                  {produtoVinculado ? (labelConsumo(produtoVinculado) || labelEstoque(produtoVinculado)) : "un"}
                </span>
              </div>
            </Field>
          </div>

          {/* Painel de ingredientes — 2 colunas */}
          <div style={{ display: "grid", gridTemplateColumns: isNarrow ? "1fr" : "1fr 280px", gap: 14, alignItems: "start" }}>

            {/* Esquerda: lista de ingredientes adicionados */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 1 }}>
                Ingredientes da receita
              </div>

              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                {/* Cabeçalho das colunas */}
                {form.ingredientes.length > 0 && (
                  <div style={{ display: "grid", gridTemplateColumns: isNarrow ? "1fr 56px 44px 28px" : "1fr 64px 54px 80px 28px", gap: 6, paddingBottom: 4, borderBottom: `1px solid ${C.border}` }}>
                    {(isNarrow ? ["Ingrediente", "Qtd", "Un", ""] : ["Ingrediente", "Qtd", "Un", "R$/un", ""]).map((h, i) => (
                      <div key={i} style={{ fontSize: 13, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 0.8, textAlign: i > 0 ? "center" : "left" }}>{h}</div>
                    ))}
                  </div>
                )}

                {form.ingredientes.map((ing, i) => {
                  // Sempre usa dados atuais do produto vinculado
                  const prodVinc   = ing.produtoId ? products.find(p => p.id === ing.produtoId) : null;
                  const nomeChip   = prodVinc?.name  ?? ing.nome;
                  const emojiChip  = prodVinc?.emoji ?? ing.emoji;
                  return (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: isNarrow ? "1fr 56px 44px 28px" : "1fr 64px 54px 80px 28px", gap: 6, alignItems: "center" }}>
                    {/* Nome — chip se vinculado, input se manual */}
                    {prodVinc ? (
                      <div style={{
                        display: "flex", alignItems: "center", gap: 6,
                        background: `${C.accent}12`, border: `1px solid ${C.accent}33`,
                        borderRadius: 8, padding: "7px 10px", minWidth: 0,
                      }}>
                        {emojiChip && <span style={{ fontSize: 18, flexShrink: 0 }}>{emojiChip}</span>}
                        <span style={{ fontWeight: 600, fontSize: 16, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{nomeChip}</span>
                        <LuLink size={11} color={C.accent} style={{ flexShrink: 0 }} />
                      </div>
                    ) : (
                      <input
                        value={ing.nome}
                        onChange={e => setIng(i, "nome", e.target.value)}
                        placeholder="Nome do ingrediente"
                        style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1.5px solid ${C.border}`, background: C.surface, color: C.text, fontSize: 16, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }}
                      />
                    )}
                    <input
                      type="number" value={ing.qtd} onChange={e => setIng(i, "qtd", e.target.value)}
                      placeholder="0"
                      style={{ width: "100%", padding: "8px 6px", borderRadius: 8, border: `1.5px solid ${C.border}`, background: C.surface, color: C.text, fontSize: 16, fontFamily: "inherit", outline: "none", textAlign: "center", boxSizing: "border-box" }}
                    />
                    <input
                      value={ing.unidade} onChange={e => setIng(i, "unidade", e.target.value)}
                      placeholder="un"
                      style={{ width: "100%", padding: "8px 6px", borderRadius: 8, border: `1.5px solid ${C.border}`, background: C.surface, color: C.text, fontSize: 16, fontFamily: "inherit", outline: "none", textAlign: "center", boxSizing: "border-box" }}
                    />
                    {!isNarrow && (
                      <input
                        type="number" value={ing.custoUnit} onChange={e => setIng(i, "custoUnit", e.target.value)}
                        placeholder="0,00"
                        style={{ width: "100%", padding: "8px 6px", borderRadius: 8, border: `1.5px solid ${C.border}`, background: C.surface, color: C.text, fontSize: 16, fontFamily: "inherit", outline: "none", textAlign: "right", boxSizing: "border-box" }}
                      />
                    )}
                    <button onClick={() => removeIng(i)} style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 7, cursor: "pointer", color: C.muted, padding: "5px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <LuX size={12} />
                    </button>
                  </div>
                  );
                })}

                {form.ingredientes.length === 0 && (
                  <div style={{ fontSize: 16, color: C.muted, padding: "24px 0", textAlign: "center", border: `1.5px dashed ${C.border}`, borderRadius: 10 }}>
                    Selecione itens do estoque ao lado<br />
                    <span style={{ fontSize: 18 }}>ou adicione manualmente</span>
                  </div>
                )}

                {/* Botão manual */}
                <button
                  onClick={adicionarManual}
                  style={{ alignSelf: "flex-start", background: "none", border: `1px dashed ${C.border}`, borderRadius: 8, padding: "6px 12px", cursor: "pointer", color: C.muted, fontSize: 18, fontWeight: 600, fontFamily: "inherit", display: "flex", alignItems: "center", gap: 5, marginTop: 4 }}
                >
                  <LuPlus size={12} /> Adicionar manualmente
                </button>
              </div>

              {/* Resumo de custo */}
              {form.ingredientes.length > 0 && (
                <div style={{ background: C.surface, borderRadius: 10, padding: "12px 14px", border: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between" }}>
                  <div style={{ fontSize: 18, color: C.muted }}>
                    Custo total: <strong style={{ color: C.text }}>{fmtR(custoTotal)}</strong>
                  </div>
                  <div style={{ fontSize: 18, color: C.muted }}>
                    Por porção: <strong style={{ color: C.green }}>{fmtR(custoPorcao)}</strong>
                  </div>
                </div>
              )}
            </div>

            {/* Direita: painel de busca no estoque */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8, background: C.surface, borderRadius: 14, border: `1px solid ${C.border}`, padding: 12, height: isNarrow ? "auto" : 380, minHeight: isNarrow ? 200 : "unset" }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 1 }}>
                Itens do Estoque
              </div>

              {/* Campo de busca */}
              <div style={{ position: "relative" }}>
                <LuSearch size={13} color={C.muted} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
                <input
                  ref={buscaRef}
                  value={busca}
                  onChange={e => setBusca(e.target.value)}
                  placeholder="Buscar produto..."
                  style={{
                    width: "100%", padding: "8px 10px 8px 30px",
                    borderRadius: 9, border: `1.5px solid ${C.border}`,
                    background: C.card, color: C.text, fontSize: 16,
                    fontFamily: "inherit", outline: "none", boxSizing: "border-box",
                  }}
                />
                {busca && (
                  <button onClick={() => setBusca("")} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: C.muted, display: "flex", padding: 2 }}>
                    <LuX size={12} />
                  </button>
                )}
              </div>

              {/* Filtro de categorias */}
              <div>
                <button
                  type="button"
                  onClick={() => setShowFiltroIng(v => !v)}
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "6px 12px", borderRadius: 20,
                    border: `1.5px solid ${catFiltroIng !== "Todos" ? C.accent : C.border}`,
                    background: catFiltroIng !== "Todos" ? `${C.accent}12` : C.card,
                    color: catFiltroIng !== "Todos" ? C.accent : C.muted,
                    cursor: "pointer", fontWeight: 700, fontSize: 13,
                    fontFamily: "inherit", transition: "all 0.15s",
                  }}
                >
                  <LuSlidersHorizontal size={13} />
                  Filtro{catFiltroIng !== "Todos" ? `: ${catFiltroIng}` : ""}
                  <LuChevronDown size={13} style={{ transform: showFiltroIng ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }} />
                </button>

                {showFiltroIng && (
                  <div style={{ marginTop: 8, display: "flex", gap: 5, flexWrap: "wrap", padding: "10px 12px", background: C.bg, borderRadius: 12, border: `1px solid ${C.border}` }}>
                    {categoriasIng.map(cat => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => { setCatFiltroIng(cat); if (cat !== "Todos") setShowFiltroIng(false); }}
                        style={{
                          padding: "4px 12px", borderRadius: 20,
                          border: `1.5px solid ${catFiltroIng === cat ? C.accent : C.border}`,
                          background: catFiltroIng === cat ? C.accent : C.card,
                          color: catFiltroIng === cat ? "#fff" : C.muted,
                          cursor: "pointer", fontWeight: 600, fontSize: 12,
                          fontFamily: "inherit", transition: "all 0.12s",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Lista de produtos */}
              <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 3, minHeight: 0, maxHeight: isNarrow ? 200 : "unset" }}>
                {produtosFiltrados.length === 0 ? (
                  <div style={{ fontSize: 18, color: C.muted, textAlign: "center", padding: "20px 0" }}>
                    Nenhum produto encontrado
                  </div>
                ) : (
                  produtosFiltrados.map(p => {
                    const jaAdicionado = adicionados.has(p.id);
                    return (
                      <button
                        key={p.id}
                        onClick={() => !jaAdicionado && adicionarDoProduto(p)}
                        style={{
                          display: "flex", alignItems: "center", gap: 8,
                          padding: "8px 10px", borderRadius: 9,
                          border: `1px solid ${jaAdicionado ? C.accent + "44" : "transparent"}`,
                          background: jaAdicionado ? `${C.accent}0c` : "none",
                          cursor: jaAdicionado ? "default" : "pointer",
                          textAlign: "left", width: "100%",
                          transition: "background 0.12s, border-color 0.12s",
                          fontFamily: "inherit",
                        }}
                        onMouseEnter={e => { if (!jaAdicionado) e.currentTarget.style.background = C.faint; }}
                        onMouseLeave={e => { if (!jaAdicionado) e.currentTarget.style.background = "none"; }}
                      >
                        <span style={{ fontSize: 17, flexShrink: 0 }}>{p.emoji || "📦"}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: 18, color: jaAdicionado ? C.accent : C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
                          <div style={{ fontSize: 14, color: C.muted }}>{p.category}</div>
                        </div>
                        {jaAdicionado ? (
                          <LuCheck size={13} color={C.accent} style={{ flexShrink: 0 }} />
                        ) : (
                          <LuPlus size={13} color={C.muted} style={{ flexShrink: 0 }} />
                        )}
                      </button>
                    );
                  })
                )}
              </div>

              <div style={{ fontSize: 14, color: C.muted, textAlign: "center", borderTop: `1px solid ${C.border}`, paddingTop: 8 }}>
                {produtosFiltrados.length} produto{produtosFiltrados.length !== 1 ? "s" : ""} encontrado{produtosFiltrados.length !== 1 ? "s" : ""}
              </div>
            </div>
          </div>

          {/* Modo de preparo */}
          <Field label="Modo de preparo">
            <Txta value={form.preparo} onChange={v => setF("preparo", v)} placeholder="Descreva o preparo..." rows={3} />
          </Field>
        </ModalBase>
      )}

      {deleteId && (
        <DeleteConfirm
          msg={`<strong>${fichas.find(f => f.id === deleteId)?.nome}</strong> será removida permanentemente.`}
          onCancel={() => setDeleteId(null)}
          onConfirm={excluir}
        />
      )}
    </div>
  );
}

// ── Aba: Notas ────────────────────────────────────────────────────

// ── Aba: Fornecedores ─────────────────────────────────────────────

const FORN_VAZIO = { id: "", nome: "", cnpj: "", categoria: "", contato: "", telefone: "", email: "", observacoes: "" };

function FornecedoresTab({ sz, fornecedores, onSave, onDelete }) {
  const [form,     setForm]     = useState(null);
  const [saving,   setSaving]   = useState(false);
  const [deleteId, setDeleteId] = useState(null);

  const abrirNovo   = () => setForm({ ...FORN_VAZIO, id: uid() });
  const abrirEditar = (f) => setForm({ ...f });
  const fechar      = () => setForm(null);
  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const salvar = async () => {
    if (!form?.nome?.trim()) return;
    setSaving(true);
    const nova = [...fornecedores.filter(f => f.id !== form.id), { ...form, nome: form.nome.trim() }];
    await onSave("fornecedores", nova);
    setSaving(false);
    fechar();
  };

  const excluir = async () => {
    await onDelete("fornecedores", fornecedores.filter(f => f.id !== deleteId));
    setDeleteId(null);
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div style={{ color: C.muted, fontSize: sz.fontSm + 1 }}>{fornecedores.length} fornecedor{fornecedores.length !== 1 ? "es" : ""}</div>
        <AddBtn onClick={abrirNovo} label="Novo Fornecedor" />
      </div>

      {fornecedores.length === 0 ? (
        <EmptyMsg icon={LuTruck} msg="Nenhum fornecedor cadastrado" />
      ) : (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                {["Nome", "Categoria", "Contato", "Telefone", ""].map((h, i) => (
                  <th key={i} style={{ padding: "12px 16px", textAlign: "left", fontSize: 14, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 1 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {fornecedores.map(f => (
                <tr key={f.id} onMouseEnter={e => e.currentTarget.style.background = C.surface} onMouseLeave={e => e.currentTarget.style.background = "transparent"} style={{ borderBottom: `1px solid ${C.border}`, transition: "background 0.1s" }}>
                  <td style={{ padding: "13px 16px", fontWeight: 700, fontSize: sz.fontBase }}>{f.nome}</td>
                  <td style={{ padding: "13px 16px" }}>
                    {f.categoria
                      ? <span style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 20, padding: "2px 10px", fontSize: sz.fontSm + 1, color: C.muted, fontWeight: 600 }}>{f.categoria}</span>
                      : <span style={{ color: C.muted }}>—</span>}
                  </td>
                  <td style={{ padding: "13px 16px", fontSize: sz.fontBase, color: C.muted }}>{f.contato || "—"}</td>
                  <td style={{ padding: "13px 16px", fontSize: sz.fontBase, color: C.muted }}>{f.telefone || "—"}</td>
                  <td style={{ padding: "13px 16px", textAlign: "right" }}>
                    <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                      <CardBtn onClick={() => abrirEditar(f)}><LuPencil size={12} /> Editar</CardBtn>
                      <CardBtn onClick={() => setDeleteId(f.id)}><LuTrash2 size={12} /></CardBtn>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {form && (
        <ModalBase title={fornecedores.find(f => f.id === form.id) ? "Editar Fornecedor" : "Novo Fornecedor"} onClose={fechar} onSave={salvar} saving={saving}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Nome *"><Inp value={form.nome} onChange={v => setF("nome", v)} placeholder="Nome do fornecedor" /></Field>
            <Field label="Categoria"><Inp value={form.categoria} onChange={v => setF("categoria", v)} placeholder="Ex: Bebidas, Carnes..." /></Field>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="CNPJ"><Inp value={form.cnpj ?? ""} onChange={v => setF("cnpj", v)} placeholder="00.000.000/0000-00" /></Field>
            <Field label="Contato"><Inp value={form.contato} onChange={v => setF("contato", v)} placeholder="Nome do responsável" /></Field>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Telefone"><Inp value={form.telefone} onChange={v => setF("telefone", v)} placeholder="(00) 00000-0000" /></Field>
            <Field label="E-mail"><Inp type="email" value={form.email} onChange={v => setF("email", v)} placeholder="email@fornecedor.com" /></Field>
          </div>
          <Field label="Observações"><Txta value={form.observacoes} onChange={v => setF("observacoes", v)} placeholder="Prazo de entrega, condições de pagamento..." rows={3} /></Field>
        </ModalBase>
      )}

      {deleteId && (
        <DeleteConfirm msg={`<strong>${fornecedores.find(f => f.id === deleteId)?.nome}</strong> será removido permanentemente.`} onCancel={() => setDeleteId(null)} onConfirm={excluir} />
      )}
    </div>
  );
}

// ── Aba: Compras ──────────────────────────────────────────────────

const COMPRA_VAZIA = { id: "", fornecedor: "", data: "", itens: [], status: "pendente", observacoes: "" };
const ITEM_VAZIO   = { nome: "", qtd: "", unidade: "un", valorUnit: "" };

function ComprasTab({ sz, compras, fornecedores, onSave, onDelete }) {
  const [form,     setForm]     = useState(null);
  const [saving,   setSaving]   = useState(false);
  const [deleteId, setDeleteId] = useState(null);

  const abrirNova   = () => setForm({ ...COMPRA_VAZIA, id: uid(), data: new Date().toISOString().slice(0, 10) });
  const abrirEditar = (c) => setForm({ ...c });
  const fechar      = () => setForm(null);
  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const addItem    = () => setForm(f => ({ ...f, itens: [...f.itens, { ...ITEM_VAZIO }] }));
  const setItem    = (i, k, v) => setForm(f => ({ ...f, itens: f.itens.map((it, idx) => idx === i ? { ...it, [k]: v } : it) }));
  const removeItem = (i) => setForm(f => ({ ...f, itens: f.itens.filter((_, idx) => idx !== i) }));

  const totalForm = form ? form.itens.reduce((s, it) => s + (parseFloat(it.qtd) || 0) * (parseFloat(it.valorUnit) || 0), 0) : 0;

  const salvar = async () => {
    if (!form?.fornecedor?.trim()) return;
    setSaving(true);
    const forn = form.fornecedor === "__outro" ? (form._fornecedorCustom?.trim() || "") : form.fornecedor;
    const total = form.itens.reduce((s, it) => s + (parseFloat(it.qtd) || 0) * (parseFloat(it.valorUnit) || 0), 0);
    const { _fornecedorCustom, ...rest } = form;
    const atualizada = [...compras.filter(c => c.id !== form.id), { ...rest, fornecedor: forn, total }]
      .sort((a, b) => new Date(b.data) - new Date(a.data));
    await onSave("compras", atualizada);
    setSaving(false);
    fechar();
  };

  const excluir = async () => {
    await onDelete("compras", compras.filter(c => c.id !== deleteId));
    setDeleteId(null);
  };

  const fns = fornecedores.map(f => f.nome);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div style={{ color: C.muted, fontSize: sz.fontSm + 1 }}>{compras.length} compra{compras.length !== 1 ? "s" : ""} registrada{compras.length !== 1 ? "s" : ""}</div>
        <AddBtn onClick={abrirNova} label="Registrar Compra" />
      </div>

      {compras.length === 0 ? (
        <EmptyMsg icon={LuShoppingCart} msg="Nenhuma compra registrada" />
      ) : (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                {["Data", "Fornecedor", "Itens", "Total", "Status", ""].map((h, i) => (
                  <th key={i} style={{ padding: "12px 16px", textAlign: i >= 2 ? "right" : "left", fontSize: 14, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 1 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {compras.map(c => {
                const st = STATUS_COMPRA[c.status] ?? STATUS_COMPRA.pendente;
                return (
                  <tr key={c.id} onMouseEnter={e => e.currentTarget.style.background = C.surface} onMouseLeave={e => e.currentTarget.style.background = "transparent"} style={{ borderBottom: `1px solid ${C.border}`, transition: "background 0.1s" }}>
                    <td style={{ padding: "13px 16px", fontSize: sz.fontBase, color: C.muted, whiteSpace: "nowrap" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}><LuCalendar size={13} /> {fmtDt(c.data)}</div>
                    </td>
                    <td style={{ padding: "13px 16px", fontWeight: 700, fontSize: sz.fontBase }}>{c.fornecedor}</td>
                    <td style={{ padding: "13px 16px", textAlign: "right", fontSize: sz.fontBase, color: C.muted }}>{c.itens?.length ?? 0} {(c.itens?.length ?? 0) === 1 ? "item" : "itens"}</td>
                    <td style={{ padding: "13px 16px", textAlign: "right", fontWeight: 800, fontSize: sz.fontBase, color: C.green }}>{fmtR(c.total)}</td>
                    <td style={{ padding: "13px 16px", textAlign: "right" }}>
                      <span style={{ fontSize: sz.fontSm + 1, fontWeight: 700, background: `${st.color}18`, border: `1px solid ${st.color}44`, color: st.color, padding: "3px 10px", borderRadius: 20 }}>{st.label}</span>
                    </td>
                    <td style={{ padding: "13px 16px", textAlign: "right" }}>
                      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                        <CardBtn onClick={() => abrirEditar(c)}><LuPencil size={12} /> Editar</CardBtn>
                        <CardBtn onClick={() => setDeleteId(c.id)}><LuTrash2 size={12} /></CardBtn>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {form && (
        <ModalBase title={compras.find(c => c.id === form.id) ? "Editar Compra" : "Registrar Compra"} onClose={fechar} onSave={salvar} saving={saving} width={620}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Fornecedor *">
              {fns.length > 0 ? (
                <select value={form.fornecedor} onChange={e => setF("fornecedor", e.target.value)} style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: `1.5px solid ${C.border}`, background: C.surface, color: form.fornecedor ? C.text : C.muted, fontSize: 17, fontFamily: "inherit", outline: "none", cursor: "pointer" }}>
                  <option value="">Selecionar...</option>
                  {fns.map(n => <option key={n} value={n}>{n}</option>)}
                  <option value="__outro">Outro (digitar)</option>
                </select>
              ) : (
                <Inp value={form.fornecedor} onChange={v => setF("fornecedor", v)} placeholder="Nome do fornecedor" />
              )}
            </Field>
            {fns.length > 0 && form.fornecedor === "__outro" && (
              <Field label="Nome do fornecedor">
                <Inp value={form._fornecedorCustom ?? ""} onChange={v => setF("_fornecedorCustom", v)} placeholder="Digite o nome" />
              </Field>
            )}
            <Field label="Data"><Inp type="date" value={form.data} onChange={v => setF("data", v)} /></Field>
          </div>

          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 1 }}>Itens</div>
              <button onClick={addItem} style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 8, padding: "4px 10px", cursor: "pointer", color: C.accent, fontSize: 18, fontWeight: 700, fontFamily: "inherit", display: "flex", alignItems: "center", gap: 4 }}>
                <LuPlus size={12} /> Adicionar item
              </button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {form.itens.map((it, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 70px 60px 90px 32px", gap: 6, alignItems: "center" }}>
                  <Inp value={it.nome} onChange={v => setItem(i, "nome", v)} placeholder="Produto / insumo" />
                  <Inp type="number" value={it.qtd} onChange={v => setItem(i, "qtd", v)} placeholder="Qtd" />
                  <Inp value={it.unidade} onChange={v => setItem(i, "unidade", v)} placeholder="Un" />
                  <Inp type="number" value={it.valorUnit} onChange={v => setItem(i, "valorUnit", v)} placeholder="R$/un" />
                  <button onClick={() => removeItem(i)} style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 8, cursor: "pointer", color: C.muted, padding: 6, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <LuX size={13} />
                  </button>
                </div>
              ))}
              {form.itens.length === 0 && <div style={{ fontSize: 16, color: C.muted, textAlign: "center", padding: "12px 0" }}>Nenhum item adicionado</div>}
            </div>
            {form.itens.length > 0 && (
              <div style={{ marginTop: 10, textAlign: "right", fontSize: 16, color: C.muted }}>
                Total: <strong style={{ color: C.green, fontSize: 18 }}>{fmtR(totalForm)}</strong>
              </div>
            )}
          </div>

          <Field label="Status">
            <div style={{ display: "flex", gap: 8 }}>
              {Object.entries(STATUS_COMPRA).map(([id, s]) => (
                <button key={id} onClick={() => setF("status", id)} style={{ padding: "7px 16px", borderRadius: 20, border: `1.5px solid ${form.status === id ? s.color : C.border}`, background: form.status === id ? `${s.color}18` : "none", color: form.status === id ? s.color : C.muted, cursor: "pointer", fontWeight: 600, fontSize: sz.fontSm + 1, fontFamily: "inherit" }}>
                  {s.label}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Observações">
            <Txta value={form.observacoes} onChange={v => setF("observacoes", v)} placeholder="Condições, prazos, notas..." rows={2} />
          </Field>
        </ModalBase>
      )}

      {deleteId && (
        <DeleteConfirm msg="Esta compra será removida permanentemente." onCancel={() => setDeleteId(null)} onConfirm={excluir} />
      )}
    </div>
  );
}

// ── Aba: Impostos ─────────────────────────────────────────────────

const TIPOS_IMPOSTO = ["ISS", "ICMS", "PIS", "COFINS", "Simples Nacional", "Outro"];

const COR_TIPO = {
  "ISS":              "#3b82f6",
  "ICMS":             "#8b5cf6",
  "PIS":              "#10b981",
  "COFINS":           "#f59e0b",
  "Simples Nacional": "#ec4899",
  "Outro":            "#6b7280",
};

const IMPOSTO_VAZIO = { id: "", nome: "", tipo: "ISS", aliquota: "", categorias: "", observacoes: "" };

function ImpostosTab({ sz, impostos, onSave, onDelete }) {
  const [form,     setForm]     = useState(null);
  const [saving,   setSaving]   = useState(false);
  const [deleteId, setDeleteId] = useState(null);

  const abrirNovo   = () => setForm({ ...IMPOSTO_VAZIO, id: uid() });
  const abrirEditar = (imp) => setForm({ ...imp });
  const fechar      = () => setForm(null);
  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const salvar = async () => {
    if (!form?.nome?.trim()) return;
    setSaving(true);
    const nova = [...impostos.filter(i => i.id !== form.id), { ...form, nome: form.nome.trim() }];
    await onSave("impostos", nova);
    setSaving(false);
    fechar();
  };

  const excluir = async () => {
    await onDelete("impostos", impostos.filter(i => i.id !== deleteId));
    setDeleteId(null);
  };

  // Totais por tipo
  const resumo = TIPOS_IMPOSTO.reduce((acc, tipo) => {
    acc[tipo] = impostos.filter(i => i.tipo === tipo);
    return acc;
  }, {});

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div style={{ color: C.muted, fontSize: sz.fontSm + 1 }}>
          {impostos.length} imposto{impostos.length !== 1 ? "s" : ""} cadastrado{impostos.length !== 1 ? "s" : ""}
        </div>
        <AddBtn onClick={abrirNovo} label="Novo Imposto" />
      </div>

      {/* Cards de resumo por tipo */}
      {impostos.length > 0 && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 24 }}>
          {TIPOS_IMPOSTO.filter(tipo => resumo[tipo].length > 0).map(tipo => {
            const cor   = COR_TIPO[tipo];
            const lista = resumo[tipo];
            const aliqMedia = lista.reduce((s, i) => s + (parseFloat(i.aliquota) || 0), 0) / lista.length;
            return (
              <div key={tipo} style={{ background: `${cor}10`, border: `1px solid ${cor}33`, borderRadius: 12, padding: "10px 16px", minWidth: 120 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: cor, textTransform: "uppercase", letterSpacing: 0.8 }}>{tipo}</div>
                <div style={{ fontWeight: 800, fontSize: 18, color: cor, marginTop: 2 }}>
                  {lista.length === 1 ? `${parseFloat(lista[0].aliquota) || 0}%` : `${lista.length} reg.`}
                </div>
                {lista.length > 1 && (
                  <div style={{ fontSize: 14, color: C.muted, marginTop: 1 }}>média {aliqMedia.toFixed(1)}%</div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {impostos.length === 0 ? (
        <EmptyMsg icon={LuPercent} msg="Nenhum imposto cadastrado" />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {impostos.map(imp => {
            const cor = COR_TIPO[imp.tipo] ?? C.muted;
            return (
              <div key={imp.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: "16px 20px", display: "flex", alignItems: "center", gap: 16 }}>
                {/* Alíquota */}
                <div style={{ width: 64, height: 64, borderRadius: 14, background: `${cor}12`, border: `1.5px solid ${cor}33`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <div style={{ fontWeight: 900, fontSize: 20, color: cor, lineHeight: 1 }}>
                    {parseFloat(imp.aliquota) || 0}
                  </div>
                  <div style={{ fontSize: 14, color: cor, fontWeight: 700 }}>%</div>
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <span style={{ fontWeight: 800, fontSize: sz.fontBase + 1 }}>{imp.nome}</span>
                    <span style={{ fontSize: 14, fontWeight: 700, padding: "2px 8px", borderRadius: 20, background: `${cor}15`, border: `1px solid ${cor}44`, color: cor }}>
                      {imp.tipo}
                    </span>
                  </div>
                  {imp.categorias && (
                    <div style={{ fontSize: sz.fontSm + 1, color: C.muted }}>
                      Categorias: {imp.categorias}
                    </div>
                  )}
                  {imp.observacoes && (
                    <div style={{ fontSize: sz.fontSm, color: C.muted, marginTop: 2, fontStyle: "italic" }}>
                      {imp.observacoes}
                    </div>
                  )}
                </div>

                {/* Ações */}
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  <CardBtn onClick={() => abrirEditar(imp)}><LuPencil size={12} /> Editar</CardBtn>
                  <CardBtn onClick={() => setDeleteId(imp.id)}><LuTrash2 size={12} /></CardBtn>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {form && (
        <ModalBase
          title={impostos.find(i => i.id === form.id) ? "Editar Imposto" : "Novo Imposto"}
          onClose={fechar}
          onSave={salvar}
          saving={saving}
        >
          <Field label="Nome *">
            <Inp value={form.nome} onChange={v => setF("nome", v)} placeholder="Ex: ISS Serviços, ICMS Bebidas..." />
          </Field>

          <Field label="Tipo">
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
              {TIPOS_IMPOSTO.map(tipo => {
                const cor = COR_TIPO[tipo];
                return (
                  <button
                    key={tipo}
                    onClick={() => setF("tipo", tipo)}
                    style={{ padding: "7px 16px", borderRadius: 20, border: `1.5px solid ${form.tipo === tipo ? cor : C.border}`, background: form.tipo === tipo ? `${cor}18` : "none", color: form.tipo === tipo ? cor : C.muted, cursor: "pointer", fontWeight: 600, fontSize: sz.fontSm + 1, fontFamily: "inherit", transition: "all 0.15s" }}
                  >
                    {tipo}
                  </button>
                );
              })}
            </div>
          </Field>

          <Field label="Alíquota (%)">
            <div style={{ position: "relative", marginTop: 6 }}>
              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={form.aliquota}
                onChange={e => setF("aliquota", e.target.value)}
                placeholder="0,00"
                style={{ width: "100%", padding: "10px 36px 10px 12px", borderRadius: 10, border: `1.5px solid ${C.border}`, background: C.surface, color: C.text, fontSize: 18, fontWeight: 700, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }}
              />
              <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: C.muted, fontWeight: 700, fontSize: 17 }}>%</span>
            </div>
            {form.aliquota && (
              <div style={{ fontSize: 18, color: C.muted, marginTop: 6 }}>
                Sobre R$ 1.000,00 → <strong style={{ color: C.text }}>R$ {(parseFloat(form.aliquota) * 10).toFixed(2)}</strong> de imposto
              </div>
            )}
          </Field>

          <Field label="Categorias aplicáveis">
            <Inp value={form.categorias} onChange={v => setF("categorias", v)} placeholder="Ex: Bebidas, Comidas (opcional)" />
          </Field>

          <Field label="Observações">
            <Txta value={form.observacoes} onChange={v => setF("observacoes", v)} placeholder="Base de cálculo, regime tributário, notas..." rows={3} />
          </Field>
        </ModalBase>
      )}

      {deleteId && (
        <DeleteConfirm
          msg={`O imposto <strong>${impostos.find(i => i.id === deleteId)?.nome}</strong> será removido.`}
          onCancel={() => setDeleteId(null)}
          onConfirm={excluir}
        />
      )}
    </div>
  );
}

// ── Grade inicial ─────────────────────────────────────────────────

const SECOES = [
  { id: "fichas",       label: "Ficha Técnica", desc: "Receitas, ingredientes e custo por porção", Icon: LuClipboardList, color: C.accent  },
  { id: "fornecedores", label: "Fornecedores",  desc: "Contatos e cadastro de fornecedores",       Icon: LuTruck,        color: C.blue    },
  { id: "compras",      label: "Compras",       desc: "Registro de compras e pedidos",             Icon: LuShoppingCart, color: C.green   },
  { id: "impostos",     label: "Impostos",      desc: "Alíquotas e configuração fiscal",           Icon: LuPercent,      color: "#f97316" },
  { id: "notas_fiscais", label: "Notas Fiscais", desc: "Importação de NF-e via XML e controle de entradas", Icon: LuFileText, color: C.blue },
];

function GradeInicial({ sz, onSelecionar, fichas, fornecedores, compras, impostos, notasFiscaisCount }) {
  const contadores = { fichas: fichas.length, fornecedores: fornecedores.length, compras: compras.length, impostos: impostos.length, notas_fiscais: notasFiscaisCount };
  return (
    <div style={{ maxWidth: 700, margin: "0 auto" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {SECOES.map(s => (
          <button
            key={s.id}
            onClick={() => onSelecionar(s.id)}
            style={{ background: C.card, border: `1.5px solid ${C.border}`, borderRadius: 20, padding: 28, cursor: "pointer", textAlign: "left", color: C.text, display: "flex", flexDirection: "column", gap: 16, transition: "border-color 0.18s, background 0.18s", fontFamily: "inherit" }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = s.color + "66"; e.currentTarget.style.background = `${s.color}08`; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.background = C.card; }}
          >
            <div style={{ width: 52, height: 52, borderRadius: 14, background: `${s.color}18`, border: `1.5px solid ${s.color}44`, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <s.Icon size={24} color={s.color} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 800, fontSize: sz.fontLg - 1, marginBottom: 4 }}>{s.label}</div>
              <div style={{ fontSize: sz.fontSm + 1, color: C.muted, lineHeight: 1.5 }}>{s.desc}</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 18, fontWeight: 700, padding: "3px 10px", borderRadius: 20, background: C.surface, color: C.muted, border: `1px solid ${C.border}` }}>
                {contadores[s.id]} {contadores[s.id] === 1 ? "registro" : "registros"}
              </span>
              <LuChevronRight size={16} color={C.muted} />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── View principal ────────────────────────────────────────────────

export default function AdminView() {
  const { width } = useResponsive();
  const sz = getSizes(width);
  const { products, estoque } = useApp();

  const [secao,              setSecao]              = useState(null);
  const [fichas,             setFichas]             = useState([]);
  const [fornecedores,       setFornecedores]       = useState([]);
  const [compras,            setCompras]            = useState([]);
  const [impostos,           setImpostos]           = useState([]);
  const [notasFiscaisCount,  setNotasFiscaisCount]  = useState(0);
  const [loading,            setLoading]            = useState(true);

  useEffect(() => {
    Promise.all([
      supabase.from("config").select("key, value")
        .in("key", ["fichas_tecnicas", "fornecedores", "compras", "impostos"]),
      supabase.from("notas_fiscais").select("id", { count: "exact", head: true }),
    ]).then(([{ data }, { count }]) => {
      if (data) {
        const get = (key) => { const r = data.find(d => d.key === key); return Array.isArray(r?.value) ? r.value : []; };
        setFichas(get("fichas_tecnicas"));
        setFornecedores(get("fornecedores"));
        setCompras(get("compras"));
        setImpostos(get("impostos"));
      }
      setNotasFiscaisCount(count || 0);
      setLoading(false);
    });
  }, []);

  const handleSave = async (key, value) => {
    await supabase.from("config").upsert({ key, value });
    if (key === "fichas_tecnicas") setFichas(value);
    if (key === "fornecedores")    setFornecedores(value);
    if (key === "compras")         setCompras(value);
    if (key === "impostos")        setImpostos(value);
  };

  const secaoAtual = SECOES.find(s => s.id === secao);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", background: C.bg, overflow: "hidden" }}>
      <div style={{ padding: `${sz.pad - 4}px ${sz.pad}px`, borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {secao && (
            <button
              onClick={() => setSecao(null)}
              style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "8px 14px", cursor: "pointer", color: C.text, display: "flex", alignItems: "center", gap: 6, fontSize: sz.fontSm + 1, fontWeight: 600, fontFamily: "inherit" }}
            >
              <LuArrowLeft size={15} /> Voltar
            </button>
          )}
          <div>
            <div style={{ fontWeight: 800, fontSize: sz.fontLg }}>{secaoAtual ? secaoAtual.label : "Gestão"}</div>
            <div style={{ color: C.muted, fontSize: sz.fontSm, marginTop: 2 }}>
              {secaoAtual ? secaoAtual.desc : "Selecione uma área para gerenciar"}
            </div>
          </div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: sz.pad }}>
        {loading ? (
          <div style={{ color: C.muted, textAlign: "center", padding: 60 }}>Carregando...</div>
        ) : !secao ? (
          <GradeInicial sz={sz} onSelecionar={setSecao} fichas={fichas} fornecedores={fornecedores} compras={compras} impostos={impostos} notasFiscaisCount={notasFiscaisCount} />
        ) : (
          <>
            {secao === "fichas"       && <FichasTecnicasTab sz={sz} fichas={fichas}             products={products} estoque={estoque} onSave={handleSave} onDelete={handleSave} />}
            {secao === "fornecedores" && <FornecedoresTab   sz={sz} fornecedores={fornecedores} onSave={handleSave} onDelete={handleSave} />}
            {secao === "compras"      && <ComprasTab        sz={sz} compras={compras}           fornecedores={fornecedores} onSave={handleSave} onDelete={handleSave} />}
            {secao === "impostos"     && <ImpostosTab       sz={sz} impostos={impostos}          onSave={handleSave} onDelete={handleSave} />}
            {secao === "notas_fiscais" && (
              <NotasFiscaisTab
                sz={sz}
                fornecedores={fornecedores}
                onAddFornecedor={async (forn) => {
                  const nova = [...fornecedores, { ...FORN_VAZIO, ...forn, id: uid() }];
                  await handleSave("fornecedores", nova);
                }}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
