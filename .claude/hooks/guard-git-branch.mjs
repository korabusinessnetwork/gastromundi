#!/usr/bin/env node
/**
 * PreToolUse hook — barra `git commit` / `git push` em branch que não é sua.
 *
 * O Claude Code executa este script antes de cada comando Bash. Sair com
 * código 2 bloqueia a chamada e devolve o motivo (stderr) para o modelo.
 * Diferente de uma instrução no CLAUDE.md, isto é determinístico: o modelo
 * não tem como "esquecer".
 */

import { validarBranch, alvosDoComando, branchAtual } from '../../scripts/git-guard/guard.mjs'

function lerStdin() {
  return new Promise((resolve) => {
    let dados = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (c) => (dados += c))
    process.stdin.on('end', () => resolve(dados))
    process.stdin.on('error', () => resolve(''))
  })
}

const bruto = await lerStdin()

let evento
try {
  evento = JSON.parse(bruto || '{}')
} catch {
  process.exit(0) // Sem payload legível não há o que barrar.
}

if (evento.tool_name !== 'Bash') process.exit(0)

const comando = evento.tool_input?.command || ''
const alvos = alvosDoComando(comando, branchAtual())
if (alvos.length === 0) process.exit(0)

const motivos = []
const jaVistos = new Set()

for (const alvo of alvos) {
  const chave = `${alvo.operacao}:${alvo.branch}`
  if (jaVistos.has(chave)) continue
  jaVistos.add(chave)

  const resultado = validarBranch(alvo.branch, { operacao: alvo.operacao })
  if (!resultado.ok) motivos.push(resultado.motivo)
}

if (motivos.length) {
  console.error('⛔ Guarda de branch: comando bloqueado.\n\n' + motivos.join('\n\n'))
  process.exit(2)
}

process.exit(0)
