import { defineConfig } from "vitest/config";

// Fuso fixo na suíte. As regras de assinatura (vencimento, carência, "dias sem
// vender") comparam DIAS de calendário, e vários testes documentam justamente
// que um instante em UTC deve ser lido no calendário de quem opera. Sem fixar o
// fuso, esses testes passam na máquina brasileira e falham no runner da Vercel
// e do GitHub Actions, que rodam em UTC — CI nasceria vermelho. Fixar aqui deixa
// o resultado igual em qualquer máquina; quando houver cliente fora de
// São Paulo, o caminho é parametrizar o fuso por tenant, não afrouxar o teste.
process.env.TZ = "America/Sao_Paulo";

export default defineConfig({
  resolve: {
    alias: {
      "@": "/src",
    },
  },
  test: {
    // Funções puras (src/**/*.test.js) rodam em node — mais rápido, sem DOM.
    // Testes de componente (src/**/*.test.jsx) precisam de DOM → jsdom.
    // Vitest 4 removeu `environmentMatchGlobs`; cada *.test.jsx declara o
    // ambiente com o comentário mágico `// @vitest-environment jsdom` na
    // primeira linha do arquivo (suportado nativamente pelo Vitest).
    environment: "node",
    include: ["src/**/*.test.js", "src/**/*.test.jsx", "ponte/lib/*.test.js"],
    setupFiles: ["src/test/setup.js"],
    // Repassa o fuso para os workers (eles não herdam alteração feita em
    // process.env depois do boot) e dá ao Supabase valores de teste, para os
    // módulos que exigem as duas variáveis carregarem num runner sem .env.local.
    env: {
      TZ: "America/Sao_Paulo",
      VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL || "https://teste.supabase.co",
      VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY || "chave-de-teste",
    },
  },
});
