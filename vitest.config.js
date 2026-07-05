import { defineConfig } from "vitest/config";

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
    include: ["src/**/*.test.js", "src/**/*.test.jsx"],
    setupFiles: ["src/test/setup.js"],
  },
});
