import { useState, useEffect, useMemo, useCallback } from "react";
import {
  LuTriangleAlert, LuLoaderCircle, LuReceipt, LuPrinter,
  LuBuilding2, LuCircleCheck, LuStore,
} from "react-icons/lu";
import { listarSaude, resumirSaude, PERIODOS_ANALYTICS } from "@/lib/console";
import "./SaudeDashboard.css";

/**
 * Saúde da operação por estabelecimento (F022-SAUDE, Console da
 * Plataforma · ADR-008 §7).
 *
 * É a 3ª fatia do "console do dev". A aba de Planos mostra quem PAGA, a de
 * Uso mostra quem USA, e esta mostra **para quem o sistema está quebrado
 * agora**. As duas falhas que ela expõe são silenciosas do lado da
 * plataforma e barulhentas do lado do cliente:
 *
 *   • nota fiscal recusada pela SEFAZ ou parada na fila de contingência —
 *     obrigação fiscal não cumprida, que hoje quem descobre é o contador
 *     do cliente;
 *   • comanda que não imprime — pedido que não chega na cozinha, com a
 *     Ponte local falhando na casa do cliente sem ninguém aqui saber.
 *
 * De onde vem o dado: RPC `saude_plataforma` (20260928), que agrega no
 * banco. `nfce_emitidas` e `trabalhos_impressao` NÃO são legíveis pelo
 * super-admin — a policy não tem o ramo `OR is_super_admin()`, por decisão
 * escrita (ADR-008, decisão v2 nº 2), e a RPC devolve contagem e a data do
 * mais antigo, nunca a linha do documento. Esta tela portanto não sabe (nem
 * pode saber) qual nota falhou, de qual venda, nem o que a comanda mandava
 * imprimir.
 *
 * Período e estado são coisas diferentes aqui, e a tela não os mistura:
 * "recusadas" e "com erro" são eventos do período escolhido; "paradas" é o
 * que está travado AGORA, sem corte nenhum. Aplicar o período à pendência
 * apagaria justamente o caso grave, a nota parada há 60 dias vista numa
 * janela de 30.
 *
 * A leitura acontece aqui e não na página porque a aba é a única
 * interessada: enquanto ninguém abrir "Saúde da operação", a RPC não é
 * chamada, e o Console continua carregando igual em bases onde a 20260928
 * ainda não foi aplicada.
 *
 * Por que é intuitivo (Princípio nº1): a primeira coisa da tela é a lista
 * de quem está quebrado, ordenada por há quanto tempo está parado, porque
 * um cliente com 1 nota parada há 40 dias está pior que outro com 30 notas
 * paradas desde hoje de manhã. Quando não há ninguém quebrado, a tela diz
 * isso com todas as letras em vez de mostrar uma tabela vazia. Nenhum
 * jargão: "nota fiscal", "impressão", "parado desde".
 */
export default function SaudeDashboard({ tenants, dias, aoTrocarPeriodo }) {
  const [saude, setSaude] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(false);
    const { data, error } = await listarSaude(dias);
    // Lista vazia é indistinguível de "está tudo funcionando": guardamos a
    // falha para a tela dizer que não sabe, em vez de dar um atestado de
    // saúde a uma base onde a leitura nem chegou a acontecer.
    if (error) setErro(true);
    setSaude(error ? [] : data);
    setCarregando(false);
  }, [dias]);

  useEffect(() => { carregar(); }, [carregar]);

  const { linhas, kpis, quebrados } = useMemo(
    () => resumirSaude(tenants ?? [], saude),
    [tenants, saude]
  );

  return (
    <div className="asau">
      {/* ── Período ──────────────────────────────────────────────────── */}
      <div className="asau__periodo" role="group" aria-label="Período">
        <span className="asau__periodo-rotulo">Falhas dos últimos</span>
        {PERIODOS_ANALYTICS.map((d) => (
          <button
            key={d}
            type="button"
            className={`asau__periodo-btn${d === dias ? " asau__periodo-btn--ativo" : ""}`}
            aria-pressed={d === dias}
            onClick={() => aoTrocarPeriodo(d)}
          >
            {d} dias
          </button>
        ))}
      </div>

      {carregando ? (
        <div className="asau__estado">
          <LuLoaderCircle size={26} className="asau__spin" aria-hidden />
          <p>Carregando a saúde dos estabelecimentos…</p>
        </div>
      ) : erro ? (
        <div className="asau__estado asau__estado--erro">
          <LuTriangleAlert size={26} aria-hidden />
          <p>
            Não foi possível carregar a saúde dos estabelecimentos. Isso não quer dizer que
            está tudo funcionando — as pendências só aparecem quando a leitura funcionar.
          </p>
          <button type="button" className="asau__tentar" onClick={carregar}>Tentar de novo</button>
        </div>
      ) : (
        <>
          {/* ── Quem está quebrado — o que exige ação agora ───────────── */}
          {quebrados.length > 0 ? (
            <section
              className="asau__alerta"
              role="status"
              aria-label="Estabelecimentos com pendência parada"
            >
              <div className="asau__alerta-topo">
                <LuTriangleAlert size={18} aria-hidden />
                <strong>
                  {quebrados.length === 1
                    ? "1 estabelecimento com algo parado agora"
                    : `${quebrados.length} estabelecimentos com algo parado agora`}
                </strong>
              </div>
              <ul className="asau__alerta-lista">
                {quebrados.map((l) => (
                  <li key={l.tenantId} className="asau__alerta-item">
                    <span className="asau__alerta-nome">{l.nome}</span>
                    <span className="asau__alerta-oque">{descreverParadas(l)}</span>
                    <span className="asau__alerta-quando">{rotularParadoDesde(l.diasParado)}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : linhas.length > 0 && (
            // Tabela de zeros lê como "não carregou". Aqui a tela afirma o
            // zero com todas as letras (Princípio nº1).
            <section className="asau__tudo-certo" role="status">
              <LuCircleCheck size={20} aria-hidden />
              <p>
                Nenhum estabelecimento com nota fiscal ou impressão parada. Nada exige ação
                agora.
              </p>
            </section>
          )}

          {/* ── Números da base ──────────────────────────────────────── */}
          <div className="asau__kpis">
            <Kpi icone={<LuBuilding2 size={18} aria-hidden />} rotulo="Com algo parado"
                 valor={`${kpis.estabelecimentosQuebrados} de ${linhas.length}`} />
            <Kpi icone={<LuReceipt size={18} aria-hidden />} rotulo="Notas paradas agora"
                 valor={String(kpis.fiscaisParadas)} />
            <Kpi icone={<LuPrinter size={18} aria-hidden />} rotulo="Impressões paradas agora"
                 valor={String(kpis.impressoesParadas)} />
            <Kpi icone={<LuTriangleAlert size={18} aria-hidden />} rotulo={`Falhas em ${dias} dias`}
                 valor={String(kpis.fiscaisRecusadas + kpis.impressoesComErro)} />
          </div>

          <p className="asau__nota">
            "Parado agora" não usa o período: é o que está travado neste momento, venha de
            quando vier. O período vale só para as falhas contadas, as recusas da SEFAZ e os
            erros de impressão.
          </p>

          {/* ── Por estabelecimento ──────────────────────────────────── */}
          {linhas.length === 0 ? (
            <div className="asau__estado">
              <LuStore size={30} aria-hidden />
              <p className="asau__vazio-titulo">Nenhum estabelecimento ainda</p>
              <p className="asau__vazio-texto">
                A saúde aparece quando o primeiro começar a emitir nota ou imprimir.
              </p>
            </div>
          ) : (
            <div className="asau__tabela-caixa">
              <table className="asau__tabela">
                <caption className="asau__tabela-caption">
                  Saúde por estabelecimento, com as falhas dos últimos {dias} dias
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Estabelecimento</th>
                    <th scope="col" className="asau__num">Notas paradas</th>
                    <th scope="col" className="asau__num">Notas recusadas</th>
                    <th scope="col" className="asau__num">Impressões paradas</th>
                    <th scope="col" className="asau__num">Impressões com erro</th>
                    <th scope="col">Parado desde</th>
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((l) => (
                    <tr key={l.tenantId} className={l.paradas > 0 ? "asau__linha--quebrada" : undefined}>
                      <th scope="row" className="asau__nome">{l.nome}</th>
                      <td className="asau__num">{l.fiscaisParadas}</td>
                      <td className="asau__num">{l.fiscaisRecusadas}</td>
                      <td className="asau__num">{l.impressoesParadas}</td>
                      <td className="asau__num">{l.impressoesComErro}</td>
                      <td>{rotularParadoDesde(l.diasParado)}</td>
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
    <div className="asau__kpi">
      <span className="asau__kpi-icone" aria-hidden>{icone}</span>
      <span className="asau__kpi-rotulo">{rotulo}</span>
      <strong className="asau__kpi-valor">{valor}</strong>
    </div>
  );
}

/** O que está parado, em português de quem vai ligar para o cliente. Só
 *  entra na frase o que tem pendência: dizer "0 impressões" para quem só
 *  tem problema fiscal obrigaria a ler um zero para descobrir que não é
 *  nada. */
function descreverParadas(l) {
  const partes = [];
  if (l.fiscaisParadas > 0) {
    partes.push(l.fiscaisParadas === 1 ? "1 nota fiscal" : `${l.fiscaisParadas} notas fiscais`);
  }
  if (l.impressoesParadas > 0) {
    partes.push(l.impressoesParadas === 1 ? "1 impressão" : `${l.impressoesParadas} impressões`);
  }
  return partes.join(" e ");
}

/** "Hoje" / "Ontem" / "Há N dias" — em vez de uma data que obrigaria o
 *  leitor a fazer a conta de cabeça. `null` é ausência de pendência, e aí
 *  não há desde quando: o travessão é a resposta honesta. */
function rotularParadoDesde(dias) {
  if (dias == null) return "—";
  if (dias === 0) return "Hoje";
  if (dias === 1) return "Ontem";
  return `Há ${dias} dias`;
}
