// Lint do app (fase 0.2 de docs/09_BACKLOG/plano_refatoracao.md).
//
// Cobre só o que roda no navegador (`src/`) e os scripts de manutenção. Ficam
// de fora os projetos que têm ambiente próprio: `ponte/` e `bot/` (Node,
// fora do bundle) e `supabase/functions/` (Deno).
//
// As fronteiras entre camadas nascem como AVISO e viram ERRO na fase em que o
// plano zera aquela contagem. Assim o lint já mostra o tamanho do problema sem
// travar a suíte antes da hora, e depois impede que ele volte.

import js from "@eslint/js";
import globals from "globals";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";

export default [
  {
    ignores: [
      "dist/**", "dev-dist/**", "node_modules/**", "public/**", "coverage/**",
      "ponte/**", "bot/**", "tools/**", "supabase/**", "executavel/**",
      // Hooks do agente: scripts Node do ambiente de desenvolvimento, não do app.
      ".claude/**",
    ],
  },
  js.configs.recommended,
  {
    files: ["src/**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, __APP_VERSION__: "readonly" },
    },
    plugins: { react, "react-hooks": reactHooks },
    settings: { react: { version: "18.3" } },
    rules: {
      // Sem isto, componente usado só como <Tag /> conta como variável sem uso.
      "react/jsx-uses-vars": "error",
      ...reactHooks.configs.recommended.rules,
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" }],
      // Espaço inseparável e BOM aparecem de propósito em regex (o formatador
      // de moeda do Intl usa U+00A0, e o Excel grava BOM no CSV).
      "no-irregular-whitespace": ["error", { skipRegExps: true }],
    },
  },
  {
    // Testes rodam no Vitest (node ou jsdom) e usam `global`/`process`.
    files: ["src/**/*.test.{js,jsx}", "src/test/**"],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      // Guard de SQL compara o texto da migration ao pé da letra, espaços
      // inclusive; e teste de impressão procura caractere de controle.
      "no-regex-spaces": "off",
      "no-control-regex": "off",
    },
  },
  {
    files: ["scripts/**/*.{js,mjs}", "*.config.js"],
    languageOptions: { globals: globals.node },
  },
  {
    // Fronteira da camada de dados: tela não fala com o Supabase direto.
    // Erro desde a tarefa 1.4 do plano, quando a última tela saiu.
    files: ["src/components/**", "src/pages/**", "src/routes/**", "src/layouts/**"],
    ignores: ["**/*.test.{js,jsx}"],
    rules: {
      "no-restricted-imports": ["error", {
        paths: [{ name: "@/lib/supabase", message: "Tela não chama o Supabase direto: use a camada dados/ da feature (fase 1 do plano de refatoração)." }],
        patterns: [{ group: ["**/lib/supabase"], message: "Tela não chama o Supabase direto: use a camada dados/ da feature (fase 1 do plano de refatoração)." }],
      }],
    },
  },
  {
    // Celular não importa código da árvore do computador. Aviso agora; erro no
    // fim da fase 4 do plano.
    files: ["src/pages/mobile/**", "src/pages/MobilePage.jsx"],
    ignores: ["**/*.test.{js,jsx}"],
    rules: {
      "no-restricted-imports": ["warn", {
        patterns: [{ group: ["@/components/desktop/**", "**/components/desktop/**"], message: "Lógica compartilhada mora em hooks da feature, não na pasta do computador (fase 4 do plano de refatoração)." }],
      }],
    },
  },
];
