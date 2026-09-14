import { useEffect, useMemo, useState } from "react";
import C from "@/constants/colors";
import { varColor } from "@/lib/tema";
import { intervaloPeriodo } from "@/utils/datas";
import { formatarReais } from "@/lib/dinheiro";
import { listarPedidosDelivery, formatarFormaPagamento } from "@/lib/deliveryPedidos";
import {
  compararOrigens, resumoDelivery, agruparPorBairro,
  agruparPorFormaPagamento, tempoMedioEntregaMin,
} from "@/lib/relatorioDelivery";
import {
  LuStore, LuBike, LuBanknote, LuReceipt, LuChartBar,
  LuMapPin, LuClock, LuTruck, LuCircleX, LuCircleAlert,
} from "react-icons/lu";
import "./DeliveryReport.css";

/**
 * Relatório de Delivery (F011 + DELIVERY.md).
 *
 * Responde a pergunta que a tela de Vendas não respondia: quanto do
 * movimento é entrega e quanto é balcão. A comparação vem primeiro,
 * porque é para isso que se abre esta aba; o detalhe do delivery
 * (bairro, taxa, forma de pagamento, tempo) vem depois.
 *
 * O faturamento de cada lado sai de `vendas.origem` (marcado na origem
 * desde a migração 20261002 — sem contagem dupla e sem adivinhação); a
 * operação da entrega sai de `delivery_pedidos`, o histórico próprio do
 * delivery. As duas listas são recortadas pelo MESMO período escolhido
 * no topo da tela.
 */
export default function DeliveryReport({ vendas, periodo, customInicio, customFim, onExportar }) {
  const [pedidos, setPedidos] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);

  useEffect(() => {
    let vivo = true;
    setCarregando(true);
    setErro(null);
    listarPedidosDelivery().then(({ data, error }) => {
      if (!vivo) return;
      setCarregando(false);
      if (error) { setErro("Não foi possível carregar os pedidos de delivery agora."); return; }
      setPedidos(data ?? []);
    });
    return () => { vivo = false; };
  }, []);

  const { ini, fim } = useMemo(
    () => intervaloPeriodo(periodo, customInicio, customFim),
    [periodo, customInicio, customFim],
  );

  const dentroDoPeriodo = useMemo(() => (campo) => (registro) => {
    if (ini == null && fim == null) return true;
    const t = registro?.[campo] ? new Date(registro[campo]).getTime() : 0;
    return (ini == null || t >= ini) && (fim == null || t <= fim);
  }, [ini, fim]);

  const vendasPeriodo = useMemo(
    () => (vendas ?? []).filter(dentroDoPeriodo("at")),
    [vendas, dentroDoPeriodo],
  );
  const pedidosPeriodo = useMemo(
    () => pedidos.filter(dentroDoPeriodo("created_at")),
    [pedidos, dentroDoPeriodo],
  );

  const comparacao = useMemo(() => compararOrigens(vendasPeriodo), [vendasPeriodo]);
  const resumo = useMemo(() => resumoDelivery(pedidosPeriodo), [pedidosPeriodo]);
  const bairros = useMemo(() => agruparPorBairro(pedidosPeriodo), [pedidosPeriodo]);
  const pagamentos = useMemo(() => agruparPorFormaPagamento(pedidosPeriodo), [pedidosPeriodo]);
  const tempoMedio = useMemo(() => tempoMedioEntregaMin(pedidosPeriodo), [pedidosPeriodo]);

  // Quem chama monta o PDF/planilha: aqui só entregamos as linhas prontas.
  useEffect(() => {
    onExportar?.({ comparacao, resumo, bairros, pagamentos, tempoMedio });
  }, [onExportar, comparacao, resumo, bairros, pagamentos, tempoMedio]);

  if (carregando) {
    return <div className="delivery-report__estado">Carregando o movimento do delivery...</div>;
  }

  const semMovimento = comparacao.vendas === 0 && resumo.pedidos === 0;

  return (
    <div className="delivery-report">
      {erro && (
        <div className="delivery-report__erro">
          <LuCircleAlert size={16} /> {erro}
        </div>
      )}

      {semMovimento ? (
        <div className="delivery-report__estado">
          <LuBike size={44} className="delivery-report__estado-icone" />
          <div className="delivery-report__estado-titulo">Nenhum movimento no período selecionado</div>
          <div className="delivery-report__estado-msg">Troque o período no topo da tela para ver outro intervalo.</div>
        </div>
      ) : (
        <>
          {/* ── A comparação: os dois lados, lado a lado ── */}
          <section>
            <h3 className="delivery-report__secao">Delivery x Frente de caixa</h3>
            <div className="delivery-report__comparacao">
              <LadoCard
                titulo="Frente de caixa"
                Icon={LuStore}
                cor={varColor(C.blue)}
                dados={comparacao.pdv}
              />
              <LadoCard
                titulo="Delivery"
                Icon={LuBike}
                cor={varColor(C.accent)}
                dados={comparacao.delivery}
              />
            </div>

            {/* Uma barra só, com os dois pedaços: a leitura de "quanto é
                delivery" não exige comparar dois números de cabeça. */}
            <div className="delivery-report__barra" role="img"
              aria-label={`Frente de caixa ${comparacao.pdv.participacao.toFixed(0)}%, delivery ${comparacao.delivery.participacao.toFixed(0)}% do faturamento`}
            >
              <div
                className="delivery-report__barra-pdv"
                style={{ width: `${comparacao.pdv.participacao}%`, background: varColor(C.blue) }}
              />
              <div
                className="delivery-report__barra-delivery"
                style={{ width: `${comparacao.delivery.participacao}%`, background: varColor(C.accent) }}
              />
            </div>
            <div className="delivery-report__barra-legenda">
              <span><i style={{ background: varColor(C.blue) }} /> Frente de caixa {comparacao.pdv.participacao.toFixed(0)}%</span>
              <span><i style={{ background: varColor(C.accent) }} /> Delivery {comparacao.delivery.participacao.toFixed(0)}%</span>
              <strong>{formatarReais(comparacao.total)} no total</strong>
            </div>
          </section>

          {/* ── O delivery por dentro ── */}
          <section>
            <h3 className="delivery-report__secao">Operação do delivery</h3>
            <div className="delivery-report__kpis">
              <Kpi label="Pedidos"            valor={resumo.pedidos}                       Icon={LuReceipt}  cor={varColor(C.blue)} />
              <Kpi label="Entregues"          valor={resumo.entregues}                     Icon={LuTruck}    cor={varColor(C.green)} />
              <Kpi label="Em andamento"       valor={resumo.emAndamento}                   Icon={LuClock}    cor={varColor(C.warn)} />
              <Kpi label="Cancelados"         valor={resumo.cancelados}                    Icon={LuCircleX}  cor={varColor(C.red)} />
              <Kpi label="Faturamento"        valor={formatarReais(resumo.faturamento)}    Icon={LuBanknote} cor={varColor(C.green)} />
              <Kpi label="Taxas de entrega"   valor={formatarReais(resumo.taxaEntrega)}    Icon={LuBike}     cor={varColor(C.accent)} />
              <Kpi label="Ticket médio"       valor={formatarReais(resumo.ticket)}         Icon={LuChartBar} cor={varColor(C.accent)} />
              <Kpi
                label="Tempo até entregar"
                valor={tempoMedio == null ? "—" : `${Math.round(tempoMedio)} min`}
                Icon={LuClock}
                cor={varColor(C.muted)}
              />
            </div>
          </section>

          {/* ── Onde vende e como paga ── */}
          <div className="delivery-report__colunas">
            <section>
              <h3 className="delivery-report__secao"><LuMapPin size={14} /> Bairros que mais pedem</h3>
              <Ranking linhas={bairros} vazio="Nenhum pedido de entrega no período." />
            </section>
            <section>
              <h3 className="delivery-report__secao"><LuBanknote size={14} /> Como o delivery paga</h3>
              {/* O delivery tem vocabulário próprio de pagamento
                  ("Cartão na entrega"); o rotuloMetodo do PDV não conhece
                  "cartao" e mostraria o código cru. */}
              <Ranking
                linhas={pagamentos.map((l) => ({ ...l, nome: formatarFormaPagamento(l.nome) }))}
                vazio="Nenhum pagamento registrado no período."
              />
            </section>
          </div>
        </>
      )}
    </div>
  );
}

/** Um lado do balcão: faturamento em destaque, o resto embaixo. */
function LadoCard({ titulo, Icon, cor, dados }) {
  return (
    <div className="delivery-report__lado" style={{ "--lado-cor": cor }}>
      <div className="delivery-report__lado-topo">
        <Icon size={16} color={cor} />
        <span className="delivery-report__lado-titulo">{titulo}</span>
        <span className="delivery-report__lado-fatia">{dados.participacao.toFixed(0)}%</span>
      </div>
      <div className="delivery-report__lado-valor">{formatarReais(dados.total)}</div>
      <div className="delivery-report__lado-linhas">
        <span>{dados.vendas} {dados.vendas === 1 ? "venda" : "vendas"}</span>
        <span>Ticket {formatarReais(dados.ticket)}</span>
      </div>
    </div>
  );
}

function Kpi({ label, valor, Icon, cor }) {
  return (
    <div className="delivery-report__kpi" style={{ "--kpi-cor": cor }}>
      <div className="delivery-report__kpi-topo">
        <Icon size={14} color={cor} />
        <span className="delivery-report__kpi-label">{label}</span>
      </div>
      <div className="delivery-report__kpi-valor">{valor}</div>
    </div>
  );
}

/** Lista com barra proporcional — dá para ver a diferença sem ler os números. */
function Ranking({ linhas, vazio }) {
  if (linhas.length === 0) {
    return <div className="delivery-report__vazio">{vazio}</div>;
  }
  const maior = Math.max(...linhas.map((l) => l.total), 1);
  return (
    <div className="delivery-report__ranking">
      {linhas.map((l) => (
        <div key={l.nome} className="delivery-report__ranking-linha">
          <div className="delivery-report__ranking-topo">
            <span className="delivery-report__ranking-nome">{l.nome}</span>
            <span className="delivery-report__ranking-valor">
              {formatarReais(l.total)} <em>· {l.pedidos} {l.pedidos === 1 ? "pedido" : "pedidos"}</em>
            </span>
          </div>
          <div className="delivery-report__ranking-trilho">
            <div
              className="delivery-report__ranking-barra"
              style={{ width: `${Math.max(2, (l.total / maior) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
