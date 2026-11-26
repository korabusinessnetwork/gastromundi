import { createPortal } from "react-dom";
import C from "@/constants/colors";
import { varColor } from "@/lib/tema";
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

    const label = (text) => (
      <div className="nf-tab__cap nf-manual__rotulo">{text}</div>
    );

    return (
      <div className="nf-manual">
        <div className="nf-tab__topo">
          <button
            onClick={() => setView("lista")}
            className="nf-tab__voltar-btn"
          >
            <LuArrowLeft size={14} /> Cancelar
          </button>
          <div className="nf-tab__title nf-tab__title--forte">Nova nota manual</div>
        </div>

        {/* Cabeçalho da nota */}
        <div className="nf-tab__card nf-manual__card-dados">
          <div className="nf-tab__subtitle nf-manual__secao-titulo">Dados do fornecedor e nota</div>

          {/* Seletor de fornecedor */}
          <div className="nf-manual__fornecedor">
            {label("Fornecedor *")}
            {fornecedorSelecionado ? (
              <div className="nf-manual__forn-escolhido">
                <LuTruck size={16} color={varColor(C.green)} />
                <div className="nf-manual__forn-corpo">
                  <div className="nf-tab__body nf-manual__forn-nome">{fornecedorSelecionado.nome}</div>
                  {fornecedorSelecionado.cnpj && <div className="nf-tab__cap nf-tab__muted">{fmtCnpj(fornecedorSelecionado.cnpj)}</div>}
                </div>
                <button
                  onClick={() => { setManualFornId(""); setManualFornBusca(""); }}
                  className="nf-manual__btn-limpar"
                >
                  <LuX size={14} />
                </button>
              </div>
            ) : (
              <div ref={fornDDRef} className="nf-tab__ancora">
                <div className="nf-tab__ancora">
                  <LuSearch size={13} className="nf-tab__busca-icone nf-manual__busca-icone" />
                  <input
                    className="nf-tab__campo nf-manual__input nf-manual__input--busca"
                    placeholder="Buscar fornecedor cadastrado..."
                    value={manualFornBusca}
                    onChange={e => { setManualFornBusca(e.target.value); setShowFornDD(true); }}
                    onFocus={() => setShowFornDD(true)}
                  />
                </div>
                {showFornDD && (
                  <div className="nf-tab__dropdown">
                    {fornecedores
                      .filter(f => !manualFornBusca || f.nome.toLowerCase().includes(manualFornBusca.toLowerCase()))
                      .slice(0, 8)
                      .map(f => (
                        <button
                          key={f.id}
                          onMouseDown={() => { setManualFornId(f.id); setManualFornBusca(""); setShowFornDD(false); }}
                          className="nf-tab__dropdown-item"
                        >
                          <LuTruck size={14} color={varColor(C.muted)} />
                          <div>
                            <div className="nf-tab__sub nf-tab__dropdown-nome">{f.nome}</div>
                            {f.cnpj && <div className="nf-tab__cap nf-tab__muted">{fmtCnpj(f.cnpj)}</div>}
                          </div>
                        </button>
                      ))
                    }
                    <button
                      onMouseDown={() => { setShowFornDD(false); setShowNovoForn(true); setNovoFornForm({ nome: manualFornBusca, cnpj: "" }); setNovoFornErro(""); }}
                      className="nf-tab__sub nf-manual__btn-novo-forn"
                    >
                      <LuPlus size={14} /> Cadastrar novo fornecedor
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="nf-manual__grid-nota">
            <div>
              {label("Data de emissão")}
              <input
                type="date"
                className="nf-tab__campo nf-manual__input"
                value={manualForm.dataEmissao}
                onChange={e => setManualForm(f => ({ ...f, dataEmissao: e.target.value }))}
              />
            </div>
            <div>
              {label("Número da nota *")}
              <input
                className="nf-tab__campo nf-manual__input"
                placeholder="000000"
                value={manualForm.numero}
                onChange={e => setManualForm(f => ({ ...f, numero: e.target.value }))}
              />
            </div>
            <div>
              {label("Série")}
              <input
                className="nf-tab__campo nf-manual__input"
                placeholder="1"
                value={manualForm.serie}
                onChange={e => setManualForm(f => ({ ...f, serie: e.target.value }))}
              />
            </div>
          </div>
        </div>

        {/* Popup: cadastrar novo fornecedor (manual) */}
        {showNovoForn && createPortal(
          <div className="nf-manual__overlay">
            <div className="nf-manual__modal">
              <div className="nf-tab__title nf-tab__title--forte nf-manual__modal-titulo">Cadastrar fornecedor</div>
              <div className="nf-tab__sub nf-tab__muted nf-manual__modal-sub">O fornecedor será salvo no cadastro e vinculado à nota.</div>
              <div className="nf-manual__modal-campos">
                <div>
                  {label("Nome *")}
                  <input className="nf-tab__campo nf-manual__input" placeholder="Nome do fornecedor" value={novoFornForm.nome} onChange={e => setNovoFornForm(f => ({ ...f, nome: e.target.value }))} />
                </div>
                <div>
                  {label("CNPJ")}
                  <input className="nf-tab__campo nf-manual__input" placeholder="00.000.000/0000-00" value={novoFornForm.cnpj} onChange={e => setNovoFornForm(f => ({ ...f, cnpj: e.target.value }))} />
                </div>
              </div>
              {novoFornErro && <div className="nf-tab__sub nf-manual__modal-erro">{novoFornErro}</div>}
              <div className="nf-manual__modal-acoes">
                <button
                  onClick={() => { setShowNovoForn(false); setNovoFornErro(""); }}
                  className="nf-tab__body nf-manual__btn-modal nf-manual__btn-modal--secundario"
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
                  className="nf-tab__body nf-manual__btn-modal nf-manual__btn-modal--primario"
                >
                  {fornSaving ? "Salvando..." : "Cadastrar"}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

        {/* Itens */}
        <div className="nf-tab__card nf-tab__card--tabela">
          <div className="nf-manual__itens-topo">
            <div className="nf-tab__subtitle nf-manual__itens-titulo">Itens da nota</div>
            <button
              onClick={addItem}
              className="nf-tab__sub nf-manual__btn-add"
            >
              <LuPlus size={13} /> Adicionar item
            </button>
          </div>
          <div className="nf-tab__tabela-scroll">
            <table className="nf-tab__tabela nf-tab__tabela--itens">
              <thead>
                <tr className="nf-tab__thead-tr">
                  {["#", "Descrição *", "Qtd *", "Unidade", "Preço Unit. (R$)", ""].map((h, i) => (
                    // TD015: cabeçalho literal dos itens manuais, não vem de dado.
                    <th key={i} className={i >= 2 ? "nf-tab__th nf-tab__th--centro" : "nf-tab__th nf-tab__th--esquerda"}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {manualItens.map((it, idx) => (
                  <tr key={it.uid} className="nf-manual__linha">
                    <td className="nf-tab__num nf-manual__td nf-manual__td--indice">{idx + 1}</td>
                    <td className="nf-manual__td">
                      <input
                        className="nf-tab__campo nf-manual__input nf-manual__input--celula"
                        placeholder="Ex: Farinha de trigo..."
                        value={it.descricaoXml}
                        onChange={e => setManualItem(idx, { descricaoXml: e.target.value })}
                      />
                    </td>
                    <td className="nf-manual__td nf-manual__td--estreita">
                      <input
                        type="number"
                        min="0"
                        step="any"
                        className="nf-tab__campo nf-manual__input nf-manual__input--celula nf-manual__input--centro"
                        placeholder="0"
                        value={it.quantidade}
                        onChange={e => setManualItem(idx, { quantidade: e.target.value })}
                      />
                    </td>
                    <td className="nf-manual__td nf-manual__td--estreita">
                      <input
                        className="nf-tab__campo nf-manual__input nf-manual__input--celula nf-manual__input--centro"
                        placeholder="KG"
                        value={it.unidadeXml}
                        onChange={e => setManualItem(idx, { unidadeXml: e.target.value })}
                      />
                    </td>
                    <td className="nf-manual__td nf-manual__td--preco">
                      <input
                        className="nf-tab__campo nf-manual__input nf-manual__input--celula nf-manual__input--direita"
                        placeholder="0,00"
                        value={it.precoUnitario}
                        onChange={e => setManualItem(idx, { precoUnitario: e.target.value })}
                      />
                    </td>
                    <td className="nf-manual__td nf-manual__td--centro">
                      {manualItens.length > 1 && (
                        <button
                          onClick={() => removeItem(idx)}
                          className="nf-manual__btn-remover"
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
          <div className="nf-tab__erro-box nf-tab__erro-box--erro">
            <LuTriangleAlert size={16} /> {manualErro}
          </div>
        )}

        <div className="nf-tab__acoes">
          <button
            onClick={() => setView("lista")}
            className="nf-tab__btn-secundario"
          >
            Cancelar
          </button>
          <button
            onClick={confirmarManual}
            className="nf-tab__btn-primario nf-tab__btn-primario--cheio nf-tab__btn-primario--accent nf-manual__btn-continuar"
          >
            Continuar → Vincular produtos
          </button>
        </div>
      </div>
    );
}
