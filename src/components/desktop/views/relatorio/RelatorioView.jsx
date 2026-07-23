import { useState, useMemo, useEffect, Fragment } from "react";
import { fecharAoClicarFora } from "@/lib/overlayFechar";
import { normalizarPagamentos, totalPorMetodo, rotuloMetodo } from "@/utils/pagamentos";
import { agruparVendasPorDia, rotuloDiaBR, intervaloPeriodo, agruparVendasPorOperador } from "@/utils/datas";
import { calcularVariacaoPercentual } from "@/lib/relatorios";
import { createPortal } from "react-dom";
import { useApp } from "@/context/AppContext";
import { supabase } from "@/lib/supabase";
import { exportToPDF as exportToPDFBase, exportToXLSX as exportToXLSXBase } from "@/lib/exportReport";
import { useResponsive } from "@/utils/hooks";
import { getSizes } from "@/constants/sizes";
import C from "@/constants/colors";
import { alfa } from "@/constants/colorAlfa";
import { varColor, nomeExibicaoTenant } from "@/lib/tema";
import DesempenhoReport from "./DesempenhoReport";
import "./RelatorioView.css";
import {
  LuBanknote, LuReceipt, LuChartBar, LuCreditCard, LuZap, LuSmartphone,
  LuLock, LuTriangleAlert, LuPackage, LuClipboardList, LuShieldAlert,
  LuPrinter, LuDownload, LuX, LuCircleX,
} from "react-icons/lu";

const ABAS_BASE = ["Vendas", "Desempenho", "Cancelamentos", "Fechamentos", "Logs", "Credenciais"];
// "Admin" só entra para role admin (visão consolidada/sensível) — B3.

const PERIODOS = [
  { id: "hoje",    label: "Hoje"    },
  { id: "semana",  label: "7 dias"  },
  { id: "mes",     label: "30 dias" },
  { id: "tudo",    label: "Tudo"    },
  { id: "custom",  label: "Período" },
];

const METODOS_ICON  = { dinheiro: LuBanknote, credito: LuCreditCard, debito: LuSmartphone, pix: LuZap };
const ACTION_TYPE_META = {
  auth:    { label: "Auth",    color: varColor(C.blue)      },
  caixa:   { label: "Caixa",  color: "#f59e0b"   },
  comanda: { label: "Comanda", color: varColor(C.green)     },
  itens:   { label: "Itens",  color: varColor(C.green)     },
  produto: { label: "Produto", color: varColor(C.accent)    },
};

function tipoLog(actionType) {
  const prefix = (actionType ?? "").split(":")[0];
  return ACTION_TYPE_META[prefix] ?? { label: actionType ?? "—", color: varColor(C.muted) };
}

const SALE_PREFIXES = new Set(["comanda", "itens", "produto"]);

function filtrarPorPeriodo(list, campo, periodo, customInicio, customFim) {
  if (periodo === "tudo") return list;
  if (periodo === "custom") {
    if (!customInicio && !customFim) return list;
    const ini = customInicio ? new Date(customInicio + "T00:00:00").getTime() : 0;
    const fim = customFim    ? new Date(customFim    + "T23:59:59").getTime() : Infinity;
    return list.filter(r => {
      const t = r[campo] ? new Date(r[campo]).getTime() : 0;
      return t >= ini && t <= fim;
    });
  }
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
      background: varColor(C.card), border: `1px solid var(${C.border})`,
      borderRadius: 16, padding: `${sz.padSm + 4}px ${sz.pad - 4}px`,
      display: "flex", flexDirection: "column", gap: 10,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {Icon && <Icon size={sz.fontLg} color={color} />}
        <span className="relatorio-view__kpi-label" style={{ color: varColor(C.muted), fontWeight: 600 }}>{label}</span>
      </div>
      <div className="relatorio-view__kpi-valor" style={{ fontWeight: 900, color }}>{value}</div>
    </div>
  );
}

function Th({ children, right }) {
  return (
    <th className="relatorio-view__th" style={{
      padding: "12px 16px", textAlign: right ? "right" : "left",
      fontWeight: 700, color: varColor(C.muted),
      textTransform: "uppercase", letterSpacing: 1, whiteSpace: "nowrap",
    }}>
      {children}
    </th>
  );
}

function Td({ children, right, muted, sz, nowrap, color }) {
  return (
    <td className="relatorio-view__td" style={{
      padding: "14px 16px",
      textAlign: right ? "right" : "left",
      color: color ?? (muted ? varColor(C.muted) : varColor(C.text)),
      whiteSpace: nowrap ? "nowrap" : undefined,
      verticalAlign: "middle",
    }}>
      {children}
    </td>
  );
}

function Empty({ icon: Icon, msg, sz }) {
  const inner = typeof Icon === "string"
    ? <span className="relatorio-view__empty-icon">{Icon}</span>
    : Icon ? <Icon size={48} /> : null;
  return (
    <div style={{
      flex: 1, display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      gap: 10, color: varColor(C.muted), padding: 60,
    }}>
      <div style={{ opacity: 0.3 }}>{inner}</div>
      <div className="relatorio-view__empty-msg" style={{ fontWeight: 600 }}>{msg}</div>
    </div>
  );
}

function ChipBtn({ active, onClick, children, sz }) {
  return (
    <button
      onClick={onClick}
      className="relatorio-view__chip"
      style={{
        padding: "6px 14px", borderRadius: 20, border: "none",
        background: active ? varColor(C.accent) : varColor(C.surface),
        color: active ? "#fff" : varColor(C.muted),
        cursor: "pointer", fontWeight: 600,
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
        className="relatorio-view__export-btn"
        style={{
          display: "flex", alignItems: "center", gap: 5,
          padding: "6px 13px", borderRadius: 8,
          border: `1px solid var(${C.border})`, background: "none",
          color: varColor(C.muted), cursor: "pointer",
          fontWeight: 600, whiteSpace: "nowrap",
        }}
      >
        <LuPrinter size={13} /> PDF
      </button>
      <button
        onClick={onXLSX}
        title="Exportar Excel"
        className="relatorio-view__export-btn"
        style={{
          display: "flex", alignItems: "center", gap: 5,
          padding: "6px 13px", borderRadius: 8,
          border: `1px solid var(${C.border})`, background: "none",
          color: varColor(C.muted), cursor: "pointer",
          fontWeight: 600, whiteSpace: "nowrap",
        }}
      >
        <LuDownload size={13} /> Excel
      </button>
    </div>
  );
}

// ── Modal de detalhe de fechamento ────────────────────────────────

const METODOS_DETALHE = [
  { id: "dinheiro", label: "Dinheiro", Icon: LuBanknote   },
  { id: "credito",  label: "Crédito",  Icon: LuCreditCard },
  { id: "debito",   label: "Débito",   Icon: LuSmartphone },
  { id: "pix",      label: "Pix",      Icon: LuZap        },
];

function FechamentoDetalheModal({ f, onClose }) {
  const metodos = f.conferidoPorMetodo
    ? Object.keys(f.conferidoPorMetodo)
    : METODOS_DETALHE.map(m => m.id);
  const totalEsperado = (f.totalVendas ?? 0) + (f.fundo ?? 0);
  const diferenca     = (f.totalConferido ?? 0) - totalEsperado;

  return createPortal(
    <div
      {...fecharAoClicarFora(onClose)}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 500, fontFamily: "'Inter',system-ui,sans-serif",
      }}
    >
      <div style={{
        background: varColor(C.card), borderRadius: 20, padding: 28,
        width: "100%", maxWidth: 520, border: `1px solid var(${C.border})`,
        display: "flex", flexDirection: "column", gap: 20,
        maxHeight: "90vh", overflowY: "auto",
        color: varColor(C.text), fontFamily: "'Inter',system-ui,sans-serif",
        boxSizing: "border-box",
      }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{
              width: 48, height: 48, borderRadius: 14, flexShrink: 0,
              background: `${alfa(C.accent, "18")}`, border: `1.5px solid ${alfa(C.accent, "44")}`,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <LuLock size={22} color={varColor(C.accent)} />
            </div>
            <div>
              <div className="relatorio-view__modal-titulo" style={{ fontWeight: 800 }}>Fechamento de Caixa</div>
              <div className="relatorio-view__modal-data" style={{ color: varColor(C.muted), marginTop: 2 }}>
                {fmtData(f.at)}
              </div>
              <div className="relatorio-view__modal-usuario" style={{ color: varColor(C.muted), marginTop: 1 }}>
                {f.user ?? "—"}{f.role ? ` · ${f.role}` : ""}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none", border: `1px solid var(${C.border})`,
              borderRadius: 8, padding: "6px 8px", cursor: "pointer",
              color: varColor(C.muted), display: "flex", alignItems: "center",
            }}
          >
            <LuX size={16} />
          </button>
        </div>

        {/* Tabela por método */}
        {f.conferidoPorMetodo && (
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            <div className="relatorio-view__modal-th" style={{
              display: "grid", gridTemplateColumns: "1fr 110px",
              gap: 8, paddingBottom: 8, marginBottom: 2,
              borderBottom: `1px solid var(${C.border})`,
              fontWeight: 700, color: varColor(C.muted),
              textTransform: "uppercase", letterSpacing: 1,
            }}>
              <span>Método</span>
              <span style={{ textAlign: "right" }}>Conferido</span>
            </div>
            {metodos.map(id => {
              const cat = METODOS_DETALHE.find(m => m.id === id);
              const Icon = cat?.Icon ?? LuBanknote;
              const label = cat?.label ?? id;
              const val = f.conferidoPorMetodo[id] ?? 0;
              return (
                <div key={id} style={{
                  display: "grid", gridTemplateColumns: "1fr 110px",
                  gap: 8, alignItems: "center", padding: "11px 0",
                  borderBottom: `1px solid var(${C.border})`,
                }}>
                  <div className="relatorio-view__modal-metodo-label" style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600 }}>
                    <Icon size={15} color={varColor(C.muted)} />
                    {label}
                    {id === "dinheiro" && f.fundo > 0 && (
                      <span className="relatorio-view__modal-fundo-nota" style={{ color: varColor(C.muted), fontWeight: 400 }}>
                        (inclui fundo {fmtR(f.fundo)})
                      </span>
                    )}
                  </div>
                  <div className="relatorio-view__modal-metodo-valor" style={{ textAlign: "right", fontWeight: 800 }}>
                    {fmtR(val)}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Observação */}
        {f.observacao && (
          <div style={{
            background: `${alfa(C.accent, "0c")}`, border: `1px solid ${alfa(C.accent, "33")}`,
            borderRadius: 12, padding: "12px 14px",
            display: "flex", flexDirection: "column", gap: 4,
          }}>
            <div className="relatorio-view__modal-obs-label" style={{ fontWeight: 700, color: varColor(C.accent), textTransform: "uppercase", letterSpacing: 1 }}>
              Observação
            </div>
            <div className="relatorio-view__modal-obs-texto" style={{ color: varColor(C.text) }}>
              {f.observacao}
            </div>
          </div>
        )}

        {/* Resumo */}
        <div style={{
          background: varColor(C.surface), borderRadius: 14,
          border: `1px solid var(${C.border})`, padding: 16,
          display: "flex", flexDirection: "column", gap: 9,
        }}>
          {[
            { label: "Total de Vendas (sistema)", value: fmtR(f.totalVendas) },
            { label: "Fundo de Caixa",            value: fmtR(f.fundo)       },
          ].map(r => (
            <div key={r.label} style={{ display: "flex", justifyContent: "space-between" }}>
              <span className="relatorio-view__modal-resumo-label" style={{ color: varColor(C.muted) }}>{r.label}</span>
              <span className="relatorio-view__modal-resumo-valor" style={{ fontWeight: 600, color: varColor(C.muted) }}>{r.value}</span>
            </div>
          ))}

          <div style={{ borderTop: `1px solid var(${C.border})`, paddingTop: 9, marginTop: 2, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span className="relatorio-view__modal-total-label" style={{ fontWeight: 700 }}>Total Esperado em Caixa</span>
            <span className="relatorio-view__modal-total-valor" style={{ fontWeight: 800, color: varColor(C.muted) }}>{fmtR(totalEsperado)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span className="relatorio-view__modal-total-label" style={{ fontWeight: 800 }}>Total Conferido</span>
            <span className="relatorio-view__modal-total-valor" style={{ fontWeight: 900, color: varColor(C.green) }}>{fmtR(f.totalConferido)}</span>
          </div>

          <div style={{
            padding: "12px 16px", borderRadius: 10, marginTop: 4,
            background: diferenca >= 0 ? `${alfa(C.green, "14")}` : `${alfa(C.red, "14")}`,
            border: `1.5px solid ${(diferenca >= 0 ? varColor(C.green) : varColor(C.red))}55`,
            display: "flex", justifyContent: "space-between", alignItems: "center",
          }}>
            <span className="relatorio-view__modal-dif-label" style={{ fontWeight: 600, color: varColor(C.muted) }}>
              {diferenca >= 0 ? "Sobra no Caixa" : "Falta no Caixa"}
            </span>
            <span className="relatorio-view__modal-total-valor" style={{ fontWeight: 900, color: diferenca >= 0 ? varColor(C.green) : varColor(C.red) }}>
              {diferenca >= 0 ? "+" : ""}{fmtR(diferenca)}
            </span>
          </div>
        </div>

        <button
          onClick={onClose}
          className="relatorio-view__modal-fechar"
          style={{
            padding: "11px", borderRadius: 10,
            border: `1px solid var(${C.border})`, background: "none",
            color: varColor(C.muted), cursor: "pointer", fontWeight: 600,
            fontFamily: "inherit",
          }}
        >
          Fechar
        </button>
      </div>
    </div>,
    document.body
  );
}

// ── View principal ────────────────────────────────────────────────

export default function RelatorioView() {
  const { sales: salesBrutas, fechamentos, pending, users, currentUser, tenant } = useApp();
  // Leva 15.3 — vendas canceladas ficam fora de todos os relatórios
  const sales = useMemo(() => (salesBrutas ?? []).filter(s => s && !s.cancelada), [salesBrutas]);
  const { width } = useResponsive();
  const sz = getSizes(width);

  // Cabeçalho dos exports com a identidade do tenant (white-label,
  // decisão 017); "by Kora" é a assinatura da plataforma.
  const empresaExport = `${nomeExibicaoTenant(tenant?.tema).toUpperCase()} by Kora`;
  const exportToPDF  = (titulo, headers, rows, periodo, opts = {}) =>
    exportToPDFBase(titulo, headers, rows, periodo, { empresa: empresaExport, ...opts });
  const exportToXLSX = (titulo, headers, rows, periodo) =>
    exportToXLSXBase(titulo, headers, rows, periodo, { empresa: empresaExport });

  const [aba,           setAba]           = useState("Vendas");
  const [periodo,       setPeriodo]       = useState("hoje");
  const [customInicio,  setCustomInicio]  = useState("");
  const [customFim,     setCustomFim]     = useState("");
  const [fechDetalhe,   setFechDetalhe]   = useState(null);
  const [metodoFilt,  setMetodoFilt]  = useState("todos");
  const [buscaComanda, setBuscaComanda] = useState(""); // Leva 15.5
  const [logTipo,    setLogTipo]    = useState("todos");
  const [subVendas,  setSubVendas]  = useState("resumido");
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
  // Visão administrativa consolidada (B3): só role admin — gerente/caixa não veem.
  const isSuperAdmin = currentUser?.role === "admin";
  const ABAS = isSuperAdmin ? [...ABAS_BASE, "Admin"] : ABAS_BASE;

  // ── Vendas ────────────────────────────────────────────────────
  const vendasFiltradas = useMemo(() => {
    let l = filtrarPorPeriodo(sales, "at", periodo, customInicio, customFim);
    if (metodoFilt !== "todos") l = l.filter(s => Object.keys(totalPorMetodo(s)).includes(metodoFilt));
    // Leva 15.5 — busca por número/nome da comanda
    const busca = buscaComanda.trim().toLowerCase();
    if (busca) l = l.filter(s => String(s.comanda ?? "").toLowerCase().includes(busca));
    return l;
  }, [sales, periodo, metodoFilt, buscaComanda, customInicio, customFim]);

  const kpis = useMemo(() => {
    const total  = vendasFiltradas.reduce((s, v) => s + (v.total ?? 0), 0);
    const count  = vendasFiltradas.length;
    const ticket = count > 0 ? total / count : 0;
    const porMetodo = {};
    vendasFiltradas.forEach(v => { Object.entries(totalPorMetodo(v)).forEach(([m, val]) => { porMetodo[m] = (porMetodo[m] ?? 0) + val; }); });
    const top = Object.entries(porMetodo).sort((a, b) => b[1] - a[1])[0];
    return { total, count, ticket, top };
  }, [vendasFiltradas]);

  // ── Vendas por dia (B2) — agrupadas pelo dia LOCAL (America/Sao_Paulo)
  //    para não jogar vendas após ~21h no dia seguinte. Método via
  //    totalPorMetodo (nunca .metodo direto), por compatibilidade com split.
  const vendasPorDia = useMemo(
    () => agruparVendasPorDia(vendasFiltradas, { totalPorMetodo }),
    [vendasFiltradas],
  );

  // ── Consolidado administrativo (B3) — independente do filtro de método,
  //    é uma visão gerencial: faturamento do período vs período anterior de
  //    mesma duração, ticket médio e faturamento por operador. Calculado a
  //    partir de `sales` (janela de bootstrap) pelos limites do período.
  const adminConsolidado = useMemo(() => {
    const { ini, fim } = intervaloPeriodo(periodo, customInicio, customFim);
    const atMs = (v) => (v.at ? new Date(v.at).getTime() : 0);
    const atuais = (ini == null && fim == null)
      ? sales
      : sales.filter((v) => { const t = atMs(v); return (ini == null || t >= ini) && (fim == null || t <= fim); });

    const totalAtual = atuais.reduce((s, v) => s + (v.total ?? 0), 0);
    const ticket = atuais.length > 0 ? totalAtual / atuais.length : 0;

    let totalAnterior = null, variacao = null;
    if (ini != null && fim != null) {
      const dur = fim - ini;
      const prevIni = ini - dur, prevFim = ini;
      const anteriores = sales.filter((v) => { const t = atMs(v); return t >= prevIni && t < prevFim; });
      totalAnterior = anteriores.reduce((s, v) => s + (v.total ?? 0), 0);
      variacao = calcularVariacaoPercentual(totalAtual, totalAnterior);
    }

    const porMetodo = {};
    atuais.forEach((v) => { Object.entries(totalPorMetodo(v)).forEach(([m, val]) => { porMetodo[m] = (porMetodo[m] ?? 0) + val; }); });

    return {
      totalAtual, totalAnterior, variacao, ticket, count: atuais.length,
      porOperador: agruparVendasPorOperador(atuais),
      porMetodo,
    };
  }, [sales, periodo, customInicio, customFim]);

  // ── Fechamentos ───────────────────────────────────────────────
  const fechsFiltrados = useMemo(() =>
    filtrarPorPeriodo(fechamentos, "at", periodo, customInicio, customFim),
  [fechamentos, periodo, customInicio, customFim]);

  // ── Cancelamentos ─────────────────────────────────────────────
  const cancelamentos = useMemo(() => {
    const linhas = [];

    // vendas finalizadas — itens cancelados dentro delas
    const vendasPeriodo = filtrarPorPeriodo(sales, "at", periodo, customInicio, customFim);
    vendasPeriodo.forEach(v => {
      (Array.isArray(v.items) ? v.items : [])
        .filter(it => it.cancelado)
        .forEach(it => linhas.push({
          comanda:       v.comanda ?? "—",
          cashier:       v.cashier ?? "—",
          canceladoPor:  it.canceladoPor || "—",
          at:            v.at,
          nome:          it.name ?? "—",
          emoji:         it.emoji ?? "",
          qty:           it.qty ?? 1,
          price:         it.price ?? 0,
          motivo:        it.motivoCancelamento || "—",
          origem:        "Finalizada",
        }));
    });

    // comandas em aberto — itens cancelados
    const pendingPeriodo = filtrarPorPeriodo(pending ?? [], "created_at", periodo, customInicio, customFim);
    pendingPeriodo.forEach(p => {
      (Array.isArray(p.items) ? p.items : [])
        .filter(it => it.cancelado)
        .forEach(it => linhas.push({
          comanda:       p.comanda ?? "—",
          cashier:       p.garcom  ?? "—",
          canceladoPor:  it.canceladoPor || "—",
          at:            p.updated_at ?? p.created_at,
          nome:          it.name ?? "—",
          emoji:         it.emoji ?? "",
          qty:           it.qty ?? 1,
          price:         it.price ?? 0,
          motivo:        it.motivoCancelamento || "—",
          origem:        "Em aberto",
        }));
    });

    return linhas.sort((a, b) => new Date(b.at) - new Date(a.at));
  }, [sales, pending, periodo, customInicio, customFim]);

  const kpisCancelamentos = useMemo(() => {
    const total    = cancelamentos.length;
    const qtd      = cancelamentos.reduce((s, c) => s + c.qty, 0);
    const valor    = cancelamentos.reduce((s, c) => s + c.price * c.qty, 0);
    const motivos  = {};
    cancelamentos.forEach(c => { motivos[c.motivo] = (motivos[c.motivo] ?? 0) + 1; });
    const topMotivo = Object.entries(motivos).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";
    return { total, qtd, valor, topMotivo };
  }, [cancelamentos]);

  // ── Logs ──────────────────────────────────────────────────────
  const logsFiltrados = useMemo(() => {
    let l = filtrarPorPeriodo(opLogs, "created_at", periodo, customInicio, customFim);
    if (logTipo === "venda")       l = l.filter(x => SALE_PREFIXES.has((x.action_type ?? "").split(":")[0]));
    else if (logTipo !== "todos")  l = l.filter(x => (x.action_type ?? "").startsWith(logTipo + ":"));
    return l;
  }, [opLogs, periodo, logTipo, customInicio, customFim]);

  // ── Handlers de exportação ────────────────────────────────────
  const totalItens = (v) => Array.isArray(v.items) ? v.items.reduce((s, it) => s + (it.qty ?? 1), 0) : 0;

  const exportVendas = (fmt) => {
    if (subVendas === "por-dia") {
      const headers = ["Dia", "Comandas", "Dinheiro (R$)", "Crédito (R$)", "Débito (R$)", "Pix (R$)", "Total (R$)", "Ticket Médio (R$)"];
      const rows = vendasPorDia.map(d => [
        rotuloDiaBR(d.dia), d.comandas,
        Number(d.metodos.dinheiro ?? 0).toFixed(2),
        Number(d.metodos.credito ?? 0).toFixed(2),
        Number(d.metodos.debito ?? 0).toFixed(2),
        Number(d.metodos.pix ?? 0).toFixed(2),
        Number(d.total ?? 0).toFixed(2),
        Number(d.ticket ?? 0).toFixed(2),
      ]);
      const totalGeral = vendasPorDia.reduce((s, d) => s + d.total, 0);
      const comandasGeral = vendasPorDia.reduce((s, d) => s + d.comandas, 0);
      const totais = `Total: R$ ${totalGeral.toFixed(2)} · ${comandasGeral} venda(s) · ${vendasPorDia.length} dia(s)`;
      if (fmt === "pdf") exportToPDF("Vendas por Dia", headers, rows, periodo, { totais });
      else               exportToXLSX("Vendas por Dia", headers, rows, periodo);
      return;
    }
    if (subVendas === "resumido") {
      const headers = ["Comanda", "Caixa", "Itens", "Método", "Total (R$)", "Data/Hora"];
      const rows = vendasFiltradas.map(v => [
        v.comanda ?? "—", v.cashier ?? "—", totalItens(v),
        normalizarPagamentos(v).map(p => rotuloMetodo(p.metodo)).join(" + "),
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
          normalizarPagamentos(v).map(p => rotuloMetodo(p.metodo)).join(" + "),
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
      // Diferença real: conferido inclui o fundo, então compara contra vendas + fundo
      const dif = (f.totalConferido ?? 0) - (f.totalVendas ?? 0) - (f.fundo ?? 0);
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

  const exportCredenciais = () => {
    const headers = ["Usuário", "Login", "Cargo"];
    const rows = users.map(u => [
      u.name ?? "—",
      `@${u.username}`,
      u.role ?? "—",
    ]);
    exportToPDF("Credenciais de Acesso", headers, rows, "");
  };

  const exportCancelamentos = (fmt) => {
    const headers = ["Comanda", "Produto", "Qtd", "Unit. (R$)", "Valor (R$)", "Motivo", "Cancelado por", "Finalizado por", "Origem", "Data/Hora"];
    const rows = cancelamentos.map(c => [
      c.comanda,
      (c.emoji ? `${c.emoji} ` : "") + c.nome,
      c.qty,
      Number(c.price).toFixed(2),
      Number(c.price * c.qty).toFixed(2),
      c.motivo,
      c.canceladoPor || "—",
      c.cashier || "—",
      c.origem,
      fmtData(c.at),
    ]);
    const totais = `Total: ${kpisCancelamentos.qtd} item(ns) cancelado(s) · Valor: R$ ${kpisCancelamentos.valor.toFixed(2)}`;
    if (fmt === "pdf") exportToPDF("Relatório de Cancelamentos", headers, rows, periodo, { totais });
    else               exportToXLSX("Cancelamentos", headers, rows, periodo);
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

  const exportAdmin = (fmt) => {
    const headers = ["Operador", "Vendas", "Total (R$)", "Ticket Médio (R$)", "Participação (%)"];
    const rows = adminConsolidado.porOperador.map(o => [
      o.operador, o.vendas,
      Number(o.total ?? 0).toFixed(2),
      Number(o.ticket ?? 0).toFixed(2),
      Number(o.participacao ?? 0).toFixed(1),
    ]);
    const totais = `Faturamento: R$ ${adminConsolidado.totalAtual.toFixed(2)} · ${adminConsolidado.count} venda(s)`
      + (adminConsolidado.variacao != null ? ` · ${adminConsolidado.variacao >= 0 ? "+" : ""}${adminConsolidado.variacao.toFixed(1)}% vs período anterior` : "");
    if (fmt === "pdf") exportToPDF("Relatório Admin — Faturamento por Operador", headers, rows, periodo, { totais });
    else               exportToXLSX("Relatorio Admin", headers, rows, periodo);
  };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", background: varColor(C.bg), overflow: "hidden" }}>

      {/* ── Header ── */}
      <div style={{
        padding: `${sz.pad - 4}px ${sz.pad}px`,
        borderBottom: `1px solid var(${C.border})`,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        flexShrink: 0, gap: 16, flexWrap: "wrap",
      }}>
        <div>
          <div className="relatorio-view__titulo" style={{ fontWeight: 800 }}>Relatórios</div>
          <div className="relatorio-view__subtitulo" style={{ color: varColor(C.muted), marginTop: 2 }}>
            Visão geral do movimento do estabelecimento
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
          <div style={{ display: "flex", gap: 6 }}>
            {PERIODOS.map(p => (
              <button
                key={p.id}
                onClick={() => setPeriodo(p.id)}
                className="relatorio-view__periodo-btn"
                style={{
                  padding: "8px 16px", borderRadius: 10, border: "none",
                  background: periodo === p.id ? varColor(C.accent) : varColor(C.surface),
                  color: periodo === p.id ? "#fff" : varColor(C.muted),
                  cursor: "pointer", fontWeight: 600,
                  transition: "background 0.15s, color 0.15s",
                }}
              >
                {p.label}
              </button>
            ))}
          </div>

          {periodo === "custom" && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <style>{`
                .relatorio-date-input::-webkit-calendar-picker-indicator {
                  filter: invert(1);
                  cursor: pointer;
                  opacity: 0.7;
                }
              `}</style>
              <input
                type="date"
                className="relatorio-date-input"
                value={customInicio}
                onChange={e => setCustomInicio(e.target.value)}
                style={{
                  padding: "7px 12px", borderRadius: 9,
                  border: `1.5px solid ${customInicio ? varColor(C.accent) : varColor(C.border)}`,
                  background: varColor(C.surface), color: varColor(C.text),
                  fontFamily: "inherit", outline: "none",
                  cursor: "pointer", transition: "border-color 0.15s",
                }}
              />
              <span className="relatorio-view__date-sep" style={{ color: varColor(C.muted), fontWeight: 600 }}>até</span>
              <input
                type="date"
                className="relatorio-date-input"
                value={customFim}
                min={customInicio || undefined}
                onChange={e => setCustomFim(e.target.value)}
                style={{
                  padding: "7px 12px", borderRadius: 9,
                  border: `1.5px solid ${customFim ? varColor(C.accent) : varColor(C.border)}`,
                  background: varColor(C.surface), color: varColor(C.text),
                  fontFamily: "inherit", outline: "none",
                  cursor: "pointer", transition: "border-color 0.15s",
                }}
              />
              {(customInicio || customFim) && (
                <button
                  onClick={() => { setCustomInicio(""); setCustomFim(""); }}
                  style={{
                    background: "none", border: `1px solid var(${C.border})`,
                    borderRadius: 8, padding: "6px 8px", cursor: "pointer",
                    color: varColor(C.muted), display: "flex", alignItems: "center",
                    transition: "border-color 0.15s",
                  }}
                  title="Limpar datas"
                >
                  <LuX size={14} />
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Abas ── */}
      <div style={{
        display: "flex", padding: `0 ${sz.pad}px`,
        borderBottom: `1px solid var(${C.border})`, flexShrink: 0,
        overflowX: "auto", scrollbarWidth: "none", WebkitOverflowScrolling: "touch",
      }}>
        {ABAS.map(a => (
          <button
            key={a}
            onClick={() => setAba(a)}
            className="relatorio-view__aba"
            style={{
              padding: "14px 22px", border: "none", background: "none",
              color: aba === a ? varColor(C.accent) : varColor(C.muted),
              fontWeight: aba === a ? 700 : 500,
              cursor: "pointer",
              borderBottom: `2px solid ${aba === a ? varColor(C.accent) : "transparent"}`,
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
                                    {rotuloMetodo(p.metodo)}
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
                                    {rotuloMetodo(p.metodo)}
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
        )}

        {/* ══ DESEMPENHO (vendas, margem — F011) ══ */}
        {aba === "Desempenho" && !isAdmin && (
          <Empty icon={LuLock} msg="Acesso restrito a administradores e gerentes" sz={sz} />
        )}
        {aba === "Desempenho" && isAdmin && <DesempenhoReport />}

        {/* ══ CANCELAMENTOS ══ */}
        {aba === "Cancelamentos" && (
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
                      <tr
                        key={i}
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
                            border: `1px solid ${c.origem === "Em aberto" ? varColor(C.accent) : varColor(C.green)}44`,
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
                      // Mesma conta do detalhe: conferido inclui o fundo
                      const dif = (f.totalConferido ?? 0) - (f.totalVendas ?? 0) - (f.fundo ?? 0);
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
                            <Td sz={sz} right color={dif >= 0 ? varColor(C.green) : varColor(C.red)}>
                              <span style={{ fontWeight: 800 }}>{dif >= 0 ? "+" : ""}{fmtR(dif)}</span>
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
        )}

        {/* ══ CREDENCIAIS ══ */}
        {aba === "Credenciais" && !isAdmin && (
          <Empty icon={LuLock} msg="Acesso restrito a administradores" sz={sz} />
        )}

        {aba === "Credenciais" && isAdmin && (
          <div style={{ flex: 1, overflowY: "auto", padding: sz.pad }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: sz.pad }}>
              <div className="relatorio-view__aviso" style={{
                flex: 1, background: `${alfa(C.red, "10")}`, border: `1px solid ${alfa(C.red, "33")}`,
                borderRadius: 12, padding: "12px 16px",
                color: varColor(C.red), fontWeight: 600,
              }}>
                <LuShieldAlert size={14} style={{ marginRight: 6, verticalAlign: "middle" }} />
                Área restrita — estas informações são confidenciais. Não compartilhe com terceiros.
              </div>
              <button
                onClick={exportCredenciais}
                title="Exportar PDF"
                className="relatorio-view__export-btn"
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "10px 16px", borderRadius: 10, flexShrink: 0,
                  border: `1px solid var(${C.border})`, background: "none",
                  color: varColor(C.muted), cursor: "pointer",
                  fontWeight: 600, whiteSpace: "nowrap",
                }}
              >
                <LuPrinter size={14} /> PDF
              </button>
            </div>

            <div style={{ background: varColor(C.card), border: `1px solid var(${C.border})`, borderRadius: 16, overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 400 }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid var(${C.border})` }}>
                    <Th>Usuário</Th>
                    <Th>Login</Th>
                    <Th>Cargo</Th>
                    <Th></Th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => {
                    return (
                      <tr
                        key={u.id}
                        onMouseEnter={e => e.currentTarget.style.background = varColor(C.surface)}
                        onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                        style={{ borderBottom: `1px solid var(${C.border})`, transition: "background 0.1s" }}
                      >
                        <Td sz={sz}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div className="relatorio-view__avatar" style={{
                              width: 32, height: 32, borderRadius: 16,
                              background: varColor(C.accent), color: "#fff",
                              display: "flex", alignItems: "center", justifyContent: "center",
                              fontWeight: 800, flexShrink: 0,
                            }}>
                              {(u.name ?? "?").split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase()}
                            </div>
                            <span style={{ fontWeight: 700 }}>{u.name}</span>
                          </div>
                        </Td>
                        <Td sz={sz} muted>@{u.username}</Td>
                        <Td sz={sz}>
                          <span className="relatorio-view__role-badge" style={{
                            fontWeight: 700,
                            background: varColor(C.surface), padding: "3px 10px",
                            borderRadius: 20, color: varColor(C.muted),
                          }}>
                            {u.role}
                          </span>
                        </Td>
                        <Td sz={sz} right>
                          <span className="relatorio-view__cred-hint" style={{ color: varColor(C.muted), fontStyle: "italic" }}>
                            redefinir em Configurações
                          </span>
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="relatorio-view__cred-nota" style={{ marginTop: 12, color: varColor(C.muted) }}>
              * Senhas marcadas como "não registrada" foram definidas antes desta funcionalidade. Redefina-as nas Configurações para que apareçam aqui.
            </div>
          </div>
        )}

        {/* ══ ADMIN (visão consolidada — só role admin) — B3 ══ */}
        {aba === "Admin" && !isSuperAdmin && (
          <Empty icon={LuLock} msg="Acesso restrito a administradores" sz={sz} />
        )}
        {aba === "Admin" && isSuperAdmin && (
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
                Visão administrativa consolidada — inclui todos os operadores. Confidencial.
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
        )}
      </div>

      {fechDetalhe && (
        <FechamentoDetalheModal f={fechDetalhe} onClose={() => setFechDetalhe(null)} />
      )}
    </div>
  );
}
