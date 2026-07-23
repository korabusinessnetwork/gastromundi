// Fase 3 — componente invisível que liga o poll da fila de impressão em rede.
// Espelha o PonteLocalBridge: montado dentro do AppProvider (por isso usa
// useApp) e só ativa no desktop, com alguém logado, online, e SÓ se esta
// máquina for uma estação (tem `estacao_id`). Sem estação não há o que
// imprimir da fila — o guard evita poll inútil em PC não configurado.
import { useApp } from "@/context/AppContext";
import { useFilaImpressao } from "@/hooks/useFilaImpressao";
import { estacaoIdAtual } from "@/lib/estacao";

export default function FilaImpressaoBridge() {
  const { isMobile, currentUser, redeOnline } = useApp();

  const ativo = !isMobile && !!currentUser && !!redeOnline && !!estacaoIdAtual();

  useFilaImpressao({ ativo });

  return null;
}
