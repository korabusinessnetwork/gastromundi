import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { sentryVitePlugin } from "@sentry/vite-plugin";

// Source maps do Sentry só sobem no build de PRODUÇÃO da Vercel, e só quando
// as credenciais server-side existem (SENTRY_AUTH_TOKEN/ORG/PROJECT — nunca no
// bundle, nunca VITE_*). Sem token (build local/preview), o plugin nem entra:
// o build roda idêntico, sem tentar upload nem exigir segredo.
export default defineConfig(({ mode }) => {
  const producao = mode === "production";
  const temCredenciaisSentry =
    producao &&
    !!process.env.SENTRY_AUTH_TOKEN &&
    !!process.env.SENTRY_ORG &&
    !!process.env.SENTRY_PROJECT;

  return {
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
      // Observabilidade (Sentry): sobe os source maps pro painel e os REMOVE
      // do bundle público (filesToDeleteAfterUpload) — stack legível no Sentry,
      // código não exposto na Vercel. Precisa ser o ÚLTIMO plugin.
      ...(temCredenciaisSentry
        ? [
            sentryVitePlugin({
              org: process.env.SENTRY_ORG,
              project: process.env.SENTRY_PROJECT,
              authToken: process.env.SENTRY_AUTH_TOKEN,
              release: { name: process.env.VITE_APP_VERSION },
              sourcemaps: {
                filesToDeleteAfterUpload: ["./dist/**/*.map"],
              },
              telemetry: false,
            }),
          ]
        : []),
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
      // Source maps só no build de produção COM credenciais Sentry — senão
      // não há upload e não faz sentido gerar/expor o .map.
      sourcemap: temCredenciaisSentry,
    },
  };
});
