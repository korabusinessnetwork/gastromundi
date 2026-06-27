import { Navigate, useLocation } from "react-router-dom";
import { useApp } from "@/context/AppContext";

/**
 * PrivateRoute — redireciona para /login se não autenticado.
 * Se `requiredRole` for passado, também valida o papel do usuário.
 */
export default function PrivateRoute({ children, requiredPermission }) {
  const { currentUser } = useApp();
  const location = useLocation();

  if (!currentUser) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (requiredPermission && !currentUser.permissions?.[requiredPermission]) {
    return <Navigate to="/app/pdv" replace />;
  }

  return children;
}
