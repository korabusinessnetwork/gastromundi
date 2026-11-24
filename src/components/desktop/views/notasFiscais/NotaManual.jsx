import { createPortal } from "react-dom";
import C from "@/constants/colors";
import { varColor } from "@/lib/tema";
import { alfa } from "@/constants/colorAlfa";
// O dia UTC vira às 21h de Brasília: a nota lançada à noite nascia com a data
// de emissão de amanhã e a entrada de estoque caía no dia seguinte.
// A quantidade convertida vai direto para o saldo do estoque: sem arredondar,
// 3 × 0,35 grava 1.0499999999999998 e o saldo carrega a sujeira para sempre.
// TD015: a linha da nota carrega estado próprio (busca do produto, dropdown
// aberto), então a chave de renderização não pode ser a posição na lista.
import {
  LuX, LuSearch, LuArrowLeft, LuTriangleAlert, LuPlus, LuTruck
} from "react-icons/lu";
import { fmtCnpj } from "./apoio";
import { novoItemManual } from "@/features/estoque/regras/notaManual";

// Lançamento manual da nota, quando não há XML.
export default function NotaManual({ nf }) {
  const {
    setView, manualForm, setManualForm, manualItens, setManualItens, manualErro, setPendingFornNome, fornSaving, setManualFornId, manualFornBusca, setManualFornBusca, showFornDD, setShowFornDD, showNovoForn, setShowNovoForn, novoFornForm, setNovoFornForm, novoFornErro, setNovoFornErro, fornDDRef, salvarNovoFornecedor, fornecedorSelecionado, confirmarManual, fornecedores,
  } = nf;
    const setManualItem = (idx, patch) =>
      setManualItens(prev => prev.map((it, i) => i === idx ? { ...it, ...patch } : it));
    const addItem = () => setManualItens(prev => [...prev, novoItemManual()]);
    const removeItem = (idx) => setManualItens(prev => prev.filter((_, i) => i !== idx));

    const inpStyle = {
      width: "100%", padding: "9px 12px", borderRadius: 10,
      border: "1.5px solid var(--gm-input-border)", background: "var(--gm-input-bg)",
      color: varColor(C.text), fontFamily: "inherit",
      outline: "none", boxSizing: "border-box",
    };
    const label = (text) => (
      <div className="nf-tab__cap" style={{ fontWeight: 700, color: varColor(C.muted), textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 }}>{text}</div>
    );

    return (
      <div style={{ maxWidth: 820, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 28 }}>
          <button
            onClick={() => setView("lista")}
            className="nf-tab__voltar-btn"
          >
            <LuArrowLeft size={14} /> Cancelar
          </button>
          <div className="nf-tab__title" style={{ fontWeight: 800 }}>Nova nota manual</div>
        </div>

        {/* Cabeçalho da nota */}
        <div className="nf-tab__card" style={{ padding: 24, marginBottom: 20 }}>
          <div className="nf-tab__subtitle" style={{ fontWeight: 700, marginBottom: 20 }}>Dados do fornecedor e nota</div>

          {/* Seletor de fornecedor */}
          <div style={{ marginBottom: 16 }}>
            {label("Fornecedor *")}
            {fornecedorSelecionado ? (
              <div style={{ display: "flex", alignItems: "center", gap: 10, background: alfa(C.green, "10"), border: `1.5px solid ${alfa(C.green, "44")}`, borderRadius: 10, padding: "10px 14px" }}>
                <LuTruck size={16} color={varColor(C.green)} />
                <div style={{ flex: 1 }}>
                  <div className="nf-tab__body" style={{ fontWeight: 700, color: varColor(C.green) }}>{fornecedorSelecionado.nome}</div>
                  {fornecedorSelecionado.cnpj && <div className="nf-tab__cap" style={{ color: varColor(C.muted) }}>{fmtCnpj(fornecedorSelecionado.cnpj)}</div>}
                </div>
                <button
                  onClick={() => { setManualFornId(""); setManualFornBusca(""); }}
                  style={{ background: "none", border: "none", cursor: "pointer", color: varColor(C.muted), padding: 4, display: "flex" }}
                >
                  <LuX size={14} />
                </button>
              </div>
            ) : (
              <div ref={fornDDRef} style={{ position: "relative" }}>
                <div style={{ position: "relative" }}>
                  <LuSearch size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: varColor(C.muted), pointerEvents: "none" }} />
                  <input
                    className="nf-tab__campo"
                    style={{ ...inpStyle, paddingLeft: 32 }}
                    placeholder="Buscar fornecedor cadastrado..."
                    value={manualFornBusca}
                    onChange={e => { setManualFornBusca(e.target.value); setShowFornDD(true); }}
                    onFocus={() => setShowFornDD(true)}
                  />
                </div>
                {showFornDD && (
                  <div className="nf-tab__dropdown" style={{ boxShadow: "0 8px 24px rgba(0,0,0,0.25)" }}>
                    {fornecedores
                      .filter(f => !manualFornBusca || f.nome.toLowerCase().includes(manualFornBusca.toLowerCase()))
                      .slice(0, 8)
                      .map(f => (
                        <button
                          key={f.id}
                          onMouseDown={() => { setManualFornId(f.id); setManualFornBusca(""); setShowFornDD(false); }}
                          className="nf-tab__dropdown-item"
                          onMouseEnter={e => e.currentTarget.style.background = varColor(C.surface)}
                          onMouseLeave={e => e.currentTarget.style.background = "none"}
                        >
                          <LuTruck size={14} color={varColor(C.muted)} />
                          <div>
                            <div className="nf-tab__sub" style={{ fontWeight: 600 }}>{f.nome}</div>
                            {f.cnpj && <div className="nf-tab__cap" style={{ color: varColor(C.muted) }}>{fmtCnpj(f.cnpj)}</div>}
                          </div>
                        </button>
                      ))
                    }
                    <button
                      onMouseDown={() => { setShowFornDD(false); setShowNovoForn(true); setNovoFornForm({ nome: manualFornBusca, cnpj: "" }); setNovoFornErro(""); }}
                      className="nf-tab__sub"
                      style={{ width: "100%", padding: "10px 14px", border: "none", borderTop: `1px solid var(${C.border})`, background: "none", cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: 8, fontFamily: "inherit", color: varColor(C.accent), fontWeight: 600 }}
                      onMouseEnter={e => e.currentTarget.style.background = alfa(C.accent, "08")}
                      onMouseLeave={e => e.currentTarget.style.background = "none"}
                    >
                      <LuPlus size={14} /> Cadastrar novo fornecedor
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
            <div>
              {label("Data de emissão")}
              <input
                type="date"
                className="nf-tab__campo"
                style={inpStyle}
                value={manualForm.dataEmissao}
                onChange={e => setManualForm(f => ({ ...f, dataEmissao: e.target.value }))}
              />
            </div>
            <div>
              {label("Número da nota *")}
              <input
                className="nf-tab__campo"
                style={inpStyle}
                placeholder="000000"
                value={manualForm.numero}
                onChange={e => setManualForm(f => ({ ...f, numero: e.target.value }))}
              />
            </div>
            <div>
              {label("Série")}
              <input
                className="nf-tab__campo"
                style={inpStyle}
                placeholder="1"
                value={manualForm.serie}
                onChange={e => setManualForm(f => ({ ...f, serie: e.target.value }))}
              />
            </div>
          </div>
        </div>

        {/* Popup: cadastrar novo fornecedor (manual) */}
        {showNovoForn && createPortal(
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 }}>
            <div style={{ background: varColor(C.card), border: `1px solid var(${C.border})`, borderRadius: 20, padding: 28, width: "100%", maxWidth: 440 }}>
              <div className="nf-tab__title" style={{ fontWeight: 800, marginBottom: 6 }}>Cadastrar fornecedor</div>
              <div className="nf-tab__sub" style={{ color: varColor(C.muted), marginBottom: 20 }}>O fornecedor será salvo no cadastro e vinculado à nota.</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 16 }}>
                <div>
                  {label("Nome *")}
                  <input className="nf-tab__campo" style={inpStyle} placeholder="Nome do fornecedor" value={novoFornForm.nome} onChange={e => setNovoFornForm(f => ({ ...f, nome: e.target.value }))} />
                </div>
                <div>
                  {label("CNPJ")}
                  <input className="nf-tab__campo" style={inpStyle} placeholder="00.000.000/0000-00" value={novoFornForm.cnpj} onChange={e => setNovoFornForm(f => ({ ...f, cnpj: e.target.value }))} />
                </div>
              </div>
              {novoFornErro && <div className="nf-tab__sub" style={{ color: varColor(C.red), marginBottom: 12, fontWeight: 600 }}>{novoFornErro}</div>}
              <div style={{ display: "flex", gap: 10 }}>
                <button
                  onClick={() => { setShowNovoForn(false); setNovoFornErro(""); }}
                  className="nf-tab__body"
                  style={{ flex: 1, padding: "11px", borderRadius: 10, border: `1.5px solid var(${C.border})`, background: "none", color: varColor(C.text), cursor: "pointer", fontWeight: 600, fontFamily: "inherit" }}
                >
                  Cancelar
                </button>
                <button
                  disabled={fornSaving}
                  onClick={async () => {
                    if (!novoFornForm.nome.trim()) { setNovoFornErro("Informe o nome do fornecedor."); return; }
                    setPendingFornNome(novoFornForm.nome.trim());
                    await salvarNovoFornecedor(novoFornForm.nome, novoFornForm.cnpj);
                  }}
                  className="nf-tab__body"
                  style={{ flex: 1, padding: "11px", borderRadius: 10, border: "none", background: varColor(C.accent), color: "#fff", cursor: fornSaving ? "not-allowed" : "pointer", fontWeight: 700, fontFamily: "inherit", opacity: fornSaving ? 0.6 : 1 }}
                >
                  {fornSaving ? "Salvando..." : "Cadastrar"}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

        {/* Itens */}
        <div className="nf-tab__card" style={{ overflow: "hidden", marginBottom: 20 }}>
          <div style={{ padding: "16px 20px", borderBottom: `1px solid var(${C.border})`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div className="nf-tab__subtitle" style={{ fontWeight: 700 }}>Itens da nota</div>
            <button
              onClick={addItem}
              className="nf-tab__sub"
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 8, border: "none", background: varColor(C.accent), color: "#fff", cursor: "pointer", fontWeight: 600, fontFamily: "inherit" }}
            >
              <LuPlus size={13} /> Adicionar item
            </button>
          </div>
          <div className="nf-tab__tabela-scroll">
            <table className="nf-tab__tabela" style={{ minWidth: 680 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid var(${C.border})`, background: varColor(C.surface) }}>
                  {["#", "Descrição *", "Qtd *", "Unidade", "Preço Unit. (R$)", ""].map((h, i) => (
                    // TD015: cabeçalho literal dos itens manuais, não vem de dado.
                    <th key={i} className="nf-tab__th" style={{ textAlign: i >= 2 ? "center" : "left" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {manualItens.map((it, idx) => (
                  <tr key={it.uid} style={{ borderBottom: `1px solid var(${C.border})` }}>
                    <td className="nf-tab__num" style={{ padding: "8px 12px", color: varColor(C.muted), fontWeight: 600 }}>{idx + 1}</td>
                    <td style={{ padding: "8px 12px" }}>
                      <input
                        className="nf-tab__campo"
                        style={{ ...inpStyle, padding: "7px 10px" }}
                        placeholder="Ex: Farinha de trigo..."
                        value={it.descricaoXml}
                        onChange={e => setManualItem(idx, { descricaoXml: e.target.value })}
                      />
                    </td>
                    <td style={{ padding: "8px 10px", width: 90 }}>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        className="nf-tab__campo"
                        style={{ ...inpStyle, padding: "7px 10px", textAlign: "center" }}
                        placeholder="0"
                        value={it.quantidade}
                        onChange={e => setManualItem(idx, { quantidade: e.target.value })}
                      />
                    </td>
                    <td style={{ padding: "8px 10px", width: 90 }}>
                      <input
                        className="nf-tab__campo"
                        style={{ ...inpStyle, padding: "7px 10px", textAlign: "center" }}
                        placeholder="KG"
                        value={it.unidadeXml}
                        onChange={e => setManualItem(idx, { unidadeXml: e.target.value })}
                      />
                    </td>
                    <td style={{ padding: "8px 10px", width: 130 }}>
                      <input
                        className="nf-tab__campo"
                        style={{ ...inpStyle, padding: "7px 10px", textAlign: "right" }}
                        placeholder="0,00"
                        value={it.precoUnitario}
                        onChange={e => setManualItem(idx, { precoUnitario: e.target.value })}
                      />
                    </td>
                    <td style={{ padding: "8px 12px", textAlign: "center" }}>
                      {manualItens.length > 1 && (
                        <button
                          onClick={() => removeItem(idx)}
                          style={{ background: "none", border: "none", cursor: "pointer", color: varColor(C.muted), padding: 4, display: "flex", alignItems: "center" }}
                          onMouseEnter={e => e.currentTarget.style.color = varColor(C.red)}
                          onMouseLeave={e => e.currentTarget.style.color = varColor(C.muted)}
                        >
                          <LuX size={15} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {manualErro && (
          <div className="nf-tab__erro-box" style={{ background: alfa(C.red, "12"), border: `1.5px solid ${alfa(C.red, "44")}` }}>
            <LuTriangleAlert size={16} /> {manualErro}
          </div>
        )}

        <div style={{ display: "flex", gap: 12 }}>
          <button
            onClick={() => setView("lista")}
            className="nf-tab__btn-secundario"
          >
            Cancelar
          </button>
          <button
            onClick={confirmarManual}
            className="nf-tab__btn-primario"
            style={{ flex: 1, background: varColor(C.accent), boxShadow: `0 4px 14px ${alfa(C.accent, "44")}` }}
          >
            Continuar → Vincular produtos
          </button>
        </div>
      </div>
    );
}
