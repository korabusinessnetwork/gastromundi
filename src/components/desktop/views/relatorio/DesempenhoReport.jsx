import { useEffect, useState } from "react";
import C from "@/constants/colors";
import { alfa } from "@/constants/colorAlfa";
import { varColor } from "@/lib/tema";
import { useResponsive } from "@/utils/hooks";
import { rotuloMetodo } from "@/utils/pagamentos";
import { getSizes } from "@/constants/sizes";
import { LuBanknote, LuReceipt, LuChartBar, LuCircleAlert, LuTrendingUp, LuTrendingDown } from "react-icons/lu";
import {
  calcularPeriodo, calcularPeriodoAnterior, calcularVariacaoPercentual,
  calcularMargemProdutos, buscarRelatorioVendas, buscarFichasTecnicas,
} from "@/lib/relatorios";
import "./DesempenhoReport.css";

const PERIODOS = [
  { id: "dia",       label: "Hoje"    },
  { id: "semana",    label: "7 dias"  },
  { id: "mes",       label: "30 dias" },
  { id: "intervalo", label: "Período" },
];


const fmtR = (v) => "R$ " + Number(v ?? 0).toFixed(2);

function KpiCard({ label, value, color, Icon, variacao }) {
  return (
    <div className="kpi-card" style={{ background: varColor(C.card), border: `1px solid var(${C.border})` }}>
      <div className="kpi-card__label" style={{ color: varColor(C.muted), display: "flex", alignItems: "center", gap: 8 }}>
        {Icon && <Icon size={15} color={color} />} {label}
      </div>
      <div className="kpi-card__value" style={{ color }}>{value}</div>
      {variacao != null && (
        <span
          className="kpi-card__variacao"
          style={{
            color: variacao >= 0 ? varColor(C.green) : varColor(C.red),
            background: variacao >= 0 ? `${alfa(C.green, "18")}` : `${alfa(C.red, "18")}`,
            display: "inline-flex", alignItems: "center", gap: 4,
          }}
        >
          {variacao >= 0 ? <LuTrendingUp size={12} /> : <LuTrendingDown size={12} />}
          {variacao >= 0 ? "+" : ""}{variacao.toFixed(1)}% vs. período anterior
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
            <div className="grafico-dias__barra" style={{ height: `${alturaPct}%`, background: varColor(C.accent) }} />
            <span className="grafico-dias__label" style={{ color: varColor(C.muted) }}>
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
      <span className="barra-horizontal-linha__label" style={{ color: varColor(C.text) }}>{label}</span>
      <div className="barra-horizontal-linha__trilho" style={{ background: varColor(C.surface) }}>
        <div className="barra-horizontal-linha__preenchido" style={{ width: `${pct}%`, background: cor }} />
      </div>
      <span className="barra-horizontal-linha__valor" style={{ color: varColor(C.text) }}>{fmtR(valor)}</span>
    </div>
  );
}

function Estado({ icon, msg }) {
  return (
    <div className="desempenho__estado">
      <div className="desempenho__estado-icone">{icon}</div>
      <div className="desempenho__estado-msg" style={{ color: varColor(C.muted) }}>{msg}</div>
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
  const sz = getSizes(width);

  const [tipoPeriodo, setTipoPeriodo] = useState("semana");
  const [customInicio, setCustomInicio] = useState("");
  const [customFim, setCustomFim] = useState("");
  const [comparar, setComparar] = useState(true);

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
        const periodoAnterior = calcularPeriodoAnterior(inicio, fim);
        resAnterior = await buscarRelatorioVendas(periodoAnterior);
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
  }, [tipoPeriodo, customInicio, customFim, comparar, periodoValido]);

  const faturamento = atual?.faturamento ?? 0;
  const numeroVendas = atual?.numero_vendas ?? 0;
  const ticketMedio = numeroVendas > 0 ? faturamento / numeroVendas : 0;

  const faturamentoAnterior = anterior?.faturamento ?? 0;
  const numeroVendasAnterior = anterior?.numero_vendas ?? 0;
  const ticketMedioAnterior = numeroVendasAnterior > 0 ? faturamentoAnterior / numeroVendasAnterior : 0;

  const varFaturamento = comparar && anterior ? calcularVariacaoPercentual(faturamento, faturamentoAnterior) : null;
  const varVendas = comparar && anterior ? calcularVariacaoPercentual(numeroVendas, numeroVendasAnterior) : null;
  const varTicket = comparar && anterior ? calcularVariacaoPercentual(ticketMedio, ticketMedioAnterior) : null;

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
              className="desempenho__chip"
              onClick={() => setTipoPeriodo(p.id)}
              style={{
                background: tipoPeriodo === p.id ? varColor(C.accent) : varColor(C.surface),
                color: tipoPeriodo === p.id ? "#fff" : varColor(C.muted),
                fontSize: sz.fontSm + 1,
              }}
            >
              {p.label}
            </button>
          ))}
        </div>

        {tipoPeriodo === "intervalo" && (
          <div className="desempenho__datas">
            <input
              type="date"
              className="desempenho__date-input"
              value={customInicio}
              onChange={(e) => setCustomInicio(e.target.value)}
              style={{ border: `1.5px solid ${customInicio ? varColor(C.accent) : varColor(C.border)}`, background: varColor(C.surface), color: varColor(C.text), fontSize: sz.fontSm + 1 }}
            />
            <span style={{ color: varColor(C.muted), fontWeight: 600, fontSize: sz.fontSm + 1 }}>até</span>
            <input
              type="date"
              className="desempenho__date-input"
              value={customFim}
              min={customInicio || undefined}
              onChange={(e) => setCustomFim(e.target.value)}
              style={{ border: `1.5px solid ${customFim ? varColor(C.accent) : varColor(C.border)}`, background: varColor(C.surface), color: varColor(C.text), fontSize: sz.fontSm + 1 }}
            />
          </div>
        )}

        <label className="desempenho__comparar" style={{ color: varColor(C.muted), fontSize: sz.fontSm + 1 }}>
          <input type="checkbox" checked={comparar} onChange={(e) => setComparar(e.target.checked)} />
          Comparar com período anterior
        </label>
      </div>

      {/* Conteúdo */}
      {!periodoValido ? (
        <Estado icon="📅" msg="Selecione as duas datas do período" />
      ) : erro ? (
        <div className="desempenho__body">
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: 16, borderRadius: 12, background: `${alfa(C.red, "12")}`, border: `1.5px solid ${alfa(C.red, "44")}`, color: varColor(C.red) }}>
            <LuCircleAlert size={18} /> {erro}
          </div>
        </div>
      ) : carregando ? (
        <Estado icon="⏳" msg="Carregando relatório..." />
      ) : numeroVendas === 0 ? (
        <Estado icon="📊" msg="Nenhuma venda no período selecionado" />
      ) : (
        <div className="desempenho__body">
          {/* KPIs */}
          <div className="desempenho__kpis">
            <KpiCard label="Faturamento" value={fmtR(faturamento)} color={varColor(C.green)} Icon={LuBanknote} variacao={varFaturamento} />
            <KpiCard label="Vendas Realizadas" value={numeroVendas} color={varColor(C.blue)} Icon={LuReceipt} variacao={varVendas} />
            <KpiCard label="Ticket Médio" value={fmtR(ticketMedio)} color={varColor(C.accent)} Icon={LuChartBar} variacao={varTicket} />
          </div>

          {/* Vendas por dia */}
          <div className="desempenho__secao" style={{ background: varColor(C.card), border: `1px solid var(${C.border})` }}>
            <div className="desempenho__secao-titulo" style={{ color: varColor(C.muted) }}>Vendas por dia</div>
            {porDia.length === 0 ? (
              <div style={{ color: varColor(C.muted), fontSize: sz.fontSm + 1 }}>Sem dados diários no período.</div>
            ) : (
              <GraficoDias porDia={porDia} />
            )}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: width < 900 ? "1fr" : "1fr 1fr", gap: 22 }}>
            {/* Por método de pagamento */}
            <div className="desempenho__secao" style={{ background: varColor(C.card), border: `1px solid var(${C.border})` }}>
              <div className="desempenho__secao-titulo" style={{ color: varColor(C.muted) }}>Faturamento por forma de pagamento</div>
              {porMetodo.length === 0 ? (
                <div style={{ color: varColor(C.muted), fontSize: sz.fontSm + 1 }}>Sem pagamentos registrados no período.</div>
              ) : (
                porMetodo.map((m) => (
                  <BarraHorizontal
                    key={m.metodo}
                    label={rotuloMetodo(m.metodo)}
                    valor={Number(m.total) || 0}
                    max={maxMetodo}
                    cor={varColor(C.accent)}
                  />
                ))
              )}
            </div>

            {/* Top produtos + margem */}
            <div className="desempenho__secao" style={{ background: varColor(C.card), border: `1px solid var(${C.border})` }}>
              <div className="desempenho__secao-titulo" style={{ color: varColor(C.muted) }}>Produtos mais vendidos</div>
              {produtosComMargem.length === 0 ? (
                <div style={{ color: varColor(C.muted), fontSize: sz.fontSm + 1 }}>Sem produtos vendidos no período.</div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table className="tabela-produtos">
                    <thead>
                      <tr style={{ borderBottom: `1px solid var(${C.border})` }}>
                        <th style={{ color: varColor(C.muted) }}>Produto</th>
                        <th className="right" style={{ color: varColor(C.muted) }}>Unid.</th>
                        <th className="right" style={{ color: varColor(C.muted) }}>Receita</th>
                        <th className="right" style={{ color: varColor(C.muted) }}>Margem</th>
                      </tr>
                    </thead>
                    <tbody>
                      {produtosComMargem.map((p, i) => (
                        <tr key={p.produto_id ?? i} style={{ borderBottom: `1px solid var(${C.border})` }}>
                          <td style={{ color: varColor(C.text), fontWeight: 600 }}>{p.nome}</td>
                          <td className="right" style={{ color: varColor(C.muted) }}>{p.unidades}</td>
                          <td className="right" style={{ color: varColor(C.text), fontWeight: 700 }}>{fmtR(p.receita)}</td>
                          <td className="right">
                            {p.semCusto ? (
                              <span className="badge-sem-custo" style={{ color: varColor(C.muted), background: varColor(C.surface) }}>
                                sem custo cadastrado
                              </span>
                            ) : (
                              <span style={{ fontWeight: 800, color: p.margemValor >= 0 ? varColor(C.green) : varColor(C.red) }}>
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
