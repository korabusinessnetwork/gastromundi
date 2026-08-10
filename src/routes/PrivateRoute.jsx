import { Navigate, useLocation } from "react-router-dom";
import { useApp } from "@/context/AppContext";
import { assinaturaPermiteOperacao } from "@/lib/console/assinatura";
import { rotaInicialPermitida } from "@/lib/comum/navegacaoInicial";
import UpgradeNecessario from "@/components/assinatura/UpgradeNecessario";
import AssinaturaBloqueada from "@/components/assinatura/AssinaturaBloqueada";
import SemAcesso from "@/components/assinatura/SemAcesso";

/**
 * PrivateRoute — redireciona para /login se não autenticado.
 * Se `requiredPermission` for passado, também valida o papel do usuário.
 *
 * Fase 5 (ADR-006 §4, decisão do founder — bloqueio TOTAL): se a
 * assinatura está 'bloqueado', renderiza a tela cheia de aviso ANTES
 * de qualquer checagem de permissão/módulo — cobre toda rota sob
 * PrivateRoute (pdv, produtos, financeiro, /palm etc.) num só lugar.
 * `users` fica de fora do enforcement de RLS justamente para que o
 * login em si funcione e o app chegue até aqui para mostrar o aviso
 * certo, em vez de um erro de autenticação enganoso. Esta tela é só
 * cortesia de UX — a fonte de verdade do bloqueio é o Postgres
 * (RLS via `assinatura_ativa`, `supabase/migrations/20260720_assinatura_enforcement.sql`).
 *
 * `requiredModulo`/`moduloLabel` (ADR-005, gating camada 1): quando o
 * papel permite a rota mas o plano do tenant não inclui o módulo,
 * renderiza um convite a upgrade em vez de redirecionar ou quebrar —
 * cobre quem navega direto pela URL (a Sidebar já esconde/bloqueia,
 * mas a rota é a fonte de verdade da UI).
 */
export default function PrivateRoute({ children, requiredPermission, requiredModulo, moduloLabel }) {
  const { currentUser, moduloHabilitado, assinatura } = useApp();
  const location = useLocation();

  if (!currentUser) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (assinatura && !assinaturaPermiteOperacao(assinatura.status)) {
    return <AssinaturaBloqueada />;
  }

  if (requiredPermission && !currentUser.permissions?.[requiredPermission]) {
    // Manda o usuário para a PRIMEIRA rota que ele realmente pode acessar
    // (mesma permissão/módulo da rota de destino), nunca fixo em /app/pdv:
    // um garçom sem 'pdv' era jogado no PDV, que ele também não tinha,
    // gerando laço de redirecionamento infinito. Se não há destino, ou o
    // destino é a própria rota atual, mostra "sem acesso" em vez de redirecionar.
    const destino = rotaInicialPermitida(currentUser.permissions, moduloHabilitado);
    if (!destino || destino === location.pathname) {
      return <SemAcesso />;
    }
    return <Navigate to={destino} replace />;
  }

  if (requiredModulo && !moduloHabilitado?.(requiredModulo)) {
    return <UpgradeNecessario label={moduloLabel ?? "Este recurso"} />;
  }

  return children;
}
