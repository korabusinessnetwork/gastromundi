import { Navigate } from "react-router-dom";
import PrivateRoute from "@/routes/PrivateRoute";
import InicioApp from "@/routes/InicioApp";
import LoginPage from "@/pages/LoginPage";
import MobilePage from "@/pages/MobilePage";
import DesktopLayout from "@/pages/desktop/DesktopLayout";
import PDVPage from "@/pages/desktop/PDVPage";
import ProdutosPage from "@/pages/desktop/ProdutosPage";
import DeliveryPage from "@/pages/desktop/DeliveryPage";
import RelatorioPage from "@/pages/desktop/RelatorioPage";
import ConfiguracoesPage from "@/pages/desktop/ConfiguracoesPage";
import EstoquePage from "@/pages/desktop/EstoquePage";
import FinanceiroPage from "@/pages/desktop/FinanceiroPage";
import CozinhaPage from "@/pages/desktop/CozinhaPage";
import AdminPage from "@/pages/desktop/AdminPage";
import ClientesPage from "@/pages/desktop/ClientesPage";
import HistoricoNfcePage from "@/pages/desktop/HistoricoNfcePage";
import PainelFiscalPage from "@/pages/desktop/PainelFiscalPage";
import MODULOS from "@/constants/modulos";

/**
 * Uma tela do computador dentro de `/app`: exige a permissão do papel e, se a
 * tela for de um módulo do plano, o módulo contratado.
 */
function telaDoApp(path, Pagina, permissao, modulo, moduloLabel) {
  return {
    path,
    element: (
      <PrivateRoute requiredPermission={permissao} requiredModulo={modulo} moduloLabel={moduloLabel}>
        <Pagina />
      </PrivateRoute>
    ),
  };
}

/**
 * Superfície do estabelecimento: o login, o Palm do garçom e o app do
 * computador, com a gestão completa. Rota desconhecida volta ao login.
 */
export const rotasEstabelecimento = [
  { path: "/login", element: <LoginPage /> },

  // Palm, tirar pedidos.
  {
    path: "/palm",
    element: (
      <PrivateRoute requiredPermission="palm">
        <MobilePage />
      </PrivateRoute>
    ),
  },

  // Computador, gestão completa.
  {
    path: "/app",
    element: (
      <PrivateRoute>
        <DesktopLayout />
      </PrivateRoute>
    ),
    children: [
      { index: true, element: <InicioApp /> },
      telaDoApp("pdv", PDVPage, "pdv"),
      telaDoApp("produtos", ProdutosPage, "produtos", MODULOS.CARDAPIO, "Cadastro de Produtos"),
      telaDoApp("delivery", DeliveryPage, "produtos", MODULOS.DELIVERY, "Delivery"),
      telaDoApp("relatorio", RelatorioPage, "relatorio", MODULOS.RELATORIOS, "Relatórios"),
      telaDoApp("configuracoes", ConfiguracoesPage, "configuracoes"),
      telaDoApp("estoque", EstoquePage, "estoque", MODULOS.ESTOQUE, "Estoque"),
      telaDoApp("financeiro", FinanceiroPage, "financeiro", MODULOS.FINANCEIRO, "Financeiro"),
      telaDoApp("cozinha", CozinhaPage, "cozinha", MODULOS.COZINHA, "Cozinha"),
      telaDoApp("clientes", ClientesPage, "clientes", MODULOS.CLIENTES, "Clientes"),
      telaDoApp("admin", AdminPage, "configuracoes"),
      // Histórico fiscal: consulta do gestor (reimpressão e cancelamento),
      // fora do fluxo do caixa (Leva 12).
      telaDoApp("notas-fiscais", HistoricoNfcePage, "relatorio"),
      // Configuração fiscal do estabelecimento (CNPJ, série, ambiente),
      // junto das Configurações (Leva 13).
      telaDoApp("fiscal", PainelFiscalPage, "configuracoes"),
    ],
  },

  { path: "*", element: <Navigate to="/login" replace /> },
];
