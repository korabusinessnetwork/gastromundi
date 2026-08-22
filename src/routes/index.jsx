import { lazy, Suspense } from "react";
import { createBrowserRouter, Navigate } from "react-router-dom";
import PrivateRoute   from "./PrivateRoute";
import ConsoleRoute   from "./ConsoleRoute";
import InicioApp      from "./InicioApp";
import ComContextoDoApp from "./ComContextoDoApp";
import TelaCarregando from "./TelaCarregando";
import { ehApexInstitucional } from "@/lib/apex";
import { consoleAtivo, ehConsoleHost } from "@/lib/consoleHost";

// Página institucional do apex (kora.codes) — lazy: quem opera o PDV nos
// subdomínios nunca baixa esse código; só o visitante do apex.
const ApexPage = lazy(() => import("@/pages/apex/ApexPage"));
// Protótipo navegável ("Ver o KORA rodando") — só existe no apex; nos
// subdomínios de tenant a rota nem se registra e cai no fallback /login.
const DemoPage = lazy(() => import("@/pages/apex/demo/DemoPage"));
// Endereço que não existe no site (kora.codes/qualquer-coisa) — lazy pelo
// mesmo motivo dos outros: só o visitante do apex baixa esse código.
const ApexNaoEncontrada = lazy(() => import("@/pages/apex/ApexNaoEncontrada"));
// Política de privacidade — documento público que o rodapé e o aceite do
// formulário linkam. Lazy: quase ninguém abre, mas quem abre precisa que
// esteja lá (LGPD, e é o que a pessoa procura antes de deixar o contato).
const ApexPrivacidade = lazy(() => import("@/pages/apex/ApexPrivacidade"));
// Vitrine pública de delivery (cardápio online, anon por slug) — lazy: só
// quem abre /cardapio baixa esse código; o operador do PDV nunca carrega.
const CardapioPage = lazy(() => import("@/pages/delivery/CardapioPage"));

// Login: única tela que continua vindo junto com o app. É a porta de
// entrada de todo estabelecimento — baixá-la sob demanda custaria uma ida
// ao servidor bem no primeiro instante, que é justamente onde o tempo pesa.
import LoginPage from "@/pages/LoginPage";

// TODAS as outras telas são baixadas quando abertas.
//
// Antes, este arquivo importava as dezoito páginas de uma vez, e por isso
// TODO MUNDO baixava TUDO: quem só abria a vitrine em kora.codes recebia o
// PDV inteiro; o caixa que só usa o PDV recebia relatório, estoque,
// financeiro, o console da plataforma e as bibliotecas pesadas penduradas
// nelas (mapa do delivery, planilha da importação, PDF do relatório).
// Eram 2,4 MB num pedaço só. Cada tela agora traz o que é dela, quando é
// aberta — o Suspense de /app fica dentro do DesktopLayout, para o menu
// não piscar entre uma tela e outra.
const MobilePage        = lazy(() => import("@/pages/MobilePage"));
const DesktopLayout     = lazy(() => import("@/pages/desktop/DesktopLayout"));
const PDVPage           = lazy(() => import("@/pages/desktop/PDVPage"));
const ProdutosPage      = lazy(() => import("@/pages/desktop/ProdutosPage"));
const DeliveryPage      = lazy(() => import("@/pages/desktop/DeliveryPage"));
const RelatorioPage     = lazy(() => import("@/pages/desktop/RelatorioPage"));
const ConfiguracoesPage = lazy(() => import("@/pages/desktop/ConfiguracoesPage"));
const EstoquePage       = lazy(() => import("@/pages/desktop/EstoquePage"));
const FinanceiroPage    = lazy(() => import("@/pages/desktop/FinanceiroPage"));
const CozinhaPage       = lazy(() => import("@/pages/desktop/CozinhaPage"));
const AdminPage         = lazy(() => import("@/pages/desktop/AdminPage"));
const ClientesPage      = lazy(() => import("@/pages/desktop/ClientesPage"));
const HistoricoNfcePage = lazy(() => import("@/pages/desktop/HistoricoNfcePage"));
const PainelFiscalPage  = lazy(() => import("@/pages/desktop/PainelFiscalPage"));
const ConsolePage       = lazy(() => import("@/pages/console/ConsolePage"));
const ConsoleLoginPage  = lazy(() => import("@/pages/console/ConsoleLoginPage"));

import MODULOS from "@/constants/modulos";

/**
 * Embrulha a tela na espera padrão. Fora de /app cada rota traz a sua
 * (não há layout em volta para segurar a tela enquanto o pedaço chega).
 */
const comEspera = (elemento) => (
  <Suspense fallback={<TelaCarregando />}>{elemento}</Suspense>
);

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
  {
    // Tudo aqui é tela de dentro (login de desenvolvedor + painel), então
    // tudo aqui precisa do estado do app.
    element: <ComContextoDoApp />,
    children: [
      { path: "/login",   element: comEspera(<ConsoleLoginPage />) },
      {
        path: "/console",
        element: comEspera(
          <ConsoleRoute>
            <ConsolePage />
          </ConsoleRoute>
        ),
      },
      { path: "/",  element: comEspera(<ConsoleLoginPage />) },
    ],
  },
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

  // Política de privacidade (apex). Fica FORA do ComContextoDoApp de
  // propósito: é uma página de texto: abrir a política não pode acender
  // sessão nem realtime — ainda mais sendo a página que explica
  // justamente o que a gente faz com dado.
  {
    path: "/privacidade",
    element: ehApexInstitucional()
      ? <Suspense fallback={null}><ApexPrivacidade /></Suspense>
      : <Navigate to="/login" replace />,
  },

  // ── Telas do produto: SÓ ELAS montam o estado do app ──────────────
  // O AppProvider saiu do main.jsx e virou esta rota-mãe. Vitrine,
  // demonstração e endereço inexistente (acima e abaixo) ficam de fora:
  // abrem sem restaurar sessão, sem buscar tenant e sem abrir conexão de
  // realtime com o Supabase. Ver ComContextoDoApp.jsx.
  {
    element: <ComContextoDoApp />,
    children: [
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
          : comEspera(
            <ConsoleRoute>
              <ConsolePage />
            </ConsoleRoute>
          ),
      },

      // Palm — tirar pedidos
      {
        path: "/palm",
        element: comEspera(
          <PrivateRoute requiredPermission="palm">
            <MobilePage />
          </PrivateRoute>
        ),
      },

      // Desktop — gestão completa
      {
        path: "/app",
        element: comEspera(
          <PrivateRoute>
            <DesktopLayout />
          </PrivateRoute>
        ),
        children: [
          { index: true, element: <InicioApp /> },
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
            path: "delivery",
            element: (
              <PrivateRoute requiredPermission="produtos" requiredModulo={MODULOS.DELIVERY} moduloLabel="Delivery">
                <DeliveryPage />
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
    ],
  },

  // Fallback. No apex, endereço errado tem tela própria: quem clicou num
  // link quebrado do nosso site lê o que houve e tem o caminho de volta,
  // em vez de ser despejado numa tela de senha de estabelecimento. Fora
  // do apex (subdomínio de tenant, dev), segue indo para o login.
  {
    path: "*",
    element: ehApexInstitucional()
      ? <Suspense fallback={null}><ApexNaoEncontrada /></Suspense>
      : <Navigate to="/login" replace />,
  },
];

// No host dedicado do console, servimos APENAS as rotas do console; em
// qualquer outro host, o app normal. A escolha é por host (defesa-em-
// profundidade de UX); a autorização REAL continua no banco (RLS/RPCs).
const router = createBrowserRouter(naHostDoConsole ? rotasHostConsole : rotasApp);

export default router;
