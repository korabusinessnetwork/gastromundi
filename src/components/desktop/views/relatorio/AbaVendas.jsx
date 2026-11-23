import { Fragment } from "react";
import { normalizarPagamentos, rotuloMetodo } from "@/utils/pagamentos";
import { rotuloDiaBR } from "@/utils/datas";
import C from "@/constants/colors";
import { alfa } from "@/constants/colorAlfa";
import { varColor } from "@/lib/tema";
import {
  LuBanknote, LuReceipt, LuChartBar, LuCreditCard
} from "react-icons/lu";
import KpiCard from "./KpiCard";
import Th from "./Th";
import Td from "./Td";
import Empty from "./Empty";
import ChipBtn from "./ChipBtn";
import ExportBar from "./ExportBar";
import { METODOS_ICON, fmtData, fmtR } from "./apoio";

// Aba Vendas: indicadores, vendas por dia e a lista do período.
export default function AbaVendas({ tela }) {
  const {
    periodo, setPeriodo, metodoFilt, setMetodoFilt, buscaComanda, setBuscaComanda, subVendas, setSubVendas, width, customLabels, sz, vendasFiltradas, kpis, vendasPorDia, exportVendas,
  } = tela;
  return (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

            {/* KPIs */}
            <div style={{
              display: "grid", gridTemplateColumns: width < 700 ? "repeat(2, 1fr)" : "repeat(4, 1fr)",
              gap: sz.gap, padding: `${sz.pad}px ${sz.pad}px ${sz.padSm}px`,
              flexShrink: 0,
            }}>
              <KpiCard label="Total Arrecadado"  value={fmtR(kpis.total)}  color={varColor(C.green)}  Icon={LuBanknote}  sz={sz} />
              <KpiCard label="Vendas Realizadas" value={kpis.count}         color={varColor(C.blue)}   Icon={LuReceipt}   sz={sz} />
              <KpiCard label="Ticket Médio"      value={fmtR(kpis.ticket)} color={varColor(C.accent)} Icon={LuChartBar}  sz={sz} />
              <KpiCard
                label="Método Mais Usado"
                value={kpis.top ? rotuloMetodo(kpis.top[0]) : "—"}
                color={varColor(C.muted)} Icon={kpis.top ? METODOS_ICON[kpis.top[0]] : LuCreditCard} sz={sz}
              />
            </div>

            {/* Toolbar: sub-toggle + filtro método + exportar */}
            <div style={{
              display: "flex", alignItems: "center",
              padding: `0 ${sz.pad}px ${sz.padSm}px`, flexShrink: 0, gap: 12, flexWrap: "wrap",
            }}>
              {/* Toggle Resumido / Detalhado */}
              <div style={{
                display: "flex", background: varColor(C.surface),
                borderRadius: 10, padding: 3, gap: 2, flexShrink: 0,
              }}>
                {[["resumido","Resumido"],["detalhado","Detalhado"],["por-dia","Por dia"]].map(([id, label]) => (
                  <button
                    key={id}
                    onClick={() => {
                      setSubVendas(id);
                      // "Por dia" só faz sentido com mais de um dia — se estiver
                      // em "Hoje", muda para os últimos 7 dias (default do B2).
                      if (id === "por-dia" && periodo === "hoje") setPeriodo("semana");
                    }}
                    className="relatorio-view__toggle-btn"
                    style={{
                      padding: "6px 18px", borderRadius: 8, border: "none",
                      background: subVendas === id ? varColor(C.accent) : "transparent",
                      color: subVendas === id ? "#fff" : varColor(C.muted),
                      cursor: "pointer", fontWeight: 600,
                      transition: "background 0.15s, color 0.15s",
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Filtro método */}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", flex: 1 }}>
                {["todos", "dinheiro", "credito", "debito", "pix"].map(m => (
                  <ChipBtn key={m} active={metodoFilt === m} onClick={() => setMetodoFilt(m)} sz={sz}>
                    {m === "todos" ? "Todos" : (() => { const MI = METODOS_ICON[m]; return <>{MI && <MI size={13} style={{ marginRight: 4, verticalAlign: "middle" }} />}{rotuloMetodo(m)}</>; })()}
                  </ChipBtn>
                ))}
              </div>

              {/* Leva 15.5 — busca por número da comanda */}
              <input
                type="search"
                value={buscaComanda}
                onChange={e => setBuscaComanda(e.target.value)}
                placeholder="Buscar comanda..."
                aria-label="Buscar por número da comanda"
                className="relatorio-view__busca"
                style={{
                  width: 170, boxSizing: "border-box",
                  background: varColor(C.surface), border: `1px solid var(${C.border})`,
                  borderRadius: 8, padding: "7px 12px", color: varColor(C.text),
                  outline: "none",
                }}
              />

              <ExportBar onPDF={() => exportVendas("pdf")} onXLSX={() => exportVendas("xlsx")} sz={sz} />
            </div>

            {/* ── RESUMIDO ── */}
            {subVendas === "resumido" && (
              <div style={{ flex: 1, overflowY: "auto", padding: `0 ${sz.pad}px ${sz.pad}px` }}>
                {vendasFiltradas.length === 0 ? (
                  <Empty icon="🧾" msg={buscaComanda.trim() ? `Nenhuma comanda encontrada para "${buscaComanda.trim()}"` : "Nenhuma venda no período selecionado"} sz={sz} />
                ) : (
                  <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 480 }}>
                    <thead>
                      <tr style={{ borderBottom: `1px solid var(${C.border})` }}>
                        <Th>Comanda</Th>
                        <Th>Caixa</Th>
                        <Th right>Itens</Th>
                        <Th right>Método</Th>
                        <Th right>Total</Th>
                        <Th right>Data / Hora</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {vendasFiltradas.map((v, i) => (
                        <tr
                          key={v.id ?? i}
                          onMouseEnter={e => e.currentTarget.style.background = varColor(C.surface)}
                          onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                          style={{ borderBottom: `1px solid var(${C.border})`, transition: "background 0.1s" }}
                        >
                          <Td sz={sz}><span style={{ fontWeight: 700 }}>{v.comanda ?? "—"}</span></Td>
                          <Td sz={sz}>{v.cashier ?? "—"}</Td>
                          <Td sz={sz} right>
                            {Array.isArray(v.items) ? v.items.reduce((s, it) => s + (it.qty ?? 1), 0) : "—"}
                          </Td>
                          <Td sz={sz} right>
                            <span className="relatorio-view__metodo-badge" style={{
                              fontWeight: 600,
                              background: varColor(C.surface), padding: "3px 10px",
                              borderRadius: 20, color: varColor(C.muted), whiteSpace: "nowrap",
                            }}>
                              {normalizarPagamentos(v).map((p, pi) => {
                                const MI = METODOS_ICON[p.metodo];
                                return (
                                  <Fragment key={pi}>
                                    {pi > 0 && <span style={{ color: varColor(C.muted), margin: "0 4px" }}>+</span>}
                                    {MI && <MI size={13} style={{ marginRight: 4, verticalAlign: "middle" }} />}
                                    {rotuloMetodo(p.metodo, customLabels)}
                                  </Fragment>
                                );
                              })}
                            </span>
                          </Td>
                          <Td sz={sz} right color={varColor(C.green)}>
                            <span style={{ fontWeight: 800 }}>{fmtR(v.total)}</span>
                          </Td>
                          <Td sz={sz} right muted nowrap>{fmtData(v.at)}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                )}
              </div>
            )}

            {/* ── DETALHADO ── */}
            {subVendas === "detalhado" && (
              <div style={{ flex: 1, overflowY: "auto", padding: `0 ${sz.pad}px ${sz.pad}px` }}>
                {vendasFiltradas.length === 0 ? (
                  <Empty icon="🧾" msg={buscaComanda.trim() ? `Nenhuma comanda encontrada para "${buscaComanda.trim()}"` : "Nenhuma venda no período selecionado"} sz={sz} />
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    {vendasFiltradas.map((v, i) => {
                      const itens = Array.isArray(v.items) ? v.items : [];
                      const qtdTotal = itens.reduce((s, it) => s + (it.qty ?? 1), 0);
                      return (
                        <div
                          key={v.id ?? i}
                          style={{
                            background: varColor(C.card), border: `1px solid var(${C.border})`,
                            borderRadius: 16, overflow: "hidden",
                          }}
                        >
                          {/* Cabeçalho da comanda */}
                          <div style={{
                            display: "flex", alignItems: "center", justifyContent: "space-between",
                            padding: "16px 20px", borderBottom: `1px solid var(${C.border})`,
                            gap: 12, flexWrap: "wrap",
                          }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                              <div className="relatorio-view__comanda-icon" style={{
                                width: 44, height: 44, borderRadius: 12,
                                background: varColor(C.alow), border: `1.5px solid ${alfa(C.accent, "44")}`,
                                display: "flex", alignItems: "center", justifyContent: "center",
                                flexShrink: 0,
                              }}>
                                🧾
                              </div>
                              <div>
                                <div className="relatorio-view__comanda-num" style={{ fontWeight: 800 }}>
                                  {v.comanda ?? "—"}
                                </div>
                                <div className="relatorio-view__comanda-meta" style={{ color: varColor(C.muted), marginTop: 2 }}>
                                  {fmtData(v.at)} · {v.cashier ?? "—"}
                                </div>
                              </div>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                              <span className="relatorio-view__metodo-badge" style={{
                                fontWeight: 600,
                                background: varColor(C.surface), padding: "5px 14px",
                                borderRadius: 20, color: varColor(C.muted),
                              }}>
                                {normalizarPagamentos(v).map((p, pi) => {
                                const MI = METODOS_ICON[p.metodo];
                                return (
                                  <Fragment key={pi}>
                                    {pi > 0 && <span style={{ color: varColor(C.muted), margin: "0 4px" }}>+</span>}
                                    {MI && <MI size={13} style={{ marginRight: 4, verticalAlign: "middle" }} />}
                                    {rotuloMetodo(p.metodo, customLabels)}
                                  </Fragment>
                                );
                              })}
                              </span>
                              <div style={{ textAlign: "right" }}>
                                <div className="relatorio-view__comanda-total" style={{ fontWeight: 900, color: varColor(C.green) }}>
                                  {fmtR(v.total)}
                                </div>
                                <div className="relatorio-view__comanda-itens" style={{ color: varColor(C.muted) }}>
                                  {qtdTotal} {qtdTotal === 1 ? "item" : "itens"}
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Itens da comanda */}
                          {itens.length === 0 ? (
                            <div className="relatorio-view__sem-itens" style={{ padding: "14px 20px", color: varColor(C.muted) }}>
                              Sem itens registrados
                            </div>
                          ) : (
                            <table style={{ width: "100%", borderCollapse: "collapse" }}>
                              <thead>
                                <tr style={{ background: varColor(C.surface) }}>
                                  <th className="relatorio-view__subtable-th" style={{ padding: "8px 20px", fontWeight: 700, color: varColor(C.muted), textAlign: "left", textTransform: "uppercase", letterSpacing: 1 }}>
                                    Produto
                                  </th>
                                  <th className="relatorio-view__subtable-th" style={{ padding: "8px 20px", fontWeight: 700, color: varColor(C.muted), textAlign: "center", textTransform: "uppercase", letterSpacing: 1 }}>
                                    Qtd
                                  </th>
                                  <th className="relatorio-view__subtable-th" style={{ padding: "8px 20px", fontWeight: 700, color: varColor(C.muted), textAlign: "right", textTransform: "uppercase", letterSpacing: 1 }}>
                                    Unit.
                                  </th>
                                  <th className="relatorio-view__subtable-th" style={{ padding: "8px 20px", fontWeight: 700, color: varColor(C.muted), textAlign: "right", textTransform: "uppercase", letterSpacing: 1 }}>
                                    Subtotal
                                  </th>
                                </tr>
                              </thead>
                              <tbody>
                                {itens.map((it, j) => (
                                  <tr
                                    key={j}
                                    style={{ borderTop: `1px solid var(${C.border})` }}
                                  >
                                    <td className="relatorio-view__item-cell" style={{ padding: "12px 20px", color: varColor(C.text) }}>
                                      <div style={{ fontWeight: 600 }}>
                                        {it.emoji ? `${it.emoji} ` : ""}{it.name ?? "—"}
                                      </div>
                                      {it.obs && (
                                        <div className="relatorio-view__item-obs" style={{
                                          marginTop: 4,
                                          color: varColor(C.accent), fontStyle: "italic",
                                        }}>
                                          📝 {it.obs}
                                        </div>
                                      )}
                                    </td>
                                    <td className="relatorio-view__item-cell" style={{ padding: "12px 20px", textAlign: "center", fontWeight: 700, color: varColor(C.text) }}>
                                      {it.qty ?? 1}
                                    </td>
                                    <td className="relatorio-view__item-cell" style={{ padding: "12px 20px", textAlign: "right", color: varColor(C.muted) }}>
                                      {fmtR(it.price)}
                                    </td>
                                    <td className="relatorio-view__item-cell" style={{ padding: "12px 20px", textAlign: "right", fontWeight: 800, color: varColor(C.text) }}>
                                      {fmtR((it.price ?? 0) * (it.qty ?? 1))}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ── POR DIA (B2) ── */}
            {subVendas === "por-dia" && (
              <div style={{ flex: 1, overflowY: "auto", padding: `0 ${sz.pad}px ${sz.pad}px` }}>
                {vendasPorDia.length === 0 ? (
                  <Empty icon="📅" msg="Nenhuma venda no período selecionado" sz={sz} />
                ) : (
                  <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>
                    <thead>
                      <tr style={{ borderBottom: `1px solid var(${C.border})` }}>
                        <Th>Dia</Th>
                        <Th right>Comandas</Th>
                        <Th right>Dinheiro</Th>
                        <Th right>Crédito</Th>
                        <Th right>Débito</Th>
                        <Th right>Pix</Th>
                        <Th right>Total</Th>
                        <Th right>Ticket Médio</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {vendasPorDia.map((d) => (
                        <tr
                          key={d.dia}
                          onMouseEnter={e => e.currentTarget.style.background = varColor(C.surface)}
                          onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                          style={{ borderBottom: `1px solid var(${C.border})`, transition: "background 0.1s" }}
                        >
                          <Td sz={sz} nowrap><span style={{ fontWeight: 700 }}>{rotuloDiaBR(d.dia)}</span></Td>
                          <Td sz={sz} right>{d.comandas}</Td>
                          <Td sz={sz} right muted>{fmtR(d.metodos.dinheiro ?? 0)}</Td>
                          <Td sz={sz} right muted>{fmtR(d.metodos.credito ?? 0)}</Td>
                          <Td sz={sz} right muted>{fmtR(d.metodos.debito ?? 0)}</Td>
                          <Td sz={sz} right muted>{fmtR(d.metodos.pix ?? 0)}</Td>
                          <Td sz={sz} right color={varColor(C.green)}><span style={{ fontWeight: 800 }}>{fmtR(d.total)}</span></Td>
                          <Td sz={sz} right color={varColor(C.accent)}><span style={{ fontWeight: 700 }}>{fmtR(d.ticket)}</span></Td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ borderTop: `2px solid var(${C.border})` }}>
                        <td className="relatorio-view__tfoot-cell" style={{ padding: "12px 16px", fontWeight: 800 }}>
                          {vendasPorDia.length} dia(s)
                        </td>
                        <td className="relatorio-view__tfoot-cell" style={{ padding: "12px 16px", textAlign: "right", fontWeight: 800 }}>
                          {vendasPorDia.reduce((s, d) => s + d.comandas, 0)}
                        </td>
                        <td colSpan={4} />
                        <td className="relatorio-view__tfoot-total" style={{ padding: "12px 16px", textAlign: "right", fontWeight: 900, color: varColor(C.green) }}>
                          {fmtR(vendasPorDia.reduce((s, d) => s + d.total, 0))}
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                  </div>
                )}
              </div>
            )}
          </div>
  );
}
