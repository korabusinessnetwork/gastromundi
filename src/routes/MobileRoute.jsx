import { Navigate } from "react-router-dom";
import { useApp } from "@/context/AppContext";

/**
 * MobileRoute — decide se o usuário vai para palm ou desktop
 * baseado no dispositivo, role e escolha do admin.
 */
export default function MobileRoute({ children }) {
  const { currentUser, isMobile, mobileChoice } = useApp();

  if (!currentUser) return <Navigate to="/login" replace />;

  const p = currentUser.permissions;
  const hasBoth = isMobile && p.pdv && p.palm;

  // Admin/usuários com pdv+palm no mobile sem escolha → tela de escolha
  if (hasBoth && !mobileChoice) {
    return <Navigate to="/escolha" replace />;
  }

  // Usuário palm-only → força rota palm
  if (isMobile && !p.pdv && p.palm && mobileChoice !== "pdv") {
    return <Navigate to="/palm" replace />;
  }

  return children;
}
