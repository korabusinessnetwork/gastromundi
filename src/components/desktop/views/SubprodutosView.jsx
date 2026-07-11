import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabase";
import C from "@/constants/colors";
import { varColor } from "@/lib/tema";
import { alfa } from "@/constants/colorAlfa";
import {
  LuPlus, LuPencil, LuX, LuTriangleAlert, LuPackage,
} from "react-icons/lu";
import "./SubprodutosView.css";

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
      className="subprodutos-view__toggle"
      style={{ background: value ? varColor(C.green) : varColor(C.faint) }}
    >
      <span className="subprodutos-view__toggle-bolinha" style={{ left: value ? 22 : 2 }} />
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
      className="subprodutos-view__modal-overlay"
    >
      <div className="subprodutos-view__modal">

        <div className="subprodutos-view__modal-topo">
          <div style={{ fontWeight: 800, fontSize: sz.fontBase + 1 }}>{item ? "Editar Subproduto" : "Novo Subproduto"}</div>
          <button onClick={onClose} className="subprodutos-view__modal-fechar"><LuX size={20} /></button>
        </div>

        {/* Nome */}
        <div>
          <div className="subprodutos-view__label">Nome *</div>
          <input
            autoFocus
            value={form.nome}
            onChange={e => setF("nome", e.target.value)}
            onKeyDown={e => e.key === "Enter" && salvar()}
            placeholder="Ex: Fritas P, Coca-Cola Lata..."
            maxLength={80}
            className="subprodutos-view__input"
            style={{ fontSize: sz.fontBase }}
          />
        </div>

        {/* Categoria + Unidade lado a lado */}
        <div className="subprodutos-view__grid-dupla">
          <div>
            <div className="subprodutos-view__label">Categoria</div>
            <select value={form.categoria} onChange={e => setF("categoria", e.target.value)} className="subprodutos-view__select" style={{ fontSize: sz.fontBase }}>
              {CATEGORIAS.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <div className="subprodutos-view__label">Unidade</div>
            <select value={form.unidade_medida} onChange={e => setF("unidade_medida", e.target.value)} className="subprodutos-view__select" style={{ fontSize: sz.fontBase }}>
              {UNIDADES.map(u => <option key={u}>{u}</option>)}
            </select>
          </div>
        </div>

        {/* Preço */}
        <div>
          <div className="subprodutos-view__label">Preço unitário (R$) *</div>
          <input
            type="number"
            min="0"
            step="0.01"
            value={form.preco}
            onChange={e => setF("preco", e.target.value)}
            placeholder="0,00"
            className="subprodutos-view__input"
            style={{ fontSize: sz.fontBase }}
          />
        </div>

        {/* Toggles */}
        <div className="subprodutos-view__toggles">
          <div className="subprodutos-view__toggle-linha">
            <div>
              <div className="subprodutos-view__toggle-titulo" style={{ fontSize: sz.fontBase }}>Controlar estoque</div>
              <div className="subprodutos-view__toggle-ajuda" style={{ fontSize: sz.fontSm }}>Baixa estoque ao vender</div>
            </div>
            <Toggle value={form.controla_estoque} onChange={v => setF("controla_estoque", v)} />
          </div>
          <div className="subprodutos-view__toggle-linha">
            <div className="subprodutos-view__toggle-titulo" style={{ fontSize: sz.fontBase }}>Ativo</div>
            <Toggle value={form.ativo} onChange={v => setF("ativo", v)} />
          </div>
        </div>

        {erro && <div className="subprodutos-view__erro" style={{ fontSize: sz.fontSm }}>⚠ {erro}</div>}

        <div className="subprodutos-view__modal-botoes">
          <button onClick={onClose} className="subprodutos-view__btn-cancelar" style={{ fontSize: sz.fontBase }}>Cancelar</button>
          <button onClick={salvar} disabled={salvando} className="subprodutos-view__btn-salvar" style={{ background: salvando ? varColor(C.faint) : varColor(C.accent), cursor: salvando ? "not-allowed" : "pointer", fontSize: sz.fontBase }}>
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
    <div className="subprodutos-view">

      {/* Header */}
      <div className="subprodutos-view__header" style={{ padding: `${sz.padSm}px ${sz.pad}px` }}>
        <div className="subprodutos-view__contagem" style={{ fontSize: sz.fontSm + 1 }}>
          {lista.length} subproduto{lista.length !== 1 ? "s" : ""}
        </div>
        <button
          onClick={abrirNovo}
          className="subprodutos-view__btn-novo"
          style={{ fontSize: sz.fontBase }}
        >
          <LuPlus size={15} /> Novo Subproduto
        </button>
      </div>

      {/* Filtros */}
      <div className="subprodutos-view__filtros" style={{ padding: `10px ${sz.pad}px` }}>
        <div className="subprodutos-view__categorias">
          {cats.map(cat => (
            <button
              key={cat}
              onClick={() => setCatFiltro(cat)}
              className="subprodutos-view__categoria-btn"
              style={{ background: catFiltro === cat ? varColor(C.accent) : varColor(C.surface), color: catFiltro === cat ? "#fff" : varColor(C.muted), fontSize: sz.fontSm + 1 }}
            >
              {cat}
            </button>
          ))}
        </div>
        <input
          value={busca}
          onChange={e => setBusca(e.target.value)}
          placeholder="Buscar..."
          className="subprodutos-view__busca"
          style={{ fontSize: sz.fontBase }}
        />
      </div>

      {/* Tabela */}
      <div className="subprodutos-view__tabela-area" style={{ padding: `${sz.padSm}px ${sz.pad}px` }}>
        {loading ? (
          <div className="subprodutos-view__estado">Carregando…</div>
        ) : listafiltrada.length === 0 ? (
          <div className="subprodutos-view__vazio">
            <LuPackage size={40} style={{ opacity: 0.2 }} />
            <div style={{ fontWeight: 600, fontSize: sz.fontBase }}>{busca ? "Nenhum resultado" : "Nenhum subproduto cadastrado"}</div>
          </div>
        ) : (
          <div className="subprodutos-view__tabela-moldura">
            <table className="subprodutos-view__tabela">
              <thead>
                <tr style={{ borderBottom: `1px solid var(${C.border})` }}>
                  {["Nome", "Categoria", "Unidade", "Preço", "Estoque", "Status", ""].map((h, i) => (
                    <th key={i} className="subprodutos-view__th" style={{ textAlign: i >= 3 ? "center" : "left" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {listafiltrada.map(s => (
                  <tr
                    key={s.id}
                    className="subprodutos-view__tr"
                    onMouseEnter={e => e.currentTarget.style.background = varColor(C.surface)}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                    style={{ opacity: s.ativo ? 1 : 0.5 }}
                  >
                    <td className="subprodutos-view__td subprodutos-view__nome" style={{ fontSize: sz.fontBase }}>{s.nome}</td>
                    <td className="subprodutos-view__td">
                      <span className="subprodutos-view__tag-categoria" style={{ fontSize: sz.fontSm, background: alfa(C.accent, "15"), color: varColor(C.accent) }}>{s.categoria}</span>
                    </td>
                    <td className="subprodutos-view__td subprodutos-view__unidade" style={{ fontSize: sz.fontBase }}>{s.unidade_medida}</td>
                    <td className="subprodutos-view__td" style={{ textAlign: "center", fontWeight: 700, fontSize: sz.fontBase }}>R$ {Number(s.preco).toFixed(2)}</td>
                    <td className="subprodutos-view__td" style={{ textAlign: "center" }}>
                      <span style={{ fontSize: sz.fontSm, fontWeight: 600, color: s.controla_estoque ? varColor(C.green) : varColor(C.muted) }}>{s.controla_estoque ? "Sim" : "Não"}</span>
                    </td>
                    <td className="subprodutos-view__td" style={{ textAlign: "center" }}>
                      <button
                        onClick={() => toggleAtivo(s)}
                        className="subprodutos-view__badge-status"
                        style={{ fontSize: sz.fontSm - 1, padding: "3px 10px", background: s.ativo ? alfa(C.green, "18") : varColor(C.surface), color: s.ativo ? varColor(C.green) : varColor(C.muted) }}
                      >
                        {s.ativo ? "Ativo" : "Inativo"}
                      </button>
                    </td>
                    <td className="subprodutos-view__td" style={{ textAlign: "right" }}>
                      <button
                        onClick={() => abrirEditar(s)}
                        className="subprodutos-view__btn-editar"
                        style={{ fontSize: sz.fontSm }}
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
