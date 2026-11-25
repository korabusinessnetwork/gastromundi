import { Fragment } from "react";
import { normalizarPagamentos, rotuloMetodo } from "@/utils/pagamentos";
import { rotuloDiaBR } from "@/utils/datas";
import C from "@/constants/colors";
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
import "./AbaVendas.css";

// Aba Vendas: indicadores, vendas por dia e a lista do período.
export default function AbaVendas({ tela }) {
  const {
    periodo, setPeriodo, metodoFilt, setMetodoFilt, buscaComanda, setBuscaComanda, subVendas, setSubVendas, width, customLabels, sz, vendasFiltradas, kpis, vendasPorDia, exportVendas,
  } = tela;
  return (
          <div className="aba-vendas" style={{ "--vendas-gap": `${sz.gap}px`, "--vendas-pad": `${sz.pad}px`, "--vendas-pad-sm": `${sz.padSm}px` }}>

            {/* KPIs */}
            <div className={`aba-vendas__kpis${width < 700 ? " aba-vendas__kpis--duas" : ""}`}>
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
            <div className="aba-vendas__barra">
              {/* Toggle Resumido / Detalhado */}
              <div className="aba-vendas__modos">
                {[["resumido","Resumido"],["detalhado","Detalhado"],["por-dia","Por dia"]].map(([id, label]) => (
                  <button
                    key={id}
                    onClick={() => {
                      setSubVendas(id);
                      // "Por dia" só faz sentido com mais de um dia — se estiver
                      // em "Hoje", muda para os últimos 7 dias (default do B2).
                      if (id === "por-dia" && periodo === "hoje") setPeriodo("semana");
                    }}
                    className={`relatorio-view__toggle-btn aba-vendas__modo${subVendas === id ? " aba-vendas__modo--ativo" : ""}`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Filtro método */}
              <div className="aba-vendas__metodos">
                {["todos", "dinheiro", "credito", "debito", "pix"].map(m => (
                  <ChipBtn key={m} active={metodoFilt === m} onClick={() => setMetodoFilt(m)} sz={sz}>
                    {m === "todos" ? "Todos" : (() => { const MI = METODOS_ICON[m]; return <>{MI && <MI size={13} className="aba-vendas__metodo-icone" />}{rotuloMetodo(m)}</>; })()}
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
                className="relatorio-view__busca aba-vendas__busca"
              />

              <ExportBar onPDF={() => exportVendas("pdf")} onXLSX={() => exportVendas("xlsx")} sz={sz} />
            </div>

            {/* ── RESUMIDO ── */}
            {subVendas === "resumido" && (
              <div className="aba-vendas__conteudo">
                {vendasFiltradas.length === 0 ? (
                  <Empty icon="🧾" msg={buscaComanda.trim() ? `Nenhuma comanda encontrada para "${buscaComanda.trim()}"` : "Nenhuma venda no período selecionado"} sz={sz} />
                ) : (
                  <div className="aba-vendas__rolagem">
                  <table className="aba-vendas__tabela aba-vendas__tabela--resumo">
                    <thead>
                      <tr className="aba-vendas__linha">
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
                          className="aba-vendas__linha aba-vendas__linha--destaque"
                        >
                          <Td sz={sz}><span className="aba-vendas__forte">{v.comanda ?? "—"}</span></Td>
                          <Td sz={sz}>{v.cashier ?? "—"}</Td>
                          <Td sz={sz} right>
                            {Array.isArray(v.items) ? v.items.reduce((s, it) => s + (it.qty ?? 1), 0) : "—"}
                          </Td>
                          <Td sz={sz} right>
                            <span className="relatorio-view__metodo-badge aba-vendas__metodo-badge">
                              {normalizarPagamentos(v).map((p, pi) => {
                                const MI = METODOS_ICON[p.metodo];
                                return (
                                  <Fragment key={pi}>
                                    {pi > 0 && <span className="aba-vendas__mais">+</span>}
                                    {MI && <MI size={13} className="aba-vendas__metodo-icone" />}
                                    {rotuloMetodo(p.metodo, customLabels)}
                                  </Fragment>
                                );
                              })}
                            </span>
                          </Td>
                          <Td sz={sz} right color={varColor(C.green)}>
                            <span className="aba-vendas__mais-forte">{fmtR(v.total)}</span>
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
              <div className="aba-vendas__conteudo">
                {vendasFiltradas.length === 0 ? (
                  <Empty icon="🧾" msg={buscaComanda.trim() ? `Nenhuma comanda encontrada para "${buscaComanda.trim()}"` : "Nenhuma venda no período selecionado"} sz={sz} />
                ) : (
                  <div className="aba-vendas__cartoes">
                    {vendasFiltradas.map((v, i) => {
                      const itens = Array.isArray(v.items) ? v.items : [];
                      const qtdTotal = itens.reduce((s, it) => s + (it.qty ?? 1), 0);
                      return (
                        <div
                          key={v.id ?? i}
                          className="aba-vendas__cartao"
                        >
                          {/* Cabeçalho da comanda */}
                          <div className="aba-vendas__cartao-topo">
                            <div className="aba-vendas__cartao-grupo">
                              <div className="relatorio-view__comanda-icon aba-vendas__comanda-icone">
                                🧾
                              </div>
                              <div>
                                <div className="relatorio-view__comanda-num aba-vendas__mais-forte">
                                  {v.comanda ?? "—"}
                                </div>
                                <div className="relatorio-view__comanda-meta aba-vendas__comanda-meta">
                                  {fmtData(v.at)} · {v.cashier ?? "—"}
                                </div>
                              </div>
                            </div>
                            <div className="aba-vendas__cartao-grupo">
                              <span className="relatorio-view__metodo-badge aba-vendas__metodo-badge aba-vendas__metodo-badge--largo">
                                {normalizarPagamentos(v).map((p, pi) => {
                                const MI = METODOS_ICON[p.metodo];
                                return (
                                  <Fragment key={pi}>
                                    {pi > 0 && <span className="aba-vendas__mais">+</span>}
                                    {MI && <MI size={13} className="aba-vendas__metodo-icone" />}
                                    {rotuloMetodo(p.metodo, customLabels)}
                                  </Fragment>
                                );
                              })}
                              </span>
                              <div className="aba-vendas__direita">
                                <div className="relatorio-view__comanda-total aba-vendas__total">
                                  {fmtR(v.total)}
                                </div>
                                <div className="relatorio-view__comanda-itens aba-vendas__apagado">
                                  {qtdTotal} {qtdTotal === 1 ? "item" : "itens"}
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Itens da comanda */}
                          {itens.length === 0 ? (
                            <div className="relatorio-view__sem-itens aba-vendas__sem-itens">
                              Sem itens registrados
                            </div>
                          ) : (
                            <table className="aba-vendas__tabela">
                              <thead>
                                <tr className="aba-vendas__subcabecalho">
                                  <th className="relatorio-view__subtable-th aba-vendas__subth aba-vendas__subth--esquerda">
                                    Produto
                                  </th>
                                  <th className="relatorio-view__subtable-th aba-vendas__subth aba-vendas__subth--centro">
                                    Qtd
                                  </th>
                                  <th className="relatorio-view__subtable-th aba-vendas__subth aba-vendas__subth--direita">
                                    Unit.
                                  </th>
                                  <th className="relatorio-view__subtable-th aba-vendas__subth aba-vendas__subth--direita">
                                    Subtotal
                                  </th>
                                </tr>
                              </thead>
                              <tbody>
                                {itens.map((it, j) => (
                                  <tr key={j} className="aba-vendas__item">
                                    <td className="relatorio-view__item-cell aba-vendas__celula">
                                      <div className="aba-vendas__item-nome">
                                        {it.emoji ? `${it.emoji} ` : ""}{it.name ?? "—"}
                                      </div>
                                      {it.obs && (
                                        <div className="relatorio-view__item-obs aba-vendas__item-obs">
                                          📝 {it.obs}
                                        </div>
                                      )}
                                    </td>
                                    <td className="relatorio-view__item-cell aba-vendas__celula aba-vendas__celula--qtd">
                                      {it.qty ?? 1}
                                    </td>
                                    <td className="relatorio-view__item-cell aba-vendas__celula aba-vendas__celula--unit">
                                      {fmtR(it.price)}
                                    </td>
                                    <td className="relatorio-view__item-cell aba-vendas__celula aba-vendas__celula--subtotal">
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
              <div className="aba-vendas__conteudo">
                {vendasPorDia.length === 0 ? (
                  <Empty icon="📅" msg="Nenhuma venda no período selecionado" sz={sz} />
                ) : (
                  <div className="aba-vendas__rolagem">
                  <table className="aba-vendas__tabela aba-vendas__tabela--dias">
                    <thead>
                      <tr className="aba-vendas__linha">
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
                          className="aba-vendas__linha aba-vendas__linha--destaque"
                        >
                          <Td sz={sz} nowrap><span className="aba-vendas__forte">{rotuloDiaBR(d.dia)}</span></Td>
                          <Td sz={sz} right>{d.comandas}</Td>
                          <Td sz={sz} right muted>{fmtR(d.metodos.dinheiro ?? 0)}</Td>
                          <Td sz={sz} right muted>{fmtR(d.metodos.credito ?? 0)}</Td>
                          <Td sz={sz} right muted>{fmtR(d.metodos.debito ?? 0)}</Td>
                          <Td sz={sz} right muted>{fmtR(d.metodos.pix ?? 0)}</Td>
                          <Td sz={sz} right color={varColor(C.green)}><span className="aba-vendas__mais-forte">{fmtR(d.total)}</span></Td>
                          <Td sz={sz} right color={varColor(C.accent)}><span className="aba-vendas__forte">{fmtR(d.ticket)}</span></Td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="aba-vendas__rodape">
                        <td className="relatorio-view__tfoot-cell aba-vendas__rodape-celula">
                          {vendasPorDia.length} dia(s)
                        </td>
                        <td className="relatorio-view__tfoot-cell aba-vendas__rodape-celula aba-vendas__rodape-celula--direita">
                          {vendasPorDia.reduce((s, d) => s + d.comandas, 0)}
                        </td>
                        <td colSpan={4} />
                        <td className="relatorio-view__tfoot-total aba-vendas__rodape-total">
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
