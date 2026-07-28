import { useEffect, useMemo, useState } from "react";
import { LuArrowLeft, LuChartBar, LuMonitor, LuTrendingDown, LuTrendingUp } from "react-icons/lu";
import {
  buscarRelatorioVendas,
  calcularPeriodo,
  calcularPeriodoAnterior,
  calcularVariacaoPercentual,
} from "@/lib/relatorios";
import { fmtDinheiro } from "@/pages/mobile/fmt";
import "../modulos.css";
import "./RelatoriosModulo.css";

/**
 * RelatoriosModulo — resumo de bolso de Vendas no Palm.
 *
 * NÃO é o módulo inteiro: sem gráfico por forma de pagamento, sem margem
 * por ficha técnica, sem período customizado — isso continua no
 * DesempenhoReport do computador. Aqui é só o número do dia/semana/mês e o
 * top de produtos, para o dono conferir andando pelo salão. Somente
 * leitura, tudo vem da RPC relatorio_vendas via src/lib/relatorios.js —
 * esta tela não agrega nada por conta própria.
 */

const CHIPS = [
  { chave: "dia", rotulo: "Hoje" },
  { chave: "semana", rotulo: "Semana" },
  { chave: "mes", rotulo: "Mês" },
];

export default function RelatoriosModulo({ onVoltar }) {
  const [periodoChave, setPeriodoChave] = useState("dia");
  const periodo = useMemo(() => calcularPeriodo(periodoChave), [periodoChave]);
  const periodoAnterior = useMemo(
    () => calcularPeriodoAnterior(periodo.inicio, periodo.fim),
    [periodo],
  );

  const [atual, setAtual] = useState(null);
  const [anterior, setAnterior] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

  useEffect(() => {
    let cancelado = false;

    async function carregar() {
      setCarregando(true);
      setErro("");

      const [resAtual, resAnterior] = await Promise.all([
        buscarRelatorioVendas({ inicio: periodo.inicio, fim: periodo.fim, limiteProdutos: 10 }),
        buscarRelatorioVendas({
          inicio: periodoAnterior.inicio,
          fim: periodoAnterior.fim,
          limiteProdutos: 1,
        }),
      ]);

      if (cancelado) return;
      setCarregando(false);

      if (resAtual.error) {
        setErro("Não foi possível carregar o relatório agora.");
        return;
      }
      setAtual(resAtual.data);
      // Comparação é um plus: se falhar, a tela ainda mostra o período atual.
      setAnterior(resAnterior.error ? null : resAnterior.data);
    }

    carregar();
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodoChave]);

  const faturamento = atual?.faturamento ?? 0;
  const numeroVendas = atual?.numero_vendas ?? 0;
  const ticketMedio = numeroVendas > 0 ? faturamento / numeroVendas : 0;
  const faturamentoAnterior = anterior?.faturamento ?? 0;
  const variacao = anterior ? calcularVariacaoPercentual(faturamento, faturamentoAnterior) : null;
  const topProdutos = (atual?.top_produtos ?? []).slice(0, 10);

  return (
    <div className="mod-tela">
      <header className="mod-header">
        <div className="mod-header__textos">
          <h1 className="mod-header__titulo">Relatórios</h1>
          <p className="mod-header__subtitulo">Vendas do período</p>
        </div>
        <button type="button" className="mod-header__voltar" onClick={onVoltar} aria-label="Voltar">
          <LuArrowLeft aria-hidden="true" />
        </button>
      </header>

      <div className="mod-chips" role="tablist" aria-label="Período">
        {CHIPS.map(({ chave, rotulo }) => (
          <button
            key={chave}
            type="button"
            role="tab"
            aria-selected={periodoChave === chave}
            className={`mod-chip${periodoChave === chave ? " mod-chip--ativo" : ""}`}
            onClick={() => setPeriodoChave(chave)}
          >
            {rotulo}
          </button>
        ))}
      </div>

      {erro ? (
        <p className="mod-erro" role="alert">
          {erro}
        </p>
      ) : carregando ? (
        <p className="mod-carregando">Carregando relatório…</p>
      ) : numeroVendas === 0 ? (
        <div className="mod-vazio">
          <LuChartBar aria-hidden="true" />
          <p className="mod-vazio__titulo">Nenhuma venda no período</p>
          <p className="mod-vazio__texto">Escolha outro período ou volte mais tarde.</p>
        </div>
      ) : (
        <>
          <div className="mod-cartao">
            <span className="mod-cartao__sub">Faturamento</span>
            <strong className="relatorios-modulo__faturamento">{fmtDinheiro(faturamento)}</strong>
            {variacao != null && (
              <span
                className={`relatorios-modulo__variacao ${
                  variacao >= 0
                    ? "relatorios-modulo__variacao--alta"
                    : "relatorios-modulo__variacao--baixa"
                }`}
              >
                {variacao >= 0 ? (
                  <LuTrendingUp aria-hidden="true" />
                ) : (
                  <LuTrendingDown aria-hidden="true" />
                )}
                {Math.abs(variacao).toFixed(0)}% vs. período anterior
              </span>
            )}
          </div>

          <section className="relatorios-modulo__secundarios" aria-label="Vendas e ticket médio">
            <div className="mod-cartao">
              <span className="mod-cartao__sub">Vendas</span>
              <strong className="relatorios-modulo__valorSecundario">{numeroVendas}</strong>
            </div>
            <div className="mod-cartao">
              <span className="mod-cartao__sub">Ticket médio</span>
              <strong className="relatorios-modulo__valorSecundario">{fmtDinheiro(ticketMedio)}</strong>
            </div>
          </section>

          <section aria-label="Produtos mais vendidos">
            <h2 className="relatorios-modulo__secaoTitulo">Mais vendidos</h2>
            {topProdutos.length === 0 ? (
              <p className="relatorios-modulo__vazioTexto">Sem produtos vendidos no período.</p>
            ) : (
              <div className="mod-lista">
                {topProdutos.map((p, i) => (
                  <div key={p.produto_id ?? i} className="mod-linha">
                    <span>{p.nome}</span>
                    <strong>
                      {p.unidades} · {fmtDinheiro(p.receita)}
                    </strong>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      <p className="relatorios-modulo__aviso">
        <LuMonitor aria-hidden="true" />
        Versão completa no computador
      </p>
    </div>
  );
}
