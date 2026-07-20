import { useState, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useApp } from "@/context/AppContext";
import C from "@/constants/colors";
import { varColor } from "@/lib/tema";
import { alfa } from "@/constants/colorAlfa";
import { useResponsive } from "@/utils/hooks";
import { getSizes } from "@/constants/sizes";
import {
  LuPlus, LuPencil, LuTrash2, LuX, LuClipboardList,
  LuTruck, LuShoppingCart, LuCheck,
  LuCalendar, LuArrowLeft, LuChevronRight, LuChevronDown, LuSearch,
  LuLink, LuPackage, LuPercent, LuFileText, LuSlidersHorizontal,
  LuWallet, LuReceipt, LuFileCheck,
} from "react-icons/lu";
import NotasFiscaisTab from "@/components/desktop/views/NotasFiscaisTab";
import ImpostosAdmin from "@/components/desktop/views/ImpostosAdmin";
import {
  consumoParaEstoque, labelEstoque, labelConsumo,
  temConversaoConsumo, fmtQtd,
} from "@/utils/conversaoUnidades";
import "./AdminView.css";

// ── Helpers ───────────────────────────────────────────────────────

const uid   = () => Date.now().toString(36) + Math.random().toString(36).slice(2);
const fmtR  = (v) => "R$ " + Number(v ?? 0).toFixed(2);
const fmtDt = (d) => d ? new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "—";


const STATUS_COMPRA = {
  pendente:  { label: "Pendente",  color: "#f59e0b" },
  pago:      { label: "Pago",      color: varColor(C.green)   },
  cancelado: { label: "Cancelado", color: varColor(C.muted)   },
};

// ── Shared UI ─────────────────────────────────────────────────────

function Field({ label, children }) {
  return (
    <div className="admin__field">
      <div className="admin__field-label">
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
      className={`admin__input${disabled ? " admin__input--disabled" : ""}`}
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
      className="admin__textarea"
    />
  );
}

function ModalBase({ title, onClose, onSave, saveLabel = "Salvar", saving, width = 540, children }) {
  return createPortal(
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      className="admin__modal-overlay"
    >
      <div className="admin__modal" style={{ maxWidth: width }}>
        <div className="admin__modal-topo">
          <div className="admin__modal-titulo">{title}</div>
          <button
            onClick={onClose}
            className="admin__modal-fechar"
          >
            <LuX size={16} />
          </button>
        </div>
        {children}
        <div className="admin__modal-botoes">
          <button onClick={onClose} className="admin__modal-cancelar">
            Cancelar
          </button>
          <button
            onClick={onSave}
            disabled={saving}
            className="admin__modal-salvar"
            style={{ background: saving ? varColor(C.faint) : varColor(C.accent), cursor: saving ? "not-allowed" : "pointer" }}
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
    <div onClick={e => { if (e.target === e.currentTarget) onCancel(); }} className="admin__delete-overlay">
      <div className="admin__delete-modal">
        <div className="admin__delete-titulo">Confirmar exclusão</div>
        <div className="admin__delete-msg">{msg}</div>
        <div className="admin__delete-botoes">
          <button onClick={onCancel} className="admin__delete-cancelar">Cancelar</button>
          <button onClick={onConfirm} className="admin__delete-confirmar">Excluir</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function CardBtn({ onClick, children }) {
  return (
    <button onClick={onClick} className="admin__card-btn">
      {children}
    </button>
  );
}

function EmptyMsg({ icon: Icon, msg }) {
  return (
    <div className="admin__empty">
      <div className="admin__empty-icone"><Icon size={44} /></div>
      <div className="admin__empty-msg">{msg}</div>
    </div>
  );
}

function AddBtn({ onClick, label }) {
  return (
    <button onClick={onClick} className="admin__add-btn">
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
      <div className="admin__aba-header">
        <div className="admin__aba-contagem" style={{ fontSize: sz.fontSm + 1 }}>
          {fichas.length} ficha{fichas.length !== 1 ? "s" : ""} cadastrada{fichas.length !== 1 ? "s" : ""}
        </div>
        <AddBtn onClick={abrirNova} label="Nova Ficha" />
      </div>

      {fichas.length === 0 ? (
        <EmptyMsg icon={LuClipboardList} msg="Nenhuma ficha técnica cadastrada" />
      ) : (
        <div className="fichas-tab__grid">
          {fichas.map(f => {
            const ings          = f.ingredientes ?? [];
            const ct            = ings.reduce((s, ing) => s + (parseFloat(ing.qtd) || 0) * (parseFloat(ing.custoUnit) || 0), 0);
            const cp            = ct / (parseFloat(f.rendimento) || 1);
            const prodCard      = f.produtoId ? products.find(p => p.id === f.produtoId) : null;
            const nomeCard      = prodCard?.name ?? f.nome ?? "Sem produto";
            const emojiCard     = prodCard?.emoji;
            return (
              <div key={f.id} className="fichas-tab__card">

                {/* Cabeçalho */}
                <div className="fichas-tab__card-topo">
                  <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                    {emojiCard && <span style={{ fontSize: 22, flexShrink: 0 }}>{emojiCard}</span>}
                    <div>
                      <div className="fichas-tab__card-nome" style={{ fontSize: sz.fontBase + 2 }}>{nomeCard}</div>
                      {f.categoria && <div className="fichas-tab__card-categoria" style={{ fontSize: sz.fontSm + 1 }}>{f.categoria}</div>}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    <CardBtn onClick={() => abrirEditar(f)}><LuPencil size={12} /></CardBtn>
                    <CardBtn onClick={() => setDeleteId(f.id)}><LuTrash2 size={12} /></CardBtn>
                  </div>
                </div>

                {/* KPIs */}
                <div className="fichas-tab__kpis">
                  <div className="fichas-tab__kpi">
                    <div className="fichas-tab__kpi-label">Rendimento</div>
                    <div className="fichas-tab__kpi-valor" style={{ fontSize: sz.fontBase + 1 }}>{f.rendimento || "—"} porç.</div>
                  </div>
                  <div className="fichas-tab__kpi fichas-tab__kpi--custo" style={{ background: alfa(C.green, "10"), borderColor: alfa(C.green, "33") }}>
                    <div className="fichas-tab__kpi-label">Custo/porção</div>
                    <div className="fichas-tab__kpi-valor" style={{ fontSize: sz.fontBase + 1, color: varColor(C.green) }}>{fmtR(cp)}</div>
                  </div>
                </div>

                {/* Lista de ingredientes */}
                {ings.length > 0 && (
                  <div className="fichas-tab__ing-tabela">
                    {/* Cabeçalho da tabela */}
                    <div className="fichas-tab__ing-tabela-header">
                      <div className="fichas-tab__ing-th">Ingrediente</div>
                      <div className="fichas-tab__ing-th" style={{ textAlign: "center" }}>Necessário</div>
                      <div className="fichas-tab__ing-th" style={{ textAlign: "right" }}>Em estoque</div>
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
                      const corEstq    = qtdEstq === null ? varColor(C.muted) : qtdEstq === 0 ? varColor(C.red) : suficiente ? varColor(C.green) : "#f59e0b";
                      const ueLabel    = produto ? labelEstoque(produto) : "";
                      const ucLabel    = produto ? labelConsumo(produto) : (ing.unidade || "");
                      const temConv    = produto ? temConversaoConsumo(produto) : false;
                      return (
                        <div
                          key={i}
                          className="fichas-tab__ing-linha"
                          style={{ borderBottom: i < ings.length - 1 ? `1px solid var(${C.border})` : "none" }}
                        >
                          {/* Nome */}
                          <div className="fichas-tab__ing-nome">
                            {emojiShow
                              ? <span style={{ fontSize: 18, flexShrink: 0 }}>{emojiShow}</span>
                              : <LuPackage size={13} color={varColor(C.muted)} style={{ flexShrink: 0 }} />}
                            <span className="fichas-tab__ing-nome-texto">
                              {nomeShow || <span style={{ color: varColor(C.muted), fontStyle: "italic" }}>sem nome</span>}
                            </span>
                            {produto && (
                              <LuLink size={10} color={varColor(C.accent)} style={{ flexShrink: 0 }} title="Vinculado ao estoque" />
                            )}
                          </div>

                          {/* Qtd necessária */}
                          <div style={{ fontSize: 14, fontWeight: 700, color: varColor(C.text), textAlign: "center" }}>
                            {qtdNec > 0 ? (
                              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
                                <span>{fmtQtd(qtdNec)} {ucLabel}</span>
                                {temConv && (
                                  <span style={{ fontSize: 13, color: varColor(C.muted), fontWeight: 500 }}>
                                    ={fmtQtd(qtdNecEst)} {ueLabel}
                                  </span>
                                )}
                              </div>
                            ) : <span style={{ color: varColor(C.muted) }}>—</span>}
                          </div>

                          {/* Qtd em estoque */}
                          <div style={{ textAlign: "right" }}>
                            {qtdEstq === null ? (
                              <span style={{ fontSize: 14, color: varColor(C.muted) }}>—</span>
                            ) : (
                              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 1 }}>
                                <span className="fichas-tab__ing-estoque-valor" style={{
                                  color: corEstq,
                                  background: alfa(corEstq, "15"), border: `1px solid ${alfa(corEstq, "44")}`,
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
                  <div className="fichas-tab__vazio-ing">
                    Nenhum ingrediente cadastrado
                  </div>
                )}

                {/* Custo total */}
                {ct > 0 && (
                  <div className="fichas-tab__custo-total">
                    Custo total dos ingredientes: <strong style={{ color: varColor(C.text) }}>{fmtR(ct)}</strong>
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
                  <div className="fichas-tab__produto-vinculado" style={{ background: alfa(C.accent, "10") }}>
                    <span style={{ fontSize: 18, flexShrink: 0 }}>{produtoVinculado.emoji || "📦"}</span>
                    <span style={{ flex: 1, fontWeight: 700, fontSize: 16, color: varColor(C.text), overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{produtoVinculado.name}</span>
                    <button type="button" onClick={() => { setF("produtoId", null); setF("nome", ""); setF("categoria", ""); setBuscaPrato(""); setShowPratoDD(false); }} style={{ background: "none", border: "none", cursor: "pointer", color: varColor(C.muted), display: "flex", padding: 2 }}><LuX size={13} /></button>
                  </div>
                ) : (
                  <div style={{ position: "relative" }}>
                    <LuSearch size={13} color={varColor(C.muted)} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", zIndex: 1 }} />
                    <input
                      ref={buscaPratoRef}
                      value={buscaPrato}
                      onChange={e => { setBuscaPrato(e.target.value); setShowPratoDD(true); }}
                      onFocus={() => setShowPratoDD(true)}
                      onBlur={() => setTimeout(() => setShowPratoDD(false), 150)}
                      placeholder="Buscar produto..."
                      style={{ width: "100%", padding: "8px 10px 8px 30px", borderRadius: 9, border: `1.5px solid var(${C.border})`, background: varColor(C.surface), color: varColor(C.text), fontSize: 16, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }}
                    />
                    {showPratoDD && (
                      <div className="fichas-tab__dropdown">
                        {pratoElegiveis.length === 0 ? (
                          <div style={{ padding: "14px 12px", color: varColor(C.muted), fontSize: 15, textAlign: "center" }}>Nenhum produto encontrado</div>
                        ) : pratoElegiveis.map(p => (
                          <button
                            key={p.id}
                            type="button"
                            onMouseDown={() => { setF("produtoId", p.id); setF("nome", p.name); setF("categoria", p.category ?? ""); setBuscaPrato(""); setShowPratoDD(false); }}
                            className="fichas-tab__dropdown-item"
                            onMouseEnter={e => e.currentTarget.style.background = varColor(C.surface)}
                            onMouseLeave={e => e.currentTarget.style.background = "none"}
                          >
                            <span style={{ fontSize: 17, flexShrink: 0 }}>{p.emoji || "📦"}</span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontWeight: 600, fontSize: 15, color: varColor(C.text), overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
                              {p.category && <div style={{ fontSize: 13, color: varColor(C.muted) }}>{p.category}</div>}
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
              <div className="fichas-tab__categoria-preenchida" style={{ color: form.categoria ? varColor(C.text) : varColor(C.muted) }}>
                {form.categoria || "Preenchida ao vincular produto"}
              </div>
            </Field>
            <Field label="Rendimento">
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Inp type="number" value={form.rendimento} onChange={v => setF("rendimento", v)} placeholder="1" />
                <span style={{ fontSize: 15, fontWeight: 700, color: produtoVinculado ? varColor(C.accent) : varColor(C.muted), whiteSpace: "nowrap", flexShrink: 0 }}>
                  {produtoVinculado ? (labelConsumo(produtoVinculado) || labelEstoque(produtoVinculado)) : "un"}
                </span>
              </div>
            </Field>
          </div>

          {/* Painel de ingredientes — 2 colunas */}
          <div style={{ display: "grid", gridTemplateColumns: isNarrow ? "1fr" : "1fr 280px", gap: 14, alignItems: "start" }}>

            {/* Esquerda: lista de ingredientes adicionados */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: varColor(C.muted), textTransform: "uppercase", letterSpacing: 1 }}>
                Ingredientes da receita
              </div>

              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                {/* Cabeçalho das colunas */}
                {form.ingredientes.length > 0 && (
                  <div style={{ display: "grid", gridTemplateColumns: isNarrow ? "1fr 56px 44px 28px" : "1fr 64px 54px 80px 28px", gap: 6, paddingBottom: 4, borderBottom: `1px solid var(${C.border})` }}>
                    {(isNarrow ? ["Ingrediente", "Qtd", "Un", ""] : ["Ingrediente", "Qtd", "Un", "R$/un", ""]).map((h, i) => (
                      <div key={i} style={{ fontSize: 13, fontWeight: 700, color: varColor(C.muted), textTransform: "uppercase", letterSpacing: 0.8, textAlign: i > 0 ? "center" : "left" }}>{h}</div>
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
                      <div className="fichas-tab__ing-chip" style={{ background: alfa(C.accent, "12"), border: `1px solid ${alfa(C.accent, "33")}` }}>
                        {emojiChip && <span style={{ fontSize: 18, flexShrink: 0 }}>{emojiChip}</span>}
                        <span style={{ fontWeight: 600, fontSize: 16, color: varColor(C.text), overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{nomeChip}</span>
                        <LuLink size={11} color={varColor(C.accent)} style={{ flexShrink: 0 }} />
                      </div>
                    ) : (
                      <input
                        value={ing.nome}
                        onChange={e => setIng(i, "nome", e.target.value)}
                        placeholder="Nome do ingrediente"
                        className="fichas-tab__ing-input"
                      />
                    )}
                    <input
                      type="number" value={ing.qtd} onChange={e => setIng(i, "qtd", e.target.value)}
                      placeholder="0"
                      className="fichas-tab__ing-input"
                      style={{ textAlign: "center" }}
                    />
                    <input
                      value={ing.unidade} onChange={e => setIng(i, "unidade", e.target.value)}
                      placeholder="un"
                      className="fichas-tab__ing-input"
                      style={{ textAlign: "center" }}
                    />
                    {!isNarrow && (
                      <input
                        type="number" value={ing.custoUnit} onChange={e => setIng(i, "custoUnit", e.target.value)}
                        placeholder="0,00"
                        className="fichas-tab__ing-input"
                        style={{ textAlign: "right" }}
                      />
                    )}
                    <button onClick={() => removeIng(i)} className="fichas-tab__btn-remover-ing">
                      <LuX size={12} />
                    </button>
                  </div>
                  );
                })}

                {form.ingredientes.length === 0 && (
                  <div style={{ fontSize: 16, color: varColor(C.muted), padding: "24px 0", textAlign: "center", border: `1.5px dashed var(${C.border})`, borderRadius: 10 }}>
                    Selecione itens do estoque ao lado<br />
                    <span style={{ fontSize: 18 }}>ou adicione manualmente</span>
                  </div>
                )}

                {/* Botão manual */}
                <button
                  onClick={adicionarManual}
                  className="fichas-tab__btn-manual"
                >
                  <LuPlus size={12} /> Adicionar manualmente
                </button>
              </div>

              {/* Resumo de custo */}
              {form.ingredientes.length > 0 && (
                <div className="fichas-tab__resumo-custo">
                  <div style={{ fontSize: 18, color: varColor(C.muted) }}>
                    Custo total: <strong style={{ color: varColor(C.text) }}>{fmtR(custoTotal)}</strong>
                  </div>
                  <div style={{ fontSize: 18, color: varColor(C.muted) }}>
                    Por porção: <strong style={{ color: varColor(C.green) }}>{fmtR(custoPorcao)}</strong>
                  </div>
                </div>
              )}
            </div>

            {/* Direita: painel de busca no estoque */}
            <div className="fichas-tab__painel-estoque" style={{ height: isNarrow ? "auto" : 380, minHeight: isNarrow ? 200 : "unset" }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: varColor(C.muted), textTransform: "uppercase", letterSpacing: 1 }}>
                Itens do Estoque
              </div>

              {/* Campo de busca */}
              <div style={{ position: "relative" }}>
                <LuSearch size={13} color={varColor(C.muted)} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
                <input
                  ref={buscaRef}
                  value={busca}
                  onChange={e => setBusca(e.target.value)}
                  placeholder="Buscar produto..."
                  style={{
                    width: "100%", padding: "8px 10px 8px 30px",
                    borderRadius: 9, border: `1.5px solid var(${C.border})`,
                    background: varColor(C.card), color: varColor(C.text), fontSize: 16,
                    fontFamily: "inherit", outline: "none", boxSizing: "border-box",
                  }}
                />
                {busca && (
                  <button onClick={() => setBusca("")} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: varColor(C.muted), display: "flex", padding: 2 }}>
                    <LuX size={12} />
                  </button>
                )}
              </div>

              {/* Filtro de categorias */}
              <div>
                <button
                  type="button"
                  onClick={() => setShowFiltroIng(v => !v)}
                  className="fichas-tab__filtro-toggle"
                  style={{
                    borderColor: catFiltroIng !== "Todos" ? varColor(C.accent) : varColor(C.border),
                    background: catFiltroIng !== "Todos" ? alfa(C.accent, "12") : varColor(C.card),
                    color: catFiltroIng !== "Todos" ? varColor(C.accent) : varColor(C.muted),
                  }}
                >
                  <LuSlidersHorizontal size={13} />
                  Filtro{catFiltroIng !== "Todos" ? `: ${catFiltroIng}` : ""}
                  <LuChevronDown size={13} style={{ transform: showFiltroIng ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }} />
                </button>

                {showFiltroIng && (
                  <div className="fichas-tab__filtro-dropdown">
                    {categoriasIng.map(cat => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => { setCatFiltroIng(cat); if (cat !== "Todos") setShowFiltroIng(false); }}
                        className="fichas-tab__filtro-chip"
                        style={{
                          borderColor: catFiltroIng === cat ? varColor(C.accent) : varColor(C.border),
                          background: catFiltroIng === cat ? varColor(C.accent) : varColor(C.card),
                          color: catFiltroIng === cat ? "#fff" : varColor(C.muted),
                        }}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Lista de produtos */}
              <div className="fichas-tab__lista-produtos" style={{ maxHeight: isNarrow ? 200 : "unset" }}>
                {produtosFiltrados.length === 0 ? (
                  <div style={{ fontSize: 18, color: varColor(C.muted), textAlign: "center", padding: "20px 0" }}>
                    Nenhum produto encontrado
                  </div>
                ) : (
                  produtosFiltrados.map(p => {
                    const jaAdicionado = adicionados.has(p.id);
                    return (
                      <button
                        key={p.id}
                        onClick={() => !jaAdicionado && adicionarDoProduto(p)}
                        className="fichas-tab__produto-item"
                        style={{
                          borderColor: jaAdicionado ? alfa(C.accent, "44") : "transparent",
                          background: jaAdicionado ? alfa(C.accent, "0c") : "none",
                          cursor: jaAdicionado ? "default" : "pointer",
                        }}
                        onMouseEnter={e => { if (!jaAdicionado) e.currentTarget.style.background = varColor(C.faint); }}
                        onMouseLeave={e => { if (!jaAdicionado) e.currentTarget.style.background = "none"; }}
                      >
                        <span style={{ fontSize: 17, flexShrink: 0 }}>{p.emoji || "📦"}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="fichas-tab__produto-item-nome" style={{ color: jaAdicionado ? varColor(C.accent) : varColor(C.text) }}>{p.name}</div>
                          <div className="fichas-tab__produto-item-categoria">{p.category}</div>
                        </div>
                        {jaAdicionado ? (
                          <LuCheck size={13} color={varColor(C.accent)} style={{ flexShrink: 0 }} />
                        ) : (
                          <LuPlus size={13} color={varColor(C.muted)} style={{ flexShrink: 0 }} />
                        )}
                      </button>
                    );
                  })
                )}
              </div>

              <div className="fichas-tab__contador-produtos">
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
          msg={<><strong>{fichas.find(f => f.id === deleteId)?.nome}</strong> será removida permanentemente.</>}
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
      <div className="admin__aba-header">
        <div className="admin__aba-contagem" style={{ fontSize: sz.fontSm + 1 }}>{fornecedores.length} fornecedor{fornecedores.length !== 1 ? "es" : ""}</div>
        <AddBtn onClick={abrirNovo} label="Novo Fornecedor" />
      </div>

      {fornecedores.length === 0 ? (
        <EmptyMsg icon={LuTruck} msg="Nenhum fornecedor cadastrado" />
      ) : (
        <div className="admin__tabela-moldura">
          <table className="admin__tabela">
            <thead>
              <tr style={{ borderBottom: `1px solid var(${C.border})` }}>
                {["Nome", "Categoria", "Contato", "Telefone", ""].map((h, i) => (
                  <th key={i} className="admin__th">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {fornecedores.map(f => (
                <tr key={f.id} className="admin__tr" onMouseEnter={e => e.currentTarget.style.background = varColor(C.surface)} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  <td className="admin__td" style={{ fontWeight: 700, fontSize: sz.fontBase }}>{f.nome}</td>
                  <td className="admin__td">
                    {f.categoria
                      ? <span className="admin__tag" style={{ fontSize: sz.fontSm + 1 }}>{f.categoria}</span>
                      : <span style={{ color: varColor(C.muted) }}>—</span>}
                  </td>
                  <td className="admin__td" style={{ fontSize: sz.fontBase, color: varColor(C.muted) }}>{f.contato || "—"}</td>
                  <td className="admin__td" style={{ fontSize: sz.fontBase, color: varColor(C.muted) }}>{f.telefone || "—"}</td>
                  <td className="admin__td" style={{ textAlign: "right" }}>
                    <div className="admin__acoes-linha">
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
        <DeleteConfirm msg={<><strong>{fornecedores.find(f => f.id === deleteId)?.nome}</strong> será removido permanentemente.</>} onCancel={() => setDeleteId(null)} onConfirm={excluir} />
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
      <div className="admin__aba-header">
        <div className="admin__aba-contagem" style={{ fontSize: sz.fontSm + 1 }}>{compras.length} compra{compras.length !== 1 ? "s" : ""} registrada{compras.length !== 1 ? "s" : ""}</div>
        <AddBtn onClick={abrirNova} label="Registrar Compra" />
      </div>

      {compras.length === 0 ? (
        <EmptyMsg icon={LuShoppingCart} msg="Nenhuma compra registrada" />
      ) : (
        <div className="admin__tabela-moldura">
          <table className="admin__tabela">
            <thead>
              <tr style={{ borderBottom: `1px solid var(${C.border})` }}>
                {["Data", "Fornecedor", "Itens", "Total", "Status", ""].map((h, i) => (
                  <th key={i} className="admin__th" style={{ textAlign: i >= 2 ? "right" : "left" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {compras.map(c => {
                const st = STATUS_COMPRA[c.status] ?? STATUS_COMPRA.pendente;
                return (
                  <tr key={c.id} className="admin__tr" onMouseEnter={e => e.currentTarget.style.background = varColor(C.surface)} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    <td className="admin__td" style={{ fontSize: sz.fontBase, color: varColor(C.muted), whiteSpace: "nowrap" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}><LuCalendar size={13} /> {fmtDt(c.data)}</div>
                    </td>
                    <td className="admin__td" style={{ fontWeight: 700, fontSize: sz.fontBase }}>{c.fornecedor}</td>
                    <td className="admin__td" style={{ textAlign: "right", fontSize: sz.fontBase, color: varColor(C.muted) }}>{c.itens?.length ?? 0} {(c.itens?.length ?? 0) === 1 ? "item" : "itens"}</td>
                    <td className="admin__td" style={{ textAlign: "right", fontWeight: 800, fontSize: sz.fontBase, color: varColor(C.green) }}>{fmtR(c.total)}</td>
                    <td className="admin__td" style={{ textAlign: "right" }}>
                      <span className="admin__tag" style={{ fontSize: sz.fontSm + 1, background: alfa(st.color, "18"), border: `1px solid ${alfa(st.color, "44")}`, color: st.color }}>{st.label}</span>
                    </td>
                    <td className="admin__td" style={{ textAlign: "right" }}>
                      <div className="admin__acoes-linha">
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
                <select value={form.fornecedor} onChange={e => setF("fornecedor", e.target.value)} style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: `1.5px solid var(${C.border})`, background: varColor(C.surface), color: form.fornecedor ? varColor(C.text) : varColor(C.muted), fontSize: 17, fontFamily: "inherit", outline: "none", cursor: "pointer" }}>
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
              <div style={{ fontSize: 14, fontWeight: 700, color: varColor(C.muted), textTransform: "uppercase", letterSpacing: 1 }}>Itens</div>
              <button onClick={addItem} style={{ background: "none", border: `1px solid var(${C.border})`, borderRadius: 8, padding: "4px 10px", cursor: "pointer", color: varColor(C.accent), fontSize: 18, fontWeight: 700, fontFamily: "inherit", display: "flex", alignItems: "center", gap: 4 }}>
                <LuPlus size={12} /> Adicionar item
              </button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {form.itens.map((it, i) => (
                <div key={i} className="compras-tab__item-linha">
                  <Inp value={it.nome} onChange={v => setItem(i, "nome", v)} placeholder="Produto / insumo" />
                  <Inp type="number" value={it.qtd} onChange={v => setItem(i, "qtd", v)} placeholder="Qtd" />
                  <Inp value={it.unidade} onChange={v => setItem(i, "unidade", v)} placeholder="Un" />
                  <Inp type="number" value={it.valorUnit} onChange={v => setItem(i, "valorUnit", v)} placeholder="R$/un" />
                  <button onClick={() => removeItem(i)} style={{ background: "none", border: `1px solid var(${C.border})`, borderRadius: 8, cursor: "pointer", color: varColor(C.muted), padding: 6, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <LuX size={13} />
                  </button>
                </div>
              ))}
              {form.itens.length === 0 && <div style={{ fontSize: 16, color: varColor(C.muted), textAlign: "center", padding: "12px 0" }}>Nenhum item adicionado</div>}
            </div>
            {form.itens.length > 0 && (
              <div style={{ marginTop: 10, textAlign: "right", fontSize: 16, color: varColor(C.muted) }}>
                Total: <strong style={{ color: varColor(C.green), fontSize: 18 }}>{fmtR(totalForm)}</strong>
              </div>
            )}
          </div>

          <Field label="Status">
            <div style={{ display: "flex", gap: 8 }}>
              {Object.entries(STATUS_COMPRA).map(([id, s]) => (
                <button key={id} onClick={() => setF("status", id)} className="compras-tab__status-chip" style={{ borderColor: form.status === id ? s.color : varColor(C.border), background: form.status === id ? alfa(s.color, "18") : "none", color: form.status === id ? s.color : varColor(C.muted), fontSize: sz.fontSm + 1 }}>
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
      <div className="admin__aba-header">
        <div className="admin__aba-contagem" style={{ fontSize: sz.fontSm + 1 }}>
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
              <div key={tipo} className="impostos-tab__resumo-card" style={{ background: alfa(cor, "10"), border: `1px solid ${alfa(cor, "33")}` }}>
                <div className="impostos-tab__resumo-tipo" style={{ color: cor }}>{tipo}</div>
                <div className="impostos-tab__resumo-valor" style={{ color: cor }}>
                  {lista.length === 1 ? `${parseFloat(lista[0].aliquota) || 0}%` : `${lista.length} reg.`}
                </div>
                {lista.length > 1 && (
                  <div className="impostos-tab__resumo-media">média {aliqMedia.toFixed(1)}%</div>
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
            const cor = COR_TIPO[imp.tipo] ?? varColor(C.muted);
            return (
              <div key={imp.id} className="impostos-tab__card">
                {/* Alíquota */}
                <div className="impostos-tab__aliquota-box" style={{ background: alfa(cor, "12"), border: `1.5px solid ${alfa(cor, "33")}` }}>
                  <div className="impostos-tab__aliquota-valor" style={{ color: cor }}>
                    {parseFloat(imp.aliquota) || 0}
                  </div>
                  <div className="impostos-tab__aliquota-simbolo" style={{ color: cor }}>%</div>
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <span style={{ fontWeight: 800, fontSize: sz.fontBase + 1 }}>{imp.nome}</span>
                    <span className="impostos-tab__tipo-badge" style={{ background: alfa(cor, "15"), border: `1px solid ${alfa(cor, "44")}`, color: cor }}>
                      {imp.tipo}
                    </span>
                  </div>
                  {imp.categorias && (
                    <div className="impostos-tab__categorias" style={{ fontSize: sz.fontSm + 1 }}>
                      Categorias: {imp.categorias}
                    </div>
                  )}
                  {imp.observacoes && (
                    <div className="impostos-tab__observacoes" style={{ fontSize: sz.fontSm }}>
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
                    className="impostos-tab__tipo-chip"
                    style={{ borderColor: form.tipo === tipo ? cor : varColor(C.border), background: form.tipo === tipo ? alfa(cor, "18") : "none", color: form.tipo === tipo ? cor : varColor(C.muted), fontSize: sz.fontSm + 1 }}
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
                style={{ width: "100%", padding: "10px 36px 10px 12px", borderRadius: 10, border: `1.5px solid var(${C.border})`, background: varColor(C.surface), color: varColor(C.text), fontSize: 18, fontWeight: 700, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }}
              />
              <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: varColor(C.muted), fontWeight: 700, fontSize: 17 }}>%</span>
            </div>
            {form.aliquota && (
              <div style={{ fontSize: 18, color: varColor(C.muted), marginTop: 6 }}>
                Sobre R$ 1.000,00 → <strong style={{ color: varColor(C.text) }}>R$ {(parseFloat(form.aliquota) * 10).toFixed(2)}</strong> de imposto
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
          msg={<>O imposto <strong>{impostos.find(i => i.id === deleteId)?.nome}</strong> será removido.</>}
          onCancel={() => setDeleteId(null)}
          onConfirm={excluir}
        />
      )}
    </div>
  );
}

// ── Grade inicial ─────────────────────────────────────────────────

// Seções com `secao` são abas internas da Área Admin (abrem aqui mesmo).
// Seções com `to` são atalhos para telas próprias (Financeiro, Notas Emitidas,
// Config. Fiscal) — saíram da sidebar (que estava lotada) e agora vivem aqui.
// `perm` esconde o atalho de quem não tem acesso à tela de destino.
const SECOES = [
  { id: "fichas",         label: "Ficha Técnica",       desc: "Receitas, ingredientes e custo por porção",         Icon: LuClipboardList, color: varColor(C.accent) },
  { id: "fornecedores",   label: "Fornecedores",        desc: "Contatos e cadastro de fornecedores",               Icon: LuTruck,         color: varColor(C.blue)  },
  { id: "compras",        label: "Compras",             desc: "Registro de compras e pedidos",                     Icon: LuShoppingCart,  color: varColor(C.green) },
  { id: "impostos",       label: "Impostos",            desc: "Alíquotas por categoria",                           Icon: LuPercent,       color: "#f97316" },
  { id: "notas_fiscais",  label: "Notas de Entrada",    desc: "Importação de NF-e (XML) dos fornecedores",         Icon: LuFileText,      color: varColor(C.blue) },
  { id: "financeiro",     label: "Financeiro",          desc: "Fluxo de caixa, contas e lucro",                    Icon: LuWallet,        color: varColor(C.green), to: "/app/financeiro",    perm: "financeiro"    },
  { id: "notas_emitidas", label: "Notas Emitidas",      desc: "Consulta, reimpressão e cancelamento de NFC-e",     Icon: LuReceipt,       color: varColor(C.blue),  to: "/app/notas-fiscais", perm: "relatorio"     },
  { id: "config_fiscal",  label: "Configuração Fiscal", desc: "CNPJ, série, ambiente e certificado do emissor",    Icon: LuFileCheck,     color: "#f97316",         to: "/app/fiscal",        perm: "configuracoes" },
];

function GradeInicial({ sz, secoes, onSelecionar, onNavegar, fichas, fornecedores, compras, impostos, notasFiscaisCount }) {
  const contadores = { fichas: fichas.length, fornecedores: fornecedores.length, compras: compras.length, impostos: impostos.length, notas_fiscais: notasFiscaisCount };
  return (
    <div className="grade-inicial">
      <div className="grade-inicial__grid">
        {secoes.map(s => (
          <button
            key={s.id}
            onClick={() => s.to ? onNavegar(s.to) : onSelecionar(s.id)}
            className="grade-inicial__card"
            style={{ borderColor: varColor(C.border) }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = alfa(s.color, "66"); e.currentTarget.style.background = alfa(s.color, "08"); }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = varColor(C.border); e.currentTarget.style.background = varColor(C.card); }}
          >
            <div className="grade-inicial__icone" style={{ background: alfa(s.color, "18"), borderColor: alfa(s.color, "44") }}>
              <s.Icon size={20} color={s.color} />
            </div>
            <div style={{ flex: 1 }}>
              <div className="grade-inicial__titulo" style={{ fontSize: sz.fontBase }}>{s.label}</div>
              <div className="grade-inicial__desc" style={{ fontSize: sz.fontSm }}>{s.desc}</div>
            </div>
            <div className="grade-inicial__rodape">
              <span className="grade-inicial__contador" style={{ fontSize: 13 }}>
                {s.to
                  ? "Abrir"
                  : `${contadores[s.id]} ${contadores[s.id] === 1 ? "registro" : "registros"}`}
              </span>
              <LuChevronRight size={16} color={varColor(C.muted)} />
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
  const navigate = useNavigate();
  const { products, estoque, currentUser } = useApp();

  // Atalhos para telas próprias só aparecem para quem tem a permissão da
  // tela de destino (as abas internas ficam sempre visíveis).
  const secoesVisiveis = SECOES.filter(s => !s.perm || currentUser?.permissions?.[s.perm]);

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
    <div className="admin-view" style={{ background: varColor(C.bg) }}>
      <div className="admin-view__header" style={{ padding: `${sz.pad - 4}px ${sz.pad}px` }}>
        <div className="admin-view__header-topo">
          {secao && (
            <button
              onClick={() => setSecao(null)}
              className="admin-view__btn-voltar"
              style={{ fontSize: sz.fontSm + 1 }}
            >
              <LuArrowLeft size={15} /> Voltar
            </button>
          )}
          <div>
            <div className="admin-view__titulo" style={{ fontSize: sz.fontLg }}>{secaoAtual ? secaoAtual.label : "Gestão"}</div>
            <div className="admin-view__subtitulo" style={{ fontSize: sz.fontSm }}>
              {secaoAtual ? secaoAtual.desc : "Selecione uma área para gerenciar"}
            </div>
          </div>
        </div>
      </div>

      <div className="admin-view__conteudo" style={{ padding: sz.pad }}>
        {loading ? (
          <div className="admin-view__carregando">Carregando...</div>
        ) : !secao ? (
          <GradeInicial sz={sz} secoes={secoesVisiveis} onSelecionar={setSecao} onNavegar={navigate} fichas={fichas} fornecedores={fornecedores} compras={compras} impostos={impostos} notasFiscaisCount={notasFiscaisCount} />
        ) : (
          <>
            {secao === "fichas"       && <FichasTecnicasTab sz={sz} fichas={fichas}             products={products} estoque={estoque} onSave={handleSave} onDelete={handleSave} />}
            {secao === "fornecedores" && <FornecedoresTab   sz={sz} fornecedores={fornecedores} onSave={handleSave} onDelete={handleSave} />}
            {secao === "compras"      && <ComprasTab        sz={sz} compras={compras}           fornecedores={fornecedores} onSave={handleSave} onDelete={handleSave} />}
            {secao === "impostos"     && <ImpostosAdmin      sz={sz} />}
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
