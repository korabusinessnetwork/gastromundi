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
    include: ["src/**/*.test.js", "src/**/*.test.jsx", "ponte/lib/*.test.js", "scripts/**/*.test.mjs"],
    setupFiles: ["src/test/setup.js"],
    env: {
      // Fuso fixo para a suíte. As regras de dia (vencimento de assinatura,
      // "Hoje"/"Ontem", dias sem vender) leem o CALENDÁRIO LOCAL de quem opera
      // — é o comportamento certo, mas deixa o teste refém do relógio da
      // máquina: o mesmo caso passa no notebook do Brasil e quebra na CI em
      // UTC. Fixar o fuso aqui torna a suíte determinística em qualquer
      // máquina, sem mexer no código de produção.
      TZ: "America/Sao_Paulo",
      // Credenciais de mentira só para o teste. `src/lib/supabase.js` falha na
      // importação sem as VITE_*, o que derrubava toda tela que o importa em
      // clone novo (sem `.env.local`) mesmo com o client dublado no teste.
      // Nenhuma requisição real sai daqui — o client nunca é usado de verdade.
      VITE_SUPABASE_URL: "http://supabase.teste.invalid",
      VITE_SUPABASE_ANON_KEY: "chave-anon-de-teste",
    },
  },
});
