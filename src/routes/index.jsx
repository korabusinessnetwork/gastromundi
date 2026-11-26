import { createBrowserRouter } from "react-router-dom";
import { escolherRotas } from "@/app/rotas";
import { ehApexInstitucional } from "@/features/apex/regras/apex";
import { consoleAtivo, ehConsoleHost } from "@/features/console/regras/consoleHost";

// Só escolhe a superfície pelo endereço; as rotas de cada uma moram em
// `src/app/rotas/` (refatoração 6.10).
//
// Recurso "Console em subdomínio próprio" (Task #18), calculado uma vez no
// carregamento do módulo. Sem VITE_CONSOLE_SUBDOMAIN e VITE_ROOT_DOMAIN fica
// desligado e o roteador se comporta exatamente como antes. Ligado, mas num
// host de estabelecimento, site ou dev, o /console some daqui.
const consoleLigado = consoleAtivo();
const naHostDoConsole = consoleLigado && ehConsoleHost();

const router = createBrowserRouter(escolherRotas({
  naHostDoConsole,
  consoleForaDoHost: consoleLigado && !naHostDoConsole,
  noApex: ehApexInstitucional(),
}));

export default router;
