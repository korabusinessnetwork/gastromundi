// Ponte KORA — montagem dos bytes ESC/POS (impressão térmica).
//
// Por que existe:
// - A impressora térmica não entende HTML nem PDF: ela lê um fluxo de bytes
//   com comandos ESC/POS ("limpe", "use a tabela X", texto, "corte o papel").
//   Este arquivo transforma linhas de texto já formatadas pelo app nesse fluxo.
// - Acentuação é o ponto delicado. `Buffer.from(texto, "latin1")` NÃO resolve:
//   a impressora, depois de `ESC t 2`, lê os bytes na tabela CP850 (DOS Latin-1),
//   onde "ç" é 0x87 e não 0xE7 (latin1). Sem a tradução, sai "AÃ§ai" na comanda.
//   Por isso a tabela abaixo é a fonte de verdade da acentuação impressa.
// - Nada aqui faz I/O: é função pura, nasce com teste (lib/escpos.test.js).
//   Quem fala com a impressora é lib/impressoras.js.

// Comandos ESC/POS usados (constantes exportadas para o teste conferir os bytes).
export const INICIALIZAR = Buffer.from([0x1b, 0x40]); // ESC @  — reset da impressora
export const SELECIONAR_CP850 = Buffer.from([0x1b, 0x74, 0x02]); // ESC t 2 — tabela CP850
export const CORTE_PARCIAL = Buffer.from([0x1d, 0x56, 0x41, 0x03]); // GS V A 3 — corte parcial

// Linhas em branco antes do corte: sem esse avanço a última linha fica presa
// dentro do mecanismo e o corte passa no meio do texto.
export const LINHAS_DE_AVANCO = 4;

// Limite defensivo por linha — a ponte é alimentada pela rede local.
export const MAX_CARACTERES_LINHA = 400;

// Tabela CP850 (DOS Latin-1), posições 0x80 a 0xFF, em ordem. Abaixo de 0x80
// a CP850 é igual ao ASCII, então só a metade alta precisa de mapa.
// Os dois invisíveis da última linha (U+00AD = hífen opcional, U+00A0 =
// espaço rígido) estão ali como caracteres de verdade, nas posições 0xF0 e
// 0xFF: são invisíveis no editor, então não apague sem perceber.
const CP850_ALTO = [
  "ÇüéâäàåçêëèïîìÄÅ", // 80-8F
  "ÉæÆôöòûùÿÖÜø£Ø×ƒ", // 90-9F
  "áíóúñÑªº¿®¬½¼¡«»", // A0-AF
  "░▒▓│┤ÁÂÀ©╣║╗╝¢¥┐", // B0-BF
  "└┴┬├─┼ãÃ╚╔╩╦╠═╬¤", // C0-CF
  "ðÐÊËÈıÍÎÏ┘┌█▄¦Ì▀", // D0-DF
  "ÓßÔÒõÕµþÞÚÛÙýÝ¯´", // E0-EF
  "­±‗¾¶§÷¸°¨·¹³²■ ", // F0-FF
].join("");

// Unicode → byte CP850 (só a metade alta; ASCII passa direto).
const PARA_CP850 = new Map();
for (let i = 0; i < CP850_ALTO.length; i += 1) {
  const caractere = CP850_ALTO[i];
  if (!PARA_CP850.has(caractere)) PARA_CP850.set(caractere, 0x80 + i);
}

// Caracteres que não existem na CP850 mas aparecem em texto colado do
// celular/cardápio. Viram um equivalente ASCII legível em vez de sumir.
const SUBSTITUTOS = new Map(Object.entries({
  "–": "-", // – travessão curto
  "—": "-", // — travessão longo
  "―": "-", // ―
  "−": "-", // − sinal de menos
  "‘": "'", // ‘ aspas simples curvas
  "’": "'", // ’
  "‚": "'", // ‚
  "“": '"', // “ aspas duplas curvas
  "”": '"', // ”
  "„": '"', // „
  "…": "...", // … reticências
  "•": "*", // • marcador
  "●": "*", // ●
  "→": "->", // →
  "←": "<-", // ←
  "≤": "<=", // ≤
  "≥": ">=", // ≥
  "≠": "!=", // ≠
  "€": "EUR", // €
  "™": "(TM)", // ™
  " ": " ", // separador de linha invisível
  " ": " ", // separador de parágrafo invisível
  "​": "", // espaço de largura zero (vem de copiar/colar)
  "﻿": "", // BOM colado junto com o texto
  "\t": " ", // tabulação vira espaço (nunca vai crua para a impressora)
}));

// Acentos combinantes (resultado do NFD) — descartados na 2ª tentativa,
// que é o que transforma "ǎ"/"ń" em letra base imprimível.
const COMBINANTES = /[̀-ͯ]/g;

function bytesDoCaractere(caractere, profundidade) {
  const cp = caractere.codePointAt(0);

  // Controle nunca vira byte de controle na impressora: viraria comando
  // ESC/POS solto e quebraria a impressão inteira. Só a tabulação tem
  // substituto; o resto é descartado. As quebras de linha são
  // responsabilidade de montarBytes(), não do texto da linha.
  if (cp < 0x20 || cp === 0x7f) {
    const substituto = SUBSTITUTOS.get(caractere);
    return substituto ? bytesDoTexto(substituto, 0) : [];
  }

  if (cp < 0x7f) return [cp]; // ASCII imprimível

  const direto = PARA_CP850.get(caractere);
  if (direto !== undefined) return [direto];

  if (profundidade > 0) {
    const substituto = SUBSTITUTOS.get(caractere);
    if (substituto !== undefined) return bytesDoTexto(substituto, profundidade - 1);

    // Última chance: separar a letra do acento e imprimir a letra base
    // (ex.: "ǎ" → "a"). Emoji e símbolos não decompõem e caem fora.
    const semAcento = caractere.normalize("NFD").replace(COMBINANTES, "");
    if (semAcento && semAcento !== caractere) return bytesDoTexto(semAcento, profundidade - 1);
  }

  return []; // sem equivalente (emoji, símbolo exótico) — descarta
}

function bytesDoTexto(texto, profundidade) {
  const bytes = [];
  // `for...of` percorre por code point: emoji (par substituto) não é
  // partido no meio, o que geraria bytes sem sentido.
  for (const caractere of texto) bytes.push(...bytesDoCaractere(caractere, profundidade));
  return bytes;
}

/**
 * Transliteração pura: texto Unicode → bytes CP850 imprimíveis.
 * Nunca devolve byte de controle (< 0x20) — nem para emoji, nem para lixo.
 *
 * @param {string} texto
 * @returns {Buffer}
 */
export function paraCp850(texto) {
  if (typeof texto !== "string" || texto === "") return Buffer.alloc(0);
  return Buffer.from(bytesDoTexto(texto.slice(0, MAX_CARACTERES_LINHA), 2));
}

/**
 * Monta o fluxo ESC/POS completo de um documento.
 *
 * Sequência: reset → tabela CP850 → linhas → avanço → corte (opcional).
 *
 * @param {string[]} linhas - texto já formatado (colunas, alinhamento etc.)
 * @param {{cortaPapel?: boolean}} [opcoes]
 * @returns {Buffer}
 */
export function montarBytes(linhas, { cortaPapel = true } = {}) {
  const partes = [INICIALIZAR, SELECIONAR_CP850];
  const quebra = Buffer.from([0x0a]); // LF — avança uma linha na térmica

  for (const linha of Array.isArray(linhas) ? linhas : []) {
    partes.push(paraCp850(typeof linha === "string" ? linha : String(linha ?? "")));
    partes.push(quebra);
  }

  partes.push(Buffer.alloc(LINHAS_DE_AVANCO, 0x0a));
  if (cortaPapel) partes.push(CORTE_PARCIAL);

  return Buffer.concat(partes);
}
