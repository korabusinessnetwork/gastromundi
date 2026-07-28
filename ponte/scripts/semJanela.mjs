// Ponte KORA — tira a janela preta do KoraPonte.exe (Leva 15).
//
// Roda logo depois do pkg, dentro do `npm run build:exe`:
//
//   pkg . --targets node22-win-x64 --output dist/KoraPonte.exe
//   node scripts/semJanela.mjs dist/KoraPonte.exe
//
// O pkg só sabe gerar programa de CONSOLE, e programa de console abre uma
// janela preta quando o cliente dá dois cliques. O dono pediu a ponte
// rodando em segundo plano — então trocamos, dentro do executável já
// pronto, dois bytes: o campo `Subsystem` do cabeçalho PE, de 3 (console)
// para 2 (janela/GUI). Nada é recompilado; o programa é o mesmo.
//
// A conta de onde esse campo fica e todas as validações moram em
// `lib/pe.js`, que tem teste. Aqui é só o encanamento: ler, conferir,
// escrever DOIS bytes (nunca reescrever os 58 MB) e contar o que aconteceu.
//
// Códigos de saída: 0 = deu certo (ou já estava sem janela), 1 = não mexemos
// no arquivo. Falhar alto é de propósito: um .exe meio-patcheado é um
// programa quebrado na mão do cliente.

import fs from "node:fs";
import path from "node:path";
import { patchSubsystem, SUBSYSTEM_GUI } from "../lib/pe.js";

const PADRAO = path.join("dist", "KoraPonte.exe");

function falhar(mensagem) {
  console.error(`[semJanela] ${mensagem}`);
  process.exit(1);
}

const caminho = path.resolve(process.argv[2] ?? PADRAO);

if (!fs.existsSync(caminho)) {
  falhar(`Não achei o executável em ${caminho}. Rode o pkg antes (npm run build:exe).`);
}

let conteudo;
try {
  conteudo = fs.readFileSync(caminho);
} catch (e) {
  falhar(`Não consegui ler ${caminho}: ${e.message}`);
}

const resultado = patchSubsystem(conteudo, SUBSYSTEM_GUI);

if (!resultado.ok) {
  falhar(`${resultado.erro} (arquivo: ${caminho}) — nada foi escrito.`);
}

if (!resultado.alterado) {
  console.log(`[semJanela] ${path.basename(caminho)} já estava sem janela (subsistema 2). Nada a fazer.`);
  process.exit(0);
}

// Só os dois bytes do campo: reescrever o arquivo inteiro seria jogar 58 MB
// no disco à toa e abrir uma janela de tempo em que o .exe está incompleto.
let fd;
try {
  fd = fs.openSync(caminho, "r+");
  const bytes = Buffer.alloc(2);
  bytes.writeUInt16LE(SUBSYSTEM_GUI, 0);
  fs.writeSync(fd, bytes, 0, 2, resultado.offset);
  fs.fsyncSync(fd); // garante que chegou no disco antes de dizermos que deu certo
} catch (e) {
  falhar(`Não consegui gravar em ${caminho}: ${e.message}`);
} finally {
  if (fd !== undefined) {
    try {
      fs.closeSync(fd);
    } catch {
      // Fechar já era o último passo; erro aqui não muda o que foi gravado.
    }
  }
}

console.log(
  `[semJanela] ${path.basename(caminho)}: subsistema ${resultado.de} → ${resultado.para} `
  + `(byte ${resultado.offset}). O programa agora roda em segundo plano, sem janela.`,
);
