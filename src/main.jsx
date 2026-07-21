import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import * as Sentry from "@sentry/react";
import { AppProvider } from "@/context/AppContext";
import router from "@/routes";
import "@/styles/tema.css";
import { registerSW } from "virtual:pwa-register";
import { initObservabilidade } from "@/lib/observabilidade";

// PWA (Leva 11): registra o service worker que deixa o app disponível
// offline. `immediate` atualiza a versão em segundo plano sem prompt.
registerSW({ immediate: true });

// Observabilidade (Sentry): "luz do painel" do runtime. Env-gated e só em
// produção — sem VITE_SENTRY_DSN o app roda idêntico (fail-open). Precede o
// render para já capturar erros da árvore desde o primeiro frame.
initObservabilidade();

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

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <Sentry.ErrorBoundary fallback={<TelaDeErro />}>
      <AppProvider>
        <RouterProvider router={router} future={{ v7_startTransition: true }} />
      </AppProvider>
    </Sentry.ErrorBoundary>
  </StrictMode>
);
