import { useState, useEffect } from "react";
import { assinarMudancas } from "@/lib/dados/tempoReal";
import { listarMesas, alterarStatusManualMesa } from "@/features/mesas/dados/mesas";

/**
 * useMesas — busca a tabela de mesas e sincroniza via realtime
 * (mudanças de status manual/layout aparecem em outros dispositivos sem recarregar)
 */
export function useMesas() {
  const [mesas,   setMesas]   = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listarMesas()
      .then(({ data }) => {
        setMesas(data ?? []);
        setLoading(false);
      });
  }, []);

  // Requer Realtime habilitado na tabela `mesas` (Database → Replication).
  useEffect(() => {
    return assinarMudancas("mesas-realtime", { table: "mesas" }, (payload) => {
        if (payload.eventType === "INSERT") {
          setMesas(prev =>
            prev.find(m => m.numero === payload.new.numero)
              ? prev
              : [...prev, payload.new].sort((a, b) => a.numero.localeCompare(b.numero)),
          );
        } else if (payload.eventType === "UPDATE") {
          setMesas(prev => prev.map(m => m.numero === payload.new.numero ? payload.new : m));
        } else if (payload.eventType === "DELETE") {
          setMesas(prev => prev.filter(m => m.numero !== payload.old.numero));
        }
    });
  }, []);

  // Marca a mesa como livre/reservada/manutencao (aba "Reservas" do PDV).
  // Update otimista: reflete na hora no mapa e na lista; se o Supabase
  // falhar, desfaz. O realtime acima replica a mudança nos outros
  // dispositivos — aqui só garantimos resposta imediata neste.
  async function atualizarStatusMesa(numero, novoStatus) {
    const PERMITIDOS = ["livre", "reservada", "manutencao"];
    if (!numero || !PERMITIDOS.includes(novoStatus)) {
      return { error: new Error("Status de mesa inválido.") };
    }
    let anterior = "livre";
    setMesas(prev => prev.map(m => {
      if (m.numero !== numero) return m;
      anterior = m.status_manual ?? "livre";
      return { ...m, status_manual: novoStatus };
    }));
    const { error } = await alterarStatusManualMesa(numero, novoStatus);
    if (error) {
      setMesas(prev => prev.map(m => m.numero === numero ? { ...m, status_manual: anterior } : m));
    }
    return { error };
  }

  return { mesas, loading, atualizarStatusMesa };
}
