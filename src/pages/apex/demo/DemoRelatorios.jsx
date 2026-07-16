import "./DemoRelatorios.css";
import { RELATORIO_DEMO, formatarBRL } from "./demoDados";

/**
 * Relatórios da demo — painel do dia, só leitura: stat-cards, vendas
 * por hora (barras em CSS puro, sem lib), mais vendidos e meios de
 * pagamento. Fecha com o gancho do Jarvas (diferencial do topo).
 */
export default function DemoRelatorios() {
  const {
    faturamentoHoje,
    vendasHoje,
    ticketMedio,
    comparativoOntem,
    topProdutos,
    vendasPorHora,
    meiosPagamento,
  } = RELATORIO_DEMO;

  const maiorHora = Math.max(...vendasPorHora.map((h) => h.valor));
  const maiorTop = Math.max(...topProdutos.map((p) => p.total));

  return (
    <div className="demo-relatorios">
      <div className="demo-relatorios__stats">
        <div className="demo-relatorios__stat">
          <span className="demo-relatorios__stat-rotulo">Faturamento hoje</span>
          <span className="demo-relatorios__stat-numero">{formatarBRL(faturamentoHoje)}</span>
          <span className="demo-relatorios__stat-delta">
            +{Math.round(comparativoOntem * 100)}% vs ontem
          </span>
        </div>
        <div className="demo-relatorios__stat">
          <span className="demo-relatorios__stat-rotulo">Vendas</span>
          <span className="demo-relatorios__stat-numero">{vendasHoje}</span>
        </div>
        <div className="demo-relatorios__stat">
          <span className="demo-relatorios__stat-rotulo">Ticket médio</span>
          <span className="demo-relatorios__stat-numero">{formatarBRL(ticketMedio)}</span>
        </div>
      </div>

      <section className="demo-relatorios__painel" aria-label="Vendas por hora">
        <h2 className="demo-relatorios__titulo">Vendas por hora</h2>
        <div className="demo-relatorios__grafico">
          {vendasPorHora.map((h) => (
            <div key={h.hora} className="demo-relatorios__coluna">
              <div
                className={
                  "demo-relatorios__barra" +
                  (h.valor === maiorHora ? " demo-relatorios__barra--pico" : "")
                }
                style={{ height: `${Math.round((h.valor / maiorHora) * 100)}%` }}
                title={formatarBRL(h.valor)}
              />
              <span className="demo-relatorios__hora">{h.hora}</span>
            </div>
          ))}
        </div>
      </section>

      <div className="demo-relatorios__duplo">
        <section className="demo-relatorios__painel" aria-label="Mais vendidos hoje">
          <h2 className="demo-relatorios__titulo">Mais vendidos hoje</h2>
          <ul className="demo-relatorios__lista">
            {topProdutos.map((p) => (
              <li key={p.nome} className="demo-relatorios__top">
                <div className="demo-relatorios__top-info">
                  <span className="demo-relatorios__top-nome">{p.nome}</span>
                  <span className="demo-relatorios__top-detalhe">
                    {p.qtd}x · {formatarBRL(p.total)}
                  </span>
                </div>
                <div className="demo-relatorios__top-trilha">
                  <div
                    className="demo-relatorios__top-barra"
                    style={{ width: `${Math.round((p.total / maiorTop) * 100)}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="demo-relatorios__painel" aria-label="Meios de pagamento">
          <h2 className="demo-relatorios__titulo">Meios de pagamento</h2>
          <ul className="demo-relatorios__lista">
            {meiosPagamento.map((m) => (
              <li key={m.meio} className="demo-relatorios__meio">
                <span className="demo-relatorios__meio-nome">{m.meio}</span>
                <div className="demo-relatorios__meio-trilha">
                  <div
                    className={
                      "demo-relatorios__meio-barra" +
                      (m.meio === "Pix" ? " demo-relatorios__meio-barra--pix" : "")
                    }
                    style={{ width: `${Math.round(m.pct * 100)}%` }}
                  />
                </div>
                <span className="demo-relatorios__meio-pct">
                  {Math.round(m.pct * 100)}%
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <p className="demo-relatorios__nota">
        No KORA de verdade, o Jarvas (nossa IA) lê esses números e te avisa do
        que precisa de atenção.
      </p>
    </div>
  );
}
