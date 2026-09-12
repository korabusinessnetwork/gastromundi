import { useState, useEffect, useMemo, useRef } from "react";
import { fecharAoClicarFora } from "@/lib/overlayFechar";
import { useFecharModal } from "@/hooks/useFecharModal";
import { useFocoDoModal } from "@/hooks/useFocoDoModal";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useApp } from "@/context/AppContext";
import C from "@/constants/colors";
import { varColor } from "@/lib/tema";
import { alfa } from "@/constants/colorAlfa";
import { useResponsive } from "@/utils/hooks";
// O dia UTC vira às 21h de Brasília: a compra aberta à noite já nascia datada
// de amanhã.
import { hojeLocalISO } from "@/utils/datas";
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
// TD015: as linhas de ingrediente e de item de compra são adicionadas e removidas
// do meio da lista, então precisam de identidade própria. Não confundir com o `uid`
// local deste arquivo, que é id de entidade (a ficha, a compra) e vai para o banco.
// O `novoUid` daqui é chave de renderização, e sai do objeto antes de gravar.
import { novoUid, comUid, listaSemUid } from "@/lib/uidLista";
import "./AdminView.css";

// ── Helpers ───────────────────────────────────────────────────────

const uid   = () => Date.now().toString(36) + Math.random().toString(36).slice(2);
const fmtR  = (v) => "R$ " + Number(v ?? 0).toFixed(2);
const fmtDt = (d) => d ? new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "—";


const STATUS_COMPRA = {
  pendente:  { label: "Pendente",  color: varColor(C.warn)    },
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

// As duas saídas que faltavam aqui: a tecla Esc e o Tab preso dentro da caixa.
// O modal de ficha técnica, de fornecedor e de compra só fechava no clique no
// fundo, e o Tab passeava pela tela que está por baixo. Esc chama o MESMO
// caminho do "X", nunca um atalho que joga o formulário fora por fora.
function ModalBase({ title, onClose, onSave, saveLabel = "Salvar", saving, width = 540, children }) {
  const fundo = useFecharModal(onClose);
  const caixa = useFocoDoModal();
  return createPortal(
    <div
      {...fundo}
      className="admin__modal-overlay"
    >
      <div ref={caixa} tabIndex={-1} className="admin__modal" style={{ maxWidth: width }}>
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
    <div {...fecharAoClicarFora(onCancel)} className="admin__delete-overlay">
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
  const abrirEditar = (f) => { setForm({ ...f, ingredientes: comUid(f.ingredientes ?? []) }); setBusca(""); setBuscaPrato(""); setShowPratoDD(false); setCatFiltroIng("Todos"); setShowFiltroIng(false); };
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
        { ...ING_VAZIO, uid: novoUid(), produtoId: produto.id, nome: produto.name, emoji: produto.emoji || "", unidade: unidadePadrao },
      ],
    }));
    if (buscaRef.current) buscaRef.current.focus();
  };

  // Adicionar ingrediente manual
  const adicionarManual = () => setForm(f => ({
    ...f,
    ingredientes: [...f.ingredientes, { ...ING_VAZIO, uid: novoUid() }],
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
    // O `uid` das linhas é chave de renderização: o destino aqui é um jsonb livre,
    // que aceitaria o campo calado e o devolveria como se fosse dado da ficha.
    const nova = [...fichas.filter(f => f.id !== form.id), { ...form, ingredientes: listaSemUid(form.ingredientes ?? []) }];
    // Fecha só quando gravou. Antes o modal fechava mesmo com o banco
    // recusando, e a ficha inteira que o usuário digitou ia embora com ele.
    const { error } = await onSave("fichas_tecnicas", nova);
    setSaving(false);
    if (error) return;
    fechar();
  };

  const excluir = async () => {
    const { error } = await onDelete("fichas_tecnicas", fichas.filter(f => f.id !== deleteId));
    if (error) return;
    setDeleteId(null);
  };

  return (
    <div>
      <div className="admin__aba-header">
        <div className="admin__aba-contagem">
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
                    {emojiCard && <span className="fichas-tab__card-emoji" style={{ flexShrink: 0 }}>{emojiCard}</span>}
                    <div>
                      <div className="fichas-tab__card-nome">{nomeCard}</div>
                      {f.categoria && <div className="fichas-tab__card-categoria">{f.categoria}</div>}
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
                    <div className="fichas-tab__kpi-valor">{f.rendimento || "—"} porç.</div>
                  </div>
                  <div className="fichas-tab__kpi fichas-tab__kpi--custo" style={{ background: alfa(C.green, "10"), borderColor: alfa(C.green, "33") }}>
                    <div className="fichas-tab__kpi-label">Custo/porção</div>
                    <div className="fichas-tab__kpi-valor" style={{ color: varColor(C.green) }}>{fmtR(cp)}</div>
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
                      const corEstq    = qtdEstq === null ? varColor(C.muted) : qtdEstq === 0 ? varColor(C.red) : suficiente ? varColor(C.green) : varColor(C.warn);
                      const ueLabel    = produto ? labelEstoque(produto) : "";
                      const ucLabel    = produto ? labelConsumo(produto) : (ing.unidade || "");
                      const temConv    = produto ? temConversaoConsumo(produto) : false;
                      return (
                        // TD015: lista só de leitura de uma ficha já salva, e sem chave de domínio possível: o ingrediente manual nasce sem `produtoId` e o nome repete dentro da mesma ficha.
                        <div
                          key={i}
                          className="fichas-tab__ing-linha"
                          style={{ borderBottom: i < ings.length - 1 ? `1px solid var(${C.border})` : "none" }}
                        >
                          {/* Nome */}
                          <div className="fichas-tab__ing-nome">
                            {emojiShow
                              ? <span className="fichas-tab__ing-emoji" style={{ flexShrink: 0 }}>{emojiShow}</span>
                              : <LuPackage size={13} color={varColor(C.muted)} style={{ flexShrink: 0 }} />}
                            <span className="fichas-tab__ing-nome-texto">
                              {nomeShow || <span style={{ color: varColor(C.muted), fontStyle: "italic" }}>sem nome</span>}
                            </span>
                            {produto && (
                              <LuLink size={10} color={varColor(C.accent)} style={{ flexShrink: 0 }} title="Vinculado ao estoque" />
                            )}
                          </div>

                          {/* Qtd necessária */}
                          <div className="fichas-tab__ing-qtd" style={{ fontWeight: 700, color: varColor(C.text), textAlign: "center" }}>
                            {qtdNec > 0 ? (
                              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
                                <span>{fmtQtd(qtdNec)} {ucLabel}</span>
                                {temConv && (
                                  <span className="fichas-tab__ing-qtd-conv" style={{ color: varColor(C.muted), fontWeight: 500 }}>
                                    ={fmtQtd(qtdNecEst)} {ueLabel}
                                  </span>
                                )}
                              </div>
                            ) : <span style={{ color: varColor(C.muted) }}>—</span>}
                          </div>

                          {/* Qtd em estoque */}
                          <div style={{ textAlign: "right" }}>
                            {qtdEstq === null ? (
                              <span className="fichas-tab__ing-estoque-vazio" style={{ color: varColor(C.muted) }}>—</span>
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
                    <span className="fichas-tab__vinculado-emoji" style={{ flexShrink: 0 }}>{produtoVinculado.emoji || "📦"}</span>
                    <span className="fichas-tab__vinculado-nome" style={{ flex: 1, fontWeight: 700, color: varColor(C.text), overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{produtoVinculado.name}</span>
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
                      className="fichas-tab__input-busca-prato"
                      style={{ width: "100%", padding: "8px 10px 8px 30px", borderRadius: 9, border: "1.5px solid var(--gm-input-border)", background: "var(--gm-input-bg)", color: varColor(C.text), fontFamily: "inherit", outline: "none", boxSizing: "border-box" }}
                    />
                    {showPratoDD && (
                      <div className="fichas-tab__dropdown">
                        {pratoElegiveis.length === 0 ? (
                          <div className="fichas-tab__dropdown-vazio" style={{ padding: "14px 12px", color: varColor(C.muted), textAlign: "center" }}>Nenhum produto encontrado</div>
                        ) : pratoElegiveis.map(p => (
                          <button
                            key={p.id}
                            type="button"
                            onMouseDown={() => { setF("produtoId", p.id); setF("nome", p.name); setF("categoria", p.category ?? ""); setBuscaPrato(""); setShowPratoDD(false); }}
                            className="fichas-tab__dropdown-item"
                            onMouseEnter={e => e.currentTarget.style.background = varColor(C.surface)}
                            onMouseLeave={e => e.currentTarget.style.background = "none"}
                          >
                            <span className="fichas-tab__dropdown-emoji" style={{ flexShrink: 0 }}>{p.emoji || "📦"}</span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div className="fichas-tab__dropdown-nome" style={{ fontWeight: 600, color: varColor(C.text), overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
                              {p.category && <div className="fichas-tab__dropdown-categoria" style={{ color: varColor(C.muted) }}>{p.category}</div>}
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
                <span className="fichas-tab__rendimento-unidade" style={{ fontWeight: 700, color: produtoVinculado ? varColor(C.accent) : varColor(C.muted), whiteSpace: "nowrap", flexShrink: 0 }}>
                  {produtoVinculado ? (labelConsumo(produtoVinculado) || labelEstoque(produtoVinculado)) : "un"}
                </span>
              </div>
            </Field>
          </div>

          {/* Painel de ingredientes — 2 colunas */}
          <div style={{ display: "grid", gridTemplateColumns: isNarrow ? "1fr" : "1fr 280px", gap: 14, alignItems: "start" }}>

            {/* Esquerda: lista de ingredientes adicionados */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div className="admin__secao-label" style={{ fontWeight: 700, color: varColor(C.muted), textTransform: "uppercase", letterSpacing: 1 }}>
                Ingredientes da receita
              </div>

              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                {/* Cabeçalho das colunas */}
                {form.ingredientes.length > 0 && (
                  <div style={{ display: "grid", gridTemplateColumns: isNarrow ? "1fr 56px 44px 28px" : "1fr 64px 54px 80px 28px", gap: 6, paddingBottom: 4, borderBottom: `1px solid var(${C.border})` }}>
                    {(isNarrow ? ["Ingrediente", "Qtd", "Un", ""] : ["Ingrediente", "Qtd", "Un", "R$/un", ""]).map((h, i) => (
                      // TD015: cabeçalho literal, escrito na linha acima, tamanho fixo.
                      <div key={i} className="fichas-tab__ing-col-header" style={{ fontWeight: 700, color: varColor(C.muted), textTransform: "uppercase", letterSpacing: 0.8, textAlign: i > 0 ? "center" : "left" }}>{h}</div>
                    ))}
                  </div>
                )}

                {form.ingredientes.map((ing, i) => {
                  // Sempre usa dados atuais do produto vinculado
                  const prodVinc   = ing.produtoId ? products.find(p => p.id === ing.produtoId) : null;
                  const nomeChip   = prodVinc?.name  ?? ing.nome;
                  const emojiChip  = prodVinc?.emoji ?? ing.emoji;
                  return (
                  <div key={ing.uid} style={{ display: "grid", gridTemplateColumns: isNarrow ? "1fr 56px 44px 28px" : "1fr 64px 54px 80px 28px", gap: 6, alignItems: "center" }}>
                    {/* Nome — chip se vinculado, input se manual */}
                    {prodVinc ? (
                      <div className="fichas-tab__ing-chip" style={{ background: alfa(C.accent, "12"), border: `1px solid ${alfa(C.accent, "33")}` }}>
                        {emojiChip && <span className="fichas-tab__ing-chip-emoji" style={{ flexShrink: 0 }}>{emojiChip}</span>}
                        <span className="fichas-tab__ing-chip-nome" style={{ fontWeight: 600, color: varColor(C.text), overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{nomeChip}</span>
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
                  <div className="fichas-tab__ing-vazio-msg" style={{ color: varColor(C.muted), padding: "24px 0", textAlign: "center", border: `1.5px dashed var(${C.border})`, borderRadius: 10 }}>
                    Selecione itens do estoque ao lado<br />
                    <span className="fichas-tab__ing-vazio-linha2">ou adicione manualmente</span>
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
                  <div className="fichas-tab__resumo-linha" style={{ color: varColor(C.muted) }}>
                    Custo total: <strong style={{ color: varColor(C.text) }}>{fmtR(custoTotal)}</strong>
                  </div>
                  <div className="fichas-tab__resumo-linha" style={{ color: varColor(C.muted) }}>
                    Por porção: <strong style={{ color: varColor(C.green) }}>{fmtR(custoPorcao)}</strong>
                  </div>
                </div>
              )}
            </div>

            {/* Direita: painel de busca no estoque */}
            <div className="fichas-tab__painel-estoque" style={{ height: isNarrow ? "auto" : 380, minHeight: isNarrow ? 200 : "unset" }}>
              <div className="admin__secao-label" style={{ fontWeight: 700, color: varColor(C.muted), textTransform: "uppercase", letterSpacing: 1 }}>
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
                  className="fichas-tab__input-busca-estoque"
                  style={{
                    width: "100%", padding: "8px 10px 8px 30px",
                    borderRadius: 9, border: "1.5px solid var(--gm-input-border)",
                    background: "var(--gm-input-bg)", color: varColor(C.text),
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
                  <div className="fichas-tab__lista-vazia" style={{ color: varColor(C.muted), textAlign: "center", padding: "20px 0" }}>
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
                        <span className="fichas-tab__produto-item-emoji" style={{ flexShrink: 0 }}>{p.emoji || "📦"}</span>
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
    const { error } = await onSave("fornecedores", nova);
    setSaving(false);
    if (error) return;
    fechar();
  };

  const excluir = async () => {
    const { error } = await onDelete("fornecedores", fornecedores.filter(f => f.id !== deleteId));
    if (error) return;
    setDeleteId(null);
  };

  return (
    <div>
      <div className="admin__aba-header">
        <div className="admin__aba-contagem">{fornecedores.length} fornecedor{fornecedores.length !== 1 ? "es" : ""}</div>
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
                  // TD015: cabeçalho literal da tabela de fichas, não vem de dado.
                  <th key={i} className="admin__th">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {fornecedores.map(f => (
                <tr key={f.id} className="admin__tr" onMouseEnter={e => e.currentTarget.style.background = varColor(C.surface)} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  <td className="admin__td admin__td--forte" style={{ fontWeight: 700 }}>{f.nome}</td>
                  <td className="admin__td">
                    {f.categoria
                      ? <span className="admin__tag">{f.categoria}</span>
                      : <span style={{ color: varColor(C.muted) }}>—</span>}
                  </td>
                  <td className="admin__td admin__td--simples" style={{ color: varColor(C.muted) }}>{f.contato || "—"}</td>
                  <td className="admin__td admin__td--simples" style={{ color: varColor(C.muted) }}>{f.telefone || "—"}</td>
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

  const abrirNova   = () => setForm({ ...COMPRA_VAZIA, id: uid(), data: hojeLocalISO() });
  const abrirEditar = (c) => setForm({ ...c, itens: comUid(c.itens ?? []) });
  const fechar      = () => setForm(null);
  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const addItem    = () => setForm(f => ({ ...f, itens: [...f.itens, { ...ITEM_VAZIO, uid: novoUid() }] }));
  const setItem    = (i, k, v) => setForm(f => ({ ...f, itens: f.itens.map((it, idx) => idx === i ? { ...it, [k]: v } : it) }));
  const removeItem = (i) => setForm(f => ({ ...f, itens: f.itens.filter((_, idx) => idx !== i) }));

  const totalForm = form ? form.itens.reduce((s, it) => s + (parseFloat(it.qtd) || 0) * (parseFloat(it.valorUnit) || 0), 0) : 0;

  const salvar = async () => {
    if (!form?.fornecedor?.trim()) return;
    setSaving(true);
    const forn = form.fornecedor === "__outro" ? (form._fornecedorCustom?.trim() || "") : form.fornecedor;
    const total = form.itens.reduce((s, it) => s + (parseFloat(it.qtd) || 0) * (parseFloat(it.valorUnit) || 0), 0);
    const { _fornecedorCustom, ...rest } = form;
    // Mesmo motivo da ficha: `config` é jsonb livre e guardaria o `uid` sem reclamar.
    const atualizada = [...compras.filter(c => c.id !== form.id), { ...rest, fornecedor: forn, total, itens: listaSemUid(rest.itens ?? []) }]
      .sort((a, b) => new Date(b.data) - new Date(a.data));
    const { error } = await onSave("compras", atualizada);
    setSaving(false);
    if (error) return;
    fechar();
  };

  const excluir = async () => {
    const { error } = await onDelete("compras", compras.filter(c => c.id !== deleteId));
    if (error) return;
    setDeleteId(null);
  };

  const fns = fornecedores.map(f => f.nome);

  return (
    <div>
      <div className="admin__aba-header">
        <div className="admin__aba-contagem">{compras.length} compra{compras.length !== 1 ? "s" : ""} registrada{compras.length !== 1 ? "s" : ""}</div>
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
                  // TD015: cabeçalho literal da tabela de compras, não vem de dado.
                  <th key={i} className="admin__th" style={{ textAlign: i >= 2 ? "right" : "left" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {compras.map(c => {
                const st = STATUS_COMPRA[c.status] ?? STATUS_COMPRA.pendente;
                return (
                  <tr key={c.id} className="admin__tr" onMouseEnter={e => e.currentTarget.style.background = varColor(C.surface)} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    <td className="admin__td admin__td--simples" style={{ color: varColor(C.muted), whiteSpace: "nowrap" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}><LuCalendar size={13} /> {fmtDt(c.data)}</div>
                    </td>
                    <td className="admin__td admin__td--forte" style={{ fontWeight: 700 }}>{c.fornecedor}</td>
                    <td className="admin__td admin__td--simples" style={{ textAlign: "right", color: varColor(C.muted) }}>{c.itens?.length ?? 0} {(c.itens?.length ?? 0) === 1 ? "item" : "itens"}</td>
                    <td className="admin__td admin__td--dinheiro" style={{ textAlign: "right", fontWeight: 800, color: varColor(C.green) }}>{fmtR(c.total)}</td>
                    <td className="admin__td" style={{ textAlign: "right" }}>
                      <span className="admin__tag" style={{ background: alfa(st.color, "18"), border: `1px solid ${alfa(st.color, "44")}`, color: st.color }}>{st.label}</span>
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
                <select value={form.fornecedor} onChange={e => setF("fornecedor", e.target.value)} className="compras-tab__select-fornecedor" style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1.5px solid var(--gm-input-border)", background: "var(--gm-input-bg)", color: form.fornecedor ? varColor(C.text) : varColor(C.muted), fontFamily: "inherit", outline: "none", cursor: "pointer" }}>
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
              <div className="admin__secao-label" style={{ fontWeight: 700, color: varColor(C.muted), textTransform: "uppercase", letterSpacing: 1 }}>Itens</div>
              <button onClick={addItem} className="compras-tab__btn-add-item" style={{ background: "none", border: `1px solid var(${C.border})`, borderRadius: 8, padding: "4px 10px", cursor: "pointer", color: varColor(C.accent), fontWeight: 700, fontFamily: "inherit", display: "flex", alignItems: "center", gap: 4 }}>
                <LuPlus size={12} /> Adicionar item
              </button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {form.itens.map((it, i) => (
                <div key={it.uid} className="compras-tab__item-linha">
                  <Inp value={it.nome} onChange={v => setItem(i, "nome", v)} placeholder="Produto / insumo" />
                  <Inp type="number" value={it.qtd} onChange={v => setItem(i, "qtd", v)} placeholder="Qtd" />
                  <Inp value={it.unidade} onChange={v => setItem(i, "unidade", v)} placeholder="Un" />
                  <Inp type="number" value={it.valorUnit} onChange={v => setItem(i, "valorUnit", v)} placeholder="R$/un" />
                  <button onClick={() => removeItem(i)} style={{ background: "none", border: `1px solid var(${C.border})`, borderRadius: 8, cursor: "pointer", color: varColor(C.muted), padding: 6, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <LuX size={13} />
                  </button>
                </div>
              ))}
              {form.itens.length === 0 && <div className="compras-tab__itens-vazio" style={{ color: varColor(C.muted), textAlign: "center", padding: "12px 0" }}>Nenhum item adicionado</div>}
            </div>
            {form.itens.length > 0 && (
              <div className="compras-tab__total-label" style={{ marginTop: 10, textAlign: "right", color: varColor(C.muted) }}>
                Total: <strong className="compras-tab__total-valor" style={{ color: varColor(C.green) }}>{fmtR(totalForm)}</strong>
              </div>
            )}
          </div>

          <Field label="Status">
            <div style={{ display: "flex", gap: 8 }}>
              {Object.entries(STATUS_COMPRA).map(([id, s]) => (
                <button key={id} onClick={() => setF("status", id)} className="compras-tab__status-chip" style={{ borderColor: form.status === id ? s.color : varColor(C.border), background: form.status === id ? alfa(s.color, "18") : "none", color: form.status === id ? s.color : varColor(C.muted) }}>
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

function GradeInicial({ sz, secoes, onSelecionar, onNavegar, fichas, fornecedores, compras, impostosCount, notasFiscaisCount }) {
  const contadores = { fichas: fichas.length, fornecedores: fornecedores.length, compras: compras.length, impostos: impostosCount, notas_fiscais: notasFiscaisCount };
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
              <div className="grade-inicial__titulo">{s.label}</div>
              <div className="grade-inicial__desc">{s.desc}</div>
            </div>
            <div className="grade-inicial__rodape">
              <span className="grade-inicial__contador">
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
  // O card de Impostos abre o `ImpostosAdmin`, que trabalha em `itens_fiscal`.
  // O contador vinha da chave `config.impostos`, abandonada junto com a tela
  // antiga: o card dizia "0 registros" para um estabelecimento com as
  // alíquotas todas configuradas.
  const [impostosCount,      setImpostosCount]      = useState(0);
  const [notasFiscaisCount,  setNotasFiscaisCount]  = useState(0);
  const [loading,            setLoading]            = useState(true);
  const [erroTela,           setErroTela]           = useState("");

  useEffect(() => {
    Promise.all([
      supabase.from("config").select("key, value")
        .in("key", ["fichas_tecnicas", "fornecedores", "compras"]),
      supabase.from("notas_fiscais").select("id", { count: "exact", head: true }),
      supabase.from("itens_fiscal").select("item_id", { count: "exact", head: true }),
    ]).then(([{ data, error }, { count }, { count: countFiscal }]) => {
      // Sem checar o erro, uma falha de leitura zerava fichas técnicas,
      // fornecedores e compras na tela — e quem estivesse cadastrando salvava
      // por cima, apagando tudo o que já existia no banco.
      if (error) {
        setErroTela("Não deu para carregar os dados do administrativo. Recarregue a página antes de salvar qualquer coisa.");
      } else if (data) {
        const get = (key) => { const r = data.find(d => d.key === key); return Array.isArray(r?.value) ? r.value : []; };
        setFichas(get("fichas_tecnicas"));
        setFornecedores(get("fornecedores"));
        setCompras(get("compras"));
      }
      setNotasFiscaisCount(count || 0);
      setImpostosCount(countFiscal || 0);
      setLoading(false);
    });
  }, []);

  // Devolve { error } e só atualiza a tela quando o banco confirmou: antes o
  // upsert não era conferido, então a ficha técnica aparecia salva na tela e
  // sumia no próximo carregamento.
  const handleSave = async (key, value) => {
    setErroTela("");
    const { error } = await supabase.from("config").upsert({ key, value });
    if (error) {
      setErroTela("Não deu para salvar. A alteração não foi gravada, tente de novo.");
      return { error };
    }
    if (key === "fichas_tecnicas") setFichas(value);
    if (key === "fornecedores")    setFornecedores(value);
    if (key === "compras")         setCompras(value);
    return { error: null };
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
            >
              <LuArrowLeft size={15} /> Voltar
            </button>
          )}
          <div>
            <div className="admin-view__titulo">{secaoAtual ? secaoAtual.label : "Gestão"}</div>
            <div className="admin-view__subtitulo">
              {secaoAtual ? secaoAtual.desc : "Selecione uma área para gerenciar"}
            </div>
          </div>
        </div>
      </div>

      <div className="admin-view__conteudo" style={{ padding: sz.pad }}>
        {erroTela && (
          <div className="admin-view__erro" role="alert">{erroTela}</div>
        )}
        {loading ? (
          <div className="admin-view__carregando">Carregando...</div>
        ) : !secao ? (
          <GradeInicial sz={sz} secoes={secoesVisiveis} onSelecionar={setSecao} onNavegar={navigate} fichas={fichas} fornecedores={fornecedores} compras={compras} impostosCount={impostosCount} notasFiscaisCount={notasFiscaisCount} />
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
