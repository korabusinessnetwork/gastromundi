import { useState, useEffect, useCallback, useMemo } from "react";
import { useApp } from "@/context/AppContext";
import { listarLancamentos, baixarConta, processarVencidos, calcularFluxoCaixa } from "@/lib/financeiro";
import { buscarFichasTecnicas, calcularCustoVendas } from "@/lib/relatorios";
import { useResponsive } from "@/utils/hooks";
import { getSizes } from "@/constants/sizes";
import C from "@/constants/colors";
import { varColor } from "@/lib/tema";
import { LuPlus } from "react-icons/lu";
import ResumoCards from "./financeiro/ResumoCards";
import LancamentosList from "./financeiro/LancamentosList";
import NovoLancamentoModal from "./financeiro/NovoLancamentoModal";
import "./FinanceiroView.css";

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
  const { currentUser, sales } = useApp();
  const { width } = useResponsive();
  const sz = getSizes(width);

  const [periodo, setPeriodo]   = useState(() => boundsDoMes(new Date()));
  const [lancamentos, setLancamentos] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [filtroTipo, setFiltroTipo]     = useState("todos");
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [showNovo, setShowNovo] = useState(false);
  const [fichas, setFichas] = useState([]);

  // Leva 15.6 — fichas técnicas para o custo dos produtos vendidos (lucro).
  useEffect(() => {
    let ativo = true;
    buscarFichasTecnicas().then(({ data, error }) => {
      if (error) { console.error("[financeiro] erro ao buscar fichas técnicas:", error); return; }
      if (ativo) setFichas(data ?? []);
    });
    return () => { ativo = false; };
  }, []);

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

  // Leva 15.6 — lucro do período: entradas realizadas − custo dos produtos
  // vendidos (fichas técnicas) − saídas realizadas (notas já pagas).
  // Vendas canceladas ficam fora; itens sem ficha entram como cobertura
  // parcial (o card avisa) em vez de custo inventado.
  const lucro = useMemo(() => {
    const vendasDoPeriodo = (sales ?? []).filter((s) => {
      if (!s || s.cancelada || !s.at) return false;
      const dia = String(s.at).slice(0, 10);
      return dia >= periodo.de && dia <= periodo.ate;
    });
    const custoVendas = calcularCustoVendas(vendasDoPeriodo, fichas);
    return {
      valor: fluxo.realizado.entradas - custoVendas.custo - fluxo.realizado.saidas,
      custoProdutos: custoVendas.custo,
      unidadesSemFicha: custoVendas.unidadesSemFicha,
    };
  }, [sales, fichas, periodo, fluxo]);

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
    <div className="financeiro-view" style={{ background: varColor(C.bg) }}>
      {/* Header */}
      <div className="financeiro-view__header" style={{ padding: `${sz.pad - 4}px ${sz.pad}px` }}>
        <div>
          <div className="financeiro-view__titulo" style={{ fontWeight: 800 }}>Financeiro</div>
          <div className="financeiro-view__subtitulo" style={{ color: varColor(C.muted) }}>Lançamentos, contas e fluxo de caixa</div>
        </div>
        <div className="financeiro-view__acoes">
          <input
            type="month"
            aria-label="Período"
            value={periodo.de.slice(0, 7)}
            onChange={handleMesChange}
            className="financeiro-view__mes"
          />
          <button
            onClick={() => setShowNovo(true)}
            className="financeiro-view__btn-novo"
          >
            <LuPlus size={16} /> Novo lançamento
          </button>
        </div>
      </div>

      <ResumoCards fluxo={fluxo} lucro={lucro} width={width} sz={sz} />

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
