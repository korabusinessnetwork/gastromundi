// Leva 13 — componente invisível que liga o app do caixa à Ponte KORA.
// Montado dentro do AppProvider (por isso pode usar useApp) e só ativa
// no desktop com alguém logado: é o PC do caixa que fala com localhost.
//
// Opt-in por estabelecimento: só liga quando VITE_PONTE_LOCAL_ATIVA==="true".
// Sem a Ponte rodando, o ciclo bate em http://localhost/saude a cada 5s e
// polui o console com "Failed to load resource". Como a Ponte é recurso de
// quem tem o Palm no balcão, ela nasce DESLIGADA — o estabelecimento que usa
// liga a flag. Assim ninguém sem Ponte vê erro nenhum.
import { useApp } from "@/context/AppContext";
import { usePonteLocal } from "@/hooks/usePonteLocal";

const PONTE_LOCAL_ATIVA = import.meta.env.VITE_PONTE_LOCAL_ATIVA === "true";

export default function PonteLocalBridge() {
  const { isMobile, currentUser, products, pending, addPending, ponteEndereco, setPonteEndereco, redeOnline } = useApp();

  usePonteLocal({
    ativo: PONTE_LOCAL_ATIVA && !isMobile && !!currentUser,
    products,
    pending,
    addPending,
    ponteEndereco,
    setPonteEndereco,
    redeOnline,
  });

  return null;
}
