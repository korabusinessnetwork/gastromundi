import { useState, useMemo, useEffect } from "react";
import { useApp } from "@/context/AppContext";
import { supabase } from "@/lib/supabase";
import { exportToPDF, exportToXLSX } from "@/lib/exportReport";
import { useResponsive } from "@/utils/hooks";
import { getSizes } from "@/constants/sizes";
import C from "@/constants/colors";
import {
  LuBanknote, LuReceipt, LuChartBar, LuCreditCard, LuZap, LuSmartphone,
  LuLock, LuTriangleAlert, LuPackage, LuClipboardList, LuShieldAlert, LuEye, LuEyeOff,
  LuPrinter, LuDownload,
} from "react-icons/lu";

const ABAS = ["Vendas", "Fechamentos", "Logs", "Credenciais"];

const PERIODOS = [
  { id: "hoje",   label: "Hoje" },
  { id: "semana", label: "7 dias" },
  { id: "mes",    label: "30 dias" },
  { id: "tudo",   label: "Tudo" },
];

const METODOS_LABEL = { dinheiro: "Dinheiro", credito: "Crédito", debito: "Débito", pix: "Pix" };
const METODOS_ICON  = { dinheiro: LuBanknote, credito: LuCreditCard, debito: LuSmartphone, pix: LuZap };
const ACTION_TYPE_META = {
  auth:    { label: "Auth",    color: C.blue      },
  caixa:   { label: "Caixa",  color: "#f59e0b"   },
  comanda: { label: "Comanda", color: C.green     },
  itens:   { label: "Itens",  color: C.green     },
  produto: { label: "Produto", color: C.accent    },
};

function tipoLog(actionType) {
  const prefix = (actionType ?? "").split(":")[0];
  return ACTION_TYPE_META[prefix] ?? { label: actionType ?? "—", color: C.muted };
}

const SALE_PREFIXES = new Set(["comanda", "itens", "produto"]);

function filtrarPorPeriodo(list, campo, periodo) {
  if (periodo === "tudo") return list;
  const hojeInicio = new Date(new Date().toDateString()).getTime();
  const dias  = periodo === "semana" ? 7 : 30;
  const desde = Date.now() - dias * 24 * 60 * 60 * 1000;
  return list.filter(r => {
    const t = r[campo] ? new Date(r[campo]).getTime() : 0;
    return periodo === "hoje" ? t >= hojeInicio : t >= desde;
  });
}

function fmtData(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" })
    + " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

const fmtR = (v) => "R$ " + Number(v ?? 0).toFixed(2);

// ── Componentes auxiliares ────────────────────────────────────────

function KpiCard({ label, value, color, Icon, sz }) {
  return (
    <div style={{
      background: C.card, border: `1px solid ${C.border}`,
      borderRadius: 16, padding: `${sz.padSm + 4}px ${sz.pad - 4}px`,
      display: "flex", flexDirection: "column", gap: 10,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {Icon && <Icon size={sz.fontLg} color={color} />}
        <span style={{ fontSize: sz.fontSm + 1, color: C.muted, fontWeight: 600 }}>{label}</span>
      </div>
      <div style={{ fontWeight: 900, fontSize: sz.fontXl, color }}>{value}</div>
    </div>
  );
}

function Th({ children, right }) {
  return (
    <th style={{
      padding: "12px 16px", textAlign: right ? "right" : "left",
      fontSize: 11, fontWeight: 700, color: C.muted,
      textTransform: "uppercase", letterSpacing: 1, whiteSpace: "nowrap",
    }}>
      {children}
    </th>
  );
}

function Td({ children, right, muted, sz, nowrap, color }) {
  return (
    <td style={{
      padding: "14px 16px", fontSize: sz.fontBase,
      textAlign: right ? "right" : "left",
      color: color ?? (muted ? C.muted : C.text),
      whiteSpace: nowrap ? "nowrap" : undefined,
      verticalAlign: "middle",
    }}>
      {children}
    </td>
  );
}

function Empty({ icon: Icon, msg, sz }) {
  const inner = typeof Icon === "string"
    ? <span style={{ fontSize: 48 }}>{Icon}</span>
    : Icon ? <Icon size={48} /> : null;
  return (
    <div style={{
      flex: 1, display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      gap: 10, color: C.muted, padding: 60,
    }}>
      <div style={{ opacity: 0.3 }}>{inner}</div>
      <div style={{ fontSize: sz.fontBase + 1, fontWeight: 600 }}>{msg}</div>
    </div>
  );
}

function ChipBtn({ active, onClick, children, sz }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "6px 14px", borderRadius: 20, border: "none",
        background: active ? C.accent : C.surface,
        color: active ? "#fff" : C.muted,
        cursor: "pointer", fontWeight: 600, fontSize: sz.fontSm + 1,
        transition: "background 0.15s, color 0.15s",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </button>
  );
}

// ── Barra de exportação ───────────────────────────────────────────

function ExportBar({ onPDF, onXLSX, sz }) {
  return (
    <div style={{ display: "flex", gap: 6, marginLeft: "auto", flexShrink: 0 }}>
      <button
        onClick={onPDF}
        title="Exportar PDF"
        style={{
          display: "flex", alignItems: "center", gap: 5,
          padding: "6px 13px", borderRadius: 8,
          border: `1px solid ${C.border}`, background: "none",
          color: C.muted, cursor: "pointer",
          fontSize: sz.fontSm + 1, fontWeight: 600, whiteSpace: "nowrap",
        }}
      >
        <LuPrinter size={13} /> PDF
      </button>
      <button
        onClick={onXLSX}
        title="Exportar XLSX"
        style={{
          display: "flex", alignItems: "center", gap: 5,
          padding: "6px 13px", borderRadius: 8,
          border: `1px solid ${C.border}`, background: "none",
          color: C.muted, cursor: "pointer",
          fontSize: sz.fontSm + 1, fontWeight: 600, whiteSpace: "nowrap",
        }}
      >
        <LuDownload size={13} /> XLSX
      </button>
    </div>
  );
}

// ── View principal ────────────────────────────────────────────────

export default function RelatorioView() {
  const { sales, fechamentos, users, credentials, currentUser } = useApp();
  const { width } = useResponsive();
  const sz = getSizes(width);

  const [aba,        setAba]        = useState("Vendas");
  const [periodo,    setPeriodo]    = useState("hoje");
  const [metodoFilt, setMetodoFilt] = useState("todos");
  const [logTipo,    setLogTipo]    = useState("todos");
  const [subVendas,  setSubVendas]  = useState("resumido");
  const [senhasVisiveis, setSenhasVisiveis] = useState({});
  const [opLogs,     setOpLogs]     = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  useEffect(() => {
    if (aba !== "Logs") return;
    setLoadingLogs(true);
    supabase
      .from("operator_logs")
      .select("id, operator_id, action_type, payload, created_at")
      .order("created_at", { ascending: false })
      .limit(2000)
      .then(({ data }) => {
        setOpLogs(data ?? []);
        setLoadingLogs(false);
      });
  }, [aba]);

  const isAdmin = currentUser?.role === "admin" || currentUser?.role === "gerente";

  // ── Vendas ────────────────────────────────────────────────────
  const vendasFiltradas = useMemo(() => {
    let l = filtrarPorPeriodo(sales, "at", periodo);
    if (metodoFilt !== "todos") l = l.filter(s => s.metodo === metodoFilt);
    return l;
  }, [sales, periodo, metodoFilt]);

  const kpis = useMemo(() => {
    const total  = vendasFiltradas.reduce((s, v) => s + (v.total ?? 0), 0);
    const count  = vendasFiltradas.length;
    const ticket = count > 0 ? total / count : 0;
    const porMetodo = {};
    vendasFiltradas.forEach(v => { porMetodo[v.metodo] = (porMetodo[v.metodo] ?? 0) + (v.total ?? 0); });
    const top = Object.entries(porMetodo).sort((a, b) => b[1] - a[1])[0];
    return { total, count, ticket, top };
  }, [vendasFiltradas]);

  // ── Fechamentos ───────────────────────────────────────────────
  const fechsFiltrados = useMemo(() =>
    filtrarPorPeriodo(fechamentos, "at", periodo),
  [fechamentos, periodo]);

  // ── Logs ──────────────────────────────────────────────────────
  const logsFiltrados = useMemo(() => {
    let l = filtrarPorPeriodo(opLogs, "created_at", periodo);
    if (logTipo === "venda")       l = l.filter(x => SALE_PREFIXES.has((x.action_type ?? "").split(":")[0]));
    else if (logTipo !== "todos")  l = l.filter(x => (x.action_type ?? "").startsWith(logTipo + ":"));
    return l;
  }, [opLogs, periodo, logTipo]);

  // ── Handlers de exportação ────────────────────────────────────
  const totalItens = (v) => Array.isArray(v.items) ? v.items.reduce((s, it) => s + (it.qty ?? 1), 0) : 0;

  const exportVendas = (fmt) => {
    if (subVendas === "resumido") {
      const headers = ["Comanda", "Caixa", "Itens", "Método", "Total (R$)", "Data/Hora"];
      const rows = vendasFiltradas.map(v => [
        v.comanda ?? "—", v.cashier ?? "—", totalItens(v),
        METODOS_LABEL[v.metodo] ?? v.metodo ?? "—",
        Number(v.total ?? 0).toFixed(2), fmtData(v.at),
      ]);
      const totais = `Total: R$ ${kpis.total.toFixed(2)} · ${kpis.count} venda(s)`;
      if (fmt === "pdf") exportToPDF("Vendas Resumido", headers, rows, periodo, { totais });
      else               exportToXLSX("Vendas Resumido", headers, rows, periodo);
    } else {
      const headers = ["Comanda", "Caixa", "Método", "Produto", "Qtd", "Unit. (R$)", "Subtotal (R$)", "Data/Hora"];
      const rows = vendasFiltradas.flatMap(v =>
        (Array.isArray(v.items) && v.items.length > 0 ? v.items : [{ name: "—", qty: 0, price: 0 }]).map(it => [
          v.comanda ?? "—", v.cashier ?? "—",
          METODOS_LABEL[v.metodo] ?? v.metodo ?? "—",
          (it.emoji ? `${it.emoji} ` : "") + (it.name ?? "—"),
          it.qty ?? 1, Number(it.price ?? 0).toFixed(2),
          Number((it.price ?? 0) * (it.qty ?? 1)).toFixed(2),
          fmtData(v.at),
        ])
      );
      if (fmt === "pdf") exportToPDF("Vendas Detalhado", headers, rows, periodo);
      else               exportToXLSX("Vendas Detalhado", headers, rows, periodo);
    }
  };

  const exportFechamentos = (fmt) => {
    const headers = ["Data/Hora", "Usuário", "Fundo (R$)", "Total Vendas (R$)", "Conferido (R$)", "Diferença (R$)"];
    const rows = fechsFiltrados.map(f => {
      const dif = (f.totalConferido ?? 0) - (f.totalVendas ?? 0);
      return [
        fmtData(f.at), f.user ?? "—",
        Number(f.fundo ?? 0).toFixed(2),
        Number(f.totalVendas ?? 0).toFixed(2),
        Number(f.totalConferido ?? 0).toFixed(2),
        (dif >= 0 ? "+" : "") + dif.toFixed(2),
      ];
    });
    if (fmt === "pdf") exportToPDF("Fechamentos de Caixa", headers, rows, periodo);
    else               exportToXLSX("Fechamentos de Caixa", headers, rows, periodo);
  };

  const exportLogs = (fmt) => {
    const headers = ["Data/Hora", "Ação", "Operador", "Cargo", "Descrição"];
    const rows = logsFiltrados.map(l => [
      fmtData(l.created_at), l.action_type ?? "—",
      l.payload?.name ?? l.operator_id ?? "—",
      l.payload?.role ?? "—",
      l.payload?.msg ?? "—",
    ]);
    if (fmt === "pdf") exportToPDF("Logs de Operadores", headers, rows, periodo);
    else               exportToXLSX("Logs de Operadores", headers, rows, periodo);
  };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", background: C.bg, overflow: "hidden" }}>

      {/* ── Header ── */}
      <div style={{
        padding: `${sz.pad - 4}px ${sz.pad}px`,
        borderBottom: `1px solid ${C.border}`,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        flexShrink: 0, gap: 16, flexWrap: "wrap",
      }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: sz.fontLg }}>Relatórios</div>
          <div style={{ color: C.muted, fontSize: sz.fontSm, marginTop: 2 }}>
            Visão geral do movimento do estabelecimento
          </div>
        </div>

        <div style={{ display: "flex", gap: 6 }}>
          {PERIODOS.map(p => (
            <button
              key={p.id}
              onClick={() => setPeriodo(p.id)}
              style={{
                padding: "8px 16px", borderRadius: 10, border: "none",
                background: periodo === p.id ? C.accent : C.surface,
                color: periodo === p.id ? "#fff" : C.muted,
                cursor: "pointer", fontWeight: 600, fontSize: sz.fontSm + 1,
                transition: "background 0.15s, color 0.15s",
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Abas ── */}
      <div style={{
        display: "flex", padding: `0 ${sz.pad}px`,
        borderBottom: `1px solid ${C.border}`, flexShrink: 0,
      }}>
        {ABAS.map(a => (
          <button
            key={a}
            onClick={() => setAba(a)}
            style={{
              padding: "14px 22px", border: "none", background: "none",
              color: aba === a ? C.accent : C.muted,
              fontWeight: aba === a ? 700 : 500,
              fontSize: sz.fontBase, cursor: "pointer",
              borderBottom: `2px solid ${aba === a ? C.accent : "transparent"}`,
              marginBottom: -1, transition: "color 0.15s",
            }}
          >
            {a}
          </button>
        ))}
      </div>

      {/* ── Conteúdo ── */}
      <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>

        {/* ══ VENDAS ══ */}
        {aba === "Vendas" && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

            {/* KPIs */}
            <div style={{
              display: "grid", gridTemplateColumns: "repeat(4, 1fr)",
              gap: sz.gap, padding: `${sz.pad}px ${sz.pad}px ${sz.padSm}px`,
              flexShrink: 0,
            }}>
              <KpiCard label="Total Arrecadado"  value={fmtR(kpis.total)}  color={C.green}  Icon={LuBanknote}  sz={sz} />
              <KpiCard label="Vendas Realizadas" value={kpis.count}         color={C.blue}   Icon={LuReceipt}   sz={sz} />
              <KpiCard label="Ticket Médio"      value={fmtR(kpis.ticket)} color={C.accent} Icon={LuChartBar}  sz={sz} />
              <KpiCard
                label="Método Mais Usado"
                value={kpis.top ? METODOS_LABEL[kpis.top[0]] ?? kpis.top[0] : "—"}
                color={C.muted} Icon={kpis.top ? METODOS_ICON[kpis.top[0]] : LuCreditCard} sz={sz}
              />
            </div>

            {/* Toolbar: sub-toggle + filtro método + exportar */}
            <div style={{
              display: "flex", alignItems: "center",
              padding: `0 ${sz.pad}px ${sz.padSm}px`, flexShrink: 0, gap: 12, flexWrap: "wrap",
            }}>
              {/* Toggle Resumido / Detalhado */}
              <div style={{
                display: "flex", background: C.surface,
                borderRadius: 10, padding: 3, gap: 2, flexShrink: 0,
              }}>
                {[["resumido","Resumido"],["detalhado","Detalhado"]].map(([id, label]) => (
                  <button
                    key={id}
                    onClick={() => setSubVendas(id)}
                    style={{
                      padding: "6px 18px", borderRadius: 8, border: "none",
                      background: subVendas === id ? C.accent : "transparent",
                      color: subVendas === id ? "#fff" : C.muted,
                      cursor: "pointer", fontWeight: 600, fontSize: sz.fontSm + 1,
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
                    {m === "todos" ? "Todos" : (() => { const MI = METODOS_ICON[m]; return <>{MI && <MI size={13} style={{ marginRight: 4, verticalAlign: "middle" }} />}{METODOS_LABEL[m]}</>; })()}
                  </ChipBtn>
                ))}
              </div>

              <ExportBar onPDF={() => exportVendas("pdf")} onXLSX={() => exportVendas("xlsx")} sz={sz} />
            </div>

            {/* ── RESUMIDO ── */}
            {subVendas === "resumido" && (
              <div style={{ flex: 1, overflowY: "auto", padding: `0 ${sz.pad}px ${sz.pad}px` }}>
                {vendasFiltradas.length === 0 ? (
                  <Empty icon="🧾" msg="Nenhuma venda no período selecionado" sz={sz} />
                ) : (
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ borderBottom: `1px solid ${C.border}` }}>
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
                          onMouseEnter={e => e.currentTarget.style.background = C.surface}
                          onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                          style={{ borderBottom: `1px solid ${C.border}`, transition: "background 0.1s" }}
                        >
                          <Td sz={sz}><span style={{ fontWeight: 700 }}>{v.comanda ?? "—"}</span></Td>
                          <Td sz={sz}>{v.cashier ?? "—"}</Td>
                          <Td sz={sz} right>
                            {Array.isArray(v.items) ? v.items.reduce((s, it) => s + (it.qty ?? 1), 0) : "—"}
                          </Td>
                          <Td sz={sz} right>
                            <span style={{
                              fontSize: sz.fontSm + 1, fontWeight: 600,
                              background: C.surface, padding: "3px 10px",
                              borderRadius: 20, color: C.muted, whiteSpace: "nowrap",
                            }}>
                              {(() => { const MI = METODOS_ICON[v.metodo]; return <>{MI && <MI size={13} style={{ marginRight: 4, verticalAlign: "middle" }} />}{METODOS_LABEL[v.metodo] ?? v.metodo ?? "—"}</>; })()}
                            </span>
                          </Td>
                          <Td sz={sz} right color={C.green}>
                            <span style={{ fontWeight: 800 }}>{fmtR(v.total)}</span>
                          </Td>
                          <Td sz={sz} right muted nowrap>{fmtData(v.at)}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {/* ── DETALHADO ── */}
            {subVendas === "detalhado" && (
              <div style={{ flex: 1, overflowY: "auto", padding: `0 ${sz.pad}px ${sz.pad}px` }}>
                {vendasFiltradas.length === 0 ? (
                  <Empty icon="🧾" msg="Nenhuma venda no período selecionado" sz={sz} />
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    {vendasFiltradas.map((v, i) => {
                      const itens = Array.isArray(v.items) ? v.items : [];
                      const qtdTotal = itens.reduce((s, it) => s + (it.qty ?? 1), 0);
                      return (
                        <div
                          key={v.id ?? i}
                          style={{
                            background: C.card, border: `1px solid ${C.border}`,
                            borderRadius: 16, overflow: "hidden",
                          }}
                        >
                          {/* Cabeçalho da comanda */}
                          <div style={{
                            display: "flex", alignItems: "center", justifyContent: "space-between",
                            padding: "16px 20px", borderBottom: `1px solid ${C.border}`,
                            gap: 12, flexWrap: "wrap",
                          }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                              <div style={{
                                width: 44, height: 44, borderRadius: 12,
                                background: C.alow, border: `1.5px solid ${C.accent}44`,
                                display: "flex", alignItems: "center", justifyContent: "center",
                                fontSize: 20, flexShrink: 0,
                              }}>
                                🧾
                              </div>
                              <div>
                                <div style={{ fontWeight: 800, fontSize: sz.fontLg - 1 }}>
                                  {v.comanda ?? "—"}
                                </div>
                                <div style={{ fontSize: sz.fontSm, color: C.muted, marginTop: 2 }}>
                                  {fmtData(v.at)} · {v.cashier ?? "—"}
                                </div>
                              </div>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                              <span style={{
                                fontSize: sz.fontSm + 1, fontWeight: 600,
                                background: C.surface, padding: "5px 14px",
                                borderRadius: 20, color: C.muted,
                              }}>
                                {(() => { const MI = METODOS_ICON[v.metodo]; return <>{MI && <MI size={13} style={{ marginRight: 4, verticalAlign: "middle" }} />}{METODOS_LABEL[v.metodo] ?? v.metodo ?? "—"}</>; })()}
                              </span>
                              <div style={{ textAlign: "right" }}>
                                <div style={{ fontWeight: 900, fontSize: sz.fontXl - 2, color: C.green }}>
                                  {fmtR(v.total)}
                                </div>
                                <div style={{ fontSize: sz.fontSm, color: C.muted }}>
                                  {qtdTotal} {qtdTotal === 1 ? "item" : "itens"}
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Itens da comanda */}
                          {itens.length === 0 ? (
                            <div style={{ padding: "14px 20px", color: C.muted, fontSize: sz.fontSm + 1 }}>
                              Sem itens registrados
                            </div>
                          ) : (
                            <table style={{ width: "100%", borderCollapse: "collapse" }}>
                              <thead>
                                <tr style={{ background: C.surface }}>
                                  <th style={{ padding: "8px 20px", fontSize: sz.fontSm, fontWeight: 700, color: C.muted, textAlign: "left", textTransform: "uppercase", letterSpacing: 1 }}>
                                    Produto
                                  </th>
                                  <th style={{ padding: "8px 20px", fontSize: sz.fontSm, fontWeight: 700, color: C.muted, textAlign: "center", textTransform: "uppercase", letterSpacing: 1 }}>
                                    Qtd
                                  </th>
                                  <th style={{ padding: "8px 20px", fontSize: sz.fontSm, fontWeight: 700, color: C.muted, textAlign: "right", textTransform: "uppercase", letterSpacing: 1 }}>
                                    Unit.
                                  </th>
                                  <th style={{ padding: "8px 20px", fontSize: sz.fontSm, fontWeight: 700, color: C.muted, textAlign: "right", textTransform: "uppercase", letterSpacing: 1 }}>
                                    Subtotal
                                  </th>
                                </tr>
                              </thead>
                              <tbody>
                                {itens.map((it, j) => (
                                  <tr
                                    key={j}
                                    style={{ borderTop: `1px solid ${C.border}` }}
                                  >
                                    <td style={{ padding: "12px 20px", fontSize: sz.fontBase, color: C.text }}>
                                      <div style={{ fontWeight: 600 }}>
                                        {it.emoji ? `${it.emoji} ` : ""}{it.name ?? "—"}
                                      </div>
                                      {it.obs && (
                                        <div style={{
                                          marginTop: 4, fontSize: sz.fontSm,
                                          color: C.accent, fontStyle: "italic",
                                        }}>
                                          📝 {it.obs}
                                        </div>
                                      )}
                                    </td>
                                    <td style={{ padding: "12px 20px", fontSize: sz.fontBase, textAlign: "center", fontWeight: 700, color: C.text }}>
                                      {it.qty ?? 1}
                                    </td>
                                    <td style={{ padding: "12px 20px", fontSize: sz.fontBase, textAlign: "right", color: C.muted }}>
                                      {fmtR(it.price)}
                                    </td>
                                    <td style={{ padding: "12px 20px", fontSize: sz.fontBase, textAlign: "right", fontWeight: 800, color: C.text }}>
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
          </div>
        )}

        {/* ══ FECHAMENTOS ══ */}
        {aba === "Fechamentos" && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ display: "flex", justifyContent: "flex-end", padding: `${sz.padSm}px ${sz.pad}px`, flexShrink: 0 }}>
              <ExportBar onPDF={() => exportFechamentos("pdf")} onXLSX={() => exportFechamentos("xlsx")} sz={sz} />
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: `0 ${sz.pad}px ${sz.pad}px` }}>
              {fechsFiltrados.length === 0 ? (
                <Empty icon={LuLock} msg="Nenhum fechamento no período selecionado" sz={sz} />
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                      <Th>Data / Hora</Th>
                      <Th>Usuário</Th>
                      <Th right>Fundo de Caixa</Th>
                      <Th right>Total Vendas</Th>
                      <Th right>Conferido</Th>
                      <Th right>Diferença</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {fechsFiltrados.map((f, i) => {
                      const dif = (f.totalConferido ?? 0) - (f.totalVendas ?? 0);
                      return (
                        <tr
                          key={f.id ?? i}
                          onMouseEnter={e => e.currentTarget.style.background = C.surface}
                          onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                          style={{ borderBottom: `1px solid ${C.border}`, transition: "background 0.1s" }}
                        >
                          <Td sz={sz} muted nowrap>{fmtData(f.at)}</Td>
                          <Td sz={sz}>{f.user ?? "—"}</Td>
                          <Td sz={sz} right>{fmtR(f.fundo)}</Td>
                          <Td sz={sz} right><span style={{ fontWeight: 700 }}>{fmtR(f.totalVendas)}</span></Td>
                          <Td sz={sz} right color={C.green}><span style={{ fontWeight: 700 }}>{fmtR(f.totalConferido)}</span></Td>
                          <Td sz={sz} right color={dif >= 0 ? C.green : C.red}>
                            <span style={{ fontWeight: 800 }}>{dif >= 0 ? "+" : ""}{fmtR(dif)}</span>
                          </Td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* ══ LOGS ══ */}
        {aba === "Logs" && !isAdmin && (
          <Empty icon={LuLock} msg="Acesso restrito a administradores e gerentes" sz={sz} />
        )}

        {aba === "Logs" && isAdmin && (
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
                    supabase
                      .from("operator_logs")
                      .select("id, operator_id, action_type, payload, created_at")
                      .order("created_at", { ascending: false })
                      .limit(2000)
                      .then(({ data }) => { setOpLogs(data ?? []); setLoadingLogs(false); });
                  }}
                  style={{
                    padding: "6px 14px", borderRadius: 8,
                    border: `1px solid ${C.border}`, background: "none",
                    color: C.muted, cursor: "pointer", fontSize: sz.fontSm + 1, fontWeight: 600,
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
                <div style={{ color: C.muted, textAlign: "center", padding: 40 }}>Carregando logs…</div>
              ) : logsFiltrados.length === 0 ? (
                <Empty icon={LuClipboardList} msg="Nenhum evento no período selecionado" sz={sz} />
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${C.border}` }}>
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
                          onMouseEnter={e => e.currentTarget.style.background = C.surface}
                          onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                          style={{ borderBottom: `1px solid ${C.border}`, transition: "background 0.1s" }}
                        >
                          <Td sz={sz} muted nowrap>{fmtData(l.created_at)}</Td>
                          <Td sz={sz}>
                            <span style={{
                              fontSize: sz.fontSm, fontWeight: 700,
                              background: `${tipo.color}18`,
                              border: `1px solid ${tipo.color}44`,
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
                              <span style={{
                                fontSize: sz.fontSm, fontWeight: 600,
                                background: C.surface, padding: "2px 8px",
                                borderRadius: 10, color: C.muted,
                              }}>
                                {l.payload.role}
                              </span>
                            ) : <span style={{ color: C.muted }}>—</span>}
                          </Td>
                          <Td sz={sz} muted>{l.payload?.msg ?? l.action_type ?? "—"}</Td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* ══ CREDENCIAIS ══ */}
        {aba === "Credenciais" && !isAdmin && (
          <Empty icon={LuLock} msg="Acesso restrito a administradores" sz={sz} />
        )}

        {aba === "Credenciais" && isAdmin && (
          <div style={{ flex: 1, overflowY: "auto", padding: sz.pad }}>
            <div style={{
              background: `${C.red}10`, border: `1px solid ${C.red}33`,
              borderRadius: 12, padding: "12px 16px", marginBottom: sz.pad,
              fontSize: sz.fontSm + 1, color: C.red, fontWeight: 600,
            }}>
              <LuShieldAlert size={14} style={{ marginRight: 6, verticalAlign: "middle" }} />
              Área restrita — estas informações são confidenciais. Não compartilhe com terceiros.
            </div>

            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                    <Th>Usuário</Th>
                    <Th>Login</Th>
                    <Th>Cargo</Th>
                    <Th>Senha</Th>
                    <Th></Th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => {
                    const pwd     = credentials[u.username];
                    const visivel = senhasVisiveis[u.id];
                    return (
                      <tr
                        key={u.id}
                        onMouseEnter={e => e.currentTarget.style.background = C.surface}
                        onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                        style={{ borderBottom: `1px solid ${C.border}`, transition: "background 0.1s" }}
                      >
                        <Td sz={sz}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div style={{
                              width: 32, height: 32, borderRadius: 16,
                              background: C.accent, color: "#fff",
                              display: "flex", alignItems: "center", justifyContent: "center",
                              fontWeight: 800, fontSize: 12, flexShrink: 0,
                            }}>
                              {(u.name ?? "?").split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase()}
                            </div>
                            <span style={{ fontWeight: 700 }}>{u.name}</span>
                          </div>
                        </Td>
                        <Td sz={sz} muted>@{u.username}</Td>
                        <Td sz={sz}>
                          <span style={{
                            fontSize: sz.fontSm, fontWeight: 700,
                            background: C.surface, padding: "3px 10px",
                            borderRadius: 20, color: C.muted,
                          }}>
                            {u.role}
                          </span>
                        </Td>
                        <Td sz={sz}>
                          {pwd ? (
                            <span style={{
                              fontFamily: "monospace", fontSize: sz.fontBase,
                              letterSpacing: visivel ? 0 : 2,
                              color: visivel ? C.text : C.muted,
                            }}>
                              {visivel ? pwd : "••••••••"}
                            </span>
                          ) : (
                            <span style={{ color: C.muted, fontSize: sz.fontSm + 1, fontStyle: "italic" }}>
                              não registrada
                            </span>
                          )}
                        </Td>
                        <Td sz={sz} right>
                          {pwd && (
                            <button
                              onClick={() => setSenhasVisiveis(prev => ({ ...prev, [u.id]: !prev[u.id] }))}
                              style={{
                                background: "none", border: `1px solid ${C.border}`,
                                borderRadius: 8, padding: "5px 12px",
                                color: C.muted, cursor: "pointer",
                                fontSize: sz.fontSm + 1, fontWeight: 600,
                              }}
                            >
                              {visivel ? <><LuEyeOff size={13} style={{ marginRight: 4 }} />Ocultar</> : <><LuEye size={13} style={{ marginRight: 4 }} />Ver</>}
                            </button>
                          )}
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div style={{ marginTop: 12, fontSize: sz.fontSm + 1, color: C.muted }}>
              * Senhas marcadas como "não registrada" foram definidas antes desta funcionalidade. Redefina-as nas Configurações para que apareçam aqui.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
