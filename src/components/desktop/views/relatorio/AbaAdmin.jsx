import C from "@/constants/colors";
import { alfa } from "@/constants/colorAlfa";
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
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            {/* KPIs consolidados */}
            <div style={{
              display: "grid", gridTemplateColumns: width < 700 ? "repeat(2, 1fr)" : "repeat(4, 1fr)",
              gap: sz.gap, padding: `${sz.pad}px ${sz.pad}px ${sz.padSm}px`, flexShrink: 0,
            }}>
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
            <div style={{ display: "flex", alignItems: "center", padding: `0 ${sz.pad}px ${sz.padSm}px`, flexShrink: 0, gap: 12 }}>
              <div className="relatorio-view__aviso" style={{
                flex: 1, background: `${alfa(C.accent, "10")}`, border: `1px solid ${alfa(C.accent, "33")}`,
                borderRadius: 12, padding: "10px 14px", color: varColor(C.accent), fontWeight: 600,
              }}>
                <LuShieldAlert size={14} style={{ marginRight: 6, verticalAlign: "middle" }} />
                Visão administrativa consolidada, inclui todos os operadores. Confidencial.
              </div>
              <ExportBar onPDF={() => exportAdmin("pdf")} onXLSX={() => exportAdmin("xlsx")} sz={sz} />
            </div>

            {/* Faturamento por operador */}
            <div style={{ flex: 1, overflowY: "auto", padding: `0 ${sz.pad}px ${sz.pad}px` }}>
              {adminConsolidado.porOperador.length === 0 ? (
                <Empty icon={LuChartBar} msg="Nenhuma venda no período selecionado" sz={sz} />
              ) : (
                <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 520 }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid var(${C.border})` }}>
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
                        onMouseEnter={e => e.currentTarget.style.background = varColor(C.surface)}
                        onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                        style={{ borderBottom: `1px solid var(${C.border})`, transition: "background 0.1s" }}
                      >
                        <Td sz={sz}><span style={{ fontWeight: 700 }}>{o.operador}</span></Td>
                        <Td sz={sz} right>{o.vendas}</Td>
                        <Td sz={sz} right color={varColor(C.green)}><span style={{ fontWeight: 800 }}>{fmtR(o.total)}</span></Td>
                        <Td sz={sz} right muted>{fmtR(o.ticket)}</Td>
                        <Td sz={sz} right><span style={{ fontWeight: 700 }}>{o.participacao.toFixed(1)}%</span></Td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop: `2px solid var(${C.border})` }}>
                      <td className="relatorio-view__tfoot-cell" style={{ padding: "12px 16px", fontWeight: 800 }}>
                        {adminConsolidado.porOperador.length} operador(es)
                      </td>
                      <td className="relatorio-view__tfoot-cell" style={{ padding: "12px 16px", textAlign: "right", fontWeight: 800 }}>
                        {adminConsolidado.count}
                      </td>
                      <td className="relatorio-view__tfoot-total" style={{ padding: "12px 16px", textAlign: "right", fontWeight: 900, color: varColor(C.green) }}>
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
