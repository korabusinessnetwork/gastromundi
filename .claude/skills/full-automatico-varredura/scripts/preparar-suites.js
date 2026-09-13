#!/usr/bin/env node
/**
 * preparar-suites.js
 *
 * Le .full-auto/varredura/SUITES.json, valida o isolamento entre as suites e
 * prepara o ambiente de cada frente: worktree propria, branch propria, pasta de
 * evidencias e um AMBIENTE-SUITE.md com porta, banco e usuarios.
 *
 * Uso:
 *   node preparar-suites.js <pasta-do-projeto> [--dry-run] [--limpar]
 *
 *   --dry-run  so valida e imprime o plano, nao cria nada
 *   --limpar   remove as worktrees das suites da onda (depois do merge)
 *
 * Sem dependencias externas.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const args = process.argv.slice(2);
const alvo = path.resolve(args.find((a) => !a.startsWith('--')) || '.');
const dryRun = args.includes('--dry-run');
const limpar = args.includes('--limpar');

const arquivoSuites = path.join(alvo, '.full-auto', 'varredura', 'SUITES.json');

function sair(msg) {
  console.error(`ERRO: ${msg}`);
  process.exit(1);
}

function git(cwd, ...cmd) {
  return execFileSync('git', cmd, { cwd, encoding: 'utf8' }).trim();
}

// sem trim: o status porcelain usa a coluna 1 e 2 para o estado do arquivo
function gitRaw(cwd, ...cmd) {
  return execFileSync('git', cmd, { cwd, encoding: 'utf8' });
}

if (!fs.existsSync(arquivoSuites)) {
  sair(`nao achei ${arquivoSuites}. Escreva o particionamento antes de preparar as frentes.`);
}

let config;
try {
  config = JSON.parse(fs.readFileSync(arquivoSuites, 'utf8'));
} catch (e) {
  sair(`SUITES.json invalido: ${e.message}`);
}

const suites = Array.isArray(config.suites) ? config.suites : [];
if (suites.length === 0) sair('SUITES.json nao tem nenhuma suite.');
if (suites.length > 10) sair(`${suites.length} suites. O teto e 10 frentes simultaneas, quebre em mais ondas.`);

// --- validacao de isolamento -------------------------------------------------

const erros = [];
const visto = { id: new Map(), porta: new Map(), banco: new Map(), fluxo: new Map() };

function checarUnico(tipo, valor, suiteId) {
  if (valor === undefined || valor === null || valor === '') return;
  const chave = String(valor);
  if (visto[tipo].has(chave)) {
    erros.push(`${tipo} "${chave}" repetido entre as suites "${visto[tipo].get(chave)}" e "${suiteId}"`);
  } else {
    visto[tipo].set(chave, suiteId);
  }
}

for (const s of suites) {
  if (!s.id) erros.push('suite sem "id"');
  checarUnico('id', s.id, s.id);
  checarUnico('porta', s.porta_front, s.id);
  checarUnico('porta', s.porta_api, s.id);
  checarUnico('banco', s.banco, s.id);
  if (!s.banco) erros.push(`suite "${s.id}" sem "banco" proprio, isso mistura dado entre frentes`);
  if (!Array.isArray(s.fluxos) || s.fluxos.length === 0) erros.push(`suite "${s.id}" sem fluxos`);
  if (Array.isArray(s.fluxos) && s.fluxos.length > 8) {
    erros.push(`suite "${s.id}" tem ${s.fluxos.length} fluxos, o limite e 8, quebre em duas`);
  }
  for (const f of s.fluxos || []) checarUnico('fluxo', f, s.id);
}

if (erros.length) {
  console.error('Isolamento invalido, nada foi criado:');
  for (const e of erros) console.error(`  - ${e}`);
  process.exit(1);
}

console.log(`Onda ${config.onda ?? '?'}: ${suites.length} suites validadas.`);
for (const s of suites) {
  console.log(
    `  ${s.id.padEnd(14)} fluxos=${(s.fluxos || []).join(',').padEnd(20)} front=${s.porta_front ?? '-'} api=${s.porta_api ?? '-'} banco=${s.banco}`
  );
}

if (dryRun) {
  console.log('\n--dry-run, nada foi criado.');
  process.exit(0);
}

// --- git ---------------------------------------------------------------------

let raiz;
try {
  raiz = git(alvo, 'rev-parse', '--show-toplevel');
} catch {
  sair('a pasta nao e um repositorio git. Rode git init e faca o commit base antes.');
}

// .full-auto/ e area de estado do maestro, muda o tempo todo e nao vai para as frentes.
const sujo = gitRaw(raiz, 'status', '--porcelain')
  .split('\n')
  .filter((l) => l.trim() && !l.slice(3).startsWith('.full-auto/'));
if (sujo.length && !limpar) {
  console.error('Arquivos com mudanca nao commitada:');
  for (const l of sujo) console.error(`  ${l}`);
  sair('faca commit do ambiente e do seed antes do fan-out, as frentes partem do commit base.');
}

function resolverBase(valor) {
  if (!valor || valor.includes('<')) return git(raiz, 'rev-parse', 'HEAD');
  try {
    return git(raiz, 'rev-parse', '--verify', `${valor}^{commit}`);
  } catch {
    console.log(`commit_base "${valor}" nao existe neste repositorio, usando HEAD.`);
    return git(raiz, 'rev-parse', 'HEAD');
  }
}

const base = resolverBase(config.commit_base);
const nomeRepo = path.basename(raiz);
const pastaWorktrees = path.resolve(raiz, '..');

if (limpar) {
  for (const s of suites) {
    const wt = path.join(pastaWorktrees, `${nomeRepo}-qa-${s.id}`);
    try {
      git(raiz, 'worktree', 'remove', wt, '--force');
      console.log(`removida worktree ${wt}`);
    } catch (e) {
      console.log(`nao removi ${wt}: ${e.message.split('\n')[0]}`);
    }
  }
  process.exit(0);
}

// --- preparar cada suite -----------------------------------------------------

for (const s of suites) {
  const branch = `varredura/qa-${s.id}`;
  const wt = path.join(pastaWorktrees, `${nomeRepo}-qa-${s.id}`);

  if (fs.existsSync(wt)) {
    console.log(`worktree ja existe, pulei: ${wt}`);
  } else {
    try {
      git(raiz, 'worktree', 'add', '-b', branch, wt, base);
      console.log(`worktree criada: ${wt} (${branch})`);
    } catch (e) {
      console.error(`falhei em criar a worktree de "${s.id}": ${e.message.split('\n')[0]}`);
      continue;
    }
  }

  const pastaSuite = path.join(raiz, '.full-auto', 'varredura', 'suites', s.id);
  fs.mkdirSync(path.join(pastaSuite, 'evidencias'), { recursive: true });

  const ambiente = [
    `# Ambiente da suite ${s.id}`,
    '',
    `Commit base: ${base}`,
    `Branch: ${branch}`,
    `Worktree: ${wt}`,
    `Porta front: ${s.porta_front ?? '-'} | Porta API: ${s.porta_api ?? '-'}`,
    `Banco: ${s.banco}`,
    `Criticidade: ${s.criticidade ?? '-'} | Modelo: ${s.modelo ?? '-'}`,
    '',
    `## Fluxos desta suite`,
    '',
    ...(s.fluxos || []).map((f) => `- ${f}`),
    '',
    `## Usuarios de teste`,
    '',
    ...((s.usuarios || []).map((u) => `- ${u}`)),
    '',
    `## Prefixo de dados`,
    '',
    `${s.dados || 'definir prefixo proprio antes de criar qualquer registro'}`,
    '',
    `## Regras`,
    '',
    '- So escrever em tests/ e na pasta desta suite. Nenhum arquivo de producao e alterado.',
    '- Nao alterar package.json, lockfile, migrations, rotas centrais nem .full-auto/ da copia principal.',
    '- Nao sair da porta e do banco desta suite. Nao usar credencial real nem apontar para producao.',
    '- Toda falha e reproduzida 3 vezes antes de virar bug.',
    '- Entregar RELATORIO.md nesta pasta, no formato do template.',
    '',
  ].join('\n');

  fs.writeFileSync(path.join(pastaSuite, 'AMBIENTE-SUITE.md'), ambiente);
  console.log(`  ambiente escrito em ${path.relative(raiz, pastaSuite)}/AMBIENTE-SUITE.md`);
}

console.log('\nPronto. Despache todas as frentes no mesmo bloco de chamadas, senao elas rodam em fila.');
