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
  LuUpload, LuFileText, LuCheck, LuArrowLeft, LuPackage, LuTriangleAlert, LuCalendar, LuBuilding2, LuHash, LuPlus
} from "react-icons/lu";
import Stepper from "./Stepper";
import VinculaRow from "./VinculaRow";
import { fmtDt, fmtR, fmtCnpj } from "./apoio";

// Assistente que importa a nota pelo XML, em passos.
export default function NotaAssistenteXml({ nf }) {
  const {
    setView, products, step, setStep, parsed, xmlErro, checkingDup, duplicadaEm, dupErro, itensVinc, saving, saveErro, importOk, dragOver, setDragOver, fileRef, fromManual, showFornPopup, setShowFornPopup, fornSaving, salvarNovoFornecedor, startWizard, startManual, processFile, handleDrop, avancarStep2, updateItem, vinculados, naoVinculados, semQuantidade, handleConfirmar,
  } = nf;
    const cab = parsed?.cabecalho;

    return (
      <div style={{ maxWidth: 960, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 28 }}>
          <button
            onClick={() => setView("lista")}
            className="nf-tab__voltar-btn"
          >
            <LuArrowLeft size={14} /> Cancelar
          </button>
          <div className="nf-tab__title" style={{ fontWeight: 800 }}>Importar XML NF-e</div>
        </div>

        {step <= 4 && <Stepper step={step} />}

        {/* ── Step 1: Upload ── */}
        {step === 1 && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20 }}>
            <div
              onDrop={handleDrop}
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onClick={() => fileRef.current?.click()}
              className="nf-tab__dropzone"
              style={{
                borderColor: dragOver ? varColor(C.accent) : xmlErro ? varColor(C.red) : varColor(C.border),
                background: dragOver ? alfa(C.accent, "08") : xmlErro ? alfa(C.red, "08") : varColor(C.card),
              }}
            >
              <div className="nf-tab__dropzone-icone" style={{ background: dragOver ? alfa(C.accent, "18") : varColor(C.surface) }}>
                <LuUpload size={28} color={dragOver ? varColor(C.accent) : varColor(C.muted)} />
              </div>
              <div>
                <div className="nf-tab__dropzone-titulo">
                  {dragOver ? "Solte o arquivo aqui" : "Arraste o XML ou clique para selecionar"}
                </div>
                <div className="nf-tab__dropzone-ajuda">Apenas arquivos .xml de NF-e</div>
              </div>
            </div>
            <input ref={fileRef} type="file" accept=".xml" style={{ display: "none" }} onChange={e => processFile(e.target.files[0])} />
            {xmlErro && (
              <div className="nf-tab__erro-box" style={{ background: alfa(C.red, "12"), border: `1.5px solid ${alfa(C.red, "44")}`, maxWidth: 560, width: "100%" }}>
                <LuTriangleAlert size={18} color={varColor(C.red)} />
                <span className="nf-tab__body" style={{ color: varColor(C.red), fontWeight: 600 }}>{xmlErro}</span>
              </div>
            )}
          </div>
        )}

        {/* ── Step 2: Cabeçalho ── */}
        {step === 2 && cab && (
          <div style={{ maxWidth: 640 }}>
            <div className="nf-tab__card" style={{ padding: 28, marginBottom: 20 }}>
              <div className="nf-tab__title" style={{ fontWeight: 800, marginBottom: 20 }}>Informações da nota</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
                {[
                  { label: "Fornecedor",    value: cab.fornecedorNome, icon: LuBuilding2 },
                  { label: "CNPJ",          value: fmtCnpj(cab.fornecedorCnpj), icon: LuHash },
                  { label: "Nº da Nota",    value: cab.numero, icon: LuFileText },
                  { label: "Série",         value: cab.serie || "—", icon: LuHash },
                  { label: "Data Emissão",  value: fmtDt(cab.dataEmissao), icon: LuCalendar },
                  { label: "Valor Total",   value: fmtR(cab.valorTotal), icon: LuPackage },
                ].map(f => (
                  <div key={f.label} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <div className="nf-tab__label">{f.label}</div>
                    <div className="nf-tab__body" style={{ fontWeight: 700 }}>{f.value}</div>
                  </div>
                ))}
              </div>
              {cab.chaveAcesso && (
                <div className="nf-tab__mono" style={{ marginTop: 16, padding: "10px 14px", background: varColor(C.surface), borderRadius: 10, color: varColor(C.muted), wordBreak: "break-all" }}>
                  Chave: {cab.chaveAcesso}
                </div>
              )}
            </div>

            {showFornPopup && (
              <div className="nf-tab__aviso" style={{ background: alfa(C.warn, "12"), border: `1.5px solid ${alfa(C.warn, "55")}` }}>
                <div className="nf-tab__aviso-linha">
                  <LuTriangleAlert size={20} color={varColor(C.warn)} style={{ flexShrink: 0, marginTop: 2 }} />
                  <div style={{ flex: 1 }}>
                    <div className="nf-tab__aviso-titulo">
                      Fornecedor não cadastrado
                    </div>
                    <div className="nf-tab__aviso-desc">
                      "<strong>{cab.fornecedorNome}</strong>" não foi encontrado no cadastro de fornecedores. Deseja cadastrá-lo automaticamente?
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        disabled={fornSaving}
                        onClick={async () => {
                          await salvarNovoFornecedor(cab.fornecedorNome, cab.fornecedorCnpj);
                          setShowFornPopup(false);
                        }}
                        className="nf-tab__sub"
                        style={{ padding: "8px 18px", borderRadius: 8, border: "none", background: varColor(C.warn), color: "#fff", cursor: fornSaving ? "not-allowed" : "pointer", fontWeight: 700, fontFamily: "inherit", opacity: fornSaving ? 0.6 : 1 }}
                      >
                        {fornSaving ? "Cadastrando..." : `Sim, cadastrar "${cab.fornecedorNome}"`}
                      </button>
                      <button
                        onClick={() => setShowFornPopup(false)}
                        className="nf-tab__sub"
                        style={{ padding: "8px 14px", borderRadius: 8, border: `1.5px solid var(${C.border})`, background: "none", color: varColor(C.text), cursor: "pointer", fontWeight: 600, fontFamily: "inherit" }}
                      >
                        Ignorar
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {duplicadaEm && (
              <div className="nf-tab__aviso" style={{ background: alfa(C.red, "12"), border: `1.5px solid ${alfa(C.red, "44")}`, padding: "14px 18px", display: "flex", alignItems: "center", gap: 10 }}>
                <LuTriangleAlert size={20} color={varColor(C.red)} />
                <div>
                  <div style={{ fontWeight: 700, color: varColor(C.red) }}>Nota já importada</div>
                  <div className="nf-tab__sub" style={{ color: varColor(C.muted) }}>Esta nota foi importada em {duplicadaEm}. Não é possível importar novamente.</div>
                </div>
              </div>
            )}

            {dupErro && (
              <div className="nf-tab__aviso" style={{ background: alfa(C.red, "12"), border: `1.5px solid ${alfa(C.red, "44")}`, padding: "14px 18px", display: "flex", alignItems: "center", gap: 10 }}>
                <LuTriangleAlert size={20} color={varColor(C.red)} />
                <div className="nf-tab__sub" style={{ color: varColor(C.red), fontWeight: 600 }}>{dupErro}</div>
              </div>
            )}

            <div style={{ display: "flex", gap: 12 }}>
              <button onClick={() => setStep(1)} className="nf-tab__btn-secundario">
                ← Voltar
              </button>
              <button
                onClick={avancarStep2}
                disabled={!!duplicadaEm || checkingDup}
                className="nf-tab__btn-primario"
                style={{ flex: 1, background: duplicadaEm ? varColor(C.faint) : varColor(C.accent), cursor: duplicadaEm ? "not-allowed" : "pointer" }}
              >
                {checkingDup ? "Verificando..." : "Continuar →"}
              </button>
            </div>
          </div>
        )}

        {/* ── Step 3: Vínculos ── */}
        {step === 3 && (
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <div>
                <div className="nf-tab__title" style={{ fontWeight: 800 }}>Vincular itens a produtos</div>
                <div className="nf-tab__sub" style={{ color: varColor(C.muted), marginTop: 2 }}>
                  {vinculados.length} de {itensVinc.length} itens vinculados
                  {naoVinculados.length > 0 && <span style={{ color: varColor(C.warn), marginLeft: 8 }}>· {naoVinculados.length} sem vínculo serão ignorados</span>}
                </div>
              </div>
            </div>

            <div className="nf-tab__card" style={{ overflow: "hidden", marginBottom: 20 }}>
              <div className="nf-tab__tabela-scroll">
                <table className="nf-tab__tabela" style={{ minWidth: 760 }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid var(${C.border})`, background: varColor(C.surface) }}>
                      {["#", "Descrição XML", "Qtd / Unid", "Preço Unit.", "Produto", "Unid. Estoque", "Fator", "Qtd Convertida"].map((h, i) => (
                        // TD015: cabeçalho literal da tela de vínculo, não vem de dado.
                        <th key={i} className="nf-tab__th" style={{ textAlign: i >= 2 ? "center" : "left" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {itensVinc.map((item, i) => (
                      <VinculaRow key={item.uid} item={item} products={products} onChange={updated => updateItem(i, updated)} />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div style={{ display: "flex", gap: 12 }}>
              <button
                onClick={() => fromManual ? setView("manual") : setStep(2)}
                className="nf-tab__btn-secundario"
              >
                ← Voltar
              </button>
              <button
                onClick={() => setStep(4)}
                className="nf-tab__btn-primario"
                style={{ flex: 1, background: varColor(C.accent) }}
              >
                Ver Preview →
              </button>
            </div>
          </div>
        )}

        {/* ── Step 4: Preview ── */}
        {step === 4 && cab && (
          <div style={{ maxWidth: 640 }}>
            <div className="nf-tab__card" style={{ padding: 24, marginBottom: 20 }}>
              <div className="nf-tab__title" style={{ fontWeight: 800, marginBottom: 4 }}>
                Nota nº {cab.numero} — {cab.fornecedorNome}
              </div>
              <div className="nf-tab__sub" style={{ color: varColor(C.muted), marginBottom: 20 }}>
                Emitida em {fmtDt(cab.dataEmissao)} · {fmtR(cab.valorTotal)}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 20 }}>
                {[
                  { label: "Total de itens", value: itensVinc.length, color: varColor(C.text) },
                  { label: "Vinculados",     value: vinculados.length, color: varColor(C.green) },
                  { label: "Ignorados",      value: naoVinculados.length, color: naoVinculados.length > 0 ? varColor(C.warn) : varColor(C.muted) },
                ].map(k => (
                  <div key={k.label} className="nf-tab__kpi-card">
                    <div className="nf-tab__kpi-valor" style={{ color: k.color }}>{k.value}</div>
                    <div className="nf-tab__kpi-label">{k.label}</div>
                  </div>
                ))}
              </div>

              {vinculados.length > 0 && (
                <div>
                  <div className="nf-tab__label" style={{ marginBottom: 10 }}>Entradas que serão criadas</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {vinculados.map(item => (
                      <div key={item.uid} className="nf-tab__entrada-linha" style={{ background: alfa(C.green, "0c"), border: `1px solid ${alfa(C.green, "22")}` }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span className="nf-tab__emoji-lg">{item.produto.emoji || "📦"}</span>
                          <div>
                            <div className="nf-tab__sub" style={{ fontWeight: 700 }}>{item.produto.name}</div>
                            <div className="nf-tab__cap" style={{ color: varColor(C.muted) }}>{item.descricaoXml}</div>
                          </div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div className="nf-tab__body-num" style={{ fontWeight: 800, color: varColor(C.green) }}>+{item.qtdEstoque.toFixed(3)}</div>
                          <div className="nf-tab__cap" style={{ color: varColor(C.muted) }}>{item.produto.unidade_estoque}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {naoVinculados.length > 0 && (
                <div style={{ marginTop: 14 }}>
                  <div className="nf-tab__label" style={{ marginBottom: 8 }}>Itens ignorados</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {naoVinculados.map(item => (
                      <div key={item.uid} className="nf-tab__sub" style={{ color: varColor(C.muted), padding: "6px 0", borderBottom: `1px solid var(${C.border})` }}>
                        {item.descricaoXml} <span className="nf-tab__cap">({item.quantidade} {item.unidadeXml})</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {saveErro && (
              <div className="nf-tab__erro-box" style={{ background: alfa(C.red, "12"), border: `1.5px solid ${alfa(C.red, "44")}` }}>
                {saveErro}
              </div>
            )}

            {semQuantidade.length > 0 && (
              <div role="alert" className="nf-tab__erro-box" style={{ background: alfa(C.warn, "12"), border: `1.5px solid ${alfa(C.warn, "44")}` }}>
                {semQuantidade.map(i => i.produto.name).join(", ")}
                {semQuantidade.length === 1 ? " ficou com quantidade 0" : " ficaram com quantidade 0"} para o estoque.
                Volte e corrija o fator de conversão, ou desvincule o item para ignorá-lo.
              </div>
            )}

            <div style={{ display: "flex", gap: 12 }}>
              <button onClick={() => setStep(3)} disabled={saving} className="nf-tab__btn-secundario" style={{ cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.5 : 1 }}>
                ← Voltar
              </button>
              <button
                onClick={handleConfirmar}
                disabled={saving || semQuantidade.length > 0}
                className="nf-tab__btn-primario"
                style={{ flex: 1, background: saving || semQuantidade.length > 0 ? varColor(C.faint) : varColor(C.green), cursor: saving || semQuantidade.length > 0 ? "not-allowed" : "pointer", boxShadow: saving || semQuantidade.length > 0 ? "none" : `0 4px 16px ${alfa(C.green, "44")}`, transition: "background 0.15s" }}
              >
                {saving ? "Salvando..." : "✓ Confirmar Importação"}
              </button>
            </div>
          </div>
        )}

        {/* ── Step 5: Sucesso ── */}
        {step === 5 && importOk && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20, paddingTop: 20 }}>
            <div className="nf-tab__sucesso-icone" style={{ background: alfa(C.green, "18"), borderColor: alfa(C.green, "44") }}>
              <LuCheck size={32} color={varColor(C.green)} />
            </div>
            <div style={{ textAlign: "center" }}>
              <div className="nf-tab__title-hero" style={{ fontWeight: 800, marginBottom: 6 }}>Nota importada com sucesso!</div>
              <div className="nf-tab__body" style={{ color: varColor(C.muted) }}>
                Nota nº {importOk.numero} · {importOk.fornecedor}
              </div>
              <div className="nf-tab__body" style={{ color: varColor(C.green), fontWeight: 700, marginTop: 4 }}>
                {importOk.count} {importOk.count === 1 ? "produto atualizado" : "produtos atualizados"} no estoque
              </div>
            </div>
            <div style={{ display: "flex", gap: 12 }}>
              <button onClick={() => setView("lista")} className="nf-tab__btn-secundario">
                Ver notas importadas
              </button>
              <button
                onClick={fromManual ? startManual : startWizard}
                className="nf-tab__btn-primario"
                style={{ background: varColor(C.accent) }}
              >
                <LuPlus size={14} style={{ marginRight: 6 }} />
                {fromManual ? "Nova nota manual" : "Importar outra"}
              </button>
            </div>
          </div>
        )}
      </div>
    );
}
