import { useState, useEffect, useMemo, useCallback } from "react";
import { LuBanknote, LuTruck, LuClock, LuCircleX, LuChartBar, LuBike, LuTriangleAlert } from "react-icons/lu";
import { formatarReais } from "@/lib/dinheiro";
import { listarPedidosDelivery, formatarFormaPagamento } from "@/lib/deliveryPedidos";
import { pedidosNoPeriodo, fecharDelivery } from "@/lib/fechamentoDelivery";
import "./AbaFechamento.css";

/**
 * Fechamento do delivery — quanto a entrega vendeu no período e onde esse
 * dinheiro está.
 *
 * Não é o fechamento de caixa e não mexe nele. É a resposta para uma
 * pergunta que o caixa não respondia: a venda de delivery entra lá junto
 * com a do balcão, e quando é dinheiro ela entra no instante em que o
 * pedido é marcado como entregue — com as notas ainda na mão do
 * entregador. Quem fecha o caixa antes de todo mundo voltar vê falta.
 *
 * Por que é intuitivo (princípio nº 1): a primeira coisa da tela é o aviso
 * do dinheiro que está na rua, em vermelho, com o valor — porque é o que
 * muda a decisão de fechar ou esperar. Os números vêm depois, e a divisão
 * por forma de pagamento é a mesma linguagem do checkout da vitrine.
 */

/** Hoje em AAAA-MM-DD, no fuso local (o dia do restaurante, não o UTC). */
function diaLocalISO() {
  const d = new Date();
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mes}-${dia}`;
}

export default function AbaFechamento({ aviso }) {
  const [inicio, setInicio] = useState(diaLocalISO);
  const [fim, setFim] = useState(diaLocalISO);
  const [pedidos, setPedidos] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    const { data, error } = await listarPedidosDelivery();
    setCarregando(false);
    if (error) {
      setErro(true);
      aviso?.("Não foi possível carregar os pedidos do fechamento.", "err");
      return;
    }
    setErro(false);
    setPedidos(data);
  }, [aviso]);

  useEffect(() => { carregar(); }, [carregar]);

  const r = useMemo(() => {
    const ini = inicio ? new Date(`${inicio}T00:00:00`) : null;
    const f = fim ? new Date(`${fim}T23:59:59.999`) : null;
    return fecharDelivery(pedidosNoPeriodo(pedidos, ini, f));
  }, [pedidos, inicio, fim]);

  if (carregando) {
    return <div className="fech-delivery__estado">Carregando o fechamento…</div>;
  }

  if (erro) {
    return (
      <div className="fech-delivery__estado">
        Não foi possível carregar os pedidos.{" "}
        <button type="button" onClick={carregar} className="fech-delivery__retry">Tentar de novo</button>
      </div>
    );
  }

  return (
    <div className="fech-delivery">
      {/* Período */}
      <div className="fech-delivery__filtros">
        <label className="fech-delivery__campo">
          <span className="fech-delivery__campo-label">De</span>
          <input type="date" value={inicio} max={fim} onChange={(e) => setInicio(e.target.value)} className="fech-delivery__data" />
        </label>
        <label className="fech-delivery__campo">
          <span className="fech-delivery__campo-label">Até</span>
          <input type="date" value={fim} min={inicio} onChange={(e) => setFim(e.target.value)} className="fech-delivery__data" />
        </label>
        <button type="button" onClick={carregar} className="fech-delivery__retry">Atualizar</button>
      </div>

      {/* O aviso vem PRIMEIRO: é o que muda a decisão de fechar o caixa
          agora ou esperar o entregador voltar. */}
      {r.dinheiroEmMaos > 0 && (
        <div className="fech-delivery__aviso" role="note">
          <LuTriangleAlert size={18} />
          <div>
            <strong>{formatarReais(r.dinheiroEmMaos)} recebidos em dinheiro na entrega.</strong>
            <span>
              Esse valor já entrou no fechamento do caixa como venda, mas as notas
              só chegam na gaveta quando o entregador volta. Confira com a equipe
              antes de fechar o caixa — senão o sistema vai acusar falta.
            </span>
          </div>
        </div>
      )}

      {r.emRota > 0 && (
        <div className="fech-delivery__aviso fech-delivery__aviso--neutro" role="note">
          <LuClock size={18} />
          <div>
            <strong>{r.emRota} {r.emRota === 1 ? "pedido ainda na rua" : "pedidos ainda na rua"} ({formatarReais(r.valorEmRota)}).</strong>
            <span>Não entram neste fechamento: só conta como vendido o que foi entregue.</span>
          </div>
        </div>
      )}

      {/* Números do período */}
      <div className="fech-delivery__kpis">
        <Kpi label="Vendido"        valor={formatarReais(r.vendido)} Icon={LuBanknote} destaque />
        <Kpi label="Entregues"      valor={r.entregues}              Icon={LuTruck} />
        <Kpi label="Ticket médio"   valor={formatarReais(r.ticket)}  Icon={LuChartBar} />
        <Kpi label="Taxas de entrega" valor={formatarReais(r.taxas)} Icon={LuBike} />
        <Kpi label="Cancelados"     valor={r.cancelados}             Icon={LuCircleX} />
      </div>

      {/* Como entrou */}
      <section>
        <h3 className="fech-delivery__secao">Como o dinheiro entrou</h3>
        {r.porForma.length === 0 ? (
          <div className="fech-delivery__vazio">Nenhuma entrega concluída no período.</div>
        ) : (
          <table className="fech-delivery__tabela">
            <thead>
              <tr>
                <th>Forma</th>
                <th className="fech-delivery__num">Pedidos</th>
                <th className="fech-delivery__num">Total</th>
              </tr>
            </thead>
            <tbody>
              {r.porForma.map((l) => (
                <tr key={l.forma}>
                  <td>{l.forma === "outros" ? "Outras formas" : formatarFormaPagamento(l.forma)}</td>
                  <td className="fech-delivery__num">{l.pedidos}</td>
                  <td className="fech-delivery__num">{formatarReais(l.total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>Total</td>
                <td className="fech-delivery__num">{r.entregues}</td>
                <td className="fech-delivery__num">{formatarReais(r.vendido)}</td>
              </tr>
            </tfoot>
          </table>
        )}
        <p className="fech-delivery__nota">
          O que pagar aos entregadores fica em <strong>Entregadores → Pagamento</strong>:
          são contas diferentes, e misturar as duas esconde as duas.
        </p>
      </section>
    </div>
  );
}

function Kpi({ label, valor, Icon, destaque }) {
  return (
    <div className={`fech-delivery__kpi${destaque ? " fech-delivery__kpi--destaque" : ""}`}>
      <div className="fech-delivery__kpi-topo">
        <Icon size={14} />
        <span className="fech-delivery__kpi-label">{label}</span>
      </div>
      <div className="fech-delivery__kpi-valor">{valor}</div>
    </div>
  );
}
