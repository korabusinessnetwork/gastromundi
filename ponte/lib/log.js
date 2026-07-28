// Ponte KORA — diário de bordo em arquivo (Leva 15).
//
// Por que existe:
// - A partir da Leva 15 o `KoraPonte.exe` roda SEM janela de console (o
//   subsistema do executável virou GUI, ver `lib/pe.js`). Sem console,
//   `console.log` escreve num handle que não existe: a mensagem some. Pior,
//   em alguns casos escrever num handle inválido chega a derrubar o processo.
// - Só que o diagnóstico continua sendo necessário: "a comanda saiu?",
//   "a ponte subiu junto com o Windows?", "por que ela fechou sozinha?".
//   A resposta passa a morar num arquivo: `<dados>/ponte.log`.
// - Em desenvolvimento (`node servidor.js`) o console existe e é o jeito mais
//   rápido de acompanhar — então lá continua ecoando na tela também.
//
// Três regras que valem para tudo aqui:
// 1. NUNCA lança. Um erro ao gravar o log não pode derrubar a ponte; a
//    comanda do cliente vale mais do que a linha de log.
// 2. NUNCA grava segredo. O endereço do Palm carrega o token do
//    estabelecimento (`?t=...`); no arquivo ele vai mascarado. Log é arquivo
//    de texto que qualquer um com acesso ao PC lê, e o token é o que separa
//    "equipe do estabelecimento" de "qualquer aparelho no mesmo Wi-Fi".
// 3. NUNCA cresce sem fim. O PC do caixa fica ligado meses; um log sem poda
//    vira um arquivo de gigabytes. Passou do limite, o arquivo atual vira
//    `ponte.log.1` e um novo começa (guardamos uma geração, não mais).

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { EMPACOTADO } from "./instalacao.js";

export const NOME_ARQUIVO_LOG = "ponte.log";

/** Acima disso o arquivo é rotacionado. 256 KB dá semanas de operação. */
export const LIMITE_BYTES = 256 * 1024;

/** Quantos caracteres do segredo continuam visíveis (só para conferir "é esse mesmo?"). */
const PREFIXO_VISIVEL = 8;

let arquivoLog = null;
// Empacotado não tem console; em dev tem, e ver na hora ajuda quem desenvolve.
let ecoNoConsole = !EMPACOTADO;

/**
 * Diz onde o log deve ser gravado. Enquanto ninguém chamar, o log só ecoa no
 * console (é o estado em que os testes de outras partes rodam: sem lixo em
 * disco).
 *
 * @param {{dir?: string, arquivo?: string, eco?: boolean}} [opcoes]
 * @returns {string|null} caminho do arquivo de log em uso
 */
export function configurarLog({ dir, arquivo, eco } = {}) {
  if (typeof arquivo === "string" && arquivo) arquivoLog = arquivo;
  else if (typeof dir === "string" && dir) arquivoLog = path.join(dir, NOME_ARQUIVO_LOG);
  if (typeof eco === "boolean") ecoNoConsole = eco;
  return arquivoLog;
}

/**
 * Caminho do arquivo de log (para mostrar ao dono: "o que aconteceu está em…").
 * @returns {string|null}
 */
export function caminhoLog() {
  return arquivoLog;
}

/**
 * Esconde segredo dentro de um texto que vai para o arquivo.
 *
 * Dois casos, nesta ordem:
 * 1. `?t=...` / `&token=...` — o link do Palm, que é o caso real do banner.
 * 2. Qualquer sequência longa de hexadecimal solta (24+ caracteres) — rede de
 *    segurança para token colado numa mensagem de erro sem o `t=` na frente.
 *
 * Função pura: mesma entrada, mesma saída, sem tocar em disco.
 *
 * @param {string} texto
 * @returns {string}
 */
export function mascararSegredos(texto) {
  if (typeof texto !== "string" || !texto) return "";
  return texto
    .replace(/([?&](?:t|token)=)([^\s&"'<>]+)/gi, (_, chave, valor) => `${chave}${encurtar(valor)}`)
    .replace(/\b[0-9a-f]{24,}\b/gi, (valor) => encurtar(valor));
}

function encurtar(valor) {
  return valor.length <= PREFIXO_VISIVEL ? valor : `${valor.slice(0, PREFIXO_VISIVEL)}…`;
}

/**
 * Monta a linha final do log: horário ISO + mensagem já mascarada, tudo numa
 * linha só (quebra de linha vira espaço — um evento por linha é o que torna o
 * arquivo legível e pesquisável).
 *
 * Função pura, com relógio injetável para o teste.
 *
 * @param {string} mensagem
 * @param {Date|string} [agora]
 * @returns {string}
 */
export function linhaLog(mensagem, agora = new Date()) {
  const quando = agora instanceof Date ? agora.toISOString() : String(agora);
  const corpo = mascararSegredos(String(mensagem ?? "")).replace(/[\r\n]+/g, " ").trim();
  return `${quando}  ${corpo}`;
}

/**
 * Passou do limite? O arquivo atual vira `.1` e um novo começa.
 * Falha aqui é silenciosa de propósito: se o Windows estiver com o arquivo
 * travado, é melhor continuar gravando num log grande do que perder a linha.
 */
function podar() {
  try {
    if (fs.statSync(arquivoLog).size < LIMITE_BYTES) return;
    const anterior = `${arquivoLog}.1`;
    fs.rmSync(anterior, { force: true });
    fs.renameSync(arquivoLog, anterior);
  } catch {
    // Arquivo ainda não existe (statSync falhou) ou está travado — segue.
  }
}

function escrever(linha) {
  if (ecoNoConsole) {
    try {
      console.log(linha);
    } catch {
      // Sem console (empacotado), escrever nele falha — e não é problema.
    }
  }
  if (!arquivoLog) return;
  try {
    podar();
    fs.appendFileSync(arquivoLog, linha + os.EOL, "utf8");
  } catch {
    // Disco cheio, pasta sumiu, permissão negada: a ponte continua servindo
    // pedido e imprimindo. Log nunca derruba a operação.
  }
}

/**
 * Registra um acontecimento normal (subiu, pedido chegou, comanda saiu).
 * @param {string} mensagem
 */
export function logar(mensagem) {
  escrever(linhaLog(mensagem));
}

/**
 * Registra uma falha. O `erro` entra como texto curto (mensagem + código),
 * nunca o objeto inteiro — pilha de chamada não ajuda quem lê o log no caixa.
 *
 * @param {string} mensagem o que estava sendo feito, em português
 * @param {unknown} [erro] o erro que veio
 */
export function logarErro(mensagem, erro) {
  const detalhe = erro instanceof Error
    ? `${erro.message}${erro.code ? ` [${erro.code}]` : ""}`
    : (erro === undefined || erro === null ? "" : String(erro));
  escrever(linhaLog(detalhe ? `${mensagem}: ${detalhe}` : String(mensagem)));
}
