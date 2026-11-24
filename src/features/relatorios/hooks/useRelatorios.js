import { useState, useMemo, useEffect } from "react";
import { normalizarPagamentos, totalPorMetodo, rotuloMetodo } from "@/utils/pagamentos";
import { agruparVendasPorDia, rotuloDiaBR, intervaloPeriodo, agruparVendasPorOperador } from "@/utils/datas";
import {
  calcularVariacaoPercentual,
} from "@/lib/relatorios";
import { ticketMedio } from "@/lib/vendas";
import { esperadoEmCaixa, diferencaCaixa } from "@/lib/caixa";
import { useSessao, useConfig, useComandas, useCaixa } from "@/context/AppContext";
import { listarLogsOperador } from "@/features/auditoria/dados/logsOperador";
import { exportToPDF as exportToPDFBase, exportToXLSX as exportToXLSXBase } from "@/lib/exportReport";
import { useResponsive } from "@/utils/hooks";
import { getSizes } from "@/constants/sizes";
import { nomeExibicaoTenant, marcaComAssinatura } from "@/lib/tema";
import { ABAS_BASE, SALE_PREFIXES, filtrarPorPeriodo, fmtData } from "@/features/relatorios/regras/relatorio";
import { ehGerencia } from "@/constants/roles";

// Estado, filtros, números e exportações da tela de Relatórios. Cada aba lê daqui.
export function useRelatorios() {
  const { users, currentUser, tenant } = useSessao();
  const { metodosCustom } = useConfig();
  const { pending } = useComandas();
  const { sales: salesBrutas, fechamentos } = useCaixa();
  // Leva 15.3 — vendas canceladas ficam fora de todos os relatórios
  const sales = useMemo(() => (salesBrutas ?? []).filter(s => s && !s.cancelada), [salesBrutas]);
  // Rótulos de método configurados pelo tenant (white-label, decisão 017):
  // garante que o nome amigável ("Cielo") apareça em vez do id cru
  // (custom_cielo_1783…) em toda a tela de relatórios.
  const customLabels = useMemo(
    () => Object.fromEntries((metodosCustom ?? []).map(m => [m.id, m.label])),
    [metodosCustom]
  );
  const { width } = useResponsive();
  const sz = getSizes(width);

  // Cabeçalho dos exports com a identidade do tenant (white-label,
  // decisão 017); "by Kora" é a assinatura da plataforma. Sem tema custom
  // cai no nome CADASTRADO do estabelecimento — antes caía na marca de um
  // cliente específico, que ia impressa no PDF e na planilha de todo mundo.
  const empresaExport = marcaComAssinatura(nomeExibicaoTenant(tenant?.tema, tenant?.nome));
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
    listarLogsOperador()
      .then(({ data }) => {
        setOpLogs(data ?? []);
        setLoadingLogs(false);
      });
  }, [aba]);

  const isAdmin = ehGerencia(currentUser);
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
    const ticket = ticketMedio(total, count);
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
    const ticket = ticketMedio(totalAtual, atuais.length);

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
          uid:           it.uid,
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
          uid:           it.uid,
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
        normalizarPagamentos(v).map(p => rotuloMetodo(p.metodo, customLabels)).join(" + "),
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
          normalizarPagamentos(v).map(p => rotuloMetodo(p.metodo, customLabels)).join(" + "),
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
    const headers = ["Data/Hora", "Usuário", "Fundo (R$)", "Total Vendas (R$)", "Esperado em Caixa (R$)", "Conferido (R$)", "Diferença (R$)"];
    const rows = fechsFiltrados.map(f => {
      const dif = diferencaCaixa(f);
      return [
        fmtData(f.at), f.user ?? "—",
        Number(f.fundo ?? 0).toFixed(2),
        Number(f.totalVendas ?? 0).toFixed(2),
        esperadoEmCaixa(f).toFixed(2),
        Number(f.totalConferido ?? 0).toFixed(2),
        (dif > 0 ? "+" : "") + dif.toFixed(2),
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
    if (fmt === "pdf") exportToPDF("Relatório Admin, Faturamento por Operador", headers, rows, periodo, { totais });
    else               exportToXLSX("Relatorio Admin", headers, rows, periodo);
  };

  return {
    aba,
    setAba,
    periodo,
    setPeriodo,
    customInicio,
    setCustomInicio,
    customFim,
    setCustomFim,
    fechDetalhe,
    setFechDetalhe,
    metodoFilt,
    setMetodoFilt,
    buscaComanda,
    setBuscaComanda,
    logTipo,
    setLogTipo,
    subVendas,
    setSubVendas,
    opLogs,
    setOpLogs,
    loadingLogs,
    setLoadingLogs,
    users,
    currentUser,
    tenant,
    metodosCustom,
    pending,
    salesBrutas,
    fechamentos,
    width,
    sales,
    customLabels,
    sz,
    empresaExport,
    exportToPDF,
    exportToXLSX,
    isAdmin,
    isSuperAdmin,
    ABAS,
    vendasFiltradas,
    kpis,
    vendasPorDia,
    adminConsolidado,
    fechsFiltrados,
    cancelamentos,
    kpisCancelamentos,
    logsFiltrados,
    totalItens,
    exportVendas,
    exportFechamentos,
    exportCredenciais,
    exportCancelamentos,
    exportLogs,
    exportAdmin,
  };
}
