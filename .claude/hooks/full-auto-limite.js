#!/usr/bin/env node
// StopFailure hook do Full Automático.
// Quando o turno termina por limite de uso (rate_limit), liga o vigia de limite
// em segundo plano, fora do Claude Code, para retomar sozinho quando o limite voltar.

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

let entrada = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (p) => (entrada += p));
process.stdin.on("end", () => {
  let input = {};
  try { input = JSON.parse(entrada || "{}"); } catch {}

  const raiz = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
  const pasta = path.join(raiz, ".full-auto");
  if (!fs.existsSync(pasta)) process.exit(0);

  // Dentro de uma rodada do próprio vigia, quem cuida do limite é o vigia.
  if (process.env.FULL_AUTO_VIGIA === "1") process.exit(0);

  const erro = String(input.error || "");
  const texto = `${input.error_details || ""} ${input.last_assistant_message || ""}`;
  const ehLimite = erro === "rate_limit" || /rate.?limit|usage limit|limit reached/i.test(texto);
  if (!ehLimite) process.exit(0);

  let estado = "";
  try { estado = fs.readFileSync(path.join(pasta, "ESTADO.md"), "utf8"); } catch {}
  const m = estado.match(/status:\s*`?([A-Z_]+)`?/i);
  const status = m ? m[1].toUpperCase() : "EXECUTANDO";
  if (status !== "EXECUTANDO") process.exit(0);

  try {
    fs.appendFileSync(
      path.join(pasta, "LOG.md"),
      `\n- ${new Date().toISOString()} limite de uso atingido (${erro || "rate_limit"}), vigia ligado\n`
    );
  } catch {}

  const vigia = path.join(raiz, ".claude", "hooks", "vigia-limite.js");
  if (!fs.existsSync(vigia)) process.exit(0);

  const filho = spawn(process.execPath, [vigia, raiz], {
    cwd: raiz,
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  filho.unref();
  process.exit(0);
});
