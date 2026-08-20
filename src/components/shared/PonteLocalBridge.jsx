// Leva 13 — componente invisível que liga o app do caixa à Ponte KORA.
// Montado dentro do AppProvider (por isso pode usar useApp) e só ativa
// no desktop com alguém logado: é o PC do caixa que fala com localhost.
//
// Quem liga é o ESTABELECIMENTO, não o build. A chave "ponte_local_ativa"
// mora na tabela `config` (uma linha por tenant), do mesmo jeito que o
// endereço do Palm, e o dono liga sozinho em Configurações → Impressão →
// "Pedidos sem Internet". Antes isso vinha da variável de build
// VITE_PONTE_LOCAL_ATIVA: ligar para um cliente exigiria recompilar o site
// de todos ao mesmo tempo, o que não existe num SaaS multi-estabelecimento
// (decisão 017) — e como a variável nunca foi definida em lugar nenhum, a
// Ponte nascia desligada em TODA build e nunca recebeu um pedido de verdade.
//
// A variável continua existindo, com outro papel: trava global do produto,
// para o caso de o recurso precisar sumir de todos os clientes de uma vez.
// O padrão dela é LIBERADO — só o texto "false" tranca. Se o padrão fosse o
// contrário, esquecer de defini-la desligaria tudo outra vez, que é
// exatamente o defeito que estamos corrigindo.
import { useApp } from "@/context/AppContext";
import { usePonteLocal } from "@/hooks/usePonteLocal";
import AvisoImpressaoPonte from "./AvisoImpressaoPonte";

const PONTE_LIBERADA_NO_PRODUTO = import.meta.env.VITE_PONTE_LOCAL_ATIVA !== "false";

export default function PonteLocalBridge() {
  const {
    isMobile, currentUser, products, pending, addPending, updatePending,
    ponteEndereco, setPonteEndereco, redeOnline, tenant, ponteLocalAtiva,
  } = useApp();

  // `ponteLocalAtiva === null` é "a config ainda não chegou" — e aí não se
  // liga nada. Chutar "ligado" faria o ciclo bater na porta da Ponte e encher
  // o console de erro em quem não usa; chutar "desligado" e ligar logo depois
  // faria o recurso piscar. Só um `true` vindo do estabelecimento liga.
  const {
    impressaoParada, ponteSemResposta, conferindo, falhaAoConferir, conferirImpressao,
  } = usePonteLocal({
    ativo: PONTE_LIBERADA_NO_PRODUTO && ponteLocalAtiva === true && !isMobile && !!currentUser,
    products,
    pending,
    addPending,
    updatePending,
    ponteEndereco,
    setPonteEndereco,
    redeOnline,
    // Identidade do estabelecimento — é com ela que a Ponte se vincula
    // sozinha ao abrir o sistema neste computador (nada de digitar código).
    estabelecimento: tenant ? { id: tenant.id, nome: tenant.nome } : null,
  });

  // O aviso mora aqui, e não no AppContext, porque é aqui que ele já nasce
  // com as duas condições certas: a chave do estabelecimento ligada e o
  // resultado do ciclo em mãos. Com a chave desligada o hook devolve `null`
  // e o aviso some sozinho — nada de estado novo atravessando o contexto.
  //
  // `ponteSemResposta` também vem para cá: a Ponte cair no meio do serviço
  // significa que nada mais é impresso neste PC, e isso PRECISA aparecer. A
  // tela ficar verde nessa hora é a mentira mais cara que este aviso pode
  // contar.
  return (
    <AvisoImpressaoPonte
      impressoes={impressaoParada?.impressoes ?? 0}
      esperaMs={impressaoParada?.esperaMs ?? 0}
      ponteSemResposta={ponteSemResposta}
      conferindo={conferindo}
      falhaAoConferir={falhaAoConferir}
      onConferir={conferirImpressao}
    />
  );
}
