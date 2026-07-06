import { Navigate, useLocation } from "react-router-dom";
import { useApp } from "@/context/AppContext";
import UpgradeNecessario from "@/components/desktop/UpgradeNecessario";

/**
 * PrivateRoute — redireciona para /login se não autenticado.
 * Se `requiredPermission` for passado, também valida o papel do usuário.
 *
 * `requiredModulo`/`moduloLabel` (ADR-005, gating camada 1): quando o
 * papel permite a rota mas o plano do tenant não inclui o módulo,
 * renderiza um convite a upgrade em vez de redirecionar ou quebrar —
 * cobre quem navega direto pela URL (a Sidebar já esconde/bloqueia,
 * mas a rota é a fonte de verdade da UI).
 */
export default function PrivateRoute({ children, requiredPermission, requiredModulo, moduloLabel }) {
  const { currentUser, moduloHabilitado } = useApp();
  const location = useLocation();

  if (!currentUser) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (requiredPermission && !currentUser.permissions?.[requiredPermission]) {
    return <Navigate to="/app/pdv" replace />;
  }

  if (requiredModulo && !moduloHabilitado?.(requiredModulo)) {
    return <UpgradeNecessario label={moduloLabel ?? "Este recurso"} />;
  }

  return children;
}
