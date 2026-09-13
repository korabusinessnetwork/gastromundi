// Componente invisível que faz o computador do caixa imprimir os pedidos
// lançados de OUTROS aparelhos — o Palm do garçom quando há internet
// (decisão do dono 2026-07-29: "o Palm tem que imprimir com e sem internet").
//
// Só desktop e só com alguém logado: é o PC que tem a impressora. No celular
// o hook nem liga — ele não tem como falar com a térmica.
//
// Invisível enquanto tudo sai no papel. Quando um lançamento NÃO sai, o
// componente deixa de ser invisível: o mesmo aviso vermelho que a Ponte usa
// aparece dizendo qual comanda ficou sem a via. Antes a falha morria num
// `console.error` e o salão só descobria pela reclamação do cliente.
import { useApp } from "@/context/AppContext";
import { useImpressaoLancamentos, useAparelhoImprime } from "@/hooks/useImpressaoLancamentos";
import AvisoImpressaoPonte from "./AvisoImpressaoPonte";

export default function ImpressaoLancamentosBridge() {
  const { isMobile, currentUser, pending, loading } = useApp();
  const aparelhoImprime = useAparelhoImprime();

  const { falhas, dispensarFalhas } = useImpressaoLancamentos({
    ativo: !isMobile && !!currentUser && aparelhoImprime,
    pending,
    loading,
  });

  // O aviso mora aqui, junto de quem sabe da falha, e não no AppContext: sem
  // falha nenhuma o componente devolve `null` e a tela segue limpa.
  //
  // "Já reimprimi" e não "Conferir de novo": este caminho não tem fila para
  // reler. A via não sai mais sozinha (o lançamento continua marcado como
  // visto de propósito, ver o hook), quem resolve é a pessoa reimprimindo pela
  // Cozinha, e o botão só reconhece que ela foi resolvida. Botão que promete
  // conferir e não conferisse nada é o que faz o operador parar de acreditar
  // no aviso.
  return (
    <AvisoImpressaoPonte
      impressoes={falhas.length}
      comandas={falhas.map((f) => f.rotulo)}
      rotuloBotao="Já reimprimi"
      onConferir={dispensarFalhas}
      empilhado
    />
  );
}
