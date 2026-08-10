import { useState, useEffect, useMemo, useCallback } from "react";
import {
  LuTriangleAlert, LuLoaderCircle, LuBanknote, LuChartColumn, LuWallet,
  LuBuilding2, LuStore,
} from "react-icons/lu";
import { listarAnalitico, resumirUso, PERIODOS_ANALYTICS } from "@/lib/console/console";
import { formatarReais } from "@/lib/delivery/deliveryPedidos";
import "./AnalyticsDashboard.css";

/**
 * Uso e faturamento por estabelecimento (F022-ANALYTICS, Console da
 * Plataforma · ADR-008 §7).
 *
 * É a 2ª fatia do "console do dev": a aba de Planos mostra quem PAGA, esta
 * mostra quem USA. A pergunta que ela responde e nenhuma outra tela
 * respondia: um cliente que paga em dia e não fecha uma venda há semanas
 * está cancelando — só ninguém sabe ainda.
 *
 * De onde vem o dado: RPC `analytics_plataforma` (20260912), que agrega no
 * banco. `vendas` NÃO é legível pelo super-admin — a policy não tem o ramo
 * `OR is_super_admin()`, por decisão escrita (ADR-008, decisão v2 nº 2), e
 * a RPC devolve só contagem e soma, nunca a venda de um cliente. Esta tela
 * portanto não sabe (nem pode saber) o que cada estabelecimento vendeu.
 *
 * O período (7/30/90) chega por propriedade e a troca volta pela página: ele
 * mora na URL (`/console?aba=uso&dias=90`), para que recarregar não jogue o
 * dono de volta em 30 dias e para que o endereço possa ser guardado. Quem
 * escreve o parâmetro é a página; este componente só mostra o escolhido e
 * pede o novo.
 *
 * A leitura acontece aqui e não na página porque a aba é a única
 * interessada: enquanto ninguém abrir "Uso e faturamento", a RPC não é
 * chamada — e o Console continua carregando igual em bases onde a
 * 20260912 ainda não foi aplicada.
 *
 * Por que é intuitivo (Princípio nº1): a primeira coisa da tela é o que
 * exige ação ("paga e não está usando", em cor de alerta e com há quanto
 * tempo parou); depois os números da base inteira em cartões grandes; e só
 * então a tabela por estabelecimento, ordenada do que mais fatura para o
 * que menos fatura. O período tem três botões, sempre visíveis, com o
 * escolhido marcado — nada de campo de data para preencher. Nenhum termo
 * de billing solto: "faturamento", "pedidos", "ticket médio", "última
 * venda".
 */
export default function AnalyticsDashboard({ tenants, assinaturas, dias, aoTrocarPeriodo }) {
  const [analitico, setAnalitico] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(false);
    const { data, error } = await listarAnalitico(dias);
    // Lista vazia é indistinguível de "ninguém vendeu": guardamos a falha
    // para a tela dizer que não sabe, em vez de afirmar R$ 0,00 para uma
    // base que pode estar faturando.
    if (error) setErro(true);
    setAnalitico(error ? [] : data);
    setCarregando(false);
  }, [dias]);

  useEffect(() => { carregar(); }, [carregar]);

  const { linhas, kpis, pagandoSemUso } = useMemo(
    () => resumirUso(tenants ?? [], assinaturas ?? [], analitico),
    [tenants, assinaturas, analitico]
  );

  return (
    <div className="auso">
      {/* ── Período ──────────────────────────────────────────────────── */}
      <div className="auso__periodo" role="group" aria-label="Período">
        <span className="auso__periodo-rotulo">Mostrando os últimos</span>
        {PERIODOS_ANALYTICS.map((d) => (
          <button
            key={d}
            type="button"
            className={`auso__periodo-btn${d === dias ? " auso__periodo-btn--ativo" : ""}`}
            aria-pressed={d === dias}
            onClick={() => aoTrocarPeriodo(d)}
          >
            {d} dias
          </button>
        ))}
      </div>

      {carregando ? (
        <div className="auso__estado">
          <LuLoaderCircle size={26} className="auso__spin" aria-hidden />
          <p>Carregando o uso dos estabelecimentos…</p>
        </div>
      ) : erro ? (
        <div className="auso__estado auso__estado--erro">
          <LuTriangleAlert size={26} aria-hidden />
          <p>
            Não foi possível carregar o uso dos estabelecimentos. Isso não quer dizer que
            ninguém está vendendo — os números só aparecem quando a leitura funcionar.
          </p>
          <button type="button" className="auso__tentar" onClick={carregar}>Tentar de novo</button>
        </div>
      ) : (
        <>
          {/* ── Paga e não usa — o que exige ação agora ───────────────── */}
          {pagandoSemUso.length > 0 && (
            <section
              className="auso__alerta"
              role="status"
              aria-label="Estabelecimentos que pagam e não estão vendendo"
            >
              <div className="auso__alerta-topo">
                <LuTriangleAlert size={18} aria-hidden />
                <strong>
                  {pagandoSemUso.length === 1
                    ? "1 estabelecimento paga e não está vendendo"
                    : `${pagandoSemUso.length} estabelecimentos pagam e não estão vendendo`}
                </strong>
              </div>
              <ul className="auso__alerta-lista">
                {pagandoSemUso.map((l) => (
                  <li key={l.tenantId} className="auso__alerta-item">
                    <span className="auso__alerta-nome">{l.nome}</span>
                    <span className="auso__alerta-quando">{rotularUltimaVenda(l.diasSemVender)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* ── Números da base ──────────────────────────────────────── */}
          <div className="auso__kpis">
            <Kpi icone={<LuBanknote size={18} aria-hidden />} rotulo="Faturamento da base"
                 valor={emReais(kpis.faturamentoCentavos)} />
            <Kpi icone={<LuChartColumn size={18} aria-hidden />} rotulo="Pedidos"
                 valor={String(kpis.pedidos)} />
            <Kpi icone={<LuWallet size={18} aria-hidden />} rotulo="Ticket médio"
                 valor={kpis.ticketMedioCentavos == null ? "—" : emReais(kpis.ticketMedioCentavos)} />
            <Kpi icone={<LuBuilding2 size={18} aria-hidden />} rotulo="Vendendo no período"
                 valor={`${kpis.operando} de ${linhas.length}`} />
          </div>

          {/* Base inteira parada: R$ 0,00 nos cartões e uma tabela de zeros
              não dizem, sozinhos, que NINGUÉM vendeu — leem como "não
              carregou". Aqui a tela afirma o zero com todas as letras. */}
          {linhas.length > 0 && kpis.pedidos === 0 && (
            <p className="auso__sem-venda" role="status">
              Nenhuma venda no período: nenhum estabelecimento fechou pedido nos últimos{" "}
              {dias} dias.
            </p>
          )}

          <p className="auso__nota">
            O período é uma janela corrida a partir de hoje, não o mês fechado. Quem não
            aparece com venda pode ter vendido antes dela.
          </p>

          {/* ── Por estabelecimento ──────────────────────────────────── */}
          {linhas.length === 0 ? (
            <div className="auso__estado">
              <LuStore size={30} aria-hidden />
              <p className="auso__vazio-titulo">Nenhum estabelecimento ainda</p>
              <p className="auso__vazio-texto">Os números aparecem quando o primeiro começar a vender.</p>
            </div>
          ) : (
            <div className="auso__tabela-caixa">
              <table className="auso__tabela">
                <caption className="auso__tabela-caption">
                  Uso por estabelecimento nos últimos {dias} dias
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Estabelecimento</th>
                    <th scope="col" className="auso__num">Faturamento</th>
                    <th scope="col" className="auso__num">Pedidos</th>
                    <th scope="col" className="auso__num">Ticket médio</th>
                    <th scope="col">Última venda</th>
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((l) => (
                    <tr key={l.tenantId} className={l.pedidos === 0 ? "auso__linha--parada" : undefined}>
                      <th scope="row" className="auso__nome">{l.nome}</th>
                      <td className="auso__num">{emReais(l.faturamentoCentavos)}</td>
                      <td className="auso__num">{l.pedidos}</td>
                      <td className="auso__num">
                        {l.ticketMedioCentavos == null ? "—" : emReais(l.ticketMedioCentavos)}
                      </td>
                      <td>{rotularUltimaVenda(l.diasSemVender)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Kpi({ icone, rotulo, valor }) {
  return (
    <div className="auso__kpi">
      <span className="auso__kpi-icone" aria-hidden>{icone}</span>
      <span className="auso__kpi-rotulo">{rotulo}</span>
      <strong className="auso__kpi-valor">{valor}</strong>
    </div>
  );
}

/** Centavos inteiros → texto em reais. É o ÚNICO ponto que divide por 100:
 *  todo o resto do caminho (RPC, resumirUso, KPIs) é inteiro. */
function emReais(centavos) {
  return formatarReais((Number(centavos) || 0) / 100);
}

/** "Nunca vendeu" / "Hoje" / "Ontem" / "Há N dias" — em vez de uma data que
 *  obrigaria o leitor a fazer a conta de cabeça. */
function rotularUltimaVenda(dias) {
  if (dias == null) return "Nunca vendeu";
  if (dias === 0) return "Hoje";
  if (dias === 1) return "Ontem";
  return `Há ${dias} dias`;
}
