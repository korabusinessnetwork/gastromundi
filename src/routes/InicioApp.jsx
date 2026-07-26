import { Navigate } from "react-router-dom";
import { useApp } from "@/context/AppContext";
import { rotaInicialPermitida } from "@/lib/navegacaoInicial";
import SemAcesso from "@/components/desktop/SemAcesso";

/**
 * Índice de /app — leva o usuário à PRIMEIRA tela que ele realmente pode
 * acessar, em vez de redirecionar fixo pra /app/pdv. O caixa/admin continua
 * caindo no PDV; um gestor sem PDV cai no financeiro/relatório; se nada for
 * acessível, mostra "sem acesso" em vez de disparar o laço de redirecionamento
 * (ver rotaInicialPermitida e PrivateRoute).
 */
export default function InicioApp() {
  const { currentUser, moduloHabilitado } = useApp();
  const destino = rotaInicialPermitida(currentUser?.permissions, moduloHabilitado);
  if (!destino) {
    return <SemAcesso />;
  }
  return <Navigate to={destino} replace />;
}
