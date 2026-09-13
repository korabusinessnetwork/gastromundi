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
    // 20 s por teste, contra os 5 s padrão. Não é para acomodar teste lento: é
    // porque montar uma tela grande (PDV, Delivery, Console) passa de 5 s
    // quando a máquina está sob carga, e aí a suíte acusa falha onde não há
    // nenhuma. Isso foi medido na rodada 2 do refino: com frentes paralelas
    // rodando, o tempo de ambiente foi de 66 s para 583 s e apareceram de 1 a 6
    // falhas por estouro de prazo, em arquivos diferentes a cada execução,
    // todas passando isoladas. O custo de um prazo folgado é esperar mais para
    // ver um travamento de verdade; o custo do prazo curto é pior, porque
    // falha intermitente ensina a ignorar vermelho, e aí a regressão real passa
    // batida no meio do ruído.
    testTimeout: 20000,
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
