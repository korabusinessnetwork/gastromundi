// O dia UTC vira às 21h de Brasília: a nota lançada à noite nascia com a data
// de emissão de amanhã e a entrada de estoque caía no dia seguinte.
// A quantidade convertida vai direto para o saldo do estoque: sem arredondar,
// 3 × 0,35 grava 1.0499999999999998 e o saldo carrega a sujeira para sempre.
// TD015: a linha da nota carrega estado próprio (busca do produto, dropdown
// aberto), então a chave de renderização não pode ser a posição na lista.
import {
  LuUpload, LuFileText, LuChevronRight
} from "react-icons/lu";
import { fmtDt, fmtR, fmtCnpj } from "./apoio";

// Lista das notas importadas, a tela inicial da aba.
export default function NotaLista({ nf }) {
  const {
    notas, loadingList, startWizard, startManual, openDetalhe,
  } = nf;
  return (
    <div>
      {/* Header */}
      <div className="nf-tab__lista-header">
        <div className="nf-tab__sub nf-tab__muted">
          {loadingList ? "Carregando..." : `${notas.length} ${notas.length === 1 ? "nota importada" : "notas importadas"}`}
        </div>
        <div className="nf-tab__lista-acoes">
          <button
            onClick={startManual}
            className="nf-tab__btn-secundario nf-tab__btn-secundario--compacto"
          >
            Nova nota manual
          </button>
          <button
            onClick={startWizard}
            className="nf-tab__body nf-tab__btn-importar"
          >
            <LuUpload size={15} /> Importar XML
          </button>
        </div>
      </div>

      {loadingList ? (
        <div className="nf-tab__carregando">Carregando...</div>
      ) : notas.length === 0 ? (
        <div className="nf-tab__vazio">
          <LuFileText size={48} className="nf-tab__vazio-icone" />
          <div className="nf-tab__subtitle nf-tab__vazio-titulo">Nenhuma nota importada</div>
          <div className="nf-tab__sub">Clique em "Importar XML" para começar</div>
        </div>
      ) : (
        <div className="nf-tab__tabela-moldura">
          <div className="nf-tab__tabela-scroll">
          <table className="nf-tab__tabela nf-tab__tabela--historico">
            <thead>
              <tr className="nf-tab__thead-tr">
                {["Data", "Fornecedor", "Nº Nota", "Série", "Valor Total", "Itens", "Status", ""].map((h, i) => (
                  // TD015: cabeçalho literal do histórico, não vem de dado.
                  <th key={i} className={i >= 4 ? "nf-tab__th nf-tab__th--centro" : "nf-tab__th"}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {notas.map(nota => (
                <tr
                  key={nota.id}
                  className="nf-tab__tr nf-tab__tr--clicavel"
                  onClick={() => openDetalhe(nota)}
                >
                  <td className="nf-tab__td nf-tab__sub nf-tab__muted">{fmtDt(nota.data_emissao)}</td>
                  <td className="nf-tab__td nf-tab__body nf-tab__td--fornecedor">
                    <div className="nf-tab__elipse">{nota.fornecedor_nome}</div>
                    <div className="nf-tab__cap nf-tab__muted">{fmtCnpj(nota.fornecedor_cnpj)}</div>
                  </td>
                  <td className="nf-tab__td nf-tab__sub nf-tab__td--numero">{nota.numero}</td>
                  <td className="nf-tab__td nf-tab__sub nf-tab__muted">{nota.serie || "—"}</td>
                  <td className="nf-tab__td nf-tab__body-num nf-tab__td--valor">{fmtR(nota.valor_total)}</td>
                  <td className="nf-tab__td nf-tab__sub-num nf-tab__td--centro-muted">
                    {nota.notas_fiscais_itens?.length ?? 0}
                  </td>
                  <td className="nf-tab__td nf-tab__td--centro">
                    <span className="nf-tab__badge-status nf-tab__badge-status--ok">
                      {nota.status || "importada"}
                    </span>
                  </td>
                  <td className="nf-tab__td nf-tab__td--centro">
                    <LuChevronRight size={16} className="nf-tab__seta" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </div>
  );
}
