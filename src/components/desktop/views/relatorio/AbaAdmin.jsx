import C from "@/constants/colors";
import { varColor } from "@/lib/tema";
import {
  LuBanknote, LuReceipt, LuChartBar, LuZap, LuShieldAlert
} from "react-icons/lu";
import KpiCard from "./KpiCard";
import Th from "./Th";
import Td from "./Td";
import Empty from "./Empty";
import ExportBar from "./ExportBar";
import { fmtR } from "./apoio";

// Aba Admin: a visão consolidada, só para quem administra o sistema.
export default function AbaAdmin({ tela }) {
  const {
    width, sz, adminConsolidado, exportAdmin,
  } = tela;
  return (
          <div className="rel-aba">
            {/* KPIs consolidados */}
            <div className={`rel-kpis${width < 700 ? " rel-kpis--duas" : ""}`}>
              <KpiCard label="Faturamento do Período" value={fmtR(adminConsolidado.totalAtual)} color={varColor(C.green)} Icon={LuBanknote} sz={sz} />
              <KpiCard
                label="Período Anterior"
                value={adminConsolidado.totalAnterior != null ? fmtR(adminConsolidado.totalAnterior) : "—"}
                color={varColor(C.muted)} Icon={LuChartBar} sz={sz}
              />
              <KpiCard
                label="Variação"
                value={adminConsolidado.variacao != null ? `${adminConsolidado.variacao >= 0 ? "+" : ""}${adminConsolidado.variacao.toFixed(1)}%` : "—"}
                color={adminConsolidado.variacao == null ? varColor(C.muted) : adminConsolidado.variacao >= 0 ? varColor(C.green) : varColor(C.red)}
                Icon={LuZap} sz={sz}
              />
              <KpiCard label="Ticket Médio" value={fmtR(adminConsolidado.ticket)} color={varColor(C.accent)} Icon={LuReceipt} sz={sz} />
            </div>

            {/* Toolbar */}
            <div className="rel-barra rel-barra--espacada">
              <div className="relatorio-view__aviso relatorio-view__aviso--destaque">
                <LuShieldAlert size={14} className="relatorio-view__aviso-icone" />
                Visão administrativa consolidada, inclui todos os operadores. Confidencial.
              </div>
              <ExportBar onPDF={() => exportAdmin("pdf")} onXLSX={() => exportAdmin("xlsx")} sz={sz} />
            </div>

            {/* Faturamento por operador */}
            <div className="rel-conteudo">
              {adminConsolidado.porOperador.length === 0 ? (
                <Empty icon={LuChartBar} msg="Nenhuma venda no período selecionado" sz={sz} />
              ) : (
                <div className="rel-rolagem">
                <table className="rel-tabela rel-tabela--520">
                  <thead>
                    <tr className="rel-linha">
                      <Th>Operador</Th>
                      <Th right>Vendas</Th>
                      <Th right>Total</Th>
                      <Th right>Ticket Médio</Th>
                      <Th right>Participação</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {adminConsolidado.porOperador.map((o) => (
                      <tr
                        key={o.operador}
                        className="rel-linha rel-linha--destaque"
                      >
                        <Td sz={sz}><span className="rel-forte">{o.operador}</span></Td>
                        <Td sz={sz} right>{o.vendas}</Td>
                        <Td sz={sz} right color={varColor(C.green)}><span className="rel-mais-forte">{fmtR(o.total)}</span></Td>
                        <Td sz={sz} right muted>{fmtR(o.ticket)}</Td>
                        <Td sz={sz} right><span className="rel-forte">{o.participacao.toFixed(1)}%</span></Td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="rel-rodape">
                      <td className="relatorio-view__tfoot-cell rel-rodape-celula">
                        {adminConsolidado.porOperador.length} operador(es)
                      </td>
                      <td className="relatorio-view__tfoot-cell rel-rodape-celula rel-rodape-celula--direita">
                        {adminConsolidado.count}
                      </td>
                      <td className="relatorio-view__tfoot-total rel-rodape-total">
                        {fmtR(adminConsolidado.totalAtual)}
                      </td>
                      <td colSpan={2} />
                    </tr>
                  </tfoot>
                </table>
                </div>
              )}
            </div>
          </div>
  );
}
