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
    include: ["src/**/*.test.js", "src/**/*.test.jsx", "ponte/lib/*.test.js"],
    setupFiles: ["src/test/setup.js"],
    env: {
      // `src/lib/supabase.js` lança na importação quando faltam as VITE_*
      // (proposital: em produção, faltar chave é erro de build, não erro 400
      // em runtime). Só que isso derrubava na COLETA todo teste de componente
      // que importa a árvore do app — inclusive os fluxos críticos do PDV —
      // em qualquer máquina sem `.env.local`, CI incluída.
      //
      // Valores de mentira, fixados aqui de propósito: eles têm precedência
      // sobre `.env.local`, então nenhum teste consegue falar com um Supabase
      // de verdade por acidente. Tudo que toca o banco nos testes passa pelo
      // dublê de `src/test/mockSupabase.js`.
      VITE_SUPABASE_URL: "http://supabase.invalido.teste",
      VITE_SUPABASE_ANON_KEY: "chave-anonima-de-teste",
      // Fuso fixo. Regras de calendário (dias sem vender, vencimento de
      // assinatura) mudam de resultado conforme o fuso da máquina: passavam
      // em UTC-3 e falhavam em UTC, que é o fuso deste container e o da CI.
      // Sem isso o mesmo commit fica verde no notebook e vermelho na CI.
      TZ: "America/Sao_Paulo",
    },
  },
});
