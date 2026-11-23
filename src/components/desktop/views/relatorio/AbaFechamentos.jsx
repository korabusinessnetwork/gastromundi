import { Fragment } from "react";
import { diferencaCaixa, situacaoCaixa } from "@/lib/caixa";
import C from "@/constants/colors";
import { alfa } from "@/constants/colorAlfa";
import { varColor } from "@/lib/tema";
import {
  LuLock
} from "react-icons/lu";
import Th from "./Th";
import Td from "./Td";
import Empty from "./Empty";
import ExportBar from "./ExportBar";
import { fmtData, fmtR } from "./apoio";

// Aba Fechamentos: os fechamentos de caixa do período.
export default function AbaFechamentos({ tela }) {
  const {
    setFechDetalhe, sz, fechsFiltrados, exportFechamentos,
  } = tela;
  return (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ display: "flex", justifyContent: "flex-end", padding: `${sz.padSm}px ${sz.pad}px`, flexShrink: 0 }}>
              <ExportBar onPDF={() => exportFechamentos("pdf")} onXLSX={() => exportFechamentos("xlsx")} sz={sz} />
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: `0 ${sz.pad}px ${sz.pad}px` }}>
              {fechsFiltrados.length === 0 ? (
                <Empty icon={LuLock} msg="Nenhum fechamento no período selecionado" sz={sz} />
              ) : (
                <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 540 }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid var(${C.border})` }}>
                      <Th>Data / Hora</Th>
                      <Th>Usuário</Th>
                      <Th right>Fundo de Caixa</Th>
                      <Th right>Total Vendas</Th>
                      <Th right>Conferido</Th>
                      <Th right>Diferença</Th>
                      <Th></Th>
                    </tr>
                  </thead>
                  <tbody>
                    {fechsFiltrados.map((f, i) => {
                      const dif = diferencaCaixa(f);
                      const corDif = situacaoCaixa(dif) === "falta" ? C.red : C.green;
                      const hasObs = !!f.observacao;
                      return (
                        <Fragment key={f.id ?? i}>
                          <tr
                            onClick={() => setFechDetalhe(f)}
                            onMouseEnter={e => e.currentTarget.style.background = varColor(C.surface)}
                            onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                            style={{
                              borderBottom: hasObs ? "none" : `1px solid var(${C.border})`,
                              transition: "background 0.1s", cursor: "pointer",
                            }}
                          >
                            <Td sz={sz} muted nowrap>{fmtData(f.at)}</Td>
                            <Td sz={sz}>{f.user ?? "—"}</Td>
                            <Td sz={sz} right>{fmtR(f.fundo)}</Td>
                            <Td sz={sz} right><span style={{ fontWeight: 700 }}>{fmtR(f.totalVendas)}</span></Td>
                            <Td sz={sz} right color={varColor(C.green)}><span style={{ fontWeight: 700 }}>{fmtR(f.totalConferido)}</span></Td>
                            <Td sz={sz} right color={varColor(corDif)}>
                              <span style={{ fontWeight: 800 }}>{dif > 0 ? "+" : ""}{fmtR(dif)}</span>
                            </Td>
                            <Td sz={sz} right>
                              <span className="relatorio-view__ver-detalhes" style={{
                                fontWeight: 600, color: varColor(C.accent),
                                padding: "3px 10px", borderRadius: 20,
                                background: `${alfa(C.accent, "10")}`, border: `1px solid ${alfa(C.accent, "33")}`,
                                whiteSpace: "nowrap",
                              }}>
                                Ver detalhes
                              </span>
                            </Td>
                          </tr>
                          {hasObs && (
                            <tr
                              onClick={() => setFechDetalhe(f)}
                              style={{ borderBottom: `1px solid var(${C.border})`, cursor: "pointer" }}
                            >
                              <td colSpan={7} style={{ padding: "0 16px 10px" }}>
                                <div className="relatorio-view__fech-obs" style={{
                                  color: varColor(C.muted), fontStyle: "italic",
                                }}>
                                  <span className="relatorio-view__fech-obs-label" style={{
                                    fontStyle: "normal", fontWeight: 700,
                                    color: varColor(C.accent), marginRight: 6,
                                    textTransform: "uppercase", letterSpacing: 0.5,
                                  }}>
                                    Obs.:
                                  </span>
                                  {f.observacao}
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
                </div>
              )}
            </div>
          </div>
  );
}
