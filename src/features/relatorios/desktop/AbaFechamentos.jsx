import { Fragment } from "react";
import { diferencaCaixa, situacaoCaixa } from "@/features/caixa/regras/caixa";
import C from "@/constants/colors";
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
          <div className="rel-aba">
            <div className="rel-barra rel-barra--fim rel-barra--topo">
              <ExportBar onPDF={() => exportFechamentos("pdf")} onXLSX={() => exportFechamentos("xlsx")} sz={sz} />
            </div>
            <div className="rel-conteudo">
              {fechsFiltrados.length === 0 ? (
                <Empty icon={LuLock} msg="Nenhum fechamento no período selecionado" sz={sz} />
              ) : (
                <div className="rel-rolagem">
                <table className="rel-tabela rel-tabela--540">
                  <thead>
                    <tr className="rel-linha">
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
                      const tomDif = situacaoCaixa(dif) === "falta" ? "perigo" : "ok";
                      const hasObs = !!f.observacao;
                      return (
                        <Fragment key={f.id ?? i}>
                          <tr
                            onClick={() => setFechDetalhe(f)}
                            className={`rel-linha rel-linha--destaque rel-linha--clicavel${hasObs ? " rel-linha--com-obs" : ""}`}
                          >
                            <Td sz={sz} muted nowrap>{fmtData(f.at)}</Td>
                            <Td sz={sz}>{f.user ?? "—"}</Td>
                            <Td sz={sz} right>{fmtR(f.fundo)}</Td>
                            <Td sz={sz} right><span className="rel-forte">{fmtR(f.totalVendas)}</span></Td>
                            <Td sz={sz} right color={varColor(C.green)}><span className="rel-forte">{fmtR(f.totalConferido)}</span></Td>
                            <Td sz={sz} right color={tomDif === "perigo" ? varColor(C.red) : varColor(C.green)}>
                              <span className="rel-mais-forte">{dif > 0 ? "+" : ""}{fmtR(dif)}</span>
                            </Td>
                            <Td sz={sz} right>
                              <span className="relatorio-view__ver-detalhes">
                                Ver detalhes
                              </span>
                            </Td>
                          </tr>
                          {hasObs && (
                            <tr
                              onClick={() => setFechDetalhe(f)}
                              className="rel-linha rel-linha--clicavel"
                            >
                              <td colSpan={7} className="relatorio-view__fech-obs-celula">
                                <div className="relatorio-view__fech-obs">
                                  <span className="relatorio-view__fech-obs-label">
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
