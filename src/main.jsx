import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { AppProvider } from "@/context/AppContext";
import router from "@/routes";
import "@/styles/tema.css";
import { registerSW } from "virtual:pwa-register";
import { assinaturaEscondida } from "@/lib/easterEgg";

// PWA (Leva 11): registra o service worker que deixa o app disponível
// offline. `immediate` atualiza a versão em segundo plano sem prompt.
registerSW({ immediate: true });

// 🥚 Easter egg: assinatura do criador, só no console (F12).
assinaturaEscondida();

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <AppProvider>
      <RouterProvider router={router} future={{ v7_startTransition: true }} />
    </AppProvider>
  </StrictMode>
);
