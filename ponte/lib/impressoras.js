// Ponte KORA — conversa com as impressoras (única parte com I/O de sistema).
//
// Por que existe:
// - O navegador não fala com impressora térmica. Era isso que o QZ Tray
//   fazia — um programa Java pago/assinado no meio do caminho. Como a ponte
//   já roda no PC do caixa, ela mesma faz esse papel, de graça e sem
//   instalar nada além do Node que já é necessário.
// - Dois caminhos cobrem o parque de impressoras dos restaurantes:
//   * "rede"    → a impressora tem IP e escuta RAW na 9100 (socket puro).
//   * "windows" → a impressora está instalada no Windows; mandamos os bytes
//                 crus pelo spooler via winspool.drv (OpenPrinter →
//                 StartDocPrinter com datatype RAW → WritePrinter). Sem RAW
//                 o driver "desenharia" o texto e a térmica cuspiria lixo.
// - Zero dependência npm: PowerShell (que já vem no Windows) hospeda o
//   P/Invoke, e o Node só orquestra. Nada aqui é puro, então a regra de
//   negócio (fila, backoff) mora em filaImpressao.js, que tem teste.

import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

const EH_WINDOWS = process.platform === "win32";

export const TIMEOUT_LISTAR_MS = 15000;
export const TIMEOUT_ENVIO_MS = 20000;
export const TIMEOUT_REDE_MS = 10000;

const POWERSHELL_BASE = ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass"];

// Consulta fixa (nenhum dado do usuário entra aqui). O OutputEncoding em
// UTF-8 é o que preserva acento no nome ("Impressora Térmica").
const COMANDO_LISTAR =
  "[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; " +
  "Get-CimInstance -ClassName Win32_Printer | Select-Object Name,Default | ConvertTo-Json -Depth 3";

function rodarPowershell(args, timeout) {
  return new Promise((resolve, reject) => {
    execFile(
      "powershell.exe",
      [...POWERSHELL_BASE, ...args],
      { timeout, windowsHide: true, encoding: "utf8", maxBuffer: 4 * 1024 * 1024 },
      (erro, stdout, stderr) => {
        if (erro) {
          const detalhe = String(stderr || erro.message || "").trim().split("\n")[0] || "sem detalhe";
          const causa = erro.killed ? "o Windows demorou demais para responder" : detalhe;
          return reject(new Error(causa));
        }
        resolve(String(stdout ?? ""));
      },
    );
  });
}

function ehPadrao(valor) {
  // O Windows devolve `Default` ora como booleano, ora como a string
  // "True"/"False" (depende de como o JSON foi serializado).
  if (typeof valor === "boolean") return valor;
  if (typeof valor === "string") return valor.trim().toLowerCase() === "true";
  return false;
}

/**
 * Impressoras instaladas no Windows, para o caixa escolher numa lista em vez
 * de digitar o nome (digitar nome de impressora é fonte garantida de erro).
 *
 * Em Linux/Mac devolve [] — a ponte continua funcionando com destino "rede".
 *
 * @returns {Promise<Array<{nome: string, padrao: boolean}>>}
 */
export async function listarImpressoras() {
  if (!EH_WINDOWS) return [];

  const saida = await rodarPowershell(["-Command", COMANDO_LISTAR], TIMEOUT_LISTAR_MS).catch((e) => {
    throw new Error(`Não foi possível ler a lista de impressoras do Windows (${e.message}).`);
  });

  const texto = saida.trim();
  if (!texto) return [];

  let bruto;
  try {
    bruto = JSON.parse(texto);
  } catch {
    throw new Error("A lista de impressoras do Windows veio em formato inesperado.");
  }

  // Com uma única impressora instalada, o ConvertTo-Json devolve objeto.
  const lista = Array.isArray(bruto) ? bruto : [bruto];
  return lista
    .filter((p) => p && typeof p.Name === "string" && p.Name.trim())
    .map((p) => ({ nome: p.Name.trim(), padrao: ehPadrao(p.Default) }));
}

// ── Envio por rede (impressora com IP, porta RAW 9100) ──────────────────
function enviarPorRede({ host, porta }, bytes) {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let encerrado = false;

    const encerrar = (erro) => {
      if (encerrado) return;
      encerrado = true;
      socket.destroy();
      if (erro) reject(erro); else resolve();
    };

    socket.setTimeout(TIMEOUT_REDE_MS);
    socket.on("timeout", () => encerrar(new Error(`A impressora ${host}:${porta} não respondeu em ${TIMEOUT_REDE_MS / 1000} segundos. Confira se ela está ligada e na rede.`)));
    socket.on("error", (e) => encerrar(new Error(`Não foi possível falar com a impressora ${host}:${porta} (${e.code ?? e.message}).`)));
    socket.on("close", () => encerrar(null)); // fechou depois do end() = enviado

    socket.connect(porta, host, () => {
      socket.write(bytes, () => socket.end());
    });
  });
}

// ── Envio pelo spooler do Windows, em modo RAW ──────────────────────────
//
// O nome da impressora NUNCA é interpolado no script: ele vai num arquivo
// à parte e o PowerShell lê de lá. Assim um nome com aspas, acento, `$` ou
// ponto-e-vírgula não vira comando (o equivalente a SQL injection, só que
// em shell).
function montarScriptRaw(caminhoNome, caminhoDados) {
  return `$ErrorActionPreference = 'Stop'
# Sem isto a mensagem de erro volta na página de código do DOS e o acento
# chega quebrado no log da ponte / na tela do caixa.
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$fonte = @'
using System;
using System.Runtime.InteropServices;

public static class KoraRaw {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public class DOCINFO {
    [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPWStr)] public string pDataType;
  }

  [DllImport("winspool.drv", EntryPoint = "OpenPrinterW", SetLastError = true, CharSet = CharSet.Unicode, ExactSpelling = true)]
  public static extern bool OpenPrinter(string pPrinterName, out IntPtr phPrinter, IntPtr pDefault);

  [DllImport("winspool.drv", EntryPoint = "ClosePrinter", SetLastError = true, ExactSpelling = true)]
  public static extern bool ClosePrinter(IntPtr hPrinter);

  [DllImport("winspool.drv", EntryPoint = "StartDocPrinterW", SetLastError = true, CharSet = CharSet.Unicode, ExactSpelling = true)]
  public static extern bool StartDocPrinter(IntPtr hPrinter, int level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFO di);

  [DllImport("winspool.drv", EntryPoint = "EndDocPrinter", SetLastError = true, ExactSpelling = true)]
  public static extern bool EndDocPrinter(IntPtr hPrinter);

  [DllImport("winspool.drv", EntryPoint = "StartPagePrinter", SetLastError = true, ExactSpelling = true)]
  public static extern bool StartPagePrinter(IntPtr hPrinter);

  [DllImport("winspool.drv", EntryPoint = "EndPagePrinter", SetLastError = true, ExactSpelling = true)]
  public static extern bool EndPagePrinter(IntPtr hPrinter);

  [DllImport("winspool.drv", EntryPoint = "WritePrinter", SetLastError = true, ExactSpelling = true)]
  public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);

  static Exception Falha(string etapa) {
    return new Exception(etapa + " falhou (codigo " + Marshal.GetLastWin32Error() + ")");
  }

  public static void Enviar(string impressora, byte[] dados) {
    IntPtr h;
    if (!OpenPrinter(impressora, out h, IntPtr.Zero)) throw Falha("OpenPrinter");
    try {
      DOCINFO di = new DOCINFO();
      di.pDocName = "KORA - comanda";
      di.pDataType = "RAW";
      if (!StartDocPrinter(h, 1, di)) throw Falha("StartDocPrinter");
      try {
        if (!StartPagePrinter(h)) throw Falha("StartPagePrinter");
        IntPtr buffer = Marshal.AllocCoTaskMem(dados.Length);
        try {
          Marshal.Copy(dados, 0, buffer, dados.Length);
          int escritos = 0;
          if (!WritePrinter(h, buffer, dados.Length, out escritos)) throw Falha("WritePrinter");
          if (escritos != dados.Length) throw new Exception("A impressora aceitou so parte dos dados.");
        } finally {
          Marshal.FreeCoTaskMem(buffer);
          EndPagePrinter(h);
        }
      } finally {
        EndDocPrinter(h);
      }
    } finally {
      ClosePrinter(h);
    }
  }
}
'@
Add-Type -TypeDefinition $fonte -Language CSharp
$nome = [System.IO.File]::ReadAllText('${caminhoNome}', [System.Text.Encoding]::UTF8)
$dados = [System.IO.File]::ReadAllBytes('${caminhoDados}')
try {
  [KoraRaw]::Enviar($nome, $dados)
} catch {
  # Só a causa raiz — o embrulho do PowerShell ("Exceção ao chamar...")
  # não ajuda em nada quem está olhando a impressora.
  [Console]::Error.WriteLine($_.Exception.GetBaseException().Message)
  exit 1
}
`;
}

async function enviarPorWindows({ nome }, bytes) {
  if (!EH_WINDOWS) {
    throw new Error("Impressora do Windows só funciona no PC com Windows. Use uma impressora de rede.");
  }

  // Nomes só com hexadecimal — o que é interpolado no script é gerado aqui,
  // nunca vem do app.
  const marca = crypto.randomBytes(8).toString("hex");
  const base = path.join(os.tmpdir(), `kora-imp-${marca}`);
  const arqDados = `${base}.bin`;
  const arqNome = `${base}.txt`;
  const arqScript = `${base}.ps1`;

  try {
    await fs.writeFile(arqDados, bytes);
    await fs.writeFile(arqNome, nome, "utf8");
    await fs.writeFile(arqScript, montarScriptRaw(arqNome, arqDados), "utf8");
    await rodarPowershell(["-File", arqScript], TIMEOUT_ENVIO_MS);
  } catch (e) {
    throw new Error(`A impressora "${nome}" não aceitou o trabalho: ${e.message}`);
  } finally {
    // Sempre limpa, inclusive em erro — senão a pasta temporária do PC do
    // caixa vai acumulando comanda por comanda.
    await Promise.all([arqDados, arqNome, arqScript].map((a) => fs.rm(a, { force: true }).catch(() => {})));
  }
}

/**
 * Manda os bytes ESC/POS para a impressora do destino.
 * Resolve quando saiu; lança Error com mensagem em português quando falhou
 * (é essa mensagem que a fila guarda e o caixa lê na tela).
 *
 * @param {{tipo: "windows", nome: string} | {tipo: "rede", host: string, porta: number}} destino
 * @param {Buffer} bytes
 * @returns {Promise<void>}
 */
export async function enviarBytes(destino, bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length === 0) {
    throw new Error("Não há nada para enviar à impressora.");
  }
  if (destino?.tipo === "rede") return enviarPorRede(destino, bytes);
  if (destino?.tipo === "windows") return enviarPorWindows(destino, bytes);
  throw new Error("Destino de impressão desconhecido.");
}
