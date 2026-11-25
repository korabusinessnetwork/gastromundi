import C from "@/constants/colors";
import { varColor } from "@/lib/tema";
import {
  LuBanknote, LuTriangleAlert, LuPackage, LuCircleX
} from "react-icons/lu";
import KpiCard from "./KpiCard";
import Th from "./Th";
import Td from "./Td";
import Empty from "./Empty";
import ExportBar from "./ExportBar";
import { fmtData, fmtR } from "./apoio";

// Aba Cancelamentos: o que foi cancelado no período e por quem.
export default function AbaCancelamentos({ tela }) {
  const {
    width, sz, cancelamentos, kpisCancelamentos, exportCancelamentos,
  } = tela;
  return (
          <div className="rel-aba">

            {/* KPIs */}
            <div className={`rel-kpis${width < 700 ? " rel-kpis--duas" : ""}`}>
              <KpiCard label="Ocorrências"       value={kpisCancelamentos.total}                        color={varColor(C.red)}    Icon={LuCircleX}       sz={sz} />
              <KpiCard label="Itens Cancelados"  value={kpisCancelamentos.qtd}                          color="#f97316"  Icon={LuPackage}       sz={sz} />
              <KpiCard label="Valor Perdido"     value={fmtR(kpisCancelamentos.valor)}                  color={varColor(C.red)}    Icon={LuBanknote}      sz={sz} />
              <KpiCard label="Motivo Mais Comum" value={kpisCancelamentos.topMotivo}                    color={varColor(C.muted)}  Icon={LuTriangleAlert} sz={sz} />
            </div>

            {/* Toolbar */}
            <div className="rel-barra rel-barra--fim">
              <ExportBar onPDF={() => exportCancelamentos("pdf")} onXLSX={() => exportCancelamentos("xlsx")} sz={sz} />
            </div>

            {/* Tabela */}
            <div className="rel-conteudo">
              {cancelamentos.length === 0 ? (
                <Empty icon={LuCircleX} msg="Nenhum cancelamento no período selecionado" sz={sz} />
              ) : (
                <div className="rel-rolagem">
                <table className="rel-tabela rel-tabela--640">
                  <thead>
                    <tr className="rel-linha">
                      <Th>Comanda</Th>
                      <Th>Produto</Th>
                      <Th right>Qtd</Th>
                      <Th right>Valor</Th>
                      <Th>Motivo</Th>
                      <Th>Cancelado por</Th>
                      <Th>Finalizado por</Th>
                      <Th>Origem</Th>
                      <Th right>Data / Hora</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {cancelamentos.map((c, i) => (
                      // TD015: o `uid` vem do item da comanda (`comandaItens.js`). O `?? i` cobre
                      // venda antiga, fechada antes de os itens passarem a nascer com identidade.
                      <tr
                        key={c.uid ?? i}
                        className="rel-linha rel-linha--destaque"
                      >
                        <Td sz={sz}>
                          <span className="rel-forte">{/^\d+$/.test(String(c.comanda ?? "").trim()) ? `Comanda ${c.comanda}` : c.comanda}</span>
                        </Td>
                        <Td sz={sz}>
                          <span className="rel-semi">
                            {c.emoji ? `${c.emoji} ` : ""}{c.nome}
                          </span>
                        </Td>
                        <Td sz={sz} right>
                          <span className="relatorio-view__qtd-badge">
                            ×{c.qty}
                          </span>
                        </Td>
                        <Td sz={sz} right color={varColor(C.red)}>
                          <span className="rel-mais-forte">- {fmtR(c.price * c.qty)}</span>
                        </Td>
                        <Td sz={sz}>
                          {c.motivo !== "—" ? (
                            <span className="relatorio-view__motivo-chip"
                              title={c.motivo}
                            >
                              {c.motivo}
                            </span>
                          ) : <span className="rel-apagado">—</span>}
                        </Td>
                        <Td sz={sz}>
                          {c.canceladoPor && c.canceladoPor !== "—"
                            ? <span className="rel-semi rel-perigo">{c.canceladoPor}</span>
                            : <span className="rel-apagado">—</span>}
                        </Td>
                        <Td sz={sz}>
                          {c.cashier && c.cashier !== "—"
                            ? <span className="rel-semi rel-texto">{c.cashier}</span>
                            : <span className="rel-apagado">—</span>}
                        </Td>
                        <Td sz={sz}>
                          <span className={`relatorio-view__origem-badge relatorio-view__origem-badge--${c.origem === "Em aberto" ? "aberto" : "finalizado"}`}>
                            {c.origem}
                          </span>
                        </Td>
                        <Td sz={sz} right muted nowrap>{fmtData(c.at)}</Td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="rel-rodape">
                      <td colSpan={3} className="relatorio-view__tfoot-cell rel-rodape-celula rel-rodape-celula--apagada">
                        {kpisCancelamentos.qtd} item(ns) cancelado(s)
                      </td>
                      <td className="relatorio-view__tfoot-total rel-rodape-total rel-rodape-total--perigo">
                        - {fmtR(kpisCancelamentos.valor)}
                      </td>
                      <td colSpan={5} />
                    </tr>
                  </tfoot>
                </table>
                </div>
              )}
            </div>
          </div>
  );
}
