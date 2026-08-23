import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

// ──────────────────────────────────────────────────────────────────
// ESLint — rede de segurança do que o teste não pega.
//
// Os testes provam comportamento; o linter pega a classe de erro que
// passa despercebida na revisão e só aparece em produção: variável que
// não existe (`no-undef`), `case` que vaza para o seguinte, e sobretudo
// as regras de Hooks do React — dependência faltando num `useEffect` é
// tela que não atualiza, e Hook dentro de `if` é crash em runtime.
//
// Conjunto deliberadamente enxuto: estilo (aspas, ponto e vírgula,
// indentação) fica de fora. Regra de estilo transforma revisão em briga
// de formatação e não impede um bug; se um dia entrar, entra com
// formatador automático, não com erro de lint.
// ──────────────────────────────────────────────────────────────────

// Base comum: as regras recomendadas do ESLint, com dois ajustes que valem
// para todo o projeto.
const regrasBase = {
  ...js.configs.recommended.rules,
  // Este projeto conversa com impressora térmica: `\x00-\x1f` em regex é o
  // sanitizador de ESC/POS fazendo exatamente o trabalho dele. A regra só
  // acertaria se caractere de controle em regex fosse acidente — aqui é
  // sempre proposital, então ela seria só falso positivo recorrente.
  "no-control-regex": "off",
  // Todos os casos de hoje são o mesmo idioma defensivo: `let error = null`
  // antes de um try/catch que atribui nos dois caminhos. Tirar o valor
  // inicial não corrige bug nenhum, e o idioma deixa o código mais legível.
  // Fica como aviso porque atribuição realmente morta (calcular e sobrescrever
  // em seguida) continua valendo a pena aparecer.
  "no-useless-assignment": "warn",
};

export default [
  {
    ignores: [
      "node_modules/**",
      "dist/**",
      "dev-dist/**",
      "coverage/**",
      "public/**",
      "tools/**",
      "bot/**",
      "pesquisas-diarias/**",
    ],
  },

  // Front-end (React, roda no navegador).
  {
    files: ["src/**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: { ...globals.browser },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...regrasBase,
      // Só as duas regras clássicas de Hooks, escolhidas uma a uma.
      // O preset `recommended` do plugin v7 traz junto as regras do React
      // Compiler (set-state-in-effect, immutability, purity...) — 66 erros
      // hoje, cada um pedindo refatoração de tela. Elas apontam coisa real,
      // mas adotar tudo de uma vez trocaria "linter que segura bug" por
      // "linter vermelho que todo mundo ignora". Ficam para uma leva própria.
      //
      // Hook dentro de if/loop quebra a ordem dos Hooks e derruba a tela:
      // isso é erro.
      "react-hooks/rules-of-hooks": "error",
      // Dependência faltando é tela que não atualiza. Aviso porque hoje há
      // 10 casos e vários são intencionais (efeito que roda uma vez só).
      "react-hooks/exhaustive-deps": "warn",
      // Argumento não usado é comum e inofensivo em callback de evento;
      // variável não usada costuma ser resto de refatoração. Aviso, não
      // erro: não vale travar a CI por isso.
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      // `console.log` é proibido em código de produção (CLAUDE.md).
      // warn/error seguem valendo — são o canal de erro de verdade.
      "no-console": ["error", { allow: ["warn", "error"] }],
      "no-fallthrough": "error",
    },
  },

  // Testes: mesmo conjunto, sem a proibição de console — um teste que
  // exercita log precisa poder chamá-lo. Vários testes leem SQL do disco
  // (os guardas de schema/RPC), então rodam com os globais do Node também.
  {
    files: ["src/**/*.test.{js,jsx}", "src/test/**/*.{js,jsx}"],
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      "no-console": "off",
    },
  },

  // Scripts de manutenção e a ponte de impressão rodam em Node.
  {
    files: ["scripts/**/*.{js,mjs}", "ponte/**/*.js"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: { ...globals.node },
    },
    rules: {
      ...regrasBase,
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },

  // Configuração do próprio projeto (Vite, Vitest, este arquivo) roda em Node.
  {
    files: ["*.config.js", "*.config.mjs"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: { ...globals.node },
    },
    rules: { ...regrasBase },
  },
];
