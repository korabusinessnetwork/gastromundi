#!/usr/bin/env node
// Instala o Stop hook do Full Automático num projeto.
// Uso: node instalar-hook.cjs <pasta-do-projeto> [--com-protecoes]
// Faz merge no .claude/settings.json sem apagar configurações existentes.

const fs = require("fs");
const path = require("path");

const args = process.argv.slice(2);
const projeto = path.resolve(args.find((a) => !a.startsWith("--")) || ".");
const comProtecoes = args.includes("--com-protecoes");

const pastaClaude = path.join(projeto, ".claude");
const pastaHooks = path.join(pastaClaude, "hooks");
// Instalado como .cjs de propósito: o hook usa require(), e projetos com
// "type": "module" no package.json (todo Vite) quebram se o arquivo for .js.
// A extensão .cjs funciona nos dois casos.
const destinoHook = path.join(pastaHooks, "full-auto-stop.cjs");
const arquivoSettings = path.join(pastaClaude, "settings.json");

fs.mkdirSync(pastaHooks, { recursive: true });
fs.copyFileSync(path.join(__dirname, "full-auto-stop.cjs"), destinoHook);

// Limpa a versão .js deixada por instalações anteriores, que quebra sob ESM.
const hookAntigo = path.join(pastaHooks, "full-auto-stop.js");
if (fs.existsSync(hookAntigo)) fs.rmSync(hookAntigo);

let settings = {};
if (fs.existsSync(arquivoSettings)) {
  try {
    settings = JSON.parse(fs.readFileSync(arquivoSettings, "utf8"));
  } catch (e) {
    console.error(`settings.json inválido em ${arquivoSettings}. Corrija o JSON e rode de novo.`);
    process.exit(1);
  }
  fs.copyFileSync(arquivoSettings, arquivoSettings + ".bak");
}

settings.hooks = settings.hooks || {};
settings.hooks.Stop = settings.hooks.Stop || [];

// O hook do Claude Code é um comando único, não aceita "args" separado.
const comandoHook = 'node "$CLAUDE_PROJECT_DIR/.claude/hooks/full-auto-stop.cjs"';

// Tira qualquer registro anterior do full-auto-stop (inclusive o .js quebrado)
// para não acumular entradas duplicadas a cada execução.
const antes = settings.hooks.Stop.length;
settings.hooks.Stop = settings.hooks.Stop.filter(
  (e) => !JSON.stringify(e).includes("full-auto-stop")
);
const jaTem = settings.hooks.Stop.length < antes;

settings.hooks.Stop.push({
  hooks: [{ type: "command", command: comandoHook }],
});

// Paralelismo: worktrees partem do trabalho atual, não da main.
settings.worktree = settings.worktree || {};
if (!settings.worktree.baseRef) settings.worktree.baseRef = "head";

// Copia arquivos de ambiente para cada worktree criada.
const arquivoInclude = path.join(projeto, ".worktreeinclude");
if (!fs.existsSync(arquivoInclude)) {
  fs.writeFileSync(arquivoInclude, ".env\n.env.local\n");
}

if (comProtecoes) {
  settings.permissions = settings.permissions || {};
  const adicionar = (lista, regras) => {
    settings.permissions[lista] = settings.permissions[lista] || [];
    for (const r of regras) {
      if (!settings.permissions[lista].includes(r)) settings.permissions[lista].push(r);
    }
  };
  adicionar("deny", ["Bash(git push --force *)", "Bash(git push -f *)"]);
  adicionar("ask", [
    "Bash(git push *)",
    "Bash(supabase db push *)",
    "Bash(vercel --prod *)",
    "Bash(npm publish *)",
  ]);
}

fs.writeFileSync(arquivoSettings, JSON.stringify(settings, null, 2) + "\n");

console.log(`Hook ${jaTem ? "reinstalado (registro anterior substituído)" : "instalado"}: ${destinoHook}`);
console.log(`settings.json atualizado: ${arquivoSettings}`);
console.log(`Paralelismo: worktree.baseRef = ${settings.worktree.baseRef}, .worktreeinclude pronto.`);
if (comProtecoes) console.log("Travas de segurança adicionadas (deny + ask).");
console.log("Reinicie a sessão do Claude Code (ou abra /hooks) para o hook ser carregado.");
