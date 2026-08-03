#!/usr/bin/env node
/**
 * Portão de segurança do laboratório de ciclo contínuo.
 *
 * Roda como PreToolUse. Lê o JSON do evento no stdin e devolve no stdout o
 * veredito no formato que o Claude Code espera. Nega:
 *
 *   - qualquer coisa que publique trabalho para fora da máquina
 *     (git push, git remote, gh, npm publish, curl/wget)
 *   - remoção recursiva de árvore (rm -rf, Remove-Item -Recurse -Force)
 *   - mudança de configuração do git (git config) e commit sem hook
 *     (--no-verify), porque é assim que se contorna o próprio portão
 *   - escrita fora do laboratório e fora do vault do Obsidian
 *
 * `git reset --hard` é permitido de propósito: o passo 4 do /ciclo-lab precisa
 * dele para reverter o working tree quando a suíte fica vermelha.
 *
 * É escrito em node (e não em sh) porque o laboratório roda no Windows: parsing
 * de JSON e normalização de caminho precisam ser confiáveis, e node já está
 * presente em qualquer projeto Vite.
 */
import path from "node:path";

const BASH_NEGADOS = [
  { re: /\bgit\s+push\b/i, motivo: "push está fora da autonomia do loop — o dono publica manualmente" },
  { re: /\bgit\s+remote\b/i, motivo: "mexer em remote é caminho para publicar sem ordem" },
  { re: /\bgh\s+/i, motivo: "o laboratório não fala com o GitHub" },
  { re: /\bnpm\s+publish\b/i, motivo: "o laboratório não publica pacote" },
  { re: /\bgit\s+config\b/i, motivo: "configuração do git é decisão humana, não de rodada" },
  { re: /--no-verify\b/i, motivo: "--no-verify pula o post-commit que escreve no Obsidian" },
  { re: /\brm\s+(-[a-z]*r[a-z]*f|-[a-z]*f[a-z]*r)\b/i, motivo: "remoção recursiva forçada não é operação de rodada" },
  { re: /Remove-Item[^\n]*-Recurse[^\n]*-Force/i, motivo: "remoção recursiva forçada não é operação de rodada" },
  { re: /\bcurl\s+/i, motivo: "o loop trabalha offline — nada de rede" },
  { re: /\bwget\s+/i, motivo: "o loop trabalha offline — nada de rede" },
];

function normalizar(p) {
  return path.resolve(p).split(path.sep).join("/").replace(/\/+$/, "").toLowerCase();
}

function dentroDe(alvo, raiz) {
  const a = normalizar(alvo);
  const r = normalizar(raiz);
  return a === r || a.startsWith(r + "/");
}

function responder(decisao, motivo) {
  if (decisao === "deny") {
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
          permissionDecisionReason: motivo,
        },
      })
    );
  }
  process.exit(0);
}

let bruto = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (c) => (bruto += c));
process.stdin.on("end", () => {
  let evento;
  try {
    evento = JSON.parse(bruto);
  } catch {
    // Sem evento legível não há como julgar; deixa o fluxo normal de permissão decidir.
    process.exit(0);
  }

  const ferramenta = evento.tool_name;
  const entrada = evento.tool_input || {};

  if (ferramenta === "Bash") {
    const comando = String(entrada.command || "");
    for (const regra of BASH_NEGADOS) {
      if (regra.re.test(comando)) {
        responder("deny", `Bloqueado pelo portão do laboratório: ${regra.motivo}.`);
      }
    }
    process.exit(0);
  }

  if (ferramenta === "Write" || ferramenta === "Edit" || ferramenta === "NotebookEdit") {
    const alvo = entrada.file_path || entrada.notebook_path;
    if (!alvo) process.exit(0);

    const lab = process.env.CLAUDE_PROJECT_DIR || process.cwd();
    const vault = process.env.KORA_VAULT || "D:/Vault/kora";

    if (dentroDe(alvo, lab) || dentroDe(alvo, vault)) process.exit(0);

    responder(
      "deny",
      `Bloqueado pelo portão do laboratório: escrita em "${alvo}" está fora do laboratório (${lab}) e do vault (${vault}).`
    );
  }

  process.exit(0);
});
