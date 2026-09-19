#!/usr/bin/env node
// Vigia de limite do Full Automático.
// Quando o limite de uso do Claude acaba, este processo roda FORA do Claude Code
// e a cada X minutos tenta retomar a execução. Quando o limite volta, ele relança
// o Full Automático em modo headless e continua relançando até o projeto terminar.
//
// Uso: node vigia-limite.js <pasta-do-projeto> [--intervalo 10] [--max-horas 48] [--agora]
// Sem dependências. Windows, macOS e Linux.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");

const args = process.argv.slice(2);
const valor = (flag, padrao) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? Number(args[i + 1]) : padrao;
};
const projeto = path.resolve(args.find((a) => !a.startsWith("--") && isNaN(Number(a))) || ".");
const intervaloMin = valor("--intervalo", 10);
const maxHoras = valor("--max-horas", 48);
const comecarAgora = args.includes("--agora");

const pasta = path.join(projeto, ".full-auto");
const arquivoLock = path.join(pasta, ".vigia.lock");
const arquivoLog = path.join(pasta, "vigia.log");
const arquivoEstado = path.join(pasta, "ESTADO.md");
const arquivoTarefas = path.join(pasta, "TAREFAS.md");

const PROMPT = "/full-automatico continuar (executado pelo vigia de limite)";
const STATUS_FINAIS = ["CONCLUIDO", "AGUARDANDO_MATHEUS", "PAUSADO"];
const REGEX_LIMITE = /rate.?limit|usage limit|limit reached|limite|429|resets? (at|in)|too many requests/i;
const MAX_RODADAS_SEM_PROGRESSO = 3;

const ler = (a) => { try { return fs.readFileSync(a, "utf8"); } catch { return ""; } };
const agora = () => new Date().toISOString().replace("T", " ").slice(0, 19);
const log = (msg) => {
  const linha = `[${agora()}] ${msg}`;
  console.log(linha);
  try { fs.appendFileSync(arquivoLog, linha + "\n"); } catch {}
};
const dormir = (min) => new Promise((r) => setTimeout(r, min * 60 * 1000));
const status = () => {
  const m = ler(arquivoEstado).match(/status:\s*`?([A-Z_]+)`?/i);
  return m ? m[1].toUpperCase() : "EXECUTANDO";
};
const pendentes = () => (ler(arquivoTarefas).match(/^\s*[-*]\s*\[( |~)\]/gm) || []).length;
const assinatura = () => crypto.createHash("sha1").update(ler(arquivoEstado) + ler(arquivoTarefas)).digest("hex");

function processoVivo(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

function pegarLock() {
  if (fs.existsSync(arquivoLock)) {
    const pid = Number(ler(arquivoLock).trim());
    if (pid && pid !== process.pid && processoVivo(pid)) {
      console.log(`Já existe um vigia rodando (pid ${pid}). Saindo.`);
      process.exit(0);
    }
  }
  fs.writeFileSync(arquivoLock, String(process.pid));
}

function soltarLock() {
  try { if (Number(ler(arquivoLock).trim()) === process.pid) fs.unlinkSync(arquivoLock); } catch {}
}

function registrarNoEstado(texto) {
  const estado = ler(arquivoEstado);
  if (!estado) return;
  const linha = `- **Vigia de limite:** ${texto}`;
  const novo = /- \*\*Vigia de limite:\*\*.*$/m.test(estado)
    ? estado.replace(/- \*\*Vigia de limite:\*\*.*$/m, linha)
    : estado.trimEnd() + "\n" + linha + "\n";
  try { fs.writeFileSync(arquivoEstado, novo); } catch {}
}

function rodarClaude() {
  const cmd = `claude -p "${PROMPT}" --permission-mode auto --output-format json`;
  const r = spawnSync(cmd, {
    cwd: projeto,
    shell: true,
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, FULL_AUTO_VIGIA: "1" },
  });
  const saida = (r.stdout || "") + "\n" + (r.stderr || "");
  let json = null;
  try { json = JSON.parse((r.stdout || "").trim().split("\n").pop()); } catch {}
  const deuErro = r.status !== 0 || (json && json.is_error);
  const ehLimite = deuErro && REGEX_LIMITE.test(saida);
  return { deuErro, ehLimite, saida: saida.trim().slice(-500) };
}

async function main() {
  if (!fs.existsSync(pasta)) {
    console.log(`Não existe .full-auto/ em ${projeto}. Nada para vigiar.`);
    process.exit(0);
  }
  pegarLock();
  process.on("exit", soltarLock);
  process.on("SIGINT", () => process.exit(0));
  process.on("SIGTERM", () => process.exit(0));

  const fim = Date.now() + maxHoras * 60 * 60 * 1000;
  let semProgresso = 0;
  log(`Vigia iniciado. Checagem a cada ${intervaloMin} min, desiste após ${maxHoras} h.`);

  if (!comecarAgora) {
    registrarNoEstado(`limite atingido em ${agora()}, próxima checagem em ${intervaloMin} min`);
    await dormir(intervaloMin);
  }

  while (Date.now() < fim) {
    const st = status();
    if (STATUS_FINAIS.includes(st)) {
      log(`Status ${st}. Vigia encerrado.`);
      registrarNoEstado(`encerrado em ${agora()} (status ${st})`);
      return;
    }
    if (pendentes() === 0 && st === "EXECUTANDO") {
      log("Sem tarefas pendentes, relançando uma vez para o encerramento.");
    }

    const antes = assinatura();
    log("Tentando retomar a execução...");
    const r = rodarClaude();

    if (r.ehLimite) {
      log(`Limite ainda ativo. Nova checagem em ${intervaloMin} min.`);
      registrarNoEstado(`limite ainda ativo em ${agora()}, próxima checagem em ${intervaloMin} min`);
      await dormir(intervaloMin);
      continue;
    }
    if (r.deuErro) {
      log(`Erro que não é de limite, o vigia não resolve sozinho. Saída: ${r.saida}`);
      registrarNoEstado(`parou em ${agora()} por erro que não é de limite, ver .full-auto/vigia.log`);
      return;
    }

    // Rodou de verdade. Se ainda há trabalho, relança logo (cobre o teto de 8 continuações).
    semProgresso = assinatura() === antes ? semProgresso + 1 : 0;
    if (semProgresso >= MAX_RODADAS_SEM_PROGRESSO) {
      log(`${MAX_RODADAS_SEM_PROGRESSO} rodadas sem progresso. Vigia encerrado para não gastar limite à toa.`);
      registrarNoEstado(`parou em ${agora()} após rodadas sem progresso, ver .full-auto/vigia.log`);
      return;
    }
    log(`Rodada concluída. Status ${status()}, ${pendentes()} tarefa(s) pendente(s).`);
    registrarNoEstado(`ativo, última rodada em ${agora()}`);
  }

  log(`Passaram ${maxHoras} h. Vigia encerrado.`);
  registrarNoEstado(`encerrado em ${agora()} após ${maxHoras} h`);
}

main();
