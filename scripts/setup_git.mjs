/**
 * SETUP GIT — assina seus commits neste projeto
 *
 * Problema que resolve:
 *   Somos mais de uma pessoa mexendo no mesmo repositório. Se o Git da
 *   máquina não estiver configurado, todo mundo commita com o mesmo nome
 *   (ou com nenhum), e depois ninguém sabe quem fez o quê. Isso não é só
 *   estética: sem autoria, não dá para pedir contexto de uma mudança nem
 *   revisar com segurança.
 *
 * O que faz:
 *   Configura `user.name` e `user.email` SÓ NESTE repositório
 *   (`git config --local`). Não encosta na configuração global da sua
 *   máquina, então seus outros projetos seguem como estão.
 *
 * Como rodar (uma vez por máquina, depois do npm install):
 *   npm run setup:git
 *     → pergunta o nome e o e-mail
 *
 *   npm run setup:git -- "Guilherme Lannes" guilhermelannes10@gmail.com
 *     → direto, sem perguntar
 *
 * O que ele NÃO faz: criar branch e mexer no que entra na main. Quem
 * decide o que vira main é a regra de proteção do GitHub — todo mundo
 * abre Pull Request, e só o admin aprova.
 */

import { execFileSync } from "child_process";
import { createInterface } from "readline/promises";
import { stdin, stdout } from "process";

// ── Helpers de git ──────────────────────────────────────────────────
function git(args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

// Consulta que pode falhar sem ser problema (ex.: config ainda não existe).
// Silencia o stderr do git para não poluir a tela com erro interno.
function gitTentar(args) {
  try {
    const saida = execFileSync("git", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return { ok: true, saida: saida.trim() };
  } catch {
    return { ok: false, saida: "" };
  }
}

function abortar(mensagem, dica) {
  console.error(`\n❌ ${mensagem}`);
  if (dica) console.error(`   ${dica}`);
  console.error("");
  process.exit(1);
}

// ── Validação ───────────────────────────────────────────────────────
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validarNome(valor) {
  const nome = (valor || "").trim().replace(/\s+/g, " ");
  if (nome.length < 2) return { erro: "O nome precisa ter pelo menos 2 letras." };
  if (nome.length > 60) return { erro: "O nome ficou longo demais (máximo 60 caracteres)." };
  if (/[<>\n\r]/.test(nome)) return { erro: "O nome não pode conter < > nem quebra de linha." };
  return { valor: nome };
}

function validarEmail(valor) {
  const email = (valor || "").trim();
  if (!EMAIL_RE.test(email)) return { erro: `E-mail inválido: "${valor}"` };
  if (email.length > 120) return { erro: "O e-mail ficou longo demais." };
  return { valor: email };
}

// ── Confere que estamos dentro do repositório ───────────────────────
if (!gitTentar(["rev-parse", "--git-dir"]).ok) {
  abortar(
    "Esta pasta não é um repositório Git.",
    "Rode o comando de dentro da pasta do projeto (a mesma do package.json)."
  );
}

// ── Coleta nome e e-mail ────────────────────────────────────────────
const [argNome, argEmail] = process.argv.slice(2);

let nome;
let email;

if (argNome || argEmail) {
  // Modo direto: os dois argumentos são obrigatórios juntos.
  if (!argNome || !argEmail) {
    abortar(
      "Passe o nome e o e-mail juntos.",
      'Exemplo: npm run setup:git -- "Guilherme Lannes" guilherme@exemplo.com'
    );
  }
  const n = validarNome(argNome);
  if (n.erro) abortar(n.erro);
  const e = validarEmail(argEmail);
  if (e.erro) abortar(e.erro);
  nome = n.valor;
  email = e.valor;
} else {
  // Modo pergunta. Sem terminal interativo (CI), não dá para perguntar.
  if (!stdin.isTTY) {
    abortar(
      "Sem terminal interativo para perguntar.",
      'Rode assim: npm run setup:git -- "Seu Nome" voce@exemplo.com'
    );
  }

  const nomeAtual = gitTentar(["config", "--local", "user.name"]).saida;
  const emailAtual = gitTentar(["config", "--local", "user.email"]).saida;

  if (nomeAtual || emailAtual) {
    console.log(`\nJá configurado neste projeto: ${nomeAtual || "(sem nome)"} <${emailAtual || "sem e-mail"}>`);
    console.log("Deixe em branco para manter.");
  }

  const rl = createInterface({ input: stdin, output: stdout });

  // Ctrl+C / Ctrl+D não devem despejar stack trace do Node na tela.
  const perguntar = async (texto) => {
    try {
      return await rl.question(texto);
    } catch {
      rl.close();
      console.log("\n\nCancelado. Nada foi alterado.\n");
      process.exit(130);
    }
  };

  try {
    console.log("\nComo você quer assinar seus commits neste projeto?\n");

    while (!nome) {
      const resposta = await perguntar(`  Nome  ${nomeAtual ? `[${nomeAtual}] ` : ""}: `);
      if (!resposta.trim() && nomeAtual) {
        nome = nomeAtual;
        break;
      }
      const r = validarNome(resposta);
      if (r.erro) console.log(`  ⚠️  ${r.erro}\n`);
      else nome = r.valor;
    }

    while (!email) {
      const resposta = await perguntar(`  E-mail${emailAtual ? ` [${emailAtual}]` : ""}: `);
      if (!resposta.trim() && emailAtual) {
        email = emailAtual;
        break;
      }
      const r = validarEmail(resposta);
      if (r.erro) console.log(`  ⚠️  ${r.erro}\n`);
      else email = r.valor;
    }
  } finally {
    rl.close();
  }
}

// ── Aplica — apenas neste repositório ───────────────────────────────
git(["config", "--local", "user.name", nome]);
git(["config", "--local", "user.email", email]);

console.log(`\n✅ Pronto. Seus commits neste projeto vão assinados como:\n`);
console.log(`     ${nome} <${email}>\n`);
console.log(`   Vale só nesta pasta — seus outros projetos não mudaram.`);

// ── Lembrete sobre a main ───────────────────────────────────────────
const branch = gitTentar(["rev-parse", "--abbrev-ref", "HEAD"]).saida;
const padrao = gitTentar(["symbolic-ref", "--short", "refs/remotes/origin/HEAD"]).saida.replace(/^origin\//, "") || "main";

if (branch === padrao) {
  console.log(
    `\n⚠️  Você está na "${padrao}". Crie uma branch antes de trabalhar:\n` +
      `     git checkout -b fix/nome-da-tarefa\n` +
      `   O que entra na "${padrao}" entra por Pull Request, aprovado pelo admin.\n`
  );
} else {
  console.log(`\n   Branch atual: ${branch}\n`);
}
