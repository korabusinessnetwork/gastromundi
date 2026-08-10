import { useEffect, useMemo, useState } from "react";
import { LuArrowLeft, LuCircleCheck, LuMonitor, LuTriangleAlert } from "react-icons/lu";
import { listarLancamentos, calcularFluxoCaixa, marcarVencidos } from "@/lib/financeiro/financeiro";
import { intervaloDoMes, intervaloUltimosDias } from "@/lib/comum/periodos";
import { fmtDinheiro } from "@/pages/mobile/fmt";
import "../modulos.css";
import "./FinanceiroModulo.css";

/**
 * FinanceiroModulo — resumo de bolso do Financeiro no Palm.
 *
 * NÃO é o módulo inteiro: é a versão "dá pra conferir andando pelo salão".
 * Somente leitura — nada de lançar, editar ou dar baixa em conta aqui (isso
 * continua no computador). Reusa por inteiro a lógica de src/lib/financeiro/financeiro.js
 * (listarLancamentos, calcularFluxoCaixa, marcarVencidos): esta tela só decide
 * o que mostrar e como, nunca recalcula dinheiro por conta própria.
 */

const CHIPS = [
  { chave: "hoje", rotulo: "Hoje", subtitulo: "Resumo de hoje" },
  { chave: "semana", rotulo: "Semana", subtitulo: "Resumo dos últimos 7 dias" },
  { chave: "mes", rotulo: "Mês", subtitulo: "Resumo do mês" },
];

function periodoDaChave(chave) {
  if (chave === "hoje") return intervaloUltimosDias(1);
  if (chave === "semana") return intervaloUltimosDias(7);
  return intervaloDoMes();
}

export default function FinanceiroModulo({ onVoltar }) {
  const [periodoChave, setPeriodoChave] = useState("mes");
  const periodo = useMemo(() => periodoDaChave(periodoChave), [periodoChave]);

  const [lancamentos, setLancamentos] = useState([]);
  const [previstos, setPrevistos] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

  useEffect(() => {
    let cancelado = false;

    async function carregar() {
      setCarregando(true);
      setErro("");

      // Dois recortes: os lançamentos do período (para o fluxo de caixa) e
      // TODOS os previstos (para vencidos/próximos, que não são "do mês
      // escolhido" — uma conta vencida importa mesmo fora do chip ativo).
      const [resPeriodo, resPrevistos] = await Promise.all([
        listarLancamentos({ de: periodo.de, ate: periodo.ate }),
        listarLancamentos({ status: "previsto" }),
      ]);

      if (cancelado) return;
      setCarregando(false);

      if (resPeriodo.error || resPrevistos.error) {
        setErro("Não foi possível carregar o financeiro agora.");
        return;
      }
      setLancamentos(resPeriodo.data ?? []);
      setPrevistos(resPrevistos.data ?? []);
    }

    carregar();
    return () => {
      cancelado = true;
    };
  }, [periodo.de, periodo.ate]);

  const fluxo = useMemo(
    () => calcularFluxoCaixa(lancamentos, periodo.de, periodo.ate),
    [lancamentos, periodo.de, periodo.ate],
  );

  const vencidosIds = useMemo(() => new Set(marcarVencidos(previstos)), [previstos]);
  const vencidosLista = useMemo(
    () => previstos.filter((l) => vencidosIds.has(l.id)),
    [previstos, vencidosIds],
  );
  const totalVencido = useMemo(
    () => vencidosLista.reduce((s, l) => s + (Number(l.valor) || 0), 0),
    [vencidosLista],
  );

  const proximos = useMemo(
    () =>
      previstos
        .filter((l) => l.vencimento && !vencidosIds.has(l.id))
        .sort((a, b) => new Date(a.vencimento) - new Date(b.vencimento))
        .slice(0, 5),
    [previstos, vencidosIds],
  );

  return (
    <div className="mod-tela">
      <header className="mod-header">
        <div className="mod-header__textos">
          <h1 className="mod-header__titulo">Financeiro</h1>
          {/* O subtítulo segue o chip: dizer "Resumo do mês" com "Hoje"
              selecionado faria o cabeçalho mentir sobre o que está na tela. */}
          <p className="mod-header__subtitulo">
            {CHIPS.find((c) => c.chave === periodoChave)?.subtitulo}
          </p>
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
        <p className="mod-carregando">Carregando financeiro…</p>
      ) : (
        <>
          <section className="mod-lista" aria-label="Fluxo de caixa previsto">
            <div className="mod-cartao mod-cartao--green">
              <span className="mod-cartao__sub">A receber</span>
              <strong className="financeiro-modulo__valor financeiro-modulo__valor--green">
                {fmtDinheiro(fluxo.previsto.entradas)}
              </strong>
            </div>
            <div className="mod-cartao mod-cartao--red">
              <span className="mod-cartao__sub">A pagar</span>
              <strong className="financeiro-modulo__valor financeiro-modulo__valor--red">
                {fmtDinheiro(fluxo.previsto.saidas)}
              </strong>
            </div>
            <div className="mod-cartao">
              <span className="mod-cartao__sub">Saldo</span>
              <strong className="financeiro-modulo__valor financeiro-modulo__valor--accent">
                {fmtDinheiro(fluxo.previsto.saldo)}
              </strong>
            </div>
          </section>

          {vencidosLista.length > 0 ? (
            <div className="mod-cartao mod-cartao--red" aria-label="Contas vencidas">
              <div className="mod-cartao__topo">
                <span className="mod-cartao__titulo">Vencidos</span>
                <span className="mod-badge mod-badge--erro">
                  <LuTriangleAlert aria-hidden="true" />
                  {vencidosLista.length === 1 ? "1 conta" : `${vencidosLista.length} contas`}
                </span>
              </div>
              <strong className="financeiro-modulo__valor financeiro-modulo__valor--red">
                {fmtDinheiro(totalVencido)}
              </strong>
            </div>
          ) : (
            <div className="mod-cartao" aria-label="Contas vencidas">
              <div className="mod-cartao__topo">
                <span className="mod-cartao__titulo">Vencidos</span>
                <span className="mod-badge mod-badge--ok">
                  <LuCircleCheck aria-hidden="true" />
                  Nada vencido
                </span>
              </div>
            </div>
          )}

          <section aria-label="Próximos lançamentos">
            <h2 className="financeiro-modulo__secaoTitulo">Próximos lançamentos</h2>
            {proximos.length === 0 ? (
              <p className="financeiro-modulo__vazioTexto">Nenhum lançamento previsto.</p>
            ) : (
              <div className="mod-lista">
                {proximos.map((l) => (
                  <div key={l.id} className="mod-linha">
                    <span>{l.descricao || l.categoria}</span>
                    <strong
                      className={
                        l.tipo === "despesa"
                          ? "financeiro-modulo__valor--red"
                          : "financeiro-modulo__valor--green"
                      }
                    >
                      {l.tipo === "despesa" ? "-" : ""}
                      {fmtDinheiro(l.valor)}
                    </strong>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      <p className="financeiro-modulo__aviso">
        <LuMonitor aria-hidden="true" />
        Versão completa no computador
      </p>
    </div>
  );
}
