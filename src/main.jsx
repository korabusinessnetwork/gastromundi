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
import { aplicarSeoDaRota } from "@/lib/seo";

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

// Canonical e "não indexe" da rota inicial. Isto NÃO cabe no index.html: o
// mesmo HTML é servido para o apex (kora.codes) e para o subdomínio de cada
// estabelecimento, então uma tag fixa apontaria o buscador para o endereço
// errado. Aqui a decisão é por host e por caminho: a vitrine e a
// demonstração ganham canonical; login, PDV, console e endereço inexistente
// saem do índice. Cada rota que muda isso depois (o 404, por exemplo)
// reaplica ao sair.
aplicarSeoDaRota();

// Fallback amigável quando o render React estoura (o que try/catch não pega).
// Intuitividade (princípio nº 1): mensagem humana em português, sem jargão,
// com a ação óbvia (recarregar). Nada de tela branca.
function TelaDeErro() {
  return (
    <div
      role="alert"
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "1rem",
        padding: "2rem",
        textAlign: "center",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <h1 style={{ fontSize: "1.5rem", margin: 0 }}>Algo deu errado</h1>
      <p style={{ margin: 0, opacity: 0.8 }}>
        Tivemos um problema ao abrir esta tela. Recarregue a página para continuar.
      </p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        style={{
          padding: "0.75rem 1.5rem",
          fontSize: "1rem",
          borderRadius: "0.5rem",
          border: "none",
          cursor: "pointer",
          background: "var(--gm-primary, #2563eb)",
          color: "#fff",
        }}
      >
        Recarregar
      </button>
    </div>
  );
}

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
