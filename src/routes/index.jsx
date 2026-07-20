import { lazy, Suspense } from "react";
import { createBrowserRouter, Navigate } from "react-router-dom";
import PrivateRoute   from "./PrivateRoute";
import ConsoleRoute   from "./ConsoleRoute";
import MobileRoute    from "./MobileRoute";
import { ehApexInstitucional } from "@/lib/apex";
import { consoleAtivo, ehConsoleHost } from "@/lib/consoleHost";

// Página institucional do apex (kora.codes) — lazy: quem opera o PDV nos
// subdomínios nunca baixa esse código; só o visitante do apex.
const ApexPage = lazy(() => import("@/pages/apex/ApexPage"));
// Protótipo navegável ("Ver o KORA rodando") — só existe no apex; nos
// subdomínios de tenant a rota nem se registra e cai no fallback /login.
const DemoPage = lazy(() => import("@/pages/apex/demo/DemoPage"));
// Vitrine pública de delivery (cardápio online, anon por slug) — lazy: só
// quem abre /cardapio baixa esse código; o operador do PDV nunca carrega.
const CardapioPage = lazy(() => import("@/pages/delivery/CardapioPage"));

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
import PainelFiscalPage   from "@/pages/desktop/PainelFiscalPage";
import ConsolePage        from "@/pages/console/ConsolePage";
import ConsoleLoginPage   from "@/pages/console/ConsoleLoginPage";
import MODULOS from "@/constants/modulos";

// Recurso "Console em subdomínio próprio" (Task #18). Calculado UMA vez no
// carregamento do módulo (como ehApexInstitucional). Master switch inerte:
// sem VITE_CONSOLE_SUBDOMAIN + VITE_ROOT_DOMAIN, `consoleLigado` é false e o
// roteador se comporta exatamente como hoje.
const consoleLigado     = consoleAtivo();
const naHostDoConsole   = consoleLigado && ehConsoleHost();
// Recurso ligado, mas estamos num host de TENANT/apex/dev: o /console some
// daqui (só existe no host dedicado) — quem tentar cai no login do tenant.
const consoleForaDoHost = consoleLigado && !naHostDoConsole;

// ── Host DEDICADO do Console (ex.: console.kora.codes) ─────────────
// Só o Console existe aqui: login de desenvolvedor próprio + painel. Nada
// de app de estabelecimento, apex ou demo. Sem marca de tenant, sem porta
// de login do estabelecimento — qualquer outra rota volta pra raiz.
const rotasHostConsole = [
  { path: "/login",   element: <ConsoleLoginPage /> },
  {
    path: "/console",
    element: (
      <ConsoleRoute>
        <ConsolePage />
      </ConsoleRoute>
    ),
  },
  { path: "/",  element: <ConsoleLoginPage /> },
  { path: "*",  element: <Navigate to="/" replace /> },
];

// ── Hosts de TENANT / apex / dev — comportamento de sempre ─────────
const rotasApp = [
  // Raiz: no apex (kora.codes/www) mostra a vitrine institucional da Kora;
  // em qualquer outro host (subdomínio de tenant, dev, preview) segue o
  // comportamento de sempre — direto ao login. Decisão em src/lib/apex.js.
  {
    path: "/",
    element: ehApexInstitucional()
      ? <Suspense fallback={null}><ApexPage /></Suspense>
      : <Navigate to="/login" replace />,
  },

  // Demonstração fictícia do produto (apex): login de mentira + telas
  // protótipo com dados fictícios. Fora do apex, comportamento antigo.
  {
    path: "/demo",
    element: ehApexInstitucional()
      ? <Suspense fallback={null}><DemoPage /></Suspense>
      : <Navigate to="/login" replace />,
  },

  // Autenticação
  { path: "/login", element: <LoginPage /> },

  // Vitrine pública de delivery — SEM login (cliente final pede pelo slug do
  // subdomínio). Fica fora do PrivateRoute de propósito: é a única superfície
  // anônima do app além do login. Segurança real nas RPCs SECURITY DEFINER.
  {
    path: "/cardapio",
    element: (
      <Suspense fallback={null}>
        <CardapioPage />
      </Suspense>
    ),
  },

  // Console da Plataforma (S1-2) — só o super-admin `plataforma`.
  // Rota à parte de /app: a plataforma não opera o estabelecimento.
  //
  // Com o recurso de console-em-subdomínio LIGADO, o /console NÃO existe
  // nos hosts de tenant — ele só mora no host dedicado. Aqui vira um beco
  // sem saída (volta ao login do tenant), removendo a porta da plataforma
  // dos subdomínios de estabelecimento. Com o switch desligado, é o
  // comportamento de sempre (ConsoleRoute decide pelo papel).
  {
    path: "/console",
    element: consoleForaDoHost
      ? <Navigate to="/login" replace />
      : (
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
      {
        // Configuração fiscal do estabelecimento — onboarding fiscal do gestor
        // (CNPJ/série/ambiente/endpoints), junto das Configurações (Leva 13).
        path: "fiscal",
        element: (
          <PrivateRoute requiredPermission="configuracoes">
            <PainelFiscalPage />
          </PrivateRoute>
        ),
      },
    ],
  },

  // Fallback
  { path: "*", element: <Navigate to="/login" replace /> },
];

// No host dedicado do console, servimos APENAS as rotas do console; em
// qualquer outro host, o app normal. A escolha é por host (defesa-em-
// profundidade de UX); a autorização REAL continua no banco (RLS/RPCs).
const router = createBrowserRouter(naHostDoConsole ? rotasHostConsole : rotasApp);

export default router;
