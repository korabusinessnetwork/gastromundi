import C from "@/constants/colors";
import { alfa } from "@/constants/colorAlfa";
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
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

            {/* KPIs */}
            <div style={{
              display: "grid", gridTemplateColumns: width < 700 ? "repeat(2, 1fr)" : "repeat(4, 1fr)",
              gap: sz.gap, padding: `${sz.pad}px ${sz.pad}px ${sz.padSm}px`,
              flexShrink: 0,
            }}>
              <KpiCard label="Ocorrências"       value={kpisCancelamentos.total}                        color={varColor(C.red)}    Icon={LuCircleX}       sz={sz} />
              <KpiCard label="Itens Cancelados"  value={kpisCancelamentos.qtd}                          color="#f97316"  Icon={LuPackage}       sz={sz} />
              <KpiCard label="Valor Perdido"     value={fmtR(kpisCancelamentos.valor)}                  color={varColor(C.red)}    Icon={LuBanknote}      sz={sz} />
              <KpiCard label="Motivo Mais Comum" value={kpisCancelamentos.topMotivo}                    color={varColor(C.muted)}  Icon={LuTriangleAlert} sz={sz} />
            </div>

            {/* Toolbar */}
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "flex-end",
              padding: `0 ${sz.pad}px ${sz.padSm}px`, flexShrink: 0,
            }}>
              <ExportBar onPDF={() => exportCancelamentos("pdf")} onXLSX={() => exportCancelamentos("xlsx")} sz={sz} />
            </div>

            {/* Tabela */}
            <div style={{ flex: 1, overflowY: "auto", padding: `0 ${sz.pad}px ${sz.pad}px` }}>
              {cancelamentos.length === 0 ? (
                <Empty icon={LuCircleX} msg="Nenhum cancelamento no período selecionado" sz={sz} />
              ) : (
                <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid var(${C.border})` }}>
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
                        onMouseEnter={e => e.currentTarget.style.background = varColor(C.surface)}
                        onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                        style={{ borderBottom: `1px solid var(${C.border})`, transition: "background 0.1s" }}
                      >
                        <Td sz={sz}>
                          <span style={{ fontWeight: 700 }}>{/^\d+$/.test(String(c.comanda ?? "").trim()) ? `Comanda ${c.comanda}` : c.comanda}</span>
                        </Td>
                        <Td sz={sz}>
                          <span style={{ fontWeight: 600 }}>
                            {c.emoji ? `${c.emoji} ` : ""}{c.nome}
                          </span>
                        </Td>
                        <Td sz={sz} right>
                          <span className="relatorio-view__qtd-badge" style={{
                            fontWeight: 800, color: varColor(C.red),
                            background: `${alfa(C.red, "14")}`, border: `1px solid ${alfa(C.red, "33")}`,
                            borderRadius: 8, padding: "2px 10px",
                          }}>
                            ×{c.qty}
                          </span>
                        </Td>
                        <Td sz={sz} right color={varColor(C.red)}>
                          <span style={{ fontWeight: 800 }}>- {fmtR(c.price * c.qty)}</span>
                        </Td>
                        <Td sz={sz}>
                          {c.motivo !== "—" ? (
                            <span className="relatorio-view__motivo-chip" style={{
                              color: varColor(C.muted),
                              background: varColor(C.surface), borderRadius: 8,
                              padding: "3px 10px", display: "inline-block",
                              maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                            }}
                              title={c.motivo}
                            >
                              {c.motivo}
                            </span>
                          ) : <span style={{ color: varColor(C.muted) }}>—</span>}
                        </Td>
                        <Td sz={sz}>
                          {c.canceladoPor && c.canceladoPor !== "—"
                            ? <span style={{ fontWeight: 600, color: varColor(C.red) }}>{c.canceladoPor}</span>
                            : <span style={{ color: varColor(C.muted) }}>—</span>}
                        </Td>
                        <Td sz={sz}>
                          {c.cashier && c.cashier !== "—"
                            ? <span style={{ fontWeight: 600, color: varColor(C.text) }}>{c.cashier}</span>
                            : <span style={{ color: varColor(C.muted) }}>—</span>}
                        </Td>
                        <Td sz={sz}>
                          <span className="relatorio-view__origem-badge" style={{
                            fontWeight: 700,
                            padding: "3px 10px", borderRadius: 20,
                            background: c.origem === "Em aberto" ? `${alfa(C.accent, "14")}` : `${alfa(C.green, "14")}`,
                            border: `1px solid ${alfa(c.origem === "Em aberto" ? C.accent : C.green, "44")}`,
                            color: c.origem === "Em aberto" ? varColor(C.accent) : varColor(C.green),
                          }}>
                            {c.origem}
                          </span>
                        </Td>
                        <Td sz={sz} right muted nowrap>{fmtData(c.at)}</Td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop: `2px solid var(${C.border})` }}>
                      <td colSpan={3} className="relatorio-view__tfoot-cell" style={{ padding: "12px 16px", fontWeight: 700, color: varColor(C.muted) }}>
                        {kpisCancelamentos.qtd} item(ns) cancelado(s)
                      </td>
                      <td className="relatorio-view__tfoot-total" style={{ padding: "12px 16px", textAlign: "right", fontWeight: 900, color: varColor(C.red) }}>
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
