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
 *
 * No celular, quem tira pedido (permissão de Palm) entra DIRETO no Palm — sem
 * tela de escolha (decisão do dono, 2026-07-26). Essa regra vale só na ENTRADA
 * (aqui, no índice de /app): as telas específicas de /app abertas de propósito
 * pelo hub "Mais" continuam acessíveis no celular. Antes o MobileRoute
 * embrulhava TODO o /app e jogava o palm de volta pro /palm, então os atalhos
 * do hub "Mais" nunca abriam — só quicavam pro Palm.
 */
export default function InicioApp() {
  const { currentUser, moduloHabilitado, isMobile } = useApp();
  if (isMobile && currentUser?.permissions?.palm) {
    return <Navigate to="/palm" replace />;
  }
  const destino = rotaInicialPermitida(currentUser?.permissions, moduloHabilitado);
  if (!destino) {
    return <SemAcesso />;
  }
  return <Navigate to={destino} replace />;
}
