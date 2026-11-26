#!/usr/bin/env node
// Stop hook do Full Automático.
// Impede o Claude Code de encerrar enquanto houver tarefas pendentes em .full-auto/TAREFAS.md.
// Sem dependências, roda em Windows, macOS e Linux com Node.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const LIMITE_SEM_PROGRESSO = 3;
const STATUS_QUE_LIBERAM = ["CONCLUIDO", "AGUARDANDO_MATHEUS", "PAUSADO"];

function ler(arquivo) {
  try {
    return fs.readFileSync(arquivo, "utf8");
  } catch {
    return "";
  }
}

function liberar() {
  process.exit(0);
}

function bloquear(motivo) {
  process.stdout.write(JSON.stringify({ decision: "block", reason: motivo }));
  process.exit(0);
}

let entrada = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (parte) => (entrada += parte));
process.stdin.on("end", () => {
  let input = {};
  try {
    input = JSON.parse(entrada || "{}");
  } catch {
    input = {};
  }

  const raiz = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
  const pasta = path.join(raiz, ".full-auto");
  if (!fs.existsSync(pasta)) liberar();

  const estado = ler(path.join(pasta, "ESTADO.md"));
  const tarefas = ler(path.join(pasta, "TAREFAS.md"));
  const arquivoHook = path.join(pasta, ".hook-state.json");

  const matchStatus = estado.match(/status:\s*`?([A-Z_]+)`?/i);
  const status = matchStatus ? matchStatus[1].toUpperCase() : "EXECUTANDO";
  if (STATUS_QUE_LIBERAM.includes(status)) {
    try { fs.unlinkSync(arquivoHook); } catch {}
    liberar();
  }

  const pendentes = (tarefas.match(/^\s*[-*]\s*\[( |~)\]/gm) || []).length;
  const bloqueadas = (tarefas.match(/^\s*[-*]\s*\[!\]/gm) || []).length;

  // Proteção contra loop infinito: se nada mudou entre bloqueios seguidos, deixa parar.
  const hash = crypto.createHash("sha1").update(estado + "\n" + tarefas).digest("hex");
  let memoria = { hash: "", repeticoes: 0 };
  try {
    memoria = JSON.parse(ler(arquivoHook)) || memoria;
  } catch {}
  const repeticoes = memoria.hash === hash ? memoria.repeticoes + 1 : 1;

  if (repeticoes > LIMITE_SEM_PROGRESSO) {
    try {
      fs.appendFileSync(
        path.join(pasta, "LOG.md"),
        `\n- ${new Date().toISOString()} hook: liberou a parada após ${LIMITE_SEM_PROGRESSO} bloqueios sem progresso\n`
      );
      fs.unlinkSync(arquivoHook);
    } catch {}
    liberar();
  }
  try {
    fs.writeFileSync(arquivoHook, JSON.stringify({ hash, repeticoes }));
  } catch {}

  if (pendentes > 0) {
    bloquear(
      `Full Automático: ainda há ${pendentes} tarefa(s) pendente(s) em .full-auto/TAREFAS.md` +
        (bloqueadas ? ` (${bloqueadas} bloqueada(s) marcada(s) com [!])` : "") +
        ". Releia .full-auto/ESTADO.md e continue a partir do próximo passo. " +
        "Não pare para perguntar ao Matheus: decida, registre em DECISOES.md e siga. " +
        "Se for extrema necessidade segundo references/escalacao.md, envie a mensagem de escalação e mude o status para AGUARDANDO_MATHEUS."
    );
  }

  bloquear(
    "Full Automático: não há tarefas pendentes, mas o status ainda não é CONCLUIDO. " +
      "Faça a verificação final, escreva .full-auto/RELATORIO-FINAL.md, mude ESTADO.md para status: CONCLUIDO e mande a mensagem final ao Matheus."
  );
});
