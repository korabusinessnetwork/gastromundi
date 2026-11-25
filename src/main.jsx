import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import * as Sentry from "@sentry/react";
import { AppProvider } from "@/context/AppContext";
import router from "@/routes";
import "@/styles/tema.css";
import { registerSW } from "virtual:pwa-register";
import { initObservabilidade } from "@/lib/observabilidade";
import { instalarRecuperacaoDeploy } from "@/lib/recuperacaoDeploy";
import { pautasAtivo, ehPautasHost } from "@/lib/pautasHost";
import TelaDeErro from "@/app/TelaDeErro";

// Host das Pautas (ex.: pautas.kora.codes): superfície interna dos sócios da
// Kora, sem PDV, sem tenant e sem rotas. Inerte por design — sem
// VITE_PAUTAS_SUBDOMAIN + VITE_ROOT_DOMAIN isto é sempre false e o app roda
// exatamente como antes.
const noHostDasPautas = pautasAtivo() && ehPautasHost();

// PWA (Leva 11): registra o service worker que deixa o app disponível
// offline. `immediate` atualiza a versão em segundo plano sem prompt.
// Fora do host das pautas: o manifest instalável é o do PDV, e cachear o
// app inteiro em um subdomínio que só mostra uma lista não serve a ninguém.
if (!noHostDasPautas) registerSW({ immediate: true });

// Deploy novo com a aba já aberta: os pedaços antigos do app somem do servidor
// e a tela quebraria em branco. Antes de qualquer render, deixamos armada a
// recuperação — recarrega uma vez e volta com a versão nova.
instalarRecuperacaoDeploy();

// Observabilidade (Sentry): "luz do painel" do runtime. Env-gated e só em
// produção — sem VITE_SENTRY_DSN o app roda idêntico (fail-open). Precede o
// render para já capturar erros da árvore desde o primeiro frame.
initObservabilidade();

const raiz = createRoot(document.getElementById("root"));

if (noHostDasPautas) {
  // Import dinâmico: as telas das pautas só chegam ao navegador de quem abre
  // o subdomínio delas — o bundle do PDV não engorda por causa disso.
  import("@/pages/pautas/PautasApp").then(({ default: PautasApp }) => {
    raiz.render(
      <StrictMode>
        <Sentry.ErrorBoundary fallback={<TelaDeErro />}>
          <PautasApp />
        </Sentry.ErrorBoundary>
      </StrictMode>
    );
  });
} else {
  raiz.render(
    <StrictMode>
      <Sentry.ErrorBoundary fallback={<TelaDeErro />}>
        <AppProvider>
          <RouterProvider router={router} future={{ v7_startTransition: true }} />
        </AppProvider>
      </Sentry.ErrorBoundary>
    </StrictMode>
  );
}
