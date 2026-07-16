import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabase";
import C from "@/constants/colors";
import { alfa } from "@/constants/colorAlfa";
import { varColor } from "@/lib/tema";
import { LuPlus, LuPencil, LuTrash2, LuX, LuSave, LuTriangleAlert } from "react-icons/lu";

const CARD_W   = 110;
const CARD_H   = 96;
const CARD_GAP = 12;
const MIN_COLS = 4;
const MIN_ROWS = 3;

const EMPTY_FORM = { numero: "", capacidade: "4" };

function proximaPosicaoLivre(mesas) {
  if (mesas.length === 0) return { posicao_x: 1, posicao_y: 1 };
  const maxX = Math.max(...mesas.map(m => m.posicao_x ?? 1));
  return { posicao_x: maxX + 1, posicao_y: 1 };
}

export default function MesasAdmin({ sz }) {
  const [mesas,          setMesas]          = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [erro,           setErro]           = useState("");
  const [posicoesDirty,  setPosicoesDirty]  = useState(false);
  const [salvandoLayout, setSalvandoLayout] = useState(false);

  // Modal criar/editar
  const [modal,     setModal]     = useState(false);
  const [editando,  setEditando]  = useState(null);
  const [form,      setForm]      = useState(EMPTY_FORM);
  const [formPosX,  setFormPosX]  = useState(1);
  const [formPosY,  setFormPosY]  = useState(1);
  const [formErro,  setFormErro]  = useState("");
  const [salvando,  setSalvando]  = useState(false);

  // Modal confirmar exclusão
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deletando,     setDeletando]     = useState(false);

  // Drag
  const [dragging, setDragging] = useState(null); // numero da mesa sendo arrastada
  const containerRef = useRef(null);

  useEffect(() => { fetchMesas(); }, []);

  async function fetchMesas() {
    setLoading(true);
    setErro("");
    const { data, error } = await supabase
      .from("mesas")
      .select("numero,capacidade,posicao_x,posicao_y,status_manual")
      .order("numero");
    if (error) setErro("Erro ao carregar mesas.");
    else setMesas(data ?? []);
    setLoading(false);
  }

  // ── Modal helpers ────────────────────────────────────────────────

  function abrirNovo() {
    const pos = proximaPosicaoLivre(mesas);
    setEditando(null);
    setForm(EMPTY_FORM);
    setFormPosX(pos.posicao_x);
    setFormPosY(pos.posicao_y);
    setFormErro("");
    setModal(true);
  }

  function abrirEditar(mesa) {
    setEditando(mesa);
    setForm({ numero: mesa.numero, capacidade: String(mesa.capacidade ?? 4) });
    setFormErro("");
    setModal(true);
  }

  function fecharModal() {
    setModal(false);
    setEditando(null);
    setForm(EMPTY_FORM);
    setFormErro("");
  }

  async function salvar() {
    const numero     = form.numero.trim();
    const capacidade = Math.max(1, parseInt(form.capacidade) || 4);

    if (!editando && !numero) { setFormErro("Informe o número ou nome da mesa."); return; }
    if (salvando) return;

    if (!editando) {
      const existe = mesas.some(m => m.numero === numero);
      if (existe) { setFormErro("Já existe uma mesa com este número/nome."); return; }
    }

    setSalvando(true);
    setFormErro("");
    try {
      if (editando) {
        const { error } = await supabase
          .from("mesas")
          .update({ capacidade })
          .eq("numero", editando.numero);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("mesas")
          .insert({ numero, capacidade, posicao_x: formPosX, posicao_y: formPosY });
        if (error) throw error;
      }
      fecharModal();
      setPosicoesDirty(false);
      await fetchMesas();
    } catch {
      setFormErro("Erro ao salvar. Tente novamente.");
    } finally {
      setSalvando(false);
    }
  }

  // ── Exclusão ──────────────────────────────────────────────────────

  async function executarDelete() {
    if (!confirmDelete || deletando) return;
    setDeletando(true);
    const { error } = await supabase
      .from("mesas")
      .delete()
      .eq("numero", confirmDelete.numero);
    if (error) {
      setErro("Erro ao remover mesa.");
    } else {
      setMesas(prev => prev.filter(m => m.numero !== confirmDelete.numero));
      if (mesas.length <= 1) setPosicoesDirty(false);
    }
    setConfirmDelete(null);
    setDeletando(false);
  }

  // ── Drag and drop ─────────────────────────────────────────────────

  function handleDragStart(e, numero) {
    e.dataTransfer.setData("text/plain", numero);
    e.dataTransfer.effectAllowed = "move";
    setDragging(numero);
  }

  function handleDragEnd() {
    setDragging(null);
  }

  function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }

  function handleDrop(e) {
    e.preventDefault();
    if (!dragging || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const relX  = e.clientX - rect.left;
    const relY  = e.clientY - rect.top;
    const novoX = Math.max(1, Math.floor(relX / (CARD_W + CARD_GAP)) + 1);
    const novoY = Math.max(1, Math.floor(relY / (CARD_H + CARD_GAP)) + 1);
    setMesas(prev => prev.map(m =>
      m.numero === dragging ? { ...m, posicao_x: novoX, posicao_y: novoY } : m
    ));
    setPosicoesDirty(true);
    setDragging(null);
  }

  // ── Salvar layout em lote ─────────────────────────────────────────

  async function salvarLayout() {
    if (salvandoLayout) return;
    setSalvandoLayout(true);
    setErro("");
    try {
      const rows = mesas.map(m => ({
        numero:        m.numero,
        capacidade:    m.capacidade ?? 4,
        posicao_x:     m.posicao_x,
        posicao_y:     m.posicao_y,
        status_manual: m.status_manual ?? "livre",
      }));
      const { error } = await supabase
        .from("mesas")
        .upsert(rows, { onConflict: "tenant_id,numero" });
      if (error) throw error;
      setPosicoesDirty(false);
    } catch {
      setErro("Erro ao salvar layout. Tente novamente.");
    } finally {
      setSalvandoLayout(false);
    }
  }

  // ── Grid dimensions ───────────────────────────────────────────────

  const maxX    = mesas.length ? Math.max(MIN_COLS, ...mesas.map(m => m.posicao_x ?? 1)) : MIN_COLS;
  const maxY    = mesas.length ? Math.max(MIN_ROWS, ...mesas.map(m => m.posicao_y ?? 1)) : MIN_ROWS;
  const gridCols = maxX + 1; // +1 de buffer para drops
  const gridRows = maxY + 1;
  const containerW = gridCols * (CARD_W + CARD_GAP) - CARD_GAP;
  const containerH = gridRows * (CARD_H + CARD_GAP) - CARD_GAP;

  // ── Render ────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ color: varColor(C.muted), fontSize: sz.fontBase, padding: "40px 0", textAlign: "center" }}>
        Carregando…
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: sz.pad }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: sz.fontBase }}>Mesas</div>
          <div style={{ fontSize: sz.fontSm, color: varColor(C.muted), marginTop: 2 }}>
            {mesas.length} mesa{mesas.length !== 1 ? "s" : ""} cadastrada{mesas.length !== 1 ? "s" : ""}
            {mesas.length > 0 && " · arraste os cards para reposicionar"}
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {posicoesDirty && (
            <button
              onClick={salvarLayout}
              disabled={salvandoLayout}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "9px 18px", borderRadius: 10, border: "none",
                background: salvandoLayout ? varColor(C.faint) : varColor(C.green),
                color: "#fff", cursor: salvandoLayout ? "not-allowed" : "pointer",
                fontWeight: 700, fontSize: sz.fontSm, fontFamily: "inherit",
                boxShadow: salvandoLayout ? "none" : `0 2px 10px ${alfa(C.green, "44")}`,
                transition: "background 0.15s",
              }}
            >
              <LuSave size={14} /> {salvandoLayout ? "Salvando…" : "Salvar layout"}
            </button>
          )}
          <button
            onClick={abrirNovo}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              background: varColor(C.accent), border: "none", borderRadius: 10,
              color: "#fff", cursor: "pointer", fontWeight: 700,
              fontSize: sz.fontSm, padding: "10px 16px", fontFamily: "inherit",
              boxShadow: `0 2px 10px ${alfa(C.accent, "44")}`,
            }}
          >
            <LuPlus size={15} /> Nova Mesa
          </button>
        </div>
      </div>

      {/* Banner de erro */}
      {erro && (
        <div style={{
          padding: "10px 14px", borderRadius: 8,
          background: `${alfa(C.red, "12")}`, border: `1px solid ${alfa(C.red, "33")}`,
          color: varColor(C.red), fontSize: sz.fontSm,
          display: "flex", gap: 8, alignItems: "center",
        }}>
          <LuTriangleAlert size={15} style={{ flexShrink: 0 }} /> {erro}
        </div>
      )}

      {/* Mapa de mesas */}
      <div style={{
        background: varColor(C.card), border: `1px solid var(${C.border})`,
        borderRadius: 16, padding: sz.pad,
        overflowX: "auto", overflowY: "auto",
        maxHeight: "calc(100vh - 280px)",
      }}>
        {mesas.length === 0 ? (
          <div style={{ padding: "60px 24px", textAlign: "center", color: varColor(C.muted) }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🪑</div>
            <div style={{ fontWeight: 700, fontSize: sz.fontBase, color: varColor(C.text), marginBottom: 4 }}>
              Nenhuma mesa cadastrada
            </div>
            <div style={{ fontSize: sz.fontSm }}>
              Clique em "+ Nova Mesa" para cadastrar a primeira mesa.
            </div>
          </div>
        ) : (
          <div
            ref={containerRef}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            style={{
              position: "relative",
              width: containerW,
              height: containerH,
              // Grade visual pontilhada alinhada com as células
              backgroundImage: `radial-gradient(circle, var(${C.border}) 1.5px, transparent 1.5px)`,
              backgroundSize: `${CARD_W + CARD_GAP}px ${CARD_H + CARD_GAP}px`,
              backgroundPosition: `${Math.round((CARD_W + CARD_GAP) / 2)}px ${Math.round((CARD_H + CARD_GAP) / 2)}px`,
              borderRadius: 8,
            }}
          >
            {mesas.map(m => {
              const x = ((m.posicao_x ?? 1) - 1) * (CARD_W + CARD_GAP);
              const y = ((m.posicao_y ?? 1) - 1) * (CARD_H + CARD_GAP);
              return (
                <div
                  key={m.numero}
                  style={{
                    position: "absolute", left: x, top: y,
                    opacity: dragging === m.numero ? 0.35 : 1,
                    transition: dragging === m.numero ? "none" : "opacity 0.15s",
                  }}
                >
                  <CardMesaAdmin
                    mesa={m}
                    w={CARD_W} h={CARD_H} sz={sz}
                    onEdit={() => abrirEditar(m)}
                    onDelete={() => setConfirmDelete(m)}
                    onDragStart={e => handleDragStart(e, m.numero)}
                    onDragEnd={handleDragEnd}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Modal Criar/Editar ─────────────────────────────────────── */}
      {modal && createPortal(
        <div
          onClick={e => { if (e.target === e.currentTarget && !salvando) fecharModal(); }}
          style={{
            position: "fixed", inset: 0, zIndex: 9000,
            background: "rgba(0,0,0,0.72)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 24, fontFamily: "'Inter',system-ui,sans-serif",
          }}
        >
          <div style={{
            background: varColor(C.card), borderRadius: 20, width: "100%", maxWidth: 420,
            border: `1px solid var(${C.border})`,
            boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
            display: "flex", flexDirection: "column", gap: 20, padding: 28,
          }}>
            {/* Título */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontWeight: 800, fontSize: sz.fontBase + 1, color: varColor(C.text) }}>
                {editando ? "Editar Mesa" : "Nova Mesa"}
              </div>
              <button
                onClick={fecharModal}
                disabled={salvando}
                style={{ background: "none", border: "none", color: varColor(C.muted), cursor: "pointer", padding: 4, lineHeight: 0 }}
              >
                <LuX size={20} />
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {/* Número / Nome */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: varColor(C.muted), textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>
                  Número / Nome *
                </div>
                <input
                  autoFocus={!editando}
                  value={form.numero}
                  onChange={e => { setForm(f => ({ ...f, numero: e.target.value })); setFormErro(""); }}
                  onKeyDown={e => e.key === "Enter" && salvar()}
                  disabled={!!editando}
                  placeholder="Ex: 1, 2, Varanda A…"
                  maxLength={20}
                  style={{
                    width: "100%", padding: "12px 14px", borderRadius: 10,
                    border: `1.5px solid ${formErro && !form.numero.trim() && !editando ? varColor(C.red) + "88" : varColor(C.border)}`,
                    background: editando ? varColor(C.bg) : varColor(C.surface), color: varColor(C.text),
                    fontSize: sz.fontBase, fontFamily: "inherit", outline: "none",
                    boxSizing: "border-box", opacity: editando ? 0.55 : 1,
                  }}
                />
                {editando && (
                  <div style={{ fontSize: sz.fontSm, color: varColor(C.muted), marginTop: 4 }}>
                    O número é chave primária e não pode ser alterado.
                  </div>
                )}
              </div>

              {/* Capacidade */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: varColor(C.muted), textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>
                  Capacidade (pessoas)
                </div>
                <input
                  autoFocus={!!editando}
                  type="number"
                  min="1"
                  max="50"
                  value={form.capacidade}
                  onChange={e => setForm(f => ({ ...f, capacidade: e.target.value }))}
                  onKeyDown={e => e.key === "Enter" && salvar()}
                  style={{
                    width: "100%", padding: "12px 14px", borderRadius: 10,
                    border: `1.5px solid var(${C.border})`,
                    background: varColor(C.surface), color: varColor(C.text),
                    fontSize: sz.fontBase, fontFamily: "inherit", outline: "none",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              {formErro && (
                <div style={{
                  padding: "8px 12px", borderRadius: 8,
                  background: `${alfa(C.red, "12")}`, border: `1px solid ${alfa(C.red, "33")}`,
                  color: varColor(C.red), fontSize: sz.fontSm,
                }}>
                  {formErro}
                </div>
              )}
            </div>

            {/* Botões */}
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={fecharModal}
                disabled={salvando}
                style={{
                  flex: 1, padding: 12, borderRadius: 10,
                  border: `1px solid var(${C.border})`, background: "none",
                  color: varColor(C.muted), cursor: salvando ? "not-allowed" : "pointer",
                  fontWeight: 600, fontSize: sz.fontBase, fontFamily: "inherit",
                }}
              >
                Cancelar
              </button>
              <button
                onClick={salvar}
                disabled={((!form.numero.trim() && !editando)) || salvando}
                style={{
                  flex: 2, padding: 12, borderRadius: 10, border: "none",
                  background: (form.numero.trim() || editando) && !salvando ? varColor(C.accent) : varColor(C.surface),
                  color: (form.numero.trim() || editando) && !salvando ? "#fff" : varColor(C.muted),
                  cursor: (form.numero.trim() || editando) && !salvando ? "pointer" : "not-allowed",
                  fontWeight: 700, fontSize: sz.fontBase, fontFamily: "inherit",
                  transition: "background 0.15s",
                }}
              >
                {salvando ? "Salvando…" : editando ? "Salvar alterações" : "Criar mesa"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Modal Confirmar Exclusão ────────────────────────────────── */}
      {confirmDelete && createPortal(
        <div
          onClick={e => { if (e.target === e.currentTarget) setConfirmDelete(null); }}
          style={{
            position: "fixed", inset: 0, zIndex: 9100,
            background: "rgba(0,0,0,0.72)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 24, fontFamily: "'Inter',system-ui,sans-serif",
          }}
        >
          <div style={{
            background: varColor(C.card), borderRadius: 20, width: "100%", maxWidth: 400,
            border: `1px solid var(${C.border})`, padding: 28,
            display: "flex", flexDirection: "column", gap: 20,
          }}>
            <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
              <div style={{
                width: 44, height: 44, borderRadius: 12, flexShrink: 0,
                background: `${alfa(C.red, "18")}`, border: `1px solid ${alfa(C.red, "33")}`,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <LuTrash2 size={20} color={varColor(C.red)} />
              </div>
              <div>
                <div style={{ fontWeight: 800, fontSize: sz.fontBase, color: varColor(C.text) }}>
                  Remover Mesa {confirmDelete.numero}?
                </div>
                <div style={{ fontSize: sz.fontSm, color: varColor(C.muted), marginTop: 4, lineHeight: 1.5 }}>
                  Esta ação não pode ser desfeita. Pedidos e vendas anteriores vinculados à mesa não serão afetados.
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => setConfirmDelete(null)}
                style={{
                  flex: 1, padding: 12, borderRadius: 10,
                  border: `1px solid var(${C.border})`, background: "none",
                  color: varColor(C.muted), cursor: "pointer",
                  fontWeight: 600, fontSize: sz.fontBase, fontFamily: "inherit",
                }}
              >
                Cancelar
              </button>
              <button
                onClick={executarDelete}
                disabled={deletando}
                style={{
                  flex: 2, padding: 12, borderRadius: 10, border: "none",
                  background: deletando ? varColor(C.faint) : varColor(C.red),
                  color: "#fff", cursor: deletando ? "not-allowed" : "pointer",
                  fontWeight: 700, fontSize: sz.fontBase, fontFamily: "inherit",
                }}
              >
                {deletando ? "Removendo…" : "Sim, remover"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

// ── Card admin (sem status dinâmico) ───────────────────────────────

function CardMesaAdmin({ mesa, w, h, sz, onEdit, onDelete, onDragStart, onDragEnd }) {
  const [hover, setHover] = useState(false);

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: w, height: h, borderRadius: 14, boxSizing: "border-box",
        background: hover ? `${alfa(C.accent, "10")}` : varColor(C.surface),
        border: `2px solid ${hover ? varColor(C.accent) + "66" : varColor(C.border)}`,
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        gap: 3, padding: "6px 4px", userSelect: "none",
        cursor: "grab", position: "relative",
        transition: "border-color 0.12s, background 0.12s",
      }}
    >
      <div style={{ fontSize: sz.fontBase + 2, fontWeight: 900, color: varColor(C.text), lineHeight: 1 }}>
        {mesa.numero}
      </div>
      {mesa.capacidade != null && (
        <div style={{ fontSize: 11, color: varColor(C.muted), fontWeight: 600 }}>
          {mesa.capacidade}p
        </div>
      )}

      {/* Botões de ação — visíveis no hover */}
      {hover && (
        <div style={{ position: "absolute", top: 5, right: 5, display: "flex", gap: 4 }}>
          <button
            onClick={e => { e.stopPropagation(); onEdit(); }}
            title="Editar"
            onMouseDown={e => e.stopPropagation()}
            style={{
              width: 22, height: 22, borderRadius: 6,
              background: varColor(C.card), border: `1px solid var(${C.border})`,
              color: varColor(C.muted), cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              padding: 0, lineHeight: 0,
            }}
          >
            <LuPencil size={11} />
          </button>
          <button
            onClick={e => { e.stopPropagation(); onDelete(); }}
            title="Remover"
            onMouseDown={e => e.stopPropagation()}
            style={{
              width: 22, height: 22, borderRadius: 6,
              background: `${alfa(C.red, "18")}`, border: `1px solid ${alfa(C.red, "33")}`,
              color: varColor(C.red), cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              padding: 0, lineHeight: 0,
            }}
          >
            <LuTrash2 size={11} />
          </button>
        </div>
      )}
    </div>
  );
}
