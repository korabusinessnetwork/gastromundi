import { useState, useEffect, useCallback, useMemo } from "react";
import { useApp } from "@/context/AppContext";
import { listarLancamentos, baixarConta, processarVencidos, calcularFluxoCaixa } from "@/lib/financeiro";
import { useResponsive } from "@/utils/hooks";
import { getSizes } from "@/constants/sizes";
import C from "@/constants/colors";
import { LuPlus } from "react-icons/lu";
import ResumoCards from "./financeiro/ResumoCards";
import LancamentosList from "./financeiro/LancamentosList";
import NovoLancamentoModal from "./financeiro/NovoLancamentoModal";

/**
 * Módulo Financeiro — fase 1 (docs/03_REGRAS_DE_NEGOCIO/FINANCEIRO.md).
 * Lançamentos, receita automática por venda, fiado como conta a
 * receber, baixa de contas e fluxo de caixa previsto vs realizado.
 */

function boundsDoMes(referencia) {
  const de  = new Date(referencia.getFullYear(), referencia.getMonth(), 1);
  const ate = new Date(referencia.getFullYear(), referencia.getMonth() + 1, 0);
  const fmt = (d) => d.toISOString().slice(0, 10);
  return { de: fmt(de), ate: fmt(ate) };
}

export default function FinanceiroView() {
  const { currentUser } = useApp();
  const { width } = useResponsive();
  const sz = getSizes(width);

  const [periodo, setPeriodo]   = useState(() => boundsDoMes(new Date()));
  const [lancamentos, setLancamentos] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [filtroTipo, setFiltroTipo]     = useState("todos");
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [showNovo, setShowNovo] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true);
    const { data, error } = await listarLancamentos({});
    if (error) {
      console.error("[financeiro] erro ao listar lançamentos:", error);
      setLoading(false);
      return;
    }
    const comVencidosProcessados = await processarVencidos(data ?? []);
    setLancamentos(comVencidosProcessados);
    setLoading(false);
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const fluxo = useMemo(
    () => calcularFluxoCaixa(lancamentos, periodo.de, periodo.ate),
    [lancamentos, periodo],
  );

  const lancamentosFiltrados = useMemo(() => {
    return lancamentos
      .filter((l) => l.competencia >= periodo.de && l.competencia <= periodo.ate)
      .filter((l) => filtroTipo === "todos" || l.tipo === filtroTipo)
      .filter((l) => filtroStatus === "todos" || l.status === filtroStatus)
      .sort((a, b) => (b.competencia ?? "").localeCompare(a.competencia ?? ""));
  }, [lancamentos, periodo, filtroTipo, filtroStatus]);

  const handleBaixar = async (id) => {
    const { data, error } = await baixarConta(id, currentUser?.username);
    if (error) { console.error("[financeiro] erro ao baixar conta:", error); return; }
    setLancamentos((prev) => prev.map((l) => (l.id === id ? data : l)));
  };

  const handleCriado = (novoLancamento) => {
    setLancamentos((prev) => [novoLancamento, ...prev]);
    setShowNovo(false);
  };

  const handleMesChange = (e) => {
    const [ano, mes] = e.target.value.split("-").map(Number);
    if (!ano || !mes) return;
    setPeriodo(boundsDoMes(new Date(ano, mes - 1, 1)));
  };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", background: C.bg, overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: `${sz.pad - 4}px ${sz.pad}px`, borderBottom: `1px solid ${C.border}`, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: sz.fontLg }}>Financeiro</div>
          <div style={{ color: C.muted, fontSize: sz.fontSm, marginTop: 2 }}>Lançamentos, contas e fluxo de caixa</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input
            type="month"
            aria-label="Período"
            value={periodo.de.slice(0, 7)}
            onChange={handleMesChange}
            style={{ padding: "8px 12px", borderRadius: 10, border: `1px solid ${C.border}`, background: C.surface, color: C.text, fontFamily: "inherit", fontSize: 14 }}
          />
          <button
            onClick={() => setShowNovo(true)}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 16px", borderRadius: 10, border: "none", background: C.accent, color: "#fff", fontWeight: 700, cursor: "pointer", fontFamily: "inherit", fontSize: 14, whiteSpace: "nowrap" }}
          >
            <LuPlus size={16} /> Novo lançamento
          </button>
        </div>
      </div>

      <ResumoCards fluxo={fluxo} width={width} sz={sz} />

      <LancamentosList
        lancamentos={lancamentosFiltrados}
        loading={loading}
        filtroTipo={filtroTipo} setFiltroTipo={setFiltroTipo}
        filtroStatus={filtroStatus} setFiltroStatus={setFiltroStatus}
        onBaixar={handleBaixar}
        sz={sz}
      />

      {showNovo && (
        <NovoLancamentoModal
          usuario={currentUser?.username}
          onCreated={handleCriado}
          onClose={() => setShowNovo(false)}
        />
      )}
    </div>
  );
}
