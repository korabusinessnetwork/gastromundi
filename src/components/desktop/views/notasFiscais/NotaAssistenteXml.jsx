import C from "@/constants/colors";
import { varColor } from "@/lib/tema";
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
      <div className="nf-assist">
        <div className="nf-tab__topo">
          <button
            onClick={() => setView("lista")}
            className="nf-tab__voltar-btn"
          >
            <LuArrowLeft size={14} /> Cancelar
          </button>
          <div className="nf-tab__title nf-tab__title--forte">Importar XML NF-e</div>
        </div>

        {step <= 4 && <Stepper step={step} />}

        {/* ── Step 1: Upload ── */}
        {step === 1 && (
          <div className="nf-assist__upload">
            <div
              onDrop={handleDrop}
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onClick={() => fileRef.current?.click()}
              className={`nf-tab__dropzone${dragOver ? " nf-tab__dropzone--arrastando" : xmlErro ? " nf-tab__dropzone--erro" : ""}`}
            >
              <div className="nf-tab__dropzone-icone">
                <LuUpload size={28} color={dragOver ? varColor(C.accent) : varColor(C.muted)} />
              </div>
              <div>
                <div className="nf-tab__dropzone-titulo">
                  {dragOver ? "Solte o arquivo aqui" : "Arraste o XML ou clique para selecionar"}
                </div>
                <div className="nf-tab__dropzone-ajuda">Apenas arquivos .xml de NF-e</div>
              </div>
            </div>
            <input ref={fileRef} type="file" accept=".xml" className="nf-tab__oculto" onChange={e => processFile(e.target.files[0])} />
            {xmlErro && (
              <div className="nf-tab__erro-box nf-tab__erro-box--erro nf-assist__upload-erro">
                <LuTriangleAlert size={18} color={varColor(C.red)} />
                <span className="nf-tab__body">{xmlErro}</span>
              </div>
            )}
          </div>
        )}

        {/* ── Step 2: Cabeçalho ── */}
        {step === 2 && cab && (
          <div className="nf-assist__estreito">
            <div className="nf-tab__card nf-assist__card-info">
              <div className="nf-tab__title nf-tab__title--forte nf-assist__titulo-info">Informações da nota</div>
              <div className="nf-assist__info-grid">
                {[
                  { label: "Fornecedor",    value: cab.fornecedorNome, icon: LuBuilding2 },
                  { label: "CNPJ",          value: fmtCnpj(cab.fornecedorCnpj), icon: LuHash },
                  { label: "Nº da Nota",    value: cab.numero, icon: LuFileText },
                  { label: "Série",         value: cab.serie || "—", icon: LuHash },
                  { label: "Data Emissão",  value: fmtDt(cab.dataEmissao), icon: LuCalendar },
                  { label: "Valor Total",   value: fmtR(cab.valorTotal), icon: LuPackage },
                ].map(f => (
                  <div key={f.label} className="nf-assist__info-campo">
                    <div className="nf-tab__label">{f.label}</div>
                    <div className="nf-tab__body nf-assist__info-valor">{f.value}</div>
                  </div>
                ))}
              </div>
              {cab.chaveAcesso && (
                <div className="nf-tab__mono nf-assist__chave">
                  Chave: {cab.chaveAcesso}
                </div>
              )}
            </div>

            {showFornPopup && (
              <div className="nf-tab__aviso nf-tab__aviso--fornecedor">
                <div className="nf-tab__aviso-linha">
                  <LuTriangleAlert size={20} color={varColor(C.warn)} className="nf-assist__aviso-icone" />
                  <div className="nf-assist__aviso-corpo">
                    <div className="nf-tab__aviso-titulo">
                      Fornecedor não cadastrado
                    </div>
                    <div className="nf-tab__aviso-desc">
                      "<strong>{cab.fornecedorNome}</strong>" não foi encontrado no cadastro de fornecedores. Deseja cadastrá-lo automaticamente?
                    </div>
                    <div className="nf-assist__aviso-acoes">
                      <button
                        disabled={fornSaving}
                        onClick={async () => {
                          await salvarNovoFornecedor(cab.fornecedorNome, cab.fornecedorCnpj);
                          setShowFornPopup(false);
                        }}
                        className="nf-tab__sub nf-assist__btn-cadastrar"
                      >
                        {fornSaving ? "Cadastrando..." : `Sim, cadastrar "${cab.fornecedorNome}"`}
                      </button>
                      <button
                        onClick={() => setShowFornPopup(false)}
                        className="nf-tab__sub nf-assist__btn-ignorar"
                      >
                        Ignorar
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {duplicadaEm && (
              <div className="nf-tab__aviso nf-tab__aviso--erro">
                <LuTriangleAlert size={20} color={varColor(C.red)} />
                <div>
                  <div className="nf-assist__dup-titulo">Nota já importada</div>
                  <div className="nf-tab__sub nf-tab__muted">Esta nota foi importada em {duplicadaEm}. Não é possível importar novamente.</div>
                </div>
              </div>
            )}

            {dupErro && (
              <div className="nf-tab__aviso nf-tab__aviso--erro">
                <LuTriangleAlert size={20} color={varColor(C.red)} />
                <div className="nf-tab__sub nf-assist__dup-erro">{dupErro}</div>
              </div>
            )}

            <div className="nf-tab__acoes">
              <button onClick={() => setStep(1)} className="nf-tab__btn-secundario">
                ← Voltar
              </button>
              <button
                onClick={avancarStep2}
                disabled={!!duplicadaEm || checkingDup}
                className={`nf-tab__btn-primario nf-tab__btn-primario--cheio ${duplicadaEm ? "nf-tab__btn-primario--bloqueado" : "nf-tab__btn-primario--accent"}`}
              >
                {checkingDup ? "Verificando..." : "Continuar →"}
              </button>
            </div>
          </div>
        )}

        {/* ── Step 3: Vínculos ── */}
        {step === 3 && (
          <div>
            <div className="nf-assist__vinc-topo">
              <div>
                <div className="nf-tab__title nf-tab__title--forte">Vincular itens a produtos</div>
                <div className="nf-tab__sub nf-tab__muted nf-assist__vinc-resumo">
                  {vinculados.length} de {itensVinc.length} itens vinculados
                  {naoVinculados.length > 0 && <span className="nf-assist__vinc-ignorados">· {naoVinculados.length} sem vínculo serão ignorados</span>}
                </div>
              </div>
            </div>

            <div className="nf-tab__card nf-tab__card--tabela">
              <div className="nf-tab__tabela-scroll">
                <table className="nf-tab__tabela nf-assist__tabela-vinc">
                  <thead>
                    <tr className="nf-tab__thead-tr">
                      {["#", "Descrição XML", "Qtd / Unid", "Preço Unit.", "Produto", "Unid. Estoque", "Fator", "Qtd Convertida"].map((h, i) => (
                        // TD015: cabeçalho literal da tela de vínculo, não vem de dado.
                        <th key={i} className={i >= 2 ? "nf-tab__th nf-tab__th--centro" : "nf-tab__th nf-tab__th--esquerda"}>{h}</th>
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

            <div className="nf-tab__acoes">
              <button
                onClick={() => fromManual ? setView("manual") : setStep(2)}
                className="nf-tab__btn-secundario"
              >
                ← Voltar
              </button>
              <button
                onClick={() => setStep(4)}
                className="nf-tab__btn-primario nf-tab__btn-primario--cheio nf-tab__btn-primario--accent"
              >
                Ver Preview →
              </button>
            </div>
          </div>
        )}

        {/* ── Step 4: Preview ── */}
        {step === 4 && cab && (
          <div className="nf-assist__estreito">
            <div className="nf-tab__card nf-assist__card-previa">
              <div className="nf-tab__title nf-tab__title--forte nf-assist__previa-titulo">
                Nota nº {cab.numero}, {cab.fornecedorNome}
              </div>
              <div className="nf-tab__sub nf-tab__muted nf-assist__previa-sub">
                Emitida em {fmtDt(cab.dataEmissao)} · {fmtR(cab.valorTotal)}
              </div>

              <div className="nf-assist__kpis">
                {[
                  { label: "Total de itens", value: itensVinc.length, tom: "" },
                  { label: "Vinculados",     value: vinculados.length, tom: "verde" },
                  { label: "Ignorados",      value: naoVinculados.length, tom: naoVinculados.length > 0 ? "aviso" : "muted" },
                ].map(k => (
                  <div key={k.label} className="nf-tab__kpi-card">
                    <div className={`nf-tab__kpi-valor${k.tom ? ` nf-tab__kpi-valor--${k.tom}` : ""}`}>{k.value}</div>
                    <div className="nf-tab__kpi-label">{k.label}</div>
                  </div>
                ))}
              </div>

              {vinculados.length > 0 && (
                <div>
                  <div className="nf-tab__label nf-assist__rotulo-entradas">Entradas que serão criadas</div>
                  <div className="nf-assist__lista-entradas">
                    {vinculados.map(item => (
                      <div key={item.uid} className="nf-tab__entrada-linha nf-assist__entrada">
                        <div className="nf-assist__entrada-produto">
                          <span className="nf-tab__emoji-lg">{item.produto.emoji || "📦"}</span>
                          <div>
                            <div className="nf-tab__sub nf-assist__entrada-nome">{item.produto.name}</div>
                            <div className="nf-tab__cap nf-tab__muted">{item.descricaoXml}</div>
                          </div>
                        </div>
                        <div className="nf-assist__entrada-qtd">
                          <div className="nf-tab__body-num nf-assist__entrada-mais">+{item.qtdEstoque.toFixed(3)}</div>
                          <div className="nf-tab__cap nf-tab__muted">{item.produto.unidade_estoque}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {naoVinculados.length > 0 && (
                <div className="nf-assist__ignorados">
                  <div className="nf-tab__label nf-assist__rotulo-ignorados">Itens ignorados</div>
                  <div className="nf-assist__lista-ignorados">
                    {naoVinculados.map(item => (
                      <div key={item.uid} className="nf-tab__sub nf-tab__muted nf-assist__ignorado">
                        {item.descricaoXml} <span className="nf-tab__cap">({item.quantidade} {item.unidadeXml})</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {saveErro && (
              <div className="nf-tab__erro-box nf-tab__erro-box--erro">
                {saveErro}
              </div>
            )}

            {semQuantidade.length > 0 && (
              <div role="alert" className="nf-tab__erro-box nf-tab__erro-box--aviso">
                {semQuantidade.map(i => i.produto.name).join(", ")}
                {semQuantidade.length === 1 ? " ficou com quantidade 0" : " ficaram com quantidade 0"} para o estoque.
                Volte e corrija o fator de conversão, ou desvincule o item para ignorá-lo.
              </div>
            )}

            <div className="nf-tab__acoes">
              <button onClick={() => setStep(3)} disabled={saving} className="nf-tab__btn-secundario nf-assist__btn-voltar">
                ← Voltar
              </button>
              <button
                onClick={handleConfirmar}
                disabled={saving || semQuantidade.length > 0}
                className="nf-tab__btn-primario nf-tab__btn-primario--cheio nf-assist__btn-confirmar"
              >
                {saving ? "Salvando..." : "✓ Confirmar Importação"}
              </button>
            </div>
          </div>
        )}

        {/* ── Step 5: Sucesso ── */}
        {step === 5 && importOk && (
          <div className="nf-assist__sucesso">
            <div className="nf-tab__sucesso-icone nf-assist__sucesso-icone">
              <LuCheck size={32} color={varColor(C.green)} />
            </div>
            <div className="nf-assist__sucesso-texto">
              <div className="nf-tab__title-hero nf-assist__sucesso-titulo">Nota importada com sucesso!</div>
              <div className="nf-tab__body nf-tab__muted">
                Nota nº {importOk.numero} · {importOk.fornecedor}
              </div>
              <div className="nf-tab__body nf-assist__sucesso-qtd">
                {importOk.count} {importOk.count === 1 ? "produto atualizado" : "produtos atualizados"} no estoque
              </div>
            </div>
            <div className="nf-tab__acoes">
              <button onClick={() => setView("lista")} className="nf-tab__btn-secundario">
                Ver notas importadas
              </button>
              <button
                onClick={fromManual ? startManual : startWizard}
                className="nf-tab__btn-primario nf-tab__btn-primario--accent"
              >
                <LuPlus size={14} className="nf-assist__icone-mais" />
                {fromManual ? "Nova nota manual" : "Importar outra"}
              </button>
            </div>
          </div>
        )}
      </div>
    );
}
