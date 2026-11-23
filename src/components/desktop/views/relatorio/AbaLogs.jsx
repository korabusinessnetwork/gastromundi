import { listarLogsOperador } from "@/features/auditoria/dados/logsOperador";
import C from "@/constants/colors";
import { alfa } from "@/constants/colorAlfa";
import { varColor } from "@/lib/tema";
import {
  LuClipboardList
} from "react-icons/lu";
import Th from "./Th";
import Td from "./Td";
import Empty from "./Empty";
import ChipBtn from "./ChipBtn";
import ExportBar from "./ExportBar";
import { tipoLog, fmtData } from "./apoio";

// Aba Logs: o registro de ações dos operadores.
export default function AbaLogs({ tela }) {
  const {
    logTipo, setLogTipo, setOpLogs, loadingLogs, setLoadingLogs, sz, logsFiltrados, exportLogs,
  } = tela;
  return (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ display: "flex", gap: 8, padding: `${sz.padSm}px ${sz.pad}px`, flexShrink: 0, flexWrap: "wrap", alignItems: "center" }}>
              {[
                { id: "todos", label: "Todos" },
                { id: "venda", label: "🧾 Vendas" },
                { id: "caixa", label: "🏦 Caixa" },
                { id: "auth",  label: "Auth" },
              ].map(({ id, label }) => (
                <ChipBtn key={id} active={logTipo === id} onClick={() => setLogTipo(id)} sz={sz}>
                  {label}
                </ChipBtn>
              ))}
              <div style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
                <button
                  onClick={() => {
                    setLoadingLogs(true);
                    listarLogsOperador()
                      .then(({ data }) => { setOpLogs(data ?? []); setLoadingLogs(false); });
                  }}
                  className="relatorio-view__log-refresh"
                  style={{
                    padding: "6px 14px", borderRadius: 8,
                    border: `1px solid var(${C.border})`, background: "none",
                    color: varColor(C.muted), cursor: "pointer", fontWeight: 600,
                    whiteSpace: "nowrap",
                  }}
                >
                  {loadingLogs ? "Carregando…" : "↻ Atualizar"}
                </button>
                <ExportBar onPDF={() => exportLogs("pdf")} onXLSX={() => exportLogs("xlsx")} sz={sz} />
              </div>
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: `0 ${sz.pad}px ${sz.pad}px` }}>
              {loadingLogs ? (
                <div style={{ color: varColor(C.muted), textAlign: "center", padding: 40 }}>Carregando logs…</div>
              ) : logsFiltrados.length === 0 ? (
                <Empty icon={LuClipboardList} msg="Nenhum evento no período selecionado" sz={sz} />
              ) : (
                <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 520 }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid var(${C.border})` }}>
                      <Th>Data / Hora</Th>
                      <Th>Ação</Th>
                      <Th>Operador</Th>
                      <Th>Cargo</Th>
                      <Th>Descrição</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {logsFiltrados.map((l, i) => {
                      const tipo = tipoLog(l.action_type);
                      return (
                        <tr
                          key={l.id ?? i}
                          onMouseEnter={e => e.currentTarget.style.background = varColor(C.surface)}
                          onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                          style={{ borderBottom: `1px solid var(${C.border})`, transition: "background 0.1s" }}
                        >
                          <Td sz={sz} muted nowrap>{fmtData(l.created_at)}</Td>
                          <Td sz={sz}>
                            <span className="relatorio-view__log-tipo" style={{
                              fontWeight: 700,
                              background: alfa(tipo.color, "18"),
                              border: `1px solid ${alfa(tipo.color, "44")}`,
                              color: tipo.color,
                              padding: "3px 10px", borderRadius: 20,
                              whiteSpace: "nowrap",
                            }}>
                              {tipo.label}
                            </span>
                          </Td>
                          <Td sz={sz}>{l.payload?.name ?? l.operator_id ?? "—"}</Td>
                          <Td sz={sz}>
                            {l.payload?.role ? (
                              <span className="relatorio-view__log-role" style={{
                                fontWeight: 600,
                                background: varColor(C.surface), padding: "2px 8px",
                                borderRadius: 10, color: varColor(C.muted),
                              }}>
                                {l.payload.role}
                              </span>
                            ) : <span style={{ color: varColor(C.muted) }}>—</span>}
                          </Td>
                          <Td sz={sz} muted>{l.payload?.msg ?? l.action_type ?? "—"}</Td>
                        </tr>
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
