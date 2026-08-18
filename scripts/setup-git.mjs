#!/usr/bin/env node
/**
 * Configuração de git por pessoa — rode uma vez por máquina:
 *
 *   npm run setup:git -- bonato
 *
 * Faz duas coisas neste repositório (config local, não vai para o GitHub):
 *   1. grava quem você é   (git config kora.dev)
 *   2. liga os hooks versionados (core.hooksPath = .githooks)
 */

import { execFileSync } from 'node:child_process'
import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'

function normalizar(nome) {
  return String(nome || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9-]/g, '')
}

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim()
}

let nome = normalizar(process.argv[2])

if (!nome) {
  const rl = createInterface({ input: stdin, output: stdout })
  const resposta = await rl.question('Qual é o seu nome de dev? (ex.: bonato, matheus, guilherme): ')
  rl.close()
  nome = normalizar(resposta)
}

if (!nome) {
  console.error('\n⛔ Nome vazio. Rode de novo: npm run setup:git -- seu-nome\n')
  process.exit(1)
}

git('config', '--local', 'kora.dev', nome)
git('config', '--local', 'core.hooksPath', '.githooks')

console.log(`
✅ Pronto, ${nome}.

O que ficou configurado neste repositório:
  • você é "${nome}" — suas branches devem começar com "${nome}/"
  • hooks ligados: commit e push em branch de outra pessoa ficam bloqueados
  • main e master ficam bloqueadas para commit/push direto

Como trabalhar a partir de agora:
  git switch main && git pull
  git switch -c ${nome}/nome-da-tarefa
  ...trabalhe, commite...
  git push -u origin ${nome}/nome-da-tarefa
  ...e abra um Pull Request para a main.

Precisa mexer na branch de outra pessoa (combinado com ela)? Só naquele comando:
  KORA_ALLOW_ANY_BRANCH=1 git push
`)
