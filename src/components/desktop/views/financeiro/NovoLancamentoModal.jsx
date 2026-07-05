import { useState } from "react";
import C from "@/constants/colors";
import { criarLancamento } from "@/lib/financeiro";

const CATEGORIAS = ["aluguel", "insumos", "salarios", "outros"];

const labelStyle = { display: "block", fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 };
const inputStyle = { width: "100%", padding: "10px 12px", borderRadius: 10, border: `1px solid ${C.border}`, background: C.surface, color: C.text, fontFamily: "inherit", fontSize: 14, boxSizing: "border-box", outline: "none" };

export default function NovoLancamentoModal({ usuario, onCreated, onClose }) {
  const [tipo,        setTipo]        = useState("despesa");
  const [categoria,   setCategoria]   = useState(CATEGORIAS[0]);
  const [descricao,   setDescricao]   = useState("");
  const [valor,        setValor]       = useState("");
  const [competencia, setCompetencia] = useState(() => new Date().toISOString().slice(0, 10));
  const [vencimento,  setVencimento]  = useState("");
  const [status,       setStatus]      = useState("previsto");
  const [salvando,    setSalvando]    = useState(false);
  const [erro,         setErro]        = useState("");

  const statusOptions = tipo === "despesa"
    ? [["previsto", "Previsto"], ["pago", "Pago"]]
    : [["previsto", "Previsto"], ["recebido", "Recebido"]];

  const handleTipo = (novoTipo) => {
    setTipo(novoTipo);
    if (novoTipo === "despesa" && status === "recebido") setStatus("previsto");
    if (novoTipo === "receita" && status === "pago") setStatus("previsto");
  };

  const handleSalvar = async () => {
    setErro("");
    const valorNum = parseFloat(String(valor).replace(",", "."));
    if (!(valorNum > 0)) { setErro("Informe um valor maior que zero."); return; }
    if (!competencia) { setErro("Informe a competência."); return; }
    if (status === "previsto" && !vencimento) { setErro("Informe o vencimento para contas previstas."); return; }

    setSalvando(true);
    const { data, error } = await criarLancamento({
      tipo, categoria, descricao: descricao.trim() || null,
      valor: valorNum, competencia, vencimento: vencimento || null, status,
      origem: "manual",
    }, usuario);
    setSalvando(false);

    if (error) { setErro(error.message || "Erro ao salvar."); return; }
    onCreated(data);
  };

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 400, padding: 16 }}
    >
      <div style={{ background: C.card, borderRadius: 20, padding: 28, width: "100%", maxWidth: 440, boxSizing: "border-box", border: `1px solid ${C.border}`, display: "flex", flexDirection: "column", gap: 16, maxHeight: "92vh", overflowY: "auto" }}>
        <div style={{ fontWeight: 800, fontSize: 18 }}>Novo Lançamento</div>

        {/* Tipo */}
        <div style={{ display: "flex", gap: 8 }}>
          {[["despesa", "Despesa"], ["receita", "Receita"]].map(([id, label]) => (
            <button
              key={id}
              onClick={() => handleTipo(id)}
              style={{
                flex: 1, padding: "10px 0", borderRadius: 10,
                border: `1.5px solid ${tipo === id ? C.accent : C.border}`,
                background: tipo === id ? C.alow : "none",
                color: tipo === id ? C.accent : C.muted,
                fontWeight: 700, cursor: "pointer", fontFamily: "inherit", fontSize: 14,
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <div>
          <label htmlFor="fin-categoria" style={labelStyle}>Categoria</label>
          <select id="fin-categoria" value={categoria} onChange={(e) => setCategoria(e.target.value)} style={inputStyle}>
            {CATEGORIAS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <div>
          <label htmlFor="fin-descricao" style={labelStyle}>Descrição (opcional)</label>
          <input id="fin-descricao" value={descricao} onChange={(e) => setDescricao(e.target.value)} maxLength={200} style={inputStyle} />
        </div>

        <div>
          <label htmlFor="fin-valor" style={labelStyle}>Valor (R$)</label>
          <input id="fin-valor" type="number" min="0" step="0.01" value={valor} onChange={(e) => setValor(e.target.value)} style={inputStyle} />
        </div>

        <div style={{ display: "flex", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label htmlFor="fin-competencia" style={labelStyle}>Competência</label>
            <input id="fin-competencia" type="date" value={competencia} onChange={(e) => setCompetencia(e.target.value)} style={inputStyle} />
          </div>
          <div style={{ flex: 1 }}>
            <label htmlFor="fin-vencimento" style={labelStyle}>Vencimento</label>
            <input id="fin-vencimento" type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)} style={inputStyle} />
          </div>
        </div>

        <div>
          <label htmlFor="fin-status" style={labelStyle}>Status</label>
          <select id="fin-status" value={status} onChange={(e) => setStatus(e.target.value)} style={inputStyle}>
            {statusOptions.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
        </div>

        {erro && <div style={{ color: C.red, fontSize: 13, fontWeight: 600 }}>{erro}</div>}

        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, padding: 13, borderRadius: 10, border: `1px solid ${C.border}`, background: "none", color: C.muted, cursor: "pointer", fontWeight: 600, fontFamily: "inherit", fontSize: 14 }}>
            Cancelar
          </button>
          <button
            onClick={handleSalvar}
            disabled={salvando}
            style={{ flex: 2, padding: 13, borderRadius: 10, border: "none", background: salvando ? C.faint : C.accent, color: "#fff", cursor: salvando ? "not-allowed" : "pointer", fontWeight: 700, fontFamily: "inherit", fontSize: 14 }}
          >
            {salvando ? "Salvando..." : "Salvar Lançamento"}
          </button>
        </div>
      </div>
    </div>
  );
}
