import { useState, useMemo, useEffect, Fragment } from "react";
import { createPortal } from "react-dom";
import { useApp } from "@/context/AppContext";
import { supabase } from "@/lib/supabase";
import { exportToPDF, exportToXLSX } from "@/lib/exportReport";
import { useResponsive } from "@/utils/hooks";
import { getSizes } from "@/constants/sizes";
import C from "@/constants/colors";
import {
  LuBanknote, LuReceipt, LuChartBar, LuCreditCard, LuZap, LuSmartphone,
  LuLock, LuTriangleAlert, LuPackage, LuClipboardList, LuShieldAlert, LuEye, LuEyeOff,
  LuPrinter, LuDownload, LuX, LuCircleX,
} from "react-icons/lu";

const ABAS = ["Vendas", "Cancelamentos", "Fechamentos", "Logs", "Credenciais"];

const PERIODOS = [
  { id: "hoje",    label: "Hoje"    },
  { id: "semana",  label: "7 dias"  },
  { id: "mes",     label: "30 dias" },
  { id: "tudo",    label: "Tudo"    },
  { id: "custom",  label: "Período" },
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
      fontSize: 14, fontWeight: 700, color: C.muted,
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
        title="Exportar Excel"
        style={{
          display: "flex", alignItems: "center", gap: 5,
          padding: "6px 13px", borderRadius: 8,
          border: `1px solid ${C.border}`, background: "none",
          color: C.muted, cursor: "pointer",
          fontSize: sz.fontSm + 1, fontWeight: 600, whiteSpace: "nowrap",
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
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 500, fontFamily: "'Inter',system-ui,sans-serif",
      }}
    >
      <div style={{
        background: C.card, borderRadius: 20, padding: 28,
        width: 520, border: `1px solid ${C.border}`,
        display: "flex", flexDirection: "column", gap: 20,
        maxHeight: "90vh", overflowY: "auto",
        color: C.text, fontFamily: "'Inter',system-ui,sans-serif",
      }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{
              width: 48, height: 48, borderRadius: 14, flexShrink: 0,
              background: `${C.accent}18`, border: `1.5px solid ${C.accent}44`,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <LuLock size={22} color={C.accent} />
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 18 }}>Fechamento de Caixa</div>
              <div style={{ color: C.muted, fontSize: 16, marginTop: 2 }}>
                {fmtData(f.at)}
              </div>
              <div style={{ color: C.muted, fontSize: 18, marginTop: 1 }}>
                {f.user ?? "—"}{f.role ? ` · ${f.role}` : ""}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none", border: `1px solid ${C.border}`,
              borderRadius: 8, padding: "6px 8px", cursor: "pointer",
              color: C.muted, display: "flex", alignItems: "center",
            }}
          >
            <LuX size={16} />
          </button>
        </div>

        {/* Tabela por método */}
        {f.conferidoPorMetodo && (
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            <div style={{
              display: "grid", gridTemplateColumns: "1fr 110px",
              gap: 8, paddingBottom: 8, marginBottom: 2,
              borderBottom: `1px solid ${C.border}`,
              fontSize: 14, fontWeight: 700, color: C.muted,
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
                  borderBottom: `1px solid ${C.border}`,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 17, fontWeight: 600 }}>
                    <Icon size={15} color={C.muted} />
                    {label}
                    {id === "dinheiro" && f.fundo > 0 && (
                      <span style={{ fontSize: 14, color: C.muted, fontWeight: 400 }}>
                        (inclui fundo {fmtR(f.fundo)})
                      </span>
                    )}
                  </div>
                  <div style={{ textAlign: "right", fontWeight: 800, fontSize: 17 }}>
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
            background: `${C.accent}0c`, border: `1px solid ${C.accent}33`,
            borderRadius: 12, padding: "12px 14px",
            display: "flex", flexDirection: "column", gap: 4,
          }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.accent, textTransform: "uppercase", letterSpacing: 1 }}>
              Observação
            </div>
            <div style={{ fontSize: 16, color: C.text, lineHeight: 1.6 }}>
              {f.observacao}
            </div>
          </div>
        )}

        {/* Resumo */}
        <div style={{
          background: C.surface, borderRadius: 14,
          border: `1px solid ${C.border}`, padding: 16,
          display: "flex", flexDirection: "column", gap: 9,
        }}>
          {[
            { label: "Total de Vendas (sistema)", value: fmtR(f.totalVendas) },
            { label: "Fundo de Caixa",            value: fmtR(f.fundo)       },
          ].map(r => (
            <div key={r.label} style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: 16, color: C.muted }}>{r.label}</span>
              <span style={{ fontSize: 16, fontWeight: 600, color: C.muted }}>{r.value}</span>
            </div>
          ))}

          <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 9, marginTop: 2, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontWeight: 700, fontSize: 17 }}>Total Esperado em Caixa</span>
            <span style={{ fontWeight: 800, fontSize: 18, color: C.muted }}>{fmtR(totalEsperado)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontWeight: 800, fontSize: 18 }}>Total Conferido</span>
            <span style={{ fontWeight: 900, fontSize: 17, color: C.green }}>{fmtR(f.totalConferido)}</span>
          </div>

          <div style={{
            padding: "12px 16px", borderRadius: 10, marginTop: 4,
            background: diferenca >= 0 ? `${C.green}14` : `${C.red}14`,
            border: `1.5px solid ${(diferenca >= 0 ? C.green : C.red)}55`,
            display: "flex", justifyContent: "space-between", alignItems: "center",
          }}>
            <span style={{ fontWeight: 600, fontSize: 16, color: C.muted }}>
              {diferenca >= 0 ? "Sobra no Caixa" : "Falta no Caixa"}
            </span>
            <span style={{ fontWeight: 900, fontSize: 18, color: diferenca >= 0 ? C.green : C.red }}>
              {diferenca >= 0 ? "+" : ""}{fmtR(diferenca)}
            </span>
          </div>
        </div>

        <button
          onClick={onClose}
          style={{
            padding: "11px", borderRadius: 10,
            border: `1px solid ${C.border}`, background: "none",
            color: C.muted, cursor: "pointer", fontWeight: 600, fontSize: 17,
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
  const { sales, fechamentos, pending, users, credentials, currentUser } = useApp();
  const { width } = useResponsive();
  const sz = getSizes(width);

  const [aba,           setAba]           = useState("Vendas");
  const [periodo,       setPeriodo]       = useState("hoje");
  const [customInicio,  setCustomInicio]  = useState("");
  const [customFim,     setCustomFim]     = useState("");
  const [fechDetalhe,   setFechDetalhe]   = useState(null);
  const [metodoFilt,  setMetodoFilt]  = useState("todos");
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
    let l = filtrarPorPeriodo(sales, "at", periodo, customInicio, customFim);
    if (metodoFilt !== "todos") l = l.filter(s => s.metodo === metodoFilt);
    return l;
  }, [sales, periodo, metodoFilt, customInicio, customFim]);

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

  const exportCredenciais = () => {
    // Senhas mascaradas no PDF — documento impresso pode ser visto por terceiros
    const headers = ["Usuário", "Login", "Cargo", "Senha cadastrada"];
    const rows = users.map(u => [
      u.name ?? "—",
      `@${u.username}`,
      u.role ?? "—",
      credentials[u.username] ? "••••••••" : "não registrada",
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

        <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
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
                  border: `1.5px solid ${customInicio ? C.accent : C.border}`,
                  background: C.surface, color: C.text,
                  fontSize: sz.fontSm + 1, fontFamily: "inherit", outline: "none",
                  cursor: "pointer", transition: "border-color 0.15s",
                }}
              />
              <span style={{ color: C.muted, fontWeight: 600, fontSize: sz.fontSm + 1 }}>até</span>
              <input
                type="date"
                className="relatorio-date-input"
                value={customFim}
                min={customInicio || undefined}
                onChange={e => setCustomFim(e.target.value)}
                style={{
                  padding: "7px 12px", borderRadius: 9,
                  border: `1.5px solid ${customFim ? C.accent : C.border}`,
                  background: C.surface, color: C.text,
                  fontSize: sz.fontSm + 1, fontFamily: "inherit", outline: "none",
                  cursor: "pointer", transition: "border-color 0.15s",
                }}
              />
              {(customInicio || customFim) && (
                <button
                  onClick={() => { setCustomInicio(""); setCustomFim(""); }}
                  style={{
                    background: "none", border: `1px solid ${C.border}`,
                    borderRadius: 8, padding: "6px 8px", cursor: "pointer",
                    color: C.muted, display: "flex", alignItems: "center",
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

        {/* ══ CANCELAMENTOS ══ */}
        {aba === "Cancelamentos" && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

            {/* KPIs */}
            <div style={{
              display: "grid", gridTemplateColumns: "repeat(4, 1fr)",
              gap: sz.gap, padding: `${sz.pad}px ${sz.pad}px ${sz.padSm}px`,
              flexShrink: 0,
            }}>
              <KpiCard label="Ocorrências"       value={kpisCancelamentos.total}                        color={C.red}    Icon={LuCircleX}       sz={sz} />
              <KpiCard label="Itens Cancelados"  value={kpisCancelamentos.qtd}                          color="#f97316"  Icon={LuPackage}       sz={sz} />
              <KpiCard label="Valor Perdido"     value={fmtR(kpisCancelamentos.valor)}                  color={C.red}    Icon={LuBanknote}      sz={sz} />
              <KpiCard label="Motivo Mais Comum" value={kpisCancelamentos.topMotivo}                    color={C.muted}  Icon={LuTriangleAlert} sz={sz} />
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
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${C.border}` }}>
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
                        onMouseEnter={e => e.currentTarget.style.background = C.surface}
                        onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                        style={{ borderBottom: `1px solid ${C.border}`, transition: "background 0.1s" }}
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
                          <span style={{
                            fontWeight: 800, color: C.red,
                            background: `${C.red}14`, border: `1px solid ${C.red}33`,
                            borderRadius: 8, padding: "2px 10px", fontSize: sz.fontSm + 1,
                          }}>
                            ×{c.qty}
                          </span>
                        </Td>
                        <Td sz={sz} right color={C.red}>
                          <span style={{ fontWeight: 800 }}>- {fmtR(c.price * c.qty)}</span>
                        </Td>
                        <Td sz={sz}>
                          {c.motivo !== "—" ? (
                            <span style={{
                              fontSize: sz.fontSm + 1, color: C.muted,
                              background: C.surface, borderRadius: 8,
                              padding: "3px 10px", display: "inline-block",
                              maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                            }}
                              title={c.motivo}
                            >
                              {c.motivo}
                            </span>
                          ) : <span style={{ color: C.muted }}>—</span>}
                        </Td>
                        <Td sz={sz}>
                          {c.canceladoPor && c.canceladoPor !== "—"
                            ? <span style={{ fontWeight: 600, color: C.red }}>{c.canceladoPor}</span>
                            : <span style={{ color: C.muted }}>—</span>}
                        </Td>
                        <Td sz={sz}>
                          {c.cashier && c.cashier !== "—"
                            ? <span style={{ fontWeight: 600, color: C.text }}>{c.cashier}</span>
                            : <span style={{ color: C.muted }}>—</span>}
                        </Td>
                        <Td sz={sz}>
                          <span style={{
                            fontSize: sz.fontSm, fontWeight: 700,
                            padding: "3px 10px", borderRadius: 20,
                            background: c.origem === "Em aberto" ? `${C.accent}14` : `${C.green}14`,
                            border: `1px solid ${c.origem === "Em aberto" ? C.accent : C.green}44`,
                            color: c.origem === "Em aberto" ? C.accent : C.green,
                          }}>
                            {c.origem}
                          </span>
                        </Td>
                        <Td sz={sz} right muted nowrap>{fmtData(c.at)}</Td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop: `2px solid ${C.border}` }}>
                      <td colSpan={3} style={{ padding: "12px 16px", fontWeight: 700, fontSize: sz.fontBase, color: C.muted }}>
                        {kpisCancelamentos.qtd} item(ns) cancelado(s)
                      </td>
                      <td style={{ padding: "12px 16px", textAlign: "right", fontWeight: 900, fontSize: sz.fontLg, color: C.red }}>
                        - {fmtR(kpisCancelamentos.valor)}
                      </td>
                      <td colSpan={5} />
                    </tr>
                  </tfoot>
                </table>
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
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${C.border}` }}>
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
                      const dif = (f.totalConferido ?? 0) - (f.totalVendas ?? 0);
                      const hasObs = !!f.observacao;
                      return (
                        <Fragment key={f.id ?? i}>
                          <tr
                            onClick={() => setFechDetalhe(f)}
                            onMouseEnter={e => e.currentTarget.style.background = C.surface}
                            onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                            style={{
                              borderBottom: hasObs ? "none" : `1px solid ${C.border}`,
                              transition: "background 0.1s", cursor: "pointer",
                            }}
                          >
                            <Td sz={sz} muted nowrap>{fmtData(f.at)}</Td>
                            <Td sz={sz}>{f.user ?? "—"}</Td>
                            <Td sz={sz} right>{fmtR(f.fundo)}</Td>
                            <Td sz={sz} right><span style={{ fontWeight: 700 }}>{fmtR(f.totalVendas)}</span></Td>
                            <Td sz={sz} right color={C.green}><span style={{ fontWeight: 700 }}>{fmtR(f.totalConferido)}</span></Td>
                            <Td sz={sz} right color={dif >= 0 ? C.green : C.red}>
                              <span style={{ fontWeight: 800 }}>{dif >= 0 ? "+" : ""}{fmtR(dif)}</span>
                            </Td>
                            <Td sz={sz} right>
                              <span style={{
                                fontSize: sz.fontSm, fontWeight: 600, color: C.accent,
                                padding: "3px 10px", borderRadius: 20,
                                background: `${C.accent}10`, border: `1px solid ${C.accent}33`,
                                whiteSpace: "nowrap",
                              }}>
                                Ver detalhes
                              </span>
                            </Td>
                          </tr>
                          {hasObs && (
                            <tr
                              onClick={() => setFechDetalhe(f)}
                              style={{ borderBottom: `1px solid ${C.border}`, cursor: "pointer" }}
                            >
                              <td colSpan={7} style={{ padding: "0 16px 10px" }}>
                                <div style={{
                                  fontSize: sz.fontSm + 1, color: C.muted,
                                  lineHeight: 1.5, fontStyle: "italic",
                                }}>
                                  <span style={{
                                    fontStyle: "normal", fontWeight: 700,
                                    color: C.accent, marginRight: 6, fontSize: sz.fontSm,
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
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: sz.pad }}>
              <div style={{
                flex: 1, background: `${C.red}10`, border: `1px solid ${C.red}33`,
                borderRadius: 12, padding: "12px 16px",
                fontSize: sz.fontSm + 1, color: C.red, fontWeight: 600,
              }}>
                <LuShieldAlert size={14} style={{ marginRight: 6, verticalAlign: "middle" }} />
                Área restrita — estas informações são confidenciais. Não compartilhe com terceiros.
              </div>
              <button
                onClick={exportCredenciais}
                title="Exportar PDF"
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "10px 16px", borderRadius: 10, flexShrink: 0,
                  border: `1px solid ${C.border}`, background: "none",
                  color: C.muted, cursor: "pointer",
                  fontSize: sz.fontSm + 1, fontWeight: 600, whiteSpace: "nowrap",
                }}
              >
                <LuPrinter size={14} /> PDF
              </button>
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
                              fontWeight: 800, fontSize: 18, flexShrink: 0,
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

      {fechDetalhe && (
        <FechamentoDetalheModal f={fechDetalhe} onClose={() => setFechDetalhe(null)} />
      )}
    </div>
  );
}
