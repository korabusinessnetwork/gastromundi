import { useState, useEffect, useCallback, useMemo } from "react";
import { useApp } from "@/context/AppContext";
import { listarLancamentos, baixarConta, processarVencidos, calcularFluxoCaixa } from "@/lib/financeiro/financeiro";
import { buscarFichasTecnicas, calcularCustoVendas } from "@/lib/relatorios/relatorios";
import { round2 } from "@/lib/vendas/vendas";
import { diaLocalISO, rotuloDiaBR } from "@/utils/datas";
import { useResponsive } from "@/utils/hooks";
import { getSizes } from "@/constants/sizes";
import C from "@/constants/colors";
import { varColor } from "@/lib/tenant/tema";
import { LuPlus } from "react-icons/lu";
import { intervaloDoMes } from "@/lib/comum/periodos";
import ResumoCards from "./cards/ResumoCards";
import LancamentosList from "./listas/LancamentosList";
import PeriodoSelector from "./campos/PeriodoSelector";
import NovoLancamentoModal from "./modais/NovoLancamentoModal";
import "./FinanceiroView.css";

/**
 * Módulo Financeiro — fase 1 (docs/03_REGRAS_DE_NEGOCIO/FINANCEIRO.md).
 * Lançamentos, receita automática por venda, fiado como conta a
 * receber, baixa de contas e fluxo de caixa previsto vs realizado.
 */

export default function FinanceiroView() {
  const { currentUser, sales } = useApp();
  const { width } = useResponsive();
  const sz = getSizes(width);

  const [periodo, setPeriodo]   = useState(() => intervaloDoMes(new Date()));
  const [lancamentos, setLancamentos] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [filtroTipo, setFiltroTipo]     = useState("todos");
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [showNovo, setShowNovo] = useState(false);
  const [fichas, setFichas] = useState([]);
  const [erroCarregar, setErroCarregar] = useState(false);
  const [aviso, setAviso] = useState("");

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
    setAviso("");
    const { data, error } = await listarLancamentos({});
    if (error) {
      // Falha de leitura NÃO é "não tem lançamento": antes a tela caía no
      // estado vazio e o dono lia "Nenhum lançamento no período" com R$ 0,00
      // em todos os cards, justamente quando o financeiro não foi lido.
      console.error("[financeiro] erro ao listar lançamentos:", error);
      setErroCarregar(true);
      setLoading(false);
      return;
    }
    setErroCarregar(false);
    const comVencidosProcessados = await processarVencidos(data ?? []);
    setLancamentos(comVencidosProcessados);
    setLoading(false);
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const fluxo = useMemo(
    () => calcularFluxoCaixa(lancamentos, periodo.de, periodo.ate),
    [lancamentos, periodo],
  );

  // Leva 15.6 — lucro do período: vendas do período − custo dos produtos
  // vendidos (fichas técnicas) − saídas realizadas (notas já pagas).
  // Vendas canceladas ficam fora; itens sem ficha entram como cobertura
  // parcial (o card avisa) em vez de custo inventado.
  //
  // Run 2 — dois acertos aqui:
  //   1. o dia da venda é o dia LOCAL do estabelecimento. Com `at.slice(0,10)`
  //      (dia UTC), a venda das 21h30 do dia 31 caía no mês seguinte: o custo
  //      dela ia para agosto e a receita ficava em julho;
  //   2. receita e custo vêm das MESMAS vendas. Antes o custo era de todas as
  //      vendas e a receita só a já recebida, então uma noite de fiado
  //      subtraía o custo sem somar a venda — e o card mostrava prejuízo.
  const lucro = useMemo(() => {
    const vendasDoPeriodo = (sales ?? []).filter((s) => {
      if (!s || s.cancelada || !s.at) return false;
      const dia = diaLocalISO(s.at);
      return dia != null && dia >= periodo.de && dia <= periodo.ate;
    });
    const custoVendas = calcularCustoVendas(vendasDoPeriodo, fichas);
    const receitaVendas = vendasDoPeriodo.reduce((s, v) => s + (Number(v.total) || 0), 0);
    return {
      valor: round2(receitaVendas - custoVendas.custo - fluxo.realizado.saidas),
      custoProdutos: round2(custoVendas.custo),
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
    setAviso("");
    const { data, error } = await baixarConta(id, currentUser?.username);
    // Duas coisas aqui: (1) a falha era só um console.error — o operador
    // clicava em "Baixar" e a tela não mudava nada, sem dizer por quê;
    // (2) sem o `!data`, um retorno vazio sem erro trocava a linha por `null`
    // e o próximo render da tabela quebrava ao ler `l.id` de nulo.
    if (error || !data) {
      console.error("[financeiro] erro ao baixar conta:", error);
      setAviso("Não foi possível baixar a conta. Tente de novo.");
      return;
    }
    setLancamentos((prev) => prev.map((l) => (l.id === id ? data : l)));
  };

  const handleCriado = (novoLancamento) => {
    setLancamentos((prev) => [novoLancamento, ...prev]);
    setShowNovo(false);
    // Salvou com competência fora do período que está na tela: a linha é
    // filtrada e o lançamento simplesmente não aparece. Sem este aviso o
    // dono acha que não salvou e lança de novo — dinheiro duplicado.
    const dia = novoLancamento?.competencia;
    if (dia && (dia < periodo.de || dia > periodo.ate)) {
      setAviso(`Lançamento salvo para ${rotuloDiaBR(dia)} — fora do período que está na tela.`);
    } else {
      setAviso("");
    }
  };

  const naoLido = erroCarregar && !loading;

  return (
    <div className="financeiro-view" style={{ background: varColor(C.bg) }}>
      {/* Header */}
      <div className="financeiro-view__header" style={{ padding: `${sz.pad - 4}px ${sz.pad}px` }}>
        <div>
          <div className="financeiro-view__titulo" style={{ fontWeight: 800 }}>Financeiro</div>
          <div className="financeiro-view__subtitulo" style={{ color: varColor(C.muted) }}>Lançamentos, contas e fluxo de caixa</div>
        </div>
        <div className="financeiro-view__acoes">
          <button
            onClick={() => setShowNovo(true)}
            className="financeiro-view__btn-novo"
          >
            <LuPlus size={16} /> Novo lançamento
          </button>
        </div>
      </div>

      <div className="financeiro-view__toolbar" style={{ padding: `${sz.padSm}px ${sz.pad}px 0` }}>
        <PeriodoSelector periodo={periodo} onChange={setPeriodo} />
      </div>

      {aviso && (
        <div className="financeiro-view__aviso" role="status" style={{ margin: `${sz.padSm}px ${sz.pad}px 0` }}>
          {aviso}
        </div>
      )}

      {/* Leitura falhou: mostrar os cards zerados seria mentir sobre o
          caixa. No lugar deles, o motivo e o botão de tentar de novo. */}
      {naoLido ? (
        <div className="financeiro-view__erro" role="alert" style={{ margin: `${sz.padSm}px ${sz.pad}px 0` }}>
          <div className="financeiro-view__erro-texto">
            Não foi possível carregar o financeiro. Os valores desta tela não estão disponíveis agora.
          </div>
          <button onClick={carregar} className="financeiro-view__btn-tentar">Tentar de novo</button>
        </div>
      ) : (
        <ResumoCards fluxo={fluxo} lucro={lucro} width={width} sz={sz} />
      )}

      <LancamentosList
        lancamentos={lancamentosFiltrados}
        loading={loading}
        erro={naoLido}
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
