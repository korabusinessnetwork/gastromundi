import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabase";
import C from "@/constants/colors";
import {
  LuPlus, LuPencil, LuX, LuTriangleAlert, LuPackage,
} from "react-icons/lu";

const CATEGORIAS = ["Acompanhamentos", "Bebidas", "Molhos", "Adicionais", "Sobremesas"];
const UNIDADES   = ["Unidade", "Porção", "Copo", "Dose"];

const EMPTY = {
  nome: "", categoria: "Acompanhamentos", preco: "",
  unidade_medida: "Unidade", controla_estoque: false, ativo: true,
};

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

function ModalSubproduto({ item, onClose, onSalvo, sz }) {
  const [form, setForm]       = useState(item ? {
    nome:             item.nome,
    categoria:        item.categoria ?? "Acompanhamentos",
    preco:            String(item.preco ?? ""),
    unidade_medida:   item.unidade_medida ?? "Unidade",
    controla_estoque: item.controla_estoque ?? false,
    ativo:            item.ativo ?? true,
  } : { ...EMPTY });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro]         = useState("");

  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const salvar = async () => {
    const nome = form.nome.trim();
    if (!nome)                       { setErro("Informe o nome.");           return; }
    const preco = parseFloat(String(form.preco).replace(",", "."));
    if (isNaN(preco) || preco < 0)   { setErro("Preço inválido.");           return; }
    setSalvando(true);
    setErro("");
    const payload = {
      nome,
      categoria:        form.categoria,
      preco,
      unidade_medida:   form.unidade_medida,
      controla_estoque: form.controla_estoque,
      ativo:            form.ativo,
      updated_at:       new Date().toISOString(),
    };
    try {
      if (item) {
        const { error } = await supabase.from("subprodutos").update(payload).eq("id", item.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("subprodutos").insert(payload);
        if (error) throw error;
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
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, zIndex: 9100, background: "rgba(0,0,0,0.72)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "'Inter',system-ui,sans-serif" }}
    >
      <div style={{ background: C.card, borderRadius: 20, width: "100%", maxWidth: 460, border: `1px solid ${C.border}`, boxShadow: "0 24px 64px rgba(0,0,0,0.5)", display: "flex", flexDirection: "column", gap: 18, padding: 28 }}>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontWeight: 800, fontSize: sz.fontBase + 1 }}>{item ? "Editar Subproduto" : "Novo Subproduto"}</div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", lineHeight: 0 }}><LuX size={20} /></button>
        </div>

        {/* Nome */}
        <div>
          <div style={labelStyle}>Nome *</div>
          <input
            autoFocus
            value={form.nome}
            onChange={e => setF("nome", e.target.value)}
            onKeyDown={e => e.key === "Enter" && salvar()}
            placeholder="Ex: Fritas P, Coca-Cola Lata..."
            maxLength={80}
            style={inputStyle(sz)}
          />
        </div>

        {/* Categoria + Unidade lado a lado */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <div style={labelStyle}>Categoria</div>
            <select value={form.categoria} onChange={e => setF("categoria", e.target.value)} style={selectStyle(sz)}>
              {CATEGORIAS.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <div style={labelStyle}>Unidade</div>
            <select value={form.unidade_medida} onChange={e => setF("unidade_medida", e.target.value)} style={selectStyle(sz)}>
              {UNIDADES.map(u => <option key={u}>{u}</option>)}
            </select>
          </div>
        </div>

        {/* Preço */}
        <div>
          <div style={labelStyle}>Preço unitário (R$) *</div>
          <input
            type="number"
            min="0"
            step="0.01"
            value={form.preco}
            onChange={e => setF("preco", e.target.value)}
            placeholder="0,00"
            style={inputStyle(sz)}
          />
        </div>

        {/* Toggles */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderRadius: 10, background: C.surface, border: `1px solid ${C.border}` }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: sz.fontBase }}>Controlar estoque</div>
              <div style={{ fontSize: sz.fontSm, color: C.muted }}>Baixa estoque ao vender</div>
            </div>
            <Toggle value={form.controla_estoque} onChange={v => setF("controla_estoque", v)} />
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderRadius: 10, background: C.surface, border: `1px solid ${C.border}` }}>
            <div style={{ fontWeight: 600, fontSize: sz.fontBase }}>Ativo</div>
            <Toggle value={form.ativo} onChange={v => setF("ativo", v)} />
          </div>
        </div>

        {erro && <div style={{ fontSize: sz.fontSm, color: C.red, fontWeight: 600 }}>⚠ {erro}</div>}

        <div style={{ display: "flex", gap: 10, paddingTop: 4, borderTop: `1px solid ${C.border}` }}>
          <button onClick={onClose} style={{ flex: 1, padding: 12, borderRadius: 10, border: `1px solid ${C.border}`, background: "none", color: C.muted, cursor: "pointer", fontWeight: 600, fontSize: sz.fontBase, fontFamily: "inherit" }}>Cancelar</button>
          <button onClick={salvar} disabled={salvando} style={{ flex: 2, padding: 12, borderRadius: 10, border: "none", background: salvando ? C.faint : C.accent, color: "#fff", cursor: salvando ? "not-allowed" : "pointer", fontWeight: 700, fontSize: sz.fontBase, fontFamily: "inherit" }}>
            {salvando ? "Salvando…" : item ? "Salvar alterações" : "Criar subproduto"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ── View principal ─────────────────────────────────────────────────

export default function SubprodutosView({ sz }) {
  const [lista,     setLista]     = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [modal,     setModal]     = useState(false);
  const [editando,  setEditando]  = useState(null);
  const [busca,     setBusca]     = useState("");
  const [catFiltro, setCatFiltro] = useState("Todos");

  const carregar = async () => {
    setLoading(true);
    const { data } = await supabase.from("subprodutos").select("*").order("nome");
    setLista(data ?? []);
    setLoading(false);
  };

  useEffect(() => { carregar(); }, []);

  const abrirNovo    = () => { setEditando(null); setModal(true); };
  const abrirEditar  = (s) => { setEditando(s); setModal(true); };
  const fecharModal  = () => { setModal(false); setEditando(null); };
  const aoSalvar     = () => { fecharModal(); carregar(); };

  const toggleAtivo = async (s) => {
    await supabase.from("subprodutos").update({ ativo: !s.ativo, updated_at: new Date().toISOString() }).eq("id", s.id);
    setLista(prev => prev.map(x => x.id === s.id ? { ...x, ativo: !x.ativo } : x));
  };

  const cats = ["Todos", ...CATEGORIAS];

  const listafiltrada = lista
    .filter(s => catFiltro === "Todos" || s.categoria === catFiltro)
    .filter(s => !busca || s.nome.toLowerCase().includes(busca.toLowerCase()));

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

      {/* Header */}
      <div style={{ padding: `${sz.padSm}px ${sz.pad}px`, borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <div style={{ color: C.muted, fontSize: sz.fontSm + 1 }}>
          {lista.length} subproduto{lista.length !== 1 ? "s" : ""}
        </div>
        <button
          onClick={abrirNovo}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 18px", borderRadius: 10, border: "none", background: C.accent, color: "#fff", fontWeight: 700, fontSize: sz.fontBase, cursor: "pointer", fontFamily: "inherit" }}
        >
          <LuPlus size={15} /> Novo Subproduto
        </button>
      </div>

      {/* Filtros */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: `10px ${sz.pad}px`, borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
        <div style={{ display: "flex", gap: 6, flex: 1, flexWrap: "nowrap", overflow: "hidden" }}>
          {cats.map(cat => (
            <button
              key={cat}
              onClick={() => setCatFiltro(cat)}
              style={{ padding: "6px 14px", borderRadius: 20, border: "none", background: catFiltro === cat ? C.accent : C.surface, color: catFiltro === cat ? "#fff" : C.muted, cursor: "pointer", fontWeight: 600, fontSize: sz.fontSm + 1, whiteSpace: "nowrap", flexShrink: 0, fontFamily: "inherit" }}
            >
              {cat}
            </button>
          ))}
        </div>
        <input
          value={busca}
          onChange={e => setBusca(e.target.value)}
          placeholder="Buscar..."
          style={{ padding: "8px 14px", borderRadius: 10, border: `1px solid ${C.border}`, background: C.surface, color: C.text, fontSize: sz.fontBase, outline: "none", fontFamily: "inherit", width: 220, flexShrink: 0 }}
        />
      </div>

      {/* Tabela */}
      <div style={{ flex: 1, overflowY: "auto", padding: `${sz.padSm}px ${sz.pad}px` }}>
        {loading ? (
          <div style={{ color: C.muted, padding: 40, textAlign: "center" }}>Carregando…</div>
        ) : listafiltrada.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, color: C.muted, padding: 60 }}>
            <LuPackage size={40} style={{ opacity: 0.2 }} />
            <div style={{ fontWeight: 600, fontSize: sz.fontBase }}>{busca ? "Nenhum resultado" : "Nenhum subproduto cadastrado"}</div>
          </div>
        ) : (
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                  {["Nome", "Categoria", "Unidade", "Preço", "Estoque", "Status", ""].map((h, i) => (
                    <th key={i} style={{ padding: "11px 16px", textAlign: i >= 3 ? "center" : "left", fontSize: 13, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 0.8, whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {listafiltrada.map(s => (
                  <tr
                    key={s.id}
                    onMouseEnter={e => e.currentTarget.style.background = C.surface}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                    style={{ borderBottom: `1px solid ${C.border}`, transition: "background 0.1s", opacity: s.ativo ? 1 : 0.5 }}
                  >
                    <td style={{ padding: "12px 16px", fontWeight: 700, fontSize: sz.fontBase }}>{s.nome}</td>
                    <td style={{ padding: "12px 16px" }}>
                      <span style={{ fontSize: sz.fontSm, fontWeight: 600, background: `${C.accent}15`, color: C.accent, padding: "2px 8px", borderRadius: 20 }}>{s.categoria}</span>
                    </td>
                    <td style={{ padding: "12px 16px", fontSize: sz.fontBase, color: C.muted }}>{s.unidade_medida}</td>
                    <td style={{ padding: "12px 16px", textAlign: "center", fontWeight: 700, fontSize: sz.fontBase }}>R$ {Number(s.preco).toFixed(2)}</td>
                    <td style={{ padding: "12px 16px", textAlign: "center" }}>
                      <span style={{ fontSize: sz.fontSm, fontWeight: 600, color: s.controla_estoque ? C.green : C.muted }}>{s.controla_estoque ? "Sim" : "Não"}</span>
                    </td>
                    <td style={{ padding: "12px 16px", textAlign: "center" }}>
                      <button
                        onClick={() => toggleAtivo(s)}
                        style={{ fontSize: sz.fontSm - 1, fontWeight: 700, padding: "3px 10px", borderRadius: 20, border: "none", cursor: "pointer", fontFamily: "inherit", background: s.ativo ? `${C.green}18` : C.surface, color: s.ativo ? C.green : C.muted }}
                      >
                        {s.ativo ? "Ativo" : "Inativo"}
                      </button>
                    </td>
                    <td style={{ padding: "12px 16px", textAlign: "right" }}>
                      <button
                        onClick={() => abrirEditar(s)}
                        style={{ padding: "6px 12px", borderRadius: 8, border: `1px solid ${C.border}`, background: "none", color: C.muted, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4, fontSize: sz.fontSm, fontFamily: "inherit" }}
                      >
                        <LuPencil size={13} /> Editar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal && (
        <ModalSubproduto item={editando} onClose={fecharModal} onSalvo={aoSalvar} sz={sz} />
      )}
    </div>
  );
}

// ── Estilos utilitários ────────────────────────────────────────────
const labelStyle = {
  fontSize: 12, fontWeight: 700, color: "#888",
  textTransform: "uppercase", letterSpacing: 1, marginBottom: 6,
};

const inputStyle = (sz) => ({
  width: "100%", padding: "11px 14px", borderRadius: 10,
  border: `1.5px solid ${C.border}`, background: C.surface,
  color: C.text, fontSize: sz.fontBase,
  boxSizing: "border-box", fontFamily: "inherit", outline: "none",
});

const selectStyle = (sz) => ({
  width: "100%", padding: "11px 14px", borderRadius: 10,
  border: `1.5px solid ${C.border}`, background: C.surface,
  color: C.text, fontSize: sz.fontBase,
  boxSizing: "border-box", fontFamily: "inherit", outline: "none",
  cursor: "pointer",
});
