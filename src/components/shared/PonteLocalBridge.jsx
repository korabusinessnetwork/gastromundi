// Leva 13 — componente invisível que liga o app do caixa à Ponte KORA.
// Montado dentro do AppProvider (por isso pode usar useApp) e só ativa
// no desktop com alguém logado: é o PC do caixa que fala com localhost.
import { useApp } from "@/context/AppContext";
import { usePonteLocal } from "@/hooks/usePonteLocal";

export default function PonteLocalBridge() {
  const { isMobile, currentUser, products, pending, addPending, ponteEndereco, setPonteEndereco, redeOnline } = useApp();

  usePonteLocal({
    ativo: !isMobile && !!currentUser,
    products,
    pending,
    addPending,
    ponteEndereco,
    setPonteEndereco,
    redeOnline,
  });

  return null;
}
