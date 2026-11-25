import { listarLogsOperador } from "@/features/auditoria/dados/logsOperador";
import {
  LuClipboardList, LuReceipt, LuLandmark
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
          <div className="rel-aba">
            <div className="rel-barra rel-barra--topo rel-barra--filtros">
              {[
                { id: "todos", label: "Todos" },
                { id: "venda", label: "Vendas", Icon: LuReceipt },
                { id: "caixa", label: "Caixa", Icon: LuLandmark },
                { id: "auth",  label: "Auth" },
              ].map(({ id, label, Icon }) => (
                <ChipBtn key={id} active={logTipo === id} onClick={() => setLogTipo(id)} sz={sz}>
                  {Icon && <Icon size={13} className="relatorio-view__chip-icone" />}{label}
                </ChipBtn>
              ))}
              <div className="relatorio-view__log-acoes">
                <button
                  onClick={() => {
                    setLoadingLogs(true);
                    listarLogsOperador()
                      .then(({ data }) => { setOpLogs(data ?? []); setLoadingLogs(false); });
                  }}
                  className="relatorio-view__log-refresh"
                >
                  {loadingLogs ? "Carregando…" : "↻ Atualizar"}
                </button>
                <ExportBar onPDF={() => exportLogs("pdf")} onXLSX={() => exportLogs("xlsx")} sz={sz} />
              </div>
            </div>

            <div className="rel-conteudo">
              {loadingLogs ? (
                <div className="rel-carregando">Carregando logs…</div>
              ) : logsFiltrados.length === 0 ? (
                <Empty icon={LuClipboardList} msg="Nenhum evento no período selecionado" sz={sz} />
              ) : (
                <div className="rel-rolagem">
                <table className="rel-tabela rel-tabela--520">
                  <thead>
                    <tr className="rel-linha">
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
                          className="rel-linha rel-linha--destaque"
                        >
                          <Td sz={sz} muted nowrap>{fmtData(l.created_at)}</Td>
                          <Td sz={sz}>
                            <span className="relatorio-view__log-tipo" style={{ "--log-cor": tipo.color }}>
                              {tipo.label}
                            </span>
                          </Td>
                          <Td sz={sz}>{l.payload?.name ?? l.operator_id ?? "—"}</Td>
                          <Td sz={sz}>
                            {l.payload?.role ? (
                              <span className="relatorio-view__log-role">
                                {l.payload.role}
                              </span>
                            ) : <span className="rel-apagado">—</span>}
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
