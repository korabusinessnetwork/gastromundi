import { Navigate } from "react-router-dom";
import ConsoleRoute from "@/routes/ConsoleRoute";
import ConsolePage from "@/pages/console/ConsolePage";
import ConsoleLoginPage from "@/pages/console/ConsoleLoginPage";

/**
 * Superfície do Console da plataforma.
 *
 * No host DEDICADO do Console (ex.: console.kora.codes) só o Console existe:
 * login de desenvolvedor próprio e o painel. Nada de app de estabelecimento,
 * site ou demonstração, e qualquer outra rota volta para a raiz.
 */
export const rotasHostConsole = [
  { path: "/login", element: <ConsoleLoginPage /> },
  { path: "/console", element: <ConsoleRoute><ConsolePage /></ConsoleRoute> },
  { path: "/", element: <ConsoleLoginPage /> },
  { path: "*", element: <Navigate to="/" replace /> },
];

/**
 * O `/console` dentro do app de estabelecimento, só para o super-admin
 * `plataforma`. Com o Console em subdomínio próprio LIGADO, o `/console` não
 * existe nos hosts de estabelecimento: vira um beco sem saída que volta ao
 * login, e a porta da plataforma some dos subdomínios. Com o recurso
 * desligado, o `ConsoleRoute` decide pelo papel, como sempre.
 *
 * @param {boolean} consoleForaDoHost - recurso ligado e o host não é o do Console
 */
export function rotaConsoleNoApp(consoleForaDoHost) {
  return {
    path: "/console",
    element: consoleForaDoHost
      ? <Navigate to="/login" replace />
      : <ConsoleRoute><ConsolePage /></ConsoleRoute>,
  };
}
