// Componente invisível que faz o computador do caixa imprimir os pedidos
// lançados de OUTROS aparelhos — o Palm do garçom quando há internet
// (decisão do dono 2026-07-29: "o Palm tem que imprimir com e sem internet").
//
// Só desktop e só com alguém logado: é o PC que tem a impressora. No celular
// o hook nem liga — ele não tem como falar com a térmica.
import { useApp } from "@/context/AppContext";
import { useImpressaoLancamentos, useAparelhoImprime } from "@/hooks/useImpressaoLancamentos";

export default function ImpressaoLancamentosBridge() {
  const { isMobile, currentUser, pending, loading } = useApp();
  const aparelhoImprime = useAparelhoImprime();

  useImpressaoLancamentos({
    ativo: !isMobile && !!currentUser && aparelhoImprime,
    pending,
    loading,
  });

  return null;
}
