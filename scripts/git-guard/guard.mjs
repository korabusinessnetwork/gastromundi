#!/usr/bin/env node
/**
 * Guarda de branch — impede commit/push em branch que não é sua.
 *
 * Um único validador usado por dois gatilhos:
 *   - .claude/hooks/guard-git-branch.mjs  (PreToolUse do Claude Code)
 *   - .githooks/pre-push                  (git, para o que é digitado à mão)
 *
 * Identidade do dev (nesta ordem):
 *   1. variável de ambiente KORA_DEV
 *   2. git config --get kora.dev   (definido por `npm run setup:git`)
 *
 * Escape de emergência: KORA_ALLOW_ANY_BRANCH=1
 */

import { execFileSync } from 'node:child_process'
import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const BRANCHES_PROTEGIDAS = ['main', 'master']

// Branches das sessões do Claude Code na web nascem como `claude/...`.
const PREFIXOS_LIVRES = ['claude/']

export function lerIdentidade() {
  const doAmbiente = (process.env.KORA_DEV || '').trim().toLowerCase()
  if (doAmbiente) return doAmbiente

  try {
    const doGit = execFileSync('git', ['config', '--get', 'kora.dev'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    return doGit.trim().toLowerCase()
  } catch {
    return ''
  }
}

export function branchAtual() {
  try {
    return execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return ''
  }
}

function normalizar(branch) {
  return String(branch || '')
    .trim()
    .replace(/^refs\/heads\//, '')
}

/**
 * @returns {{ok: true} | {ok: false, motivo: string}}
 */
export function validarBranch(branch, { operacao = 'commit' } = {}) {
  const nome = normalizar(branch)
  const dev = lerIdentidade()

  if (!nome || nome === 'HEAD') return { ok: true }

  if (BRANCHES_PROTEGIDAS.includes(nome)) {
    return {
      ok: false,
      motivo:
        `A branch "${nome}" é protegida — ninguém dá ${operacao} direto nela.\n` +
        `Crie a sua branch e trabalhe nela:\n` +
        `  git switch -c ${dev || 'seu-nome'}/nome-da-tarefa\n` +
        `Depois abra um Pull Request para a main.`,
    }
  }

  if (process.env.KORA_ALLOW_ANY_BRANCH === '1') return { ok: true }

  if (PREFIXOS_LIVRES.some((p) => nome.startsWith(p))) return { ok: true }

  if (!dev) {
    return {
      ok: false,
      motivo:
        `Não sei quem é você, então não dá para saber se "${nome}" é sua branch.\n` +
        `Rode uma vez neste repositório:\n` +
        `  npm run setup:git -- seu-nome\n` +
        `(ex.: npm run setup:git -- bonato)`,
    }
  }

  if (nome.startsWith(`${dev}/`)) return { ok: true }

  return {
    ok: false,
    motivo:
      `A branch "${nome}" não é sua — você está configurado como "${dev}".\n` +
      `Só pode dar ${operacao} em branch que comece com "${dev}/".\n` +
      `Se o trabalho é seu, mude de branch:\n` +
      `  git switch -c ${dev}/nome-da-tarefa\n` +
      `Se você precisa mesmo mexer na branch de outra pessoa, combine com ela antes e rode o comando com KORA_ALLOW_ANY_BRANCH=1.`,
  }
}

// ---------------------------------------------------------------------------
// Leitura de comandos shell — descobre se um comando faz commit/push e em quê.
// ---------------------------------------------------------------------------

function tokenizar(segmento) {
  const tokens = []
  const regex = /"([^"\\]*(?:\\.[^"\\]*)*)"|'([^']*)'|(\S+)/g
  let m
  while ((m = regex.exec(segmento)) !== null) {
    tokens.push(m[1] ?? m[2] ?? m[3])
  }
  return tokens
}

const OPCOES_GLOBAIS_COM_VALOR = ['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--exec-path']

// Redirecionamentos (`>`, `>>`, `2>&1`, `< arquivo`) não fazem parte do comando
// git em si — sem tirá-los, `git push origin x 2>&1` vira "branch 2>".
const REDIRECIONAMENTO = /^\d*(?:>>|>|<)/

function limparRedirecionamentos(tokens) {
  const saida = []
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]
    if (REDIRECIONAMENTO.test(t)) {
      // Operador solto (`> arquivo`) consome o próximo token;
      // `>arquivo` e `2>&1` já vêm grudados.
      if (/^\d*(?:>>|>|<)$/.test(t)) i += 1
      continue
    }
    saida.push(t)
  }
  return saida
}

function subcomandoGit(tokens) {
  if (!tokens.length) return null
  const primeiro = tokens[0].replace(/\\/g, '/')
  if (primeiro !== 'git' && !primeiro.endsWith('/git') && !primeiro.endsWith('/git.exe')) return null

  let i = 1
  while (i < tokens.length) {
    const t = tokens[i]
    if (OPCOES_GLOBAIS_COM_VALOR.includes(t)) {
      i += 2
      continue
    }
    if (t.startsWith('-')) {
      i += 1
      continue
    }
    return { nome: t, args: tokens.slice(i + 1) }
  }
  return null
}

/** Branch de destino de um `git push`, ou null se for a branch atual. */
function destinosDoPush(args) {
  const posicionais = []
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '-o' || a === '--push-option' || a === '--repo' || a === '--receive-pack') {
      i += 1
      continue
    }
    if (a.startsWith('-')) continue
    posicionais.push(a)
  }
  // posicionais[0] é o remote; do segundo em diante são refspecs.
  const refspecs = posicionais.slice(1)
  return refspecs
    .map((ref) => {
      const alvo = ref.includes(':') ? ref.split(':').pop() : ref
      return normalizar(alvo)
    })
    .filter((b) => b && b !== 'HEAD')
}

/**
 * Remove o corpo de heredocs (`cat <<'EOF' ... EOF`). O que está lá dentro é
 * texto — documentação, mensagem, código —, não comando a ser executado.
 */
function removerHeredocs(comando) {
  const linhas = String(comando || '').split('\n')
  const saida = []
  let delimitador = null

  for (const linha of linhas) {
    if (delimitador !== null) {
      if (linha.trim() === delimitador) delimitador = null
      continue
    }

    const m = linha.match(/<<-?\s*(?:'([^']+)'|"([^"]+)"|([A-Za-z_][A-Za-z0-9_]*))/)
    if (m) {
      delimitador = m[1] ?? m[2] ?? m[3]
      saida.push(linha.slice(0, m.index))
      continue
    }

    saida.push(linha)
  }

  return saida.join('\n')
}

/**
 * Quebra o comando nos separadores do shell, ignorando os que estão dentro de
 * aspas — `echo "git commit"` não é um commit.
 */
function dividirSegmentos(comando) {
  const texto = String(comando || '')
  const segmentos = []
  let atual = ''
  let aspas = null

  for (let i = 0; i < texto.length; i++) {
    const c = texto[i]

    if (aspas) {
      atual += c
      if (c === '\\' && aspas === '"') {
        atual += texto[++i] ?? ''
      } else if (c === aspas) {
        aspas = null
      }
      continue
    }

    if (c === '"' || c === "'") {
      aspas = c
      atual += c
      continue
    }

    if (c === '\n' || c === ';' || c === '|' || c === '&' || c === '(' || c === ')') {
      segmentos.push(atual)
      atual = ''
      continue
    }

    atual += c
  }

  segmentos.push(atual)
  return segmentos
}

/**
 * Analisa uma linha de comando shell e devolve o que precisa ser validado.
 * @returns {Array<{operacao: string, branch: string}>}
 */
export function alvosDoComando(comando, branchCorrente) {
  const segmentos = dividirSegmentos(removerHeredocs(comando))
  const alvos = []

  for (const segmento of segmentos) {
    const sub = subcomandoGit(limparRedirecionamentos(tokenizar(segmento)))
    if (!sub) continue

    if (sub.nome === 'commit') {
      alvos.push({ operacao: 'commit', branch: branchCorrente })
    } else if (sub.nome === 'push') {
      const destinos = destinosDoPush(sub.args)
      if (destinos.length === 0) {
        alvos.push({ operacao: 'push', branch: branchCorrente })
      } else {
        for (const d of destinos) alvos.push({ operacao: 'push', branch: d })
      }
    }
  }

  return alvos
}

// ---------------------------------------------------------------------------
// CLI — usado pelo hook pre-push do git.
//   node scripts/git-guard/guard.mjs --ref refs/heads/foo [--ref ...]
// Sai com 1 e explica no stderr quando alguma branch é barrada.
// ---------------------------------------------------------------------------

const executadoDiretamente = (() => {
  try {
    return Boolean(process.argv[1]) && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
  } catch {
    return false
  }
})()

if (executadoDiretamente) {
  const refs = []
  const argv = process.argv.slice(2)
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--ref') refs.push(argv[i + 1])
  }

  const paraChecar = refs.length ? refs : [branchAtual()]
  const erros = []

  for (const ref of paraChecar) {
    const resultado = validarBranch(ref, { operacao: 'push' })
    if (!resultado.ok) erros.push(resultado.motivo)
  }

  if (erros.length) {
    console.error('\n⛔ push bloqueado pela guarda de branch\n')
    console.error(erros.join('\n\n'))
    console.error('')
    process.exit(1)
  }
  process.exit(0)
}
