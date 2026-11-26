import { useState, useEffect, useCallback } from "react";
import { assinarMudancas } from "@/lib/dados/tempoReal";
import { listarPedidosCozinha } from "@/features/cozinha/dados/cozinha";

/**
 * usePedidosCozinha — busca as comandas com itens lançados (o "pedido"
 * desta base, ver src/features/cozinha/dados/cozinha.js) e sincroniza via realtime.
 * Usado pelo KDS (F007 — docs/03_REGRAS_DE_NEGOCIO/COZINHA.md).
 *
 * Expõe `erro` de propósito: se a busca falha, uma cozinha cheia vê a mesma
 * tela de cozinha vazia e simplesmente para de produzir. Painel vazio e
 * painel quebrado precisam ser distinguíveis a metros de distância.
 * Expõe `recarregar` para o cozinheiro tentar de novo sem sair da tela.
 */
export function usePedidosCozinha() {
  const [pedidos, setPedidos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(null);

  const recarregar = useCallback(async () => {
    setLoading(true);
    const { data, error } = await listarPedidosCozinha();
    if (error) {
      // Mantém o que já estava na tela: é melhor a lista de 1 minuto atrás do
      // que apagar pedidos reais que a cozinha ainda precisa fazer.
      setErro(error);
    } else {
      setErro(null);
      setPedidos((data ?? []).filter(p => Array.isArray(p.items) && p.items.length > 0));
    }
    setLoading(false);
  }, []);

  useEffect(() => { recarregar(); }, [recarregar]);

  // Requer Realtime habilitado na tabela `pending` (Database → Replication).
  useEffect(() => {
    return assinarMudancas("cozinha-pedidos-realtime", { table: "pending" }, (payload) => {
        if (payload.eventType === "INSERT") {
          const novo = payload.new;
          if (!Array.isArray(novo.items) || novo.items.length === 0) return;
          setPedidos(prev => prev.find(p => p.id === novo.id) ? prev : [...prev, novo]);
        } else if (payload.eventType === "UPDATE") {
          const atualizado = payload.new;
          setPedidos(prev => {
            if (!Array.isArray(atualizado.items) || atualizado.items.length === 0) {
              return prev.filter(p => p.id !== atualizado.id);
            }
            const existe = prev.find(p => p.id === atualizado.id);
            return existe
              ? prev.map(p => (p.id === atualizado.id ? atualizado : p))
              : [...prev, atualizado];
          });
        } else if (payload.eventType === "DELETE") {
          // Comanda finalizada/cancelada — sai do painel (mesma regra de COZINHA.md).
          setPedidos(prev => prev.filter(p => p.id !== payload.old.id));
        }
    });
  }, []);

  return { pedidos, loading, erro, recarregar };
}
