import { useState, useEffect, useCallback } from "react";
import { assinarMudancas } from "@/lib/dados/tempoReal";
import { listarPedidosDelivery } from "@/features/delivery/dados/deliveryPedidos";

/**
 * usePedidosDelivery — pedidos de delivery do tenant (aba de Pedidos, Fase 4)
 * com sincronização ao vivo. Fonte da lista: `delivery_pedidos` (histórico
 * próprio do delivery). A RLS já filtra por tenant; admin lê direto.
 *
 * Duas assinaturas de realtime, de propósito (ambas as tabelas já estão com
 * Realtime habilitado em produção):
 *  • `delivery_pedidos`: mudança de status ao vivo entre dispositivos — o
 *    entregador marca "saiu para entrega" e o balcão vê na hora.
 *  • `pending` filtrado em created_by='delivery' (INSERT): pedido novo do
 *    cliente. Como o INSERT do `pending` não traz a linha de
 *    `delivery_pedidos`, aqui só disparamos um recarregar() — barato e sempre
 *    correto.
 *
 * Expõe { pedidos, carregando, erro, recarregar }.
 */
export function usePedidosDelivery() {
  const [pedidos, setPedidos] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);

  const recarregar = useCallback(async () => {
    const { data, error } = await listarPedidosDelivery();
    if (error) {
      // Mantém a lista que já estava na tela — mesma regra de
      // usePedidosCozinha. `listarPedidosDelivery` devolve data: [] em
      // qualquer falha, então gravar `data` aqui apagava TODOS os pedidos em
      // andamento por uma piscada de rede. E não era só no botão
      // "Atualizar": `avancar` e `cancelar` chamam recarregar() logo depois
      // de mudar o status com sucesso, então uma falha nesse recarregar
      // fazia o pedido que acabou de ser aceito desaparecer da tela.
      setErro(error);
    } else {
      setErro(null);
      setPedidos(data ?? []);
    }
    setCarregando(false);
  }, []);

  useEffect(() => { recarregar(); }, [recarregar]);

  // Status ao vivo entre dispositivos.
  useEffect(() => {
    return assinarMudancas("delivery-pedidos-realtime", { table: "delivery_pedidos" }, (payload) => {
        if (payload.eventType === "INSERT") {
          const novo = payload.new;
          setPedidos((prev) => (prev.find((p) => p.id === novo.id) ? prev : [novo, ...prev]));
        } else if (payload.eventType === "UPDATE") {
          const atualizado = payload.new;
          setPedidos((prev) => prev.map((p) => (p.id === atualizado.id ? { ...p, ...atualizado } : p)));
        } else if (payload.eventType === "DELETE") {
          setPedidos((prev) => prev.filter((p) => p.id !== payload.old.id));
        }
    });
  }, []);

  // Novo pedido do cliente ao vivo HOJE: `pending` já tem Realtime. O espelho
  // do delivery entra com created_by='delivery' — nesse INSERT, recarrega a
  // lista de `delivery_pedidos` (fonte de verdade da aba).
  useEffect(() => {
    return assinarMudancas(
      "delivery-pending-espelho",
      { event: "INSERT", table: "pending", filter: "created_by=eq.delivery" },
      () => { recarregar(); },
    );
  }, [recarregar]);

  return { pedidos, carregando, erro, recarregar };
}
