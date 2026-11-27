import { LuBanknote, LuBike, LuCheck, LuRefreshCw, LuWifiOff, LuReceipt, LuHourglass } from "react-icons/lu";
import { calcularFechamento, filtrarPedidosPorPeriodo, idsAPagarDoEntregador, registrarPagamentoEntregador } from "@/features/delivery/dados/entregadores";
import { diaLocalISO } from "@/features/delivery/regras/fechamentoDelivery";
import { formatarReais } from "@/features/delivery/regras/admin";
import { listarPedidosDelivery } from "@/features/delivery/dados/deliveryPedidos";
import { useCallback, useEffect, useMemo, useState } from "react";


export default function FechamentoEntregadores({
  entregadores,
  aviso,
  isAdmin,
  currentUser,
  caixaAberto,
  dinheiroNaGaveta,
  registrarMovimentoCaixa,
}) {
  const [inicio, setInicio] = useState(diaLocalISO);
  const [fim, setFim] = useState(diaLocalISO);
  const [pedidos, setPedidos] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);
  const [confirmandoId, setConfirmandoId] = useState(null); // linha aguardando confirmação
  const [pagandoId, setPagandoId] = useState(null);         // linha com pagamento em curso

  const carregar = useCallback(async () => {
    setCarregando(true);
    const { data, error } = await listarPedidosDelivery();
    setCarregando(false);
    if (error) {
      setErro(true);
      aviso("Não foi possível carregar os pedidos do fechamento.", "err");
      return;
    }
    setErro(false);
    setPedidos(data);
  }, [aviso]);

  useEffect(() => { carregar(); }, [carregar]);

  const { linhas, totalAPagar, totalJaPago, totalEntregues, totalEmRota, noPeriodo } = useMemo(() => {
    // Limites em horário LOCAL: início 00:00, fim 23:59:59.999 do dia escolhido.
    const ini = inicio ? new Date(`${inicio}T00:00:00`) : null;
    const f = fim ? new Date(`${fim}T23:59:59.999`) : null;
    const doPeriodo = filtrarPedidosPorPeriodo(pedidos, ini, f);
    // noPeriodo sobe junto para o pagamento resolver os ids das corridas 1:1
    // com o valor da sangria (idsAPagarDoEntregador).
    return { ...calcularFechamento(doPeriodo, entregadores), noPeriodo: doPeriodo };
  }, [pedidos, inicio, fim, entregadores]);

  // Paga um entregador: sai da gaveta como SANGRIA (dinheiro de verdade) e
  // carimba as corridas como pagas para não pagar a mesma entrega de novo.
  // Só admin/gerente (autorizam a si mesmos, sem digitar senha). A ordem é
  // sangria → carimbo: se o carimbo falhar, o dinheiro já saiu e as corridas
  // seguem "a pagar" — o aviso manda conferir antes de repetir (o oposto,
  // carimbar primeiro, marcaria como pago sem o dinheiro sair).
  const pagar = useCallback(async (linha) => {
    if (!isAdmin || pagandoId) return;
    const ids = idsAPagarDoEntregador(noPeriodo, linha.entregador_id);
    if (ids.length === 0) return aviso("Nada a pagar para este entregador.", "err");
    if (!caixaAberto) return aviso("Abra o caixa antes de pagar o entregador.", "err");
    if (dinheiroNaGaveta < linha.aPagar) {
      return aviso("Não há dinheiro suficiente na gaveta para este pagamento.", "err");
    }
    setPagandoId(linha.entregador_id);
    const motivo = `Pagamento entregador ${linha.nome}, ${ids.length} ${ids.length > 1 ? "entregas" : "entrega"}`;
    const { error } = await registrarMovimentoCaixa({
      tipo: "sangria",
      valor: linha.aPagar,
      motivo,
      autorizadoPor: currentUser?.username,
      disponivel: dinheiroNaGaveta,
    });
    if (error) {
      setPagandoId(null);
      return aviso(error.message || "Não foi possível registrar a saída de caixa.", "err");
    }
    const { error: erroCarimbo } = await registrarPagamentoEntregador(ids);
    setPagandoId(null);
    setConfirmandoId(null);
    if (erroCarimbo) {
      aviso(
        "A saída de caixa foi registrada, mas não consegui marcar as corridas como pagas. Confira o caixa antes de pagar de novo.",
        "err"
      );
      await carregar();
      return;
    }
    aviso(`Pago ${formatarReais(linha.aPagar)} a ${linha.nome}.`, "ok");
    await carregar();
  }, [isAdmin, pagandoId, noPeriodo, caixaAberto, dinheiroNaGaveta, registrarMovimentoCaixa, currentUser, aviso, carregar]);

  return (
    <>
      <div className="delivery-view__fechamento-filtros">
        <label className="delivery-view__fechamento-campo">
          <span>De</span>
          <input
            type="date"
            className="delivery-view__input"
            value={inicio}
            max={fim || undefined}
            onChange={(e) => setInicio(e.target.value)}
          />
        </label>
        <label className="delivery-view__fechamento-campo">
          <span>Até</span>
          <input
            type="date"
            className="delivery-view__input"
            value={fim}
            min={inicio || undefined}
            onChange={(e) => setFim(e.target.value)}
          />
        </label>
        <button
          type="button"
          className="delivery-view__btn delivery-view__btn--sm delivery-view__btn--atualizar"
          onClick={carregar}
          title="Atualizar os pedidos do período"
        >
          <LuRefreshCw size={13} /> Atualizar
        </button>
      </div>

      {carregando ? (
        <div className="delivery-view__vazio">
          <div className="delivery-view__vazio-emoji delivery-view__vazio-emoji--carregando"><LuHourglass aria-hidden="true" /></div>
          <div className="delivery-view__carregando">Carregando fechamento…</div>
        </div>
      ) : erro ? (
        <div className="delivery-view__vazio">
          <div className="delivery-view__vazio-emoji"><LuWifiOff aria-hidden="true" /></div>
          <div className="delivery-view__vazio-titulo">Não conseguimos carregar</div>
          <div className="delivery-view__vazio-desc">Toque em “Atualizar” para tentar de novo.</div>
        </div>
      ) : linhas.length === 0 ? (
        <div className="delivery-view__vazio">
          <div className="delivery-view__vazio-emoji"><LuReceipt aria-hidden="true" /></div>
          <div className="delivery-view__vazio-titulo">Nada a pagar no período</div>
          <div className="delivery-view__vazio-desc">
            Nenhuma entrega atribuída a um entregador neste intervalo.
          </div>
        </div>
      ) : (
        <div className="delivery-view__fechamento-tabela-wrap">
          <table className="delivery-view__fechamento-tabela">
            <thead>
              <tr>
                <th>Entregador</th>
                <th className="delivery-view__num">Entregues</th>
                <th className="delivery-view__num">Em rota</th>
                <th className="delivery-view__num">A pagar</th>
                {isAdmin && <th className="delivery-view__fechamento-acao-col">Pagamento</th>}
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => {
                const confirmando = confirmandoId === l.entregador_id;
                const pagandoEsta = pagandoId === l.entregador_id;
                const semDinheiro = dinheiroNaGaveta < l.aPagar;
                // Por que o botão está desabilitado — texto direto no title,
                // prevenção de erro > mensagem depois (Princípio nº 1).
                const motivoBloqueio = !caixaAberto
                  ? "Abra o caixa para pagar o entregador."
                  : semDinheiro
                    ? "Não há dinheiro suficiente na gaveta."
                    : "";
                const podePagar = l.aPagar > 0 && caixaAberto && !semDinheiro;
                return (
                  <tr key={l.entregador_id}>
                    <td>
                      <span className="delivery-view__fechamento-nome">
                        <LuBike size={14} /> {l.nome}
                      </span>
                    </td>
                    <td className="delivery-view__num">{l.entregues}</td>
                    <td className="delivery-view__num">
                      {l.emRota > 0 ? (
                        <span className="delivery-view__fechamento-emrota" title="Ainda na rua, não entram no pagamento até serem entregues">
                          {l.emRota}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="delivery-view__num delivery-view__fechamento-valor">
                      {l.aPagar > 0 ? formatarReais(l.aPagar) : "—"}
                      {l.jaPago > 0 && (
                        <span className="delivery-view__fechamento-pago-nota" title="Já saiu do caixa neste período">
                          {formatarReais(l.jaPago)} pago
                        </span>
                      )}
                    </td>
                    {isAdmin && (
                      <td className="delivery-view__fechamento-acao">
                        {l.aPagar <= 0 ? (
                          <span className="delivery-view__fechamento-quitado" title="Todas as entregas do período já foram pagas">
                            <LuCheck size={13} /> Pago
                          </span>
                        ) : confirmando ? (
                          <span className="delivery-view__fechamento-confirma">
                            <span className="delivery-view__fechamento-confirma-txt">
                              Sair {formatarReais(l.aPagar)} do caixa?
                            </span>
                            <button
                              type="button"
                              className="delivery-view__btn delivery-view__btn--sm delivery-view__btn--primario"
                              onClick={() => pagar(l)}
                              disabled={pagandoEsta}
                            >
                              {pagandoEsta ? "Pagando…" : "Confirmar"}
                            </button>
                            <button
                              type="button"
                              className="delivery-view__btn delivery-view__btn--sm"
                              onClick={() => setConfirmandoId(null)}
                              disabled={pagandoEsta}
                            >
                              Cancelar
                            </button>
                          </span>
                        ) : (
                          <button
                            type="button"
                            className="delivery-view__btn delivery-view__btn--sm delivery-view__btn--pagar"
                            onClick={() => setConfirmandoId(l.entregador_id)}
                            disabled={!podePagar}
                            title={motivoBloqueio || `Pagar ${formatarReais(l.aPagar)} a ${l.nome} (sai do caixa)`}
                          >
                            <LuBanknote size={14} /> Pagar
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td>Total</td>
                <td className="delivery-view__num">{totalEntregues}</td>
                <td className="delivery-view__num">{totalEmRota || "—"}</td>
                <td className="delivery-view__num delivery-view__fechamento-valor">
                  {formatarReais(totalAPagar)}
                  {totalJaPago > 0 && (
                    <span className="delivery-view__fechamento-pago-nota">
                      {formatarReais(totalJaPago)} pago
                    </span>
                  )}
                </td>
                {isAdmin && <td />}
              </tr>
            </tfoot>
          </table>
          <p className="delivery-view__fechamento-nota">
            Paga-se apenas a corrida concluída (entregue). Pedidos em rota
            aparecem para acompanhamento e entram no pagamento quando forem
            confirmados. Ao confirmar o pagamento, o valor sai do caixa como
            uma retirada (sangria) e as corridas ficam marcadas como pagas.
          </p>
        </div>
      )}
    </>
  );
}
