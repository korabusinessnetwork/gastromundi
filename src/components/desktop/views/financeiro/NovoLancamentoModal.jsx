import { useState } from "react";
import C from "@/constants/colors";
import { varColor } from "@/lib/tema";
import { criarLancamento } from "@/lib/financeiro";
import "./NovoLancamentoModal.css";

const CATEGORIAS = ["aluguel", "insumos", "salarios", "outros"];

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
      className="novo-lancamento__overlay"
    >
      <div className="novo-lancamento__modal">
        <div className="novo-lancamento__titulo">Novo Lançamento</div>

        {/* Tipo */}
        <div className="novo-lancamento__tipos">
          {[["despesa", "Despesa"], ["receita", "Receita"]].map(([id, label]) => (
            <button
              key={id}
              onClick={() => handleTipo(id)}
              className="novo-lancamento__tipo-btn"
              style={{
                borderColor: tipo === id ? varColor(C.accent) : varColor(C.border),
                background: tipo === id ? "var(--gm-alow)" : "none",
                color: tipo === id ? varColor(C.accent) : varColor(C.muted),
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <div>
          <label htmlFor="fin-categoria" className="novo-lancamento__label">Categoria</label>
          <select id="fin-categoria" value={categoria} onChange={(e) => setCategoria(e.target.value)} className="novo-lancamento__input">
            {CATEGORIAS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <div>
          <label htmlFor="fin-descricao" className="novo-lancamento__label">Descrição (opcional)</label>
          <input id="fin-descricao" value={descricao} onChange={(e) => setDescricao(e.target.value)} maxLength={200} className="novo-lancamento__input" />
        </div>

        <div>
          <label htmlFor="fin-valor" className="novo-lancamento__label">Valor (R$)</label>
          <input id="fin-valor" type="number" min="0" step="0.01" value={valor} onChange={(e) => setValor(e.target.value)} className="novo-lancamento__input" />
        </div>

        <div className="novo-lancamento__linha-dupla">
          <div style={{ flex: 1 }}>
            <label htmlFor="fin-competencia" className="novo-lancamento__label">Competência</label>
            <input id="fin-competencia" type="date" value={competencia} onChange={(e) => setCompetencia(e.target.value)} className="novo-lancamento__input" />
          </div>
          <div style={{ flex: 1 }}>
            <label htmlFor="fin-vencimento" className="novo-lancamento__label">Vencimento</label>
            <input id="fin-vencimento" type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)} className="novo-lancamento__input" />
          </div>
        </div>

        <div>
          <label htmlFor="fin-status" className="novo-lancamento__label">Status</label>
          <select id="fin-status" value={status} onChange={(e) => setStatus(e.target.value)} className="novo-lancamento__input">
            {statusOptions.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
        </div>

        {erro && <div className="novo-lancamento__erro">{erro}</div>}

        <div className="novo-lancamento__botoes">
          <button onClick={onClose} className="novo-lancamento__btn-cancelar">
            Cancelar
          </button>
          <button
            onClick={handleSalvar}
            disabled={salvando}
            className="novo-lancamento__btn-salvar"
            style={{ background: salvando ? varColor(C.faint) : varColor(C.accent), cursor: salvando ? "not-allowed" : "pointer" }}
          >
            {salvando ? "Salvando..." : "Salvar Lançamento"}
          </button>
        </div>
      </div>
    </div>
  );
}
