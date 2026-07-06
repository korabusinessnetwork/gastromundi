import { createBrowserRouter, Navigate } from "react-router-dom";
import PrivateRoute   from "./PrivateRoute";
import MobileRoute    from "./MobileRoute";

// Pages
import LoginPage        from "@/pages/LoginPage";
import ChoicePage       from "@/pages/ChoicePage";
import MobilePage       from "@/pages/MobilePage";
import DesktopLayout    from "@/pages/desktop/DesktopLayout";
import PDVPage          from "@/pages/desktop/PDVPage";
import ProdutosPage     from "@/pages/desktop/ProdutosPage";
import RelatorioPage    from "@/pages/desktop/RelatorioPage";
import ConfiguracoesPage from "@/pages/desktop/ConfiguracoesPage";
import EstoquePage        from "@/pages/desktop/EstoquePage";
import FinanceiroPage     from "@/pages/desktop/FinanceiroPage";
import CozinhaPage        from "@/pages/desktop/CozinhaPage";
import AdminPage          from "@/pages/desktop/AdminPage";
import ClientesPage       from "@/pages/desktop/ClientesPage";

const router = createBrowserRouter([
  // Raiz → redireciona baseado no estado de auth (tratado no LoginPage)
  { path: "/", element: <Navigate to="/login" replace /> },

  // Autenticação
  { path: "/login", element: <LoginPage /> },

  // Tela de escolha de modo (admin no mobile)
  {
    path: "/escolha",
    element: (
      <PrivateRoute>
        <ChoicePage />
      </PrivateRoute>
    ),
  },

  // Palm — tirar pedidos
  {
    path: "/palm",
    element: (
      <PrivateRoute requiredPermission="palm">
        <MobilePage />
      </PrivateRoute>
    ),
  },

  // Desktop — gestão completa
  {
    path: "/app",
    element: (
      <PrivateRoute>
        <MobileRoute>
          <DesktopLayout />
        </MobileRoute>
      </PrivateRoute>
    ),
    children: [
      { index: true, element: <Navigate to="pdv" replace /> },
      {
        path: "pdv",
        element: (
          <PrivateRoute requiredPermission="pdv">
            <PDVPage />
          </PrivateRoute>
        ),
      },
      {
        path: "produtos",
        element: (
          <PrivateRoute requiredPermission="produtos">
            <ProdutosPage />
          </PrivateRoute>
        ),
      },
      {
        path: "relatorio",
        element: (
          <PrivateRoute requiredPermission="relatorio">
            <RelatorioPage />
          </PrivateRoute>
        ),
      },
      {
        path: "configuracoes",
        element: (
          <PrivateRoute requiredPermission="configuracoes">
            <ConfiguracoesPage />
          </PrivateRoute>
        ),
      },
      {
        path: "estoque",
        element: (
          <PrivateRoute requiredPermission="estoque">
            <EstoquePage />
          </PrivateRoute>
        ),
      },
      {
        path: "financeiro",
        element: (
          <PrivateRoute requiredPermission="financeiro">
            <FinanceiroPage />
          </PrivateRoute>
        ),
      },
      {
        path: "cozinha",
        element: (
          <PrivateRoute requiredPermission="cozinha">
            <CozinhaPage />
          </PrivateRoute>
        ),
      },
      {
        path: "clientes",
        element: (
          <PrivateRoute requiredPermission="clientes">
            <ClientesPage />
          </PrivateRoute>
        ),
      },
      {
        path: "admin",
        element: (
          <PrivateRoute requiredPermission="configuracoes">
            <AdminPage />
          </PrivateRoute>
        ),
      },
    ],
  },

  // Fallback
  { path: "*", element: <Navigate to="/login" replace /> },
]);

export default router;
