import { Navigate } from "react-router-dom";
import { useApp } from "@/context/AppContext";

/**
 * MobileRoute — guarda do app de balcão (/app) no mobile.
 *
 * No celular, quem tem permissão de Palm (tirar pedidos) entra DIRETO no
 * Palm — sem tela de escolha (decisão do dono, 2026-07-26). A Frente de
 * Caixa é operação de desktop/balcão; num celular o Palm é o modo certo.
 * Quem NÃO tem Palm (ex.: caixa puro) segue normalmente pro /app.
 */
export default function MobileRoute({ children }) {
  const { currentUser, isMobile } = useApp();

  if (!currentUser) return <Navigate to="/login" replace />;

  if (isMobile && currentUser.permissions.palm) {
    return <Navigate to="/palm" replace />;
  }

  return children;
}
