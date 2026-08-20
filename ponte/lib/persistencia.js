// Ponte KORA — os arquivos que guardam o serviço do dia.
//
// Aqui mora tudo que a ponte grava e lê no disco do PC do caixa: o token do
// estabelecimento, a fila de pedidos do Palm, o catálogo e a fila de impressão.
//
// Por que virou módulo próprio (antes eram duas funções soltas no servidor):
// - Gravar em disco no Windows falha de verdade e com frequência: o antivírus
//   segura o arquivo temporário por um instante (EBUSY), o disco enche
//   (ENOSPC), a pasta perde permissão depois de uma atualização (EPERM). Do
//   jeito antigo, qualquer um desses erros subia por dentro de uma rota e
//   DERRUBAVA A PONTE INTEIRA — o restaurante ficava sem sistema por causa de
//   um pedido. Agora a falha vira um erro explicado, que a rota responde ao
//   garçom ("não consegui salvar, tente de novo").
// - Ler um arquivo corrompido também não pode mais ser silencioso. Antes, um
//   `pedidos.json` estragado zerava a fila sem uma linha de aviso, e um
//   `config.json` estragado fazia a ponte inventar um token novo — o que
//   quebra o link do Palm de TODOS os garçons de uma vez, sem ninguém
//   entender o motivo. Agora o arquivo com defeito é guardado de lado e o
//   estrago fica escrito no ponte.log, em português.
//
// Duas regras que valem para tudo aqui:
// 1. Ler NUNCA lança — no máximo devolve o padrão, sempre falando no log.
// 2. Gravar SEMPRE lança quando não deu certo — quem chamou precisa saber que
//    o pedido não está guardado, para poder avisar quem está esperando.

import fs from "node:fs";
import path from "node:path";
import { logar, logarErro } from "./log.js";

/**
 * Nome do arquivo de quarentena para um arquivo que veio corrompido.
 *
 * Guardamos com carimbo de hora em vez de apagar: é a única evidência do que
 * aconteceu (o suporte consegue olhar depois) e, com nome novo, a ponte não
 * tropeça no mesmo arquivo estragado a cada vez que liga.
 *
 * Função pura. Sem `:` no nome, que o Windows não aceita em arquivo.
 *
 * @param {string} arquivo caminho do arquivo original
 * @param {Date|string} [agora]
 * @returns {string}
 */
export function nomeDoCorrompido(arquivo, agora = new Date()) {
  const quando = (agora instanceof Date ? agora.toISOString() : String(agora)).replace(/[:.]/g, "-");
  return `${arquivo}.corrompido-${quando}`;
}

/**
 * Lê um JSON do disco. Nunca lança: na dúvida devolve o padrão.
 *
 * Três caminhos, e cada um fala uma coisa diferente:
 * - Arquivo ainda não existe: é o primeiro dia da ponte neste PC. Silêncio.
 * - Não deu para ler (permissão, disco): entra no log, segue com o padrão.
 * - Conteúdo estragado: o arquivo é posto de lado com carimbo de hora e o
 *   ponte.log recebe uma linha em ATENÇÃO dizendo o que o dono perdeu.
 *
 * @param {string} arquivo
 * @param {*} padrao valor devolvido quando não deu para ler
 * @param {{oQuePerde?: string}} [opcoes] frase, em português, do que isso custa
 *   ao restaurante — vai para o log junto do aviso.
 */
export function lerJson(arquivo, padrao, { oQuePerde = "" } = {}) {
  const nome = path.basename(arquivo);

  let bruto;
  try {
    bruto = fs.readFileSync(arquivo, "utf8");
  } catch (e) {
    // Arquivo que ainda não existe é o caso normal do primeiro início.
    if (e?.code !== "ENOENT") {
      logarErro(`não consegui ler ${nome} — segui com o valor padrão`, e);
    }
    return padrao;
  }

  try {
    return JSON.parse(bruto);
  } catch (e) {
    const guardado = porDeLado(arquivo);
    logar(
      `ATENÇÃO: o arquivo ${nome} está corrompido e não pôde ser lido.`
      + (oQuePerde ? ` ${oQuePerde}` : "")
      + (guardado ? ` O arquivo com defeito foi guardado como ${path.basename(guardado)}.` : ""),
    );
    logarErro(`detalhe técnico de ${nome}`, e);
    return padrao;
  }
}

/**
 * Tira o arquivo estragado do caminho. Se nem renomear der certo, avisa e
 * segue: ler não pode derrubar a ponte de jeito nenhum.
 *
 * @returns {string|null} o novo caminho, ou null se não deu
 */
function porDeLado(arquivo) {
  const destino = nomeDoCorrompido(arquivo);
  try {
    fs.renameSync(arquivo, destino);
    return destino;
  } catch (e) {
    logarErro(`não consegui guardar de lado o arquivo corrompido ${path.basename(arquivo)}`, e);
    return null;
  }
}

/**
 * Grava um JSON de forma que uma queda de luz no meio não deixe o arquivo
 * pela metade: escreve num `.tmp`, MANDA O DISCO CONFIRMAR que os bytes
 * chegaram (fsync) e só então troca de nome por cima do original. Sem o
 * fsync, o rename é atômico só no nome — o conteúdo ainda podia estar em
 * cache e sumir na queda, que é exatamente o que a gente quer evitar.
 *
 * Lança quando não deu — de propósito. Quem chamou precisa responder a quem
 * está esperando, em vez de o pedido sumir calado.
 *
 * @param {string} arquivo
 * @param {*} dados
 * @throws {Error} mensagem em português, com o erro técnico já no ponte.log
 */
export function gravarJson(arquivo, dados) {
  const nome = path.basename(arquivo);
  const tmp = `${arquivo}.tmp`;
  let fd = null;

  try {
    fd = fs.openSync(tmp, "w");
    fs.writeFileSync(fd, JSON.stringify(dados));
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = null;
    fs.renameSync(tmp, arquivo);
    // A troca de nome também precisa chegar ao disco. Nem todo sistema deixa
    // fazer isso com pasta (o Windows não deixa) — lá dentro é ignorado.
    sincronizarPasta(path.dirname(arquivo));
  } catch (e) {
    if (fd !== null) {
      try { fs.closeSync(fd); } catch { /* já estava fechado */ }
    }
    // O meio-arquivo não pode ficar para trás confundindo a próxima gravação.
    try { fs.rmSync(tmp, { force: true }); } catch { /* some na próxima */ }

    logarErro(`não consegui gravar ${nome} em ${path.dirname(arquivo)}`, e);
    const erro = new Error(`Não consegui salvar ${nome} no disco deste computador.`);
    erro.code = e?.code;
    erro.causa = e;
    throw erro;
  }
}

function sincronizarPasta(dir) {
  let fd = null;
  try {
    fd = fs.openSync(dir, "r");
    fs.fsyncSync(fd);
  } catch {
    // Windows não deixa abrir pasta como arquivo, e alguns sistemas de
    // arquivo não têm o que sincronizar. O arquivo em si já foi garantido.
  } finally {
    if (fd !== null) {
      try { fs.closeSync(fd); } catch { /* nada a fazer */ }
    }
  }
}
