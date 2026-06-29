import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabase";
import { sanitizeInput } from "@/utils/crypto";
import C from "@/constants/colors";
import { LuPlus, LuPencil, LuTrash2, LuX, LuPrinter, LuTriangleAlert } from "react-icons/lu";

const EMPTY_FORM = { nome: "", descricao: "", ativo: true };

function Toggle({ value, onChange, disabled }) {
  return (
    <button
      onClick={() => !disabled && onChange(!value)}
      disabled={disabled}
      style={{
        width: 48, height: 26, borderRadius: 13, border: "none", padding: 0,
        background: value ? C.green : C.faint,
        cursor: disabled ? "not-allowed" : "pointer",
        position: "relative", transition: "background 0.2s", flexShrink: 0,
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <span style={{
        position: "absolute", top: "50%", transform: "translateY(-50%)",
        left: value ? 25 : 3, width: 20, height: 20, borderRadius: "50%",
        background: "#fff", transition: "left 0.2s", display: "block",
        boxShadow: "0 1px 3px #0005",
      }} />
    </button>
  );
}

export default function LocaisImpressao({ sz }) {
  const [locais, setLocais]     = useState([]);
  const [loading, setLoading]   = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro]         = useState("");

  const [modal, setModal]   = useState(false);
  const [editando, setEditando] = useState(null); // objeto ou null
  const [form, setForm]     = useState(EMPTY_FORM);
  const [formErro, setFormErro] = useState("");

  const [confirmDelete, setConfirmDelete] = useState(null); // objeto local

  useEffect(() => { fetchLocais(); }, []);

  async function fetchLocais() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("locais_impressao")
        .select("id,nome,descricao,ativo,created_at")
        .order("created_at", { ascending: true });
      if (error) throw error;
      setLocais(data ?? []);
    } catch (e) {
      setErro("Erro ao carregar locais de impressão.");
    } finally {
      setLoading(false);
    }
  }

  function abrirNovo() {
    setEditando(null);
    setForm(EMPTY_FORM);
    setFormErro("");
    setModal(true);
  }

  function abrirEditar(local) {
    setEditando(local);
    setForm({ nome: local.nome, descricao: local.descricao ?? "", ativo: local.ativo });
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
    const nome = sanitizeInput(form.nome, 80).trim();
    if (!nome) { setFormErro("O nome do local é obrigatório."); return; }
    if (salvando) return;
    setSalvando(true);
    setFormErro("");
    try {
      const payload = {
        nome,
        descricao: sanitizeInput(form.descricao ?? "", 200).trim() || null,
        ativo: form.ativo,
      };
      if (editando) {
        const { error } = await supabase
          .from("locais_impressao")
          .update(payload)
          .eq("id", editando.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("locais_impressao")
          .insert(payload);
        if (error) throw error;
      }
      fecharModal();
      await fetchLocais();
    } catch (e) {
      setFormErro("Erro ao salvar. Tente novamente.");
    } finally {
      setSalvando(false);
    }
  }

  async function toggleAtivo(local) {
    try {
      await supabase
        .from("locais_impressao")
        .update({ ativo: !local.ativo })
        .eq("id", local.id);
      setLocais(prev => prev.map(l => l.id === local.id ? { ...l, ativo: !l.ativo } : l));
    } catch {
      setErro("Erro ao atualizar status.");
    }
  }

  async function confirmarDelete() {
    if (!confirmDelete) return;
    try {
      // Verifica se tem roteamentos vinculados
      const { data: rotas } = await supabase
        .from("categorias_roteamento")
        .select("id")
        .eq("local_impressao_id", confirmDelete.id)
        .limit(1);

      if (rotas?.length > 0) {
        // Tem roteamentos — só desativa (soft delete)
        await supabase
          .from("locais_impressao")
          .update({ ativo: false })
          .eq("id", confirmDelete.id);
      } else {
        // Sem roteamentos — delete físico
        await supabase
          .from("locais_impressao")
          .delete()
          .eq("id", confirmDelete.id);
      }
      setConfirmDelete(null);
      await fetchLocais();
    } catch {
      setErro("Erro ao remover local.");
      setConfirmDelete(null);
    }
  }

  return (
    <div style={{ maxWidth: 720 }}>

      {/* Cabeçalho da aba */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: sz.pad }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: sz.fontBase }}>Locais de Impressão</div>
          <div style={{ fontSize: sz.fontSm, color: C.muted, marginTop: 2 }}>
            Cadastre os destinos de impressão (Cozinha, Bar, Caixa…)
          </div>
        </div>
        <button
          onClick={abrirNovo}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            background: C.accent, border: "none", borderRadius: 10,
            color: "#fff", cursor: "pointer", fontWeight: 700,
            fontSize: sz.fontSm, padding: "10px 16px", fontFamily: "inherit",
          }}
        >
          <LuPlus size={15} /> Novo Local
        </button>
      </div>

      {erro && (
        <div style={{ marginBottom: 16, padding: "10px 14px", borderRadius: 8, background: `${C.red}12`, border: `1px solid ${C.red}33`, color: C.red, fontSize: sz.fontSm, display: "flex", gap: 8 }}>
          <LuTriangleAlert size={15} style={{ flexShrink: 0, marginTop: 1 }} /> {erro}
        </div>
      )}

      {loading ? (
        <div style={{ color: C.muted, fontSize: sz.fontSm, padding: "40px 0", textAlign: "center" }}>Carregando…</div>
      ) : locais.length === 0 ? (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "40px 24px", textAlign: "center", color: C.muted }}>
          <LuPrinter size={32} style={{ opacity: 0.3, marginBottom: 12 }} />
          <div style={{ fontWeight: 600, fontSize: sz.fontBase }}>Nenhum local cadastrado</div>
          <div style={{ fontSize: sz.fontSm, marginTop: 4 }}>Crie o primeiro local de impressão clicando em "Novo Local"</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {locais.map(local => (
            <div
              key={local.id}
              style={{
                background: C.card, border: `1px solid ${local.ativo ? C.border : C.faint}`,
                borderRadius: 12, padding: `${sz.padSm}px ${sz.pad}px`,
                display: "flex", alignItems: "center", gap: 14,
                opacity: local.ativo ? 1 : 0.55, transition: "opacity 0.2s",
              }}
            >
              {/* Ícone */}
              <div style={{
                width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                background: `${C.accent}18`, border: `1px solid ${C.accent}33`,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <LuPrinter size={18} color={C.accent} />
              </div>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: sz.fontBase }}>{local.nome}</div>
                {local.descricao && (
                  <div style={{ fontSize: sz.fontSm, color: C.muted, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {local.descricao}
                  </div>
                )}
              </div>

              {/* Toggle ativo */}
              <Toggle value={local.ativo} onChange={() => toggleAtivo(local)} />

              {/* Ações */}
              <button
                onClick={() => abrirEditar(local)}
                title="Editar"
                style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, color: C.muted, cursor: "pointer", padding: "7px 9px", display: "flex", lineHeight: 0 }}
              >
                <LuPencil size={15} />
              </button>
              <button
                onClick={() => setConfirmDelete(local)}
                title="Remover"
                style={{ background: `${C.red}12`, border: `1px solid ${C.red}33`, borderRadius: 8, color: C.red, cursor: "pointer", padding: "7px 9px", display: "flex", lineHeight: 0 }}
              >
                <LuTrash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Modal Criar/Editar */}
      {modal && createPortal(
        <div
          onClick={e => { if (e.target === e.currentTarget && !salvando) fecharModal(); }}
          style={{ position: "fixed", inset: 0, zIndex: 9100, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "'Inter',system-ui,sans-serif" }}
        >
          <div style={{ background: C.card, borderRadius: 20, width: "100%", maxWidth: 440, border: `1px solid ${C.border}`, boxShadow: "0 24px 64px rgba(0,0,0,0.5)", display: "flex", flexDirection: "column", gap: 20, padding: 28 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontWeight: 800, fontSize: sz.fontBase + 1, color: C.text }}>
                {editando ? "Editar Local" : "Novo Local de Impressão"}
              </div>
              <button onClick={fecharModal} disabled={salvando} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", padding: 4, lineHeight: 0 }}>
                <LuX size={20} />
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Nome *</div>
                <input
                  autoFocus
                  value={form.nome}
                  onChange={e => { setForm(f => ({ ...f, nome: e.target.value })); setFormErro(""); }}
                  onKeyDown={e => e.key === "Enter" && salvar()}
                  placeholder="Ex: Cozinha, Bar, Caixa…"
                  maxLength={80}
                  style={{ width: "100%", padding: "12px 14px", borderRadius: 10, border: `1.5px solid ${formErro ? C.red + "88" : C.border}`, background: C.surface, color: C.text, fontSize: sz.fontBase, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }}
                />
              </div>

              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Descrição <span style={{ fontWeight: 400, textTransform: "none" }}>(opcional)</span></div>
                <input
                  value={form.descricao}
                  onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
                  placeholder="Ex: Impressora na cozinha do restaurante"
                  maxLength={200}
                  style={{ width: "100%", padding: "12px 14px", borderRadius: 10, border: `1.5px solid ${C.border}`, background: C.surface, color: C.text, fontSize: sz.fontBase, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }}
                />
              </div>

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: sz.fontBase }}>Ativo</div>
                  <div style={{ fontSize: sz.fontSm, color: C.muted, marginTop: 2 }}>Local disponível para roteamento</div>
                </div>
                <Toggle value={form.ativo} onChange={v => setForm(f => ({ ...f, ativo: v }))} />
              </div>

              {formErro && (
                <div style={{ padding: "8px 12px", borderRadius: 8, background: `${C.red}12`, border: `1px solid ${C.red}33`, color: C.red, fontSize: sz.fontSm }}>
                  {formErro}
                </div>
              )}
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={fecharModal} disabled={salvando} style={{ flex: 1, padding: 12, borderRadius: 10, border: `1px solid ${C.border}`, background: "none", color: C.muted, cursor: "pointer", fontWeight: 600, fontSize: sz.fontBase, fontFamily: "inherit" }}>
                Cancelar
              </button>
              <button onClick={salvar} disabled={!form.nome.trim() || salvando} style={{ flex: 2, padding: 12, borderRadius: 10, border: "none", background: form.nome.trim() && !salvando ? C.accent : C.surface, color: form.nome.trim() && !salvando ? "#fff" : C.muted, cursor: form.nome.trim() && !salvando ? "pointer" : "not-allowed", fontWeight: 700, fontSize: sz.fontBase, fontFamily: "inherit", transition: "background 0.15s" }}>
                {salvando ? "Salvando…" : editando ? "Salvar alterações" : "Criar local"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modal Confirmar exclusão */}
      {confirmDelete && createPortal(
        <div
          onClick={e => { if (e.target === e.currentTarget) setConfirmDelete(null); }}
          style={{ position: "fixed", inset: 0, zIndex: 9200, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "'Inter',system-ui,sans-serif" }}
        >
          <div style={{ background: C.card, borderRadius: 20, width: "100%", maxWidth: 400, border: `1px solid ${C.border}`, padding: 28, display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: `${C.red}18`, border: `1px solid ${C.red}33`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <LuTrash2 size={20} color={C.red} />
              </div>
              <div>
                <div style={{ fontWeight: 800, fontSize: sz.fontBase, color: C.text }}>Remover "{confirmDelete.nome}"?</div>
                <div style={{ fontSize: sz.fontSm, color: C.muted, marginTop: 4, lineHeight: 1.5 }}>
                  Se houver categorias roteadas para este local, ele será apenas desativado. Caso contrário, será excluído permanentemente.
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setConfirmDelete(null)} style={{ flex: 1, padding: 12, borderRadius: 10, border: `1px solid ${C.border}`, background: "none", color: C.muted, cursor: "pointer", fontWeight: 600, fontSize: sz.fontBase, fontFamily: "inherit" }}>
                Cancelar
              </button>
              <button onClick={confirmarDelete} style={{ flex: 2, padding: 12, borderRadius: 10, border: "none", background: C.red, color: "#fff", cursor: "pointer", fontWeight: 700, fontSize: sz.fontBase, fontFamily: "inherit" }}>
                Confirmar remoção
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
