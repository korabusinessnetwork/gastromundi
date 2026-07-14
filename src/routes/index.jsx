import { createBrowserRouter, Navigate } from "react-router-dom";
import PrivateRoute   from "./PrivateRoute";
import ConsoleRoute   from "./ConsoleRoute";
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
import HistoricoNfcePage  from "@/pages/desktop/HistoricoNfcePage";
import ConsolePage        from "@/pages/console/ConsolePage";
import MODULOS from "@/constants/modulos";

const router = createBrowserRouter([
  // Raiz → redireciona baseado no estado de auth (tratado no LoginPage)
  { path: "/", element: <Navigate to="/login" replace /> },

  // Autenticação
  { path: "/login", element: <LoginPage /> },

  // Console da Plataforma (S1-2) — só o super-admin `plataforma`.
  // Rota à parte de /app: a plataforma não opera o estabelecimento.
  {
    path: "/console",
    element: (
      <ConsoleRoute>
        <ConsolePage />
      </ConsoleRoute>
    ),
  },

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
          <PrivateRoute requiredPermission="produtos" requiredModulo={MODULOS.CARDAPIO} moduloLabel="Cadastro de Produtos">
            <ProdutosPage />
          </PrivateRoute>
        ),
      },
      {
        path: "relatorio",
        element: (
          <PrivateRoute requiredPermission="relatorio" requiredModulo={MODULOS.RELATORIOS} moduloLabel="Relatórios">
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
          <PrivateRoute requiredPermission="estoque" requiredModulo={MODULOS.ESTOQUE} moduloLabel="Estoque">
            <EstoquePage />
          </PrivateRoute>
        ),
      },
      {
        path: "financeiro",
        element: (
          <PrivateRoute requiredPermission="financeiro" requiredModulo={MODULOS.FINANCEIRO} moduloLabel="Financeiro">
            <FinanceiroPage />
          </PrivateRoute>
        ),
      },
      {
        path: "cozinha",
        element: (
          <PrivateRoute requiredPermission="cozinha" requiredModulo={MODULOS.COZINHA} moduloLabel="Cozinha">
            <CozinhaPage />
          </PrivateRoute>
        ),
      },
      {
        path: "clientes",
        element: (
          <PrivateRoute requiredPermission="clientes" requiredModulo={MODULOS.CLIENTES} moduloLabel="Clientes">
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
      {
        // Histórico fiscal — consulta do gestor (reimpressão/cancelamento),
        // fora do fluxo do caixa (Leva 12).
        path: "notas-fiscais",
        element: (
          <PrivateRoute requiredPermission="relatorio">
            <HistoricoNfcePage />
          </PrivateRoute>
        ),
      },
    ],
  },

  // Fallback
  { path: "*", element: <Navigate to="/login" replace /> },
]);

export default router;
