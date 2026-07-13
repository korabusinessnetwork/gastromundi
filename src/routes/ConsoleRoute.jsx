import { Navigate, useLocation } from "react-router-dom";
import { useApp } from "@/context/AppContext";

/**
 * ConsoleRoute — porta do Console da Plataforma (S1-2, ADR-008 §7).
 *
 * Só o super-admin `plataforma` (o dono do SaaS) entra. É uma rota À
 * PARTE de /app (o app do estabelecimento): o `plataforma` não tem
 * tenant (tenant_id NULL) e não opera PDV/caixa — logo não faz sentido
 * cair no layout do estabelecimento. Sem sessão → /login; logado mas
 * não-plataforma (um admin de estabelecimento que digitou a URL) →
 * volta para o app dele, sem vazar a existência do Console.
 *
 * Esta é só a barreira de UX; a autorização REAL é do banco: as leituras
 * dependem do ramo `is_super_admin()` das policies (Leva 4) e a escrita
 * passa pela Edge Function, que revalida o papel. Burlar esta rota no
 * cliente não concede nenhum acesso a dado.
 */
export default function ConsoleRoute({ children }) {
  const { currentUser } = useApp();
  const location = useLocation();

  if (!currentUser) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (currentUser.role !== "plataforma") {
    return <Navigate to="/app" replace />;
  }

  return children;
}
