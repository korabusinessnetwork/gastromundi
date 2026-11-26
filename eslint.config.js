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

const MSG_SUPABASE = "Só a camada dados/ fala com o Supabase: use a função de dados/ da feature (fase 1 e fase F do plano de refatoração).";
const SUPABASE_PATH = { name: "@/lib/supabase", message: MSG_SUPABASE };
const SUPABASE_PATTERN = { group: ["**/lib/supabase", "./supabase", "../supabase"], message: MSG_SUPABASE };

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
      // Componente usado no JSX sem import quebra só na hora de desenhar a tela;
      // a regra pega no lint (achado na refatoração 3, Console).
      "react/jsx-no-undef": "error",
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
  // As três fronteiras abaixo usam a mesma regra (`no-restricted-imports`). No
  // flat config, o bloco que vem depois substitui a regra inteira para os
  // arquivos em comum, então cada bloco repete a fronteira do Supabase junto
  // da sua.
  {
    // Fronteira da camada de dados: só `dados/` fala com o Supabase. Erro para
    // tela desde a tarefa 1.4, para o contexto desde a 2.7, e para todo `src/`
    // desde a fase F (2026-11-26), quando a última chamada fora de `dados/` saiu.
    files: ["src/**/*.{js,jsx}"],
    ignores: ["**/*.test.{js,jsx}", "src/test/**", "**/dados/**", "src/lib/supabase.js"],
    rules: {
      "no-restricted-imports": ["error", {
        paths: [SUPABASE_PATH],
        patterns: [SUPABASE_PATTERN],
      }],
    },
  },
  {
    // A camada de funcionalidade também não importa das telas do computador:
    // o celular usa esses ganchos, então a dependência chegaria a ele um passo
    // adiante, sem a regra de baixo ver. Erro desde o fim da fase 4 (2026-11-24).
    files: ["src/features/**"],
    ignores: ["**/*.test.{js,jsx}", "**/dados/**"],
    rules: {
      "no-restricted-imports": ["error", {
        paths: [SUPABASE_PATH],
        patterns: [SUPABASE_PATTERN, { group: ["@/components/desktop/**", "**/components/desktop/**"], message: "Funcionalidade não depende de tela do computador: o que é comum sai de components/desktop para a feature (fases 4 e 6 do plano de refatoração)." }],
      }],
    },
  },
  {
    // A camada de dados de uma feature também não depende de tela do computador.
    files: ["src/features/**/dados/**"],
    ignores: ["**/*.test.{js,jsx}"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [{ group: ["@/components/desktop/**", "**/components/desktop/**"], message: "Funcionalidade não depende de tela do computador: o que é comum sai de components/desktop para a feature (fases 4 e 6 do plano de refatoração)." }],
      }],
    },
  },
  {
    // Celular não importa código da árvore do computador. Erro desde o fim da
    // fase 4 do plano (2026-11-24), quando a contagem chegou a zero.
    files: ["src/pages/mobile/**", "src/pages/MobilePage.jsx"],
    ignores: ["**/*.test.{js,jsx}"],
    rules: {
      "no-restricted-imports": ["error", {
        paths: [SUPABASE_PATH],
        patterns: [SUPABASE_PATTERN, { group: ["@/components/desktop/**", "**/components/desktop/**"], message: "Lógica compartilhada mora em hooks da feature, não na pasta do computador (fase 4 do plano de refatoração)." }],
      }],
    },
  },
];
