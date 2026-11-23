// O dia UTC vira às 21h de Brasília: a nota lançada à noite nascia com a data
// de emissão de amanhã e a entrada de estoque caía no dia seguinte.
// A quantidade convertida vai direto para o saldo do estoque: sem arredondar,
// 3 × 0,35 grava 1.0499999999999998 e o saldo carrega a sujeira para sempre.
// TD015: a linha da nota carrega estado próprio (busca do produto, dropdown
// aberto), então a chave de renderização não pode ser a posição na lista.
import {
  LuArrowLeft
} from "react-icons/lu";
import { fmtDt, fmtR, fmtCnpj } from "./apoio";

// Detalhe de uma nota já importada: cabeçalho e itens.
export default function NotaDetalhe({ nf }) {
  const {
    setView, notaDetalhe, notaItens,
  } = nf;
    const cab = notaDetalhe;
    return (
      <div>
        <button
          onClick={() => setView("lista")}
          className="nf-tab__voltar-btn nf-tab__voltar-btn--solto"
        >
          <LuArrowLeft size={14} /> Voltar
        </button>

        <div className="nf-tab__card nf-tab__card--cabecalho">
          <div className="nf-tab__title nf-tab__cabecalho-titulo">
            Nota nº {cab.numero} — {cab.fornecedor_nome}
          </div>
          <div className="nf-tab__cabecalho-grid">
            {[
              { label: "Fornecedor",    value: cab.fornecedor_nome },
              { label: "CNPJ",          value: fmtCnpj(cab.fornecedor_cnpj) },
              { label: "Série",         value: cab.serie || "—" },
              { label: "Data Emissão",  value: fmtDt(cab.data_emissao) },
              { label: "Valor Total",   value: fmtR(cab.valor_total) },
              { label: "Importada em",  value: fmtDt(cab.created_at?.split("T")[0]) },
            ].map(f => (
              <div key={f.label}>
                <div className="nf-tab__label nf-tab__campo-rotulo">{f.label}</div>
                <div className="nf-tab__body nf-tab__campo-valor">{f.value}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="nf-tab__tabela-moldura">
          <div className="nf-tab__tabela-scroll">
          <table className="nf-tab__tabela nf-tab__tabela--itens">
            <thead>
              <tr className="nf-tab__thead-tr">
                {["#", "Descrição XML", "Cód.", "Qtd", "Unid.", "Preço Unit.", "Produto", "Qtd Estoque"].map((h, i) => (
                  // TD015: cabeçalho literal da lista de notas, não vem de dado.
                  <th key={i} className={i >= 3 ? "nf-tab__th nf-tab__th--centro" : "nf-tab__th"}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {notaItens.map((it, i) => (
                <tr key={it.id} className="nf-tab__tr">
                  <td className="nf-tab__td nf-tab__num nf-tab__muted">{i + 1}</td>
                  <td className="nf-tab__td nf-tab__sub nf-tab__td--descricao-nota">
                    <div className="nf-tab__elipse">{it.descricao_xml}</div>
                  </td>
                  <td className="nf-tab__td nf-tab__mono nf-tab__muted">{it.codigo_xml}</td>
                  <td className="nf-tab__td nf-tab__sub-num nf-tab__td--centro">{it.quantidade}</td>
                  <td className="nf-tab__td nf-tab__cap nf-tab__td--centro-muted">{it.unidade_xml}</td>
                  <td className="nf-tab__td nf-tab__num nf-tab__td--centro-muted">{fmtR(it.preco_unitario)}</td>
                  <td className="nf-tab__td nf-tab__sub">
                    {it.products ? (
                      <span className="nf-tab__produto-linha">
                        <span>{it.products.emoji || "📦"}</span>
                        <span className="nf-tab__produto-nome">{it.products.name}</span>
                      </span>
                    ) : (
                      <span className="nf-tab__cap nf-tab__inerte">Não vinculado</span>
                    )}
                  </td>
                  <td className={`nf-tab__td nf-tab__sub-num nf-tab__td--estoque${it.quantidade_estoque ? " nf-tab__td--estoque-ok" : ""}`}>
                    {it.quantidade_estoque != null ? `${Number(it.quantidade_estoque).toFixed(3)} ${it.products?.unidade_estoque || ""}` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      </div>
    );
}
