import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    // PWA (Leva 11 — offline-first): o service worker guarda o app inteiro
    // no dispositivo. Sem internet, o PDV abre normalmente e os pedidos
    // entram na fila local do AppContext até a conexão voltar.
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        // Nome da PLATAFORMA, não do tenant (white-label, decisão 017) —
        // o manifest é estático por build; a marca do tenant vem do banco.
        name: "PDV by Kora",
        short_name: "PDV",
        description: "Ponto de venda que funciona mesmo sem internet",
        start_url: "/",
        display: "standalone",
        background_color: "#0f0f10",
        theme_color: "#0f0f10",
        icons: [
          { src: "/icone-kora.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" },
        ],
      },
      workbox: {
        // Bundle principal tem ~1,9 MB — acima do limite default de 2 MiB
        // do precache quando crescer; folga para não quebrar build futura.
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: "StaleWhileRevalidate",
            options: { cacheName: "google-fonts-css", expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 } },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: "CacheFirst",
            options: { cacheName: "google-fonts-arquivos", expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 } },
          },
        ],
      },
    }),
  ],
  server: {
    host: true, // expõe em 0.0.0.0 para acesso pela rede local
  },
  resolve: {
    alias: {
      "@": "/src",
    },
  },
  build: {
    chunkSizeWarningLimit: 2000,
  },
});
