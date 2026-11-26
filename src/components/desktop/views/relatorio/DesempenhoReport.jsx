import { useEffect, useMemo, useState } from "react";
import C from "@/constants/colors";
import { useConfig } from "@/context/AppContext";
import { varColor } from "@/lib/tema";
import { useResponsive } from "@/utils/hooks";
import { rotuloMetodo } from "@/utils/pagamentos";
import { LuBanknote, LuReceipt, LuChartBar, LuCircleAlert, LuTrendingUp, LuTrendingDown, LuChevronDown, LuCalendar, LuHourglass } from "react-icons/lu";
import {
  calcularPeriodo, calcularPeriodoComparacao, rotuloComparacao, calcularVariacaoPercentual, calcularMargemProdutos, buscarRelatorioVendas, buscarFichasTecnicas,
} from "@/lib/relatorios";
import { ticketMedio } from "@/features/caixa/regras/vendas";
import "./DesempenhoReport.css";

const PERIODOS = [
  { id: "dia",       label: "Hoje"    },
  { id: "semana",    label: "7 dias"  },
  { id: "mes",       label: "30 dias" },
  { id: "intervalo", label: "Período" },
];

// Janelas de comparação que o dono pode escolher (F011). Espelham a
// escolha de período do relatório, mas definem CONTRA O QUÊ comparar.
const COMPARACOES = [
  { id: "ontem",     label: "Ontem"   },
  { id: "7dias",     label: "7 dias"  },
  { id: "30dias",    label: "30 dias" },
  { id: "intervalo", label: "Período" },
];


const fmtR = (v) => "R$ " + Number(v ?? 0).toFixed(2);

function KpiCard({ label, value, color, Icon, variacao, rotuloVs }) {
  return (
    <div className="kpi-card" style={{ "--kpi-cor": color }}>
      <div className="kpi-card__label">
        {Icon && <Icon size={15} color={color} />} {label}
      </div>
      <div className="kpi-card__value">{value}</div>
      {variacao != null && (
        <span
          className={`kpi-card__variacao kpi-card__variacao--${variacao >= 0 ? "sobe" : "desce"}`}
        >
          {variacao >= 0 ? <LuTrendingUp size={12} /> : <LuTrendingDown size={12} />}
          {variacao >= 0 ? "+" : ""}{variacao.toFixed(1)}% vs. {rotuloVs}
        </span>
      )}
    </div>
  );
}

function GraficoDias({ porDia }) {
  const max = Math.max(1, ...porDia.map((d) => Number(d.total) || 0));
  return (
    <div className="grafico-dias">
      {porDia.map((d) => {
        const alturaPct = Math.max(2, ((Number(d.total) || 0) / max) * 100);
        const dia = new Date(d.dia + "T00:00:00");
        return (
          <div key={d.dia} className="grafico-dias__coluna" title={`${fmtR(d.total)} em ${dia.toLocaleDateString("pt-BR")}`}>
            <div className="grafico-dias__barra" style={{ "--barra-altura": `${alturaPct}%` }} />
            <span className="grafico-dias__label">
              {dia.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function BarraHorizontal({ label, valor, max, cor }) {
  const pct = max > 0 ? Math.max(2, (valor / max) * 100) : 0;
  return (
    <div className="barra-horizontal-linha">
      <span className="barra-horizontal-linha__label">{label}</span>
      <div className="barra-horizontal-linha__trilho">
        <div className="barra-horizontal-linha__preenchido" style={{ "--barra-largura": `${pct}%`, "--barra-cor": cor }} />
      </div>
      <span className="barra-horizontal-linha__valor">{fmtR(valor)}</span>
    </div>
  );
}

function Estado({ icon: Icone, msg }) {
  return (
    <div className="desempenho__estado">
      <div className="desempenho__estado-icone"><Icone size={42} /></div>
      <div className="desempenho__estado-msg">{msg}</div>
    </div>
  );
}

/**
 * F011 — Relatórios de vendas, margem e desempenho.
 *
 * Cada bloco responde uma pergunta direta do dono: "quanto vendi?"
 * (KPIs), "vendi mais ou menos que antes?" (variação vs. período
 * anterior), "o que mais sai?" (top produtos) e "isso dá lucro?"
 * (margem — só quando há ficha técnica cadastrada; sem ficha, mostra
 * "sem custo cadastrado" em vez de inventar número). Toda agregação
 * vem da RPC relatorio_vendas (Postgres), nunca do blob de vendas no
 * cliente.
 */
export default function DesempenhoReport() {
  const { width } = useResponsive();
  // Rótulos de método configurados pelo tenant (white-label, decisão 017):
  // o gráfico "por forma de pagamento" mostra "Cielo", não o id cru.
  const { metodosCustom } = useConfig();
  const customLabels = useMemo(
    () => Object.fromEntries((metodosCustom ?? []).map(m => [m.id, m.label])),
    [metodosCustom]
  );

  const [tipoPeriodo, setTipoPeriodo] = useState("semana");
  const [customInicio, setCustomInicio] = useState("");
  const [customFim, setCustomFim] = useState("");
  const [comparar, setComparar] = useState(true);

  // Janela de comparação escolhida pelo dono (popover "Comparar com").
  const [tipoComparacao, setTipoComparacao] = useState("ontem");
  const [compInicio, setCompInicio] = useState("");
  const [compFim, setCompFim] = useState("");
  const [popoverComp, setPopoverComp] = useState(false);

  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);
  const [atual, setAtual] = useState(null);
  const [anterior, setAnterior] = useState(null);
  const [fichas, setFichas] = useState([]);

  const periodoValido = tipoPeriodo !== "intervalo" || (customInicio && customFim);

  useEffect(() => {
    if (!periodoValido) return;
    let cancelado = false;

    const carregar = async () => {
      setCarregando(true);
      setErro(null);

      let inicio, fim;
      if (tipoPeriodo === "intervalo") {
        inicio = new Date(customInicio + "T00:00:00");
        fim = new Date(new Date(customFim + "T00:00:00").getTime() + 24 * 60 * 60 * 1000);
      } else {
        ({ inicio, fim } = calcularPeriodo(tipoPeriodo));
      }

      const [resAtual, resFichas] = await Promise.all([
        buscarRelatorioVendas({ inicio, fim }),
        buscarFichasTecnicas(),
      ]);

      let resAnterior = { data: null, error: null };
      if (comparar) {
        // Janela de comparação escolhida pelo dono; null = intervalo custom
        // incompleto -> não busca comparação, mas o período atual carrega.
        const periodoComp = calcularPeriodoComparacao(tipoComparacao, inicio, { inicio: compInicio, fim: compFim });
        if (periodoComp) resAnterior = await buscarRelatorioVendas(periodoComp);
      }

      if (cancelado) return;
      setCarregando(false);

      if (resAtual.error) { setErro("Não foi possível carregar o relatório agora."); return; }
      setAtual(resAtual.data);
      setAnterior(resAnterior.data ?? null);
      setFichas(resFichas.data ?? []);
    };

    carregar();
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipoPeriodo, customInicio, customFim, comparar, tipoComparacao, compInicio, compFim, periodoValido]);

  const faturamento = atual?.faturamento ?? 0;
  const numeroVendas = atual?.numero_vendas ?? 0;
  const ticketMedioAtual = ticketMedio(faturamento, numeroVendas);

  const faturamentoAnterior = anterior?.faturamento ?? 0;
  const numeroVendasAnterior = anterior?.numero_vendas ?? 0;
  const ticketMedioAnterior = ticketMedio(faturamentoAnterior, numeroVendasAnterior);

  const varFaturamento = comparar && anterior ? calcularVariacaoPercentual(faturamento, faturamentoAnterior) : null;
  const varVendas = comparar && anterior ? calcularVariacaoPercentual(numeroVendas, numeroVendasAnterior) : null;
  const varTicket = comparar && anterior ? calcularVariacaoPercentual(ticketMedioAtual, ticketMedioAnterior) : null;

  // Rótulo da janela de comparação: no selo do KPI ("vs. ontem") e no botão.
  const rotuloVs = rotuloComparacao(tipoComparacao, { inicio: compInicio, fim: compFim });
  const rotuloBotaoComp = tipoComparacao === "intervalo"
    ? (compInicio && compFim ? rotuloVs : "Período")
    : (COMPARACOES.find((c) => c.id === tipoComparacao)?.label ?? "Ontem");

  const porDia = atual?.por_dia ?? [];
  const porMetodo = atual?.por_metodo ?? [];
  const maxMetodo = Math.max(1, ...porMetodo.map((m) => Number(m.total) || 0));

  const produtosComMargem = calcularMargemProdutos(atual?.top_produtos ?? [], fichas);

  return (
    <div className="desempenho">
      {/* Toolbar de período */}
      <div className="desempenho__toolbar">
        <div className="desempenho__periodos">
          {PERIODOS.map((p) => (
            <button
              key={p.id}
              className={`desempenho__chip${tipoPeriodo === p.id ? " desempenho__chip--ativo" : ""}`}
              onClick={() => setTipoPeriodo(p.id)}
            >
              {p.label}
            </button>
          ))}
        </div>

        {tipoPeriodo === "intervalo" && (
          <div className="desempenho__datas">
            <input
              type="date"
              className={`desempenho__date-input${customInicio ? " desempenho__date-input--preenchida" : ""}`}
              value={customInicio}
              onChange={(e) => setCustomInicio(e.target.value)}
            />
            <span className="desempenho__datas-ate">até</span>
            <input
              type="date"
              className={`desempenho__date-input${customFim ? " desempenho__date-input--preenchida" : ""}`}
              value={customFim}
              min={customInicio || undefined}
              onChange={(e) => setCustomFim(e.target.value)}
            />
          </div>
        )}

        <div className="desempenho__comparar-area">
          <label className="desempenho__comparar">
            <input type="checkbox" checked={comparar} onChange={(e) => setComparar(e.target.checked)} />
            Comparar com
          </label>

          {comparar && (
            <div className="desempenho__comp-wrap">
              <button
                type="button"
                className="desempenho__comp-btn"
                onClick={() => setPopoverComp((v) => !v)}
                aria-haspopup="true"
                aria-expanded={popoverComp}
              >
                {rotuloBotaoComp}
                <LuChevronDown size={14} className={`desempenho__comp-seta${popoverComp ? " desempenho__comp-seta--aberta" : ""}`} />
              </button>

              {popoverComp && (
                <>
                  <div className="desempenho__comp-backdrop" onClick={() => setPopoverComp(false)} />
                  <div
                    className="desempenho__comp-popover"
                    role="menu"
                  >
                    <div className="desempenho__comp-popover-titulo">
                      Comparar com
                    </div>
                    <div className="desempenho__comp-chips">
                      {COMPARACOES.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          role="menuitemradio"
                          aria-checked={tipoComparacao === c.id}
                          className={`desempenho__chip${tipoComparacao === c.id ? " desempenho__chip--ativo" : ""}`}
                          onClick={() => {
                            setTipoComparacao(c.id);
                            if (c.id !== "intervalo") setPopoverComp(false);
                          }}
                        >
                          {c.label}
                        </button>
                      ))}
                    </div>

                    {tipoComparacao === "intervalo" && (
                      <div className="desempenho__comp-datas">
                        <input
                          type="date"
                          className={`desempenho__date-input${compInicio ? " desempenho__date-input--preenchida" : ""}`}
                          value={compInicio}
                          onChange={(e) => setCompInicio(e.target.value)}
                        />
                        <span className="desempenho__datas-ate">até</span>
                        <input
                          type="date"
                          className={`desempenho__date-input${compFim ? " desempenho__date-input--preenchida" : ""}`}
                          value={compFim}
                          min={compInicio || undefined}
                          onChange={(e) => setCompFim(e.target.value)}
                        />
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Conteúdo */}
      {!periodoValido ? (
        <Estado icon={LuCalendar} msg="Selecione as duas datas do período" />
      ) : erro ? (
        <div className="desempenho__body">
          <div className="desempenho__erro">
            <LuCircleAlert size={18} /> {erro}
          </div>
        </div>
      ) : carregando ? (
        <Estado icon={LuHourglass} msg="Carregando relatório..." />
      ) : numeroVendas === 0 ? (
        <Estado icon={LuChartBar} msg="Nenhuma venda no período selecionado" />
      ) : (
        <div className="desempenho__body">
          {/* KPIs */}
          <div className="desempenho__kpis">
            <KpiCard label="Faturamento" value={fmtR(faturamento)} color={varColor(C.green)} Icon={LuBanknote} variacao={varFaturamento} rotuloVs={rotuloVs} />
            <KpiCard label="Vendas Realizadas" value={numeroVendas} color={varColor(C.blue)} Icon={LuReceipt} variacao={varVendas} rotuloVs={rotuloVs} />
            <KpiCard label="Ticket Médio" value={fmtR(ticketMedioAtual)} color={varColor(C.accent)} Icon={LuChartBar} variacao={varTicket} rotuloVs={rotuloVs} />
          </div>

          {/* Vendas por dia */}
          <div className="desempenho__secao">
            <div className="desempenho__secao-titulo">Vendas por dia</div>
            {porDia.length === 0 ? (
              <div className="desempenho__vazio-texto">Sem dados diários no período.</div>
            ) : (
              <GraficoDias porDia={porDia} />
            )}
          </div>

          <div className={`desempenho__colunas${width < 900 ? " desempenho__colunas--uma" : ""}`}>
            {/* Por método de pagamento */}
            <div className="desempenho__secao">
              <div className="desempenho__secao-titulo">Faturamento por forma de pagamento</div>
              {porMetodo.length === 0 ? (
                <div className="desempenho__vazio-texto">Sem pagamentos registrados no período.</div>
              ) : (
                porMetodo.map((m) => (
                  <BarraHorizontal
                    key={m.metodo}
                    label={rotuloMetodo(m.metodo, customLabels)}
                    valor={Number(m.total) || 0}
                    max={maxMetodo}
                    cor={varColor(C.accent)}
                  />
                ))
              )}
            </div>

            {/* Top produtos + margem */}
            <div className="desempenho__secao">
              <div className="desempenho__secao-titulo">Produtos mais vendidos</div>
              {produtosComMargem.length === 0 ? (
                <div className="desempenho__vazio-texto">Sem produtos vendidos no período.</div>
              ) : (
                <div className="desempenho__rolagem">
                  <table className="tabela-produtos">
                    <thead>
                      <tr className="tabela-produtos__linha">
                        <th>Produto</th>
                        <th className="right">Unid.</th>
                        <th className="right">Receita</th>
                        <th className="right">Margem</th>
                      </tr>
                    </thead>
                    <tbody>
                      {produtosComMargem.map((p, i) => (
                        <tr key={p.produto_id ?? i} className="tabela-produtos__linha">
                          <td className="tabela-produtos__nome">{p.nome}</td>
                          <td className="right tabela-produtos__apagado">{p.unidades}</td>
                          <td className="right tabela-produtos__receita">{fmtR(p.receita)}</td>
                          <td className="right">
                            {p.semCusto ? (
                              <span className="badge-sem-custo">
                                sem custo cadastrado
                              </span>
                            ) : (
                              <span className={`tabela-produtos__margem tabela-produtos__margem--${p.margemValor >= 0 ? "positiva" : "negativa"}`}>
                                {fmtR(p.margemValor)} ({p.margemPercentual.toFixed(0)}%)
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
