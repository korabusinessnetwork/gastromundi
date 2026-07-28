// Ponte KORA — leitura/edição do cabeçalho PE do executável (Leva 15).
//
// Por que existe:
// - O `KoraPonte.exe` é gerado pelo pkg, que só sabe produzir programa de
//   CONSOLE. Programa de console abre uma janela preta no Windows, e o dono
//   pediu que a ponte rode em segundo plano, sem janela nenhuma.
// - Quem manda nisso é UM campo de 2 bytes dentro do executável: `Subsystem`,
//   no "optional header" do formato PE (o formato de todo .exe do Windows).
//   Valor 3 = CONSOLE (abre janela), valor 2 = GUI (não abre). Trocar esse
//   número desliga a janela sem recompilar nada e sem dependência nova.
// - Aqui mora só a ARITMÉTICA de onde esse campo está e a validação de que o
//   arquivo realmente é o que dizemos. Quem lê/grava o arquivo é
//   `scripts/semJanela.mjs`. Assim a parte que pode errar tem teste, e o
//   teste não precisa de um .exe de 58 MB — monta um cabeçalho de mentira.
//
// Mapa do caminho até o campo (tudo little-endian):
//
//   0x00  "MZ"                    assinatura do cabeçalho DOS antigo
//   0x3C  e_lfanew (uint32)  ───►  posição do cabeçalho PE de verdade
//   e_lfanew + 0   "PE\0\0"        assinatura (4 bytes)
//   e_lfanew + 4   cabeçalho COFF  (20 bytes: máquina, nº de seções, etc.)
//   e_lfanew + 24  optional header ───► começa aqui
//                   + 0   Magic (uint16): 0x20B = PE32+ (64 bits)
//                   + 68  Subsystem (uint16)  ◄── o campo que interessa
//
// Nada aqui lança: toda função devolve `{ok:true, ...}` ou `{ok:false, erro}`,
// no mesmo contrato do resto da ponte. Escrever às cegas num binário de 58 MB
// seria estragar o programa do cliente — por isso a validação vem antes.

/** Programa de console: o Windows cria uma janela preta para ele. */
export const SUBSYSTEM_CONSOLE = 3;

/** Programa de janela (GUI): roda sem console. É o que a ponte quer ser. */
export const SUBSYSTEM_GUI = 2;

const OFFSET_E_LFANEW = 0x3c;
const TAMANHO_ASSINATURA_PE = 4;
const TAMANHO_CABECALHO_COFF = 20;
const OFFSET_SUBSYSTEM_NO_OPTIONAL = 68;
const MAGIC_PE32_MAIS = 0x20b;

// Maior deslocamento aceito para o cabeçalho PE. Num .exe real esse número
// é pequeno (algumas centenas de bytes); um valor absurdo é sinal de arquivo
// corrompido ou de que estamos lendo algo que não é executável.
const MAX_E_LFANEW = 1024 * 1024;

/**
 * Onde está o campo `Subsystem` dentro do arquivo.
 *
 * @param {Buffer|Uint8Array} buffer conteúdo do executável (ou só o começo dele)
 * @returns {{ok: true, offset: number, offsetOptional: number} | {ok: false, erro: string}}
 */
export function offsetSubsystem(buffer) {
  if (!buffer || typeof buffer.length !== "number" || typeof buffer.readUInt32LE !== "function") {
    return { ok: false, erro: "Nada para conferir: o conteúdo do executável não chegou como Buffer." };
  }
  if (buffer.length < OFFSET_E_LFANEW + 4) {
    return { ok: false, erro: "O arquivo é curto demais para ser um executável do Windows." };
  }
  // "MZ" — o cabeçalho DOS que todo .exe do Windows carrega desde os anos 80.
  if (buffer[0] !== 0x4d || buffer[1] !== 0x5a) {
    return { ok: false, erro: "O arquivo não começa com \"MZ\" — não é um executável do Windows." };
  }

  const eLfanew = buffer.readUInt32LE(OFFSET_E_LFANEW);
  if (eLfanew <= 0 || eLfanew > MAX_E_LFANEW) {
    return { ok: false, erro: `O ponteiro para o cabeçalho PE veio fora do razoável (${eLfanew}) — arquivo corrompido.` };
  }

  const offsetOptional = eLfanew + TAMANHO_ASSINATURA_PE + TAMANHO_CABECALHO_COFF;
  const offset = offsetOptional + OFFSET_SUBSYSTEM_NO_OPTIONAL;
  if (buffer.length < offset + 2) {
    return { ok: false, erro: "O arquivo termina antes do campo que precisamos trocar — arquivo incompleto." };
  }

  // "PE\0\0" — se não bater, o e_lfanew apontou para lugar nenhum.
  const assinaturaOk = buffer[eLfanew] === 0x50
    && buffer[eLfanew + 1] === 0x45
    && buffer[eLfanew + 2] === 0x00
    && buffer[eLfanew + 3] === 0x00;
  if (!assinaturaOk) {
    return { ok: false, erro: "Não achamos a assinatura \"PE\" no lugar esperado — o arquivo não é um executável PE." };
  }

  const magic = buffer.readUInt16LE(offsetOptional);
  if (magic !== MAGIC_PE32_MAIS) {
    return {
      ok: false,
      erro: `O executável não é 64 bits (magic 0x${magic.toString(16).toUpperCase()}, esperado 0x20B). O alvo do pkg deve ser node22-win-x64.`,
    };
  }

  return { ok: true, offset, offsetOptional };
}

/**
 * Lê o valor atual do `Subsystem`.
 *
 * @param {Buffer|Uint8Array} buffer
 * @returns {{ok: true, valor: number, offset: number} | {ok: false, erro: string}}
 */
export function lerSubsystem(buffer) {
  const local = offsetSubsystem(buffer);
  if (!local.ok) return local;
  return { ok: true, valor: buffer.readUInt16LE(local.offset), offset: local.offset };
}

/**
 * Escreve um novo `Subsystem` DENTRO do buffer recebido (altera no lugar).
 *
 * Só aceita trocar entre CONSOLE(3) e GUI(2): qualquer outro valor atual é
 * sinal de que estamos mexendo num arquivo que não é o nosso .exe, e aí a
 * resposta certa é parar, não "consertar".
 *
 * @param {Buffer} buffer conteúdo do executável — é modificado no lugar
 * @param {number} [valor] novo valor (padrão: GUI)
 * @returns {{ok: true, alterado: boolean, de: number, para: number, offset: number} | {ok: false, erro: string}}
 */
export function patchSubsystem(buffer, valor = SUBSYSTEM_GUI) {
  if (valor !== SUBSYSTEM_GUI && valor !== SUBSYSTEM_CONSOLE) {
    return { ok: false, erro: `Valor de subsistema não suportado (${valor}). Só trocamos entre 2 (sem janela) e 3 (com janela).` };
  }

  const leitura = lerSubsystem(buffer);
  if (!leitura.ok) return leitura;

  if (leitura.valor !== SUBSYSTEM_GUI && leitura.valor !== SUBSYSTEM_CONSOLE) {
    return {
      ok: false,
      erro: `O executável está com subsistema ${leitura.valor}, que não é console(3) nem janela(2). Não vamos escrever num arquivo que não reconhecemos.`,
    };
  }

  if (leitura.valor === valor) {
    return { ok: true, alterado: false, de: leitura.valor, para: valor, offset: leitura.offset };
  }

  buffer.writeUInt16LE(valor, leitura.offset);
  return { ok: true, alterado: true, de: leitura.valor, para: valor, offset: leitura.offset };
}
