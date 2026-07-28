// Testes do diário de bordo da Ponte (Leva 15).
//
// O que estes testes protegem:
// - O token do estabelecimento NUNCA pode aparecer inteiro no arquivo de log
//   (é ele que autoriza mandar pedido pela rede do restaurante).
// - Um evento = uma linha, senão o arquivo vira ilegível.
// - Log nunca derruba a ponte, mesmo com o caminho de gravação quebrado.
// - O arquivo não cresce para sempre no PC do caixa, que fica ligado meses.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  mascararSegredos, linhaLog, configurarLog, caminhoLog, logar, logarErro, LIMITE_BYTES,
} from "./log.js";

const TOKEN = "43efb9bc1d2e4f5a6b7c8d9e0f1a2b3c";
const AGORA = new Date("2026-07-28T12:00:00.000Z");

let sandbox;

beforeEach(() => {
  sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "kora-log-"));
  configurarLog({ dir: sandbox, eco: false });
});

afterEach(() => {
  // Volta o log para "só console desligado": nenhum outro teste deve herdar
  // um arquivo dentro de uma pasta temporária que já foi apagada.
  configurarLog({ arquivo: path.join(os.tmpdir(), "kora-log-inexistente", "ponte.log"), eco: false });
  fs.rmSync(sandbox, { recursive: true, force: true });
});

describe("mascararSegredos", () => {
  it("esconde o token do endereço do Palm, deixando só o começo", () => {
    const texto = mascararSegredos(`No celular: http://192.168.0.42:8123/palm?t=${TOKEN}`);
    expect(texto).not.toContain(TOKEN);
    expect(texto).toContain("?t=43efb9bc…");
  });

  it("esconde também quando o parâmetro se chama token e vem depois de &", () => {
    const texto = mascararSegredos(`http://x/palm?a=1&token=${TOKEN}`);
    expect(texto).not.toContain(TOKEN);
    expect(texto).toContain("&token=43efb9bc…");
  });

  it("esconde hexadecimal longo solto, sem estar em URL (rede de segurança)", () => {
    const texto = mascararSegredos(`falhou com a chave ${TOKEN} em mãos`);
    expect(texto).not.toContain(TOKEN);
    expect(texto).toContain("43efb9bc…");
  });

  it("não estraga texto normal do dia a dia", () => {
    expect(mascararSegredos("comanda 12 impressa na Cozinha")).toBe("comanda 12 impressa na Cozinha");
    expect(mascararSegredos("porta 8123")).toBe("porta 8123");
  });

  it("aguenta entrada que não é texto", () => {
    expect(mascararSegredos(null)).toBe("");
    expect(mascararSegredos(undefined)).toBe("");
    expect(mascararSegredos(123)).toBe("");
  });
});

describe("linhaLog", () => {
  it("põe o horário na frente e mascara o segredo", () => {
    expect(linhaLog(`palm?t=${TOKEN}`, AGORA)).toBe("2026-07-28T12:00:00.000Z  palm?t=43efb9bc…");
  });

  it("junta tudo numa linha só (um evento = uma linha)", () => {
    const linha = linhaLog("primeira\nsegunda\r\nterceira", AGORA);
    expect(linha.split("\n")).toHaveLength(1);
    expect(linha).toContain("primeira segunda terceira");
  });

  it("aguenta mensagem vazia ou ausente", () => {
    expect(linhaLog(undefined, AGORA)).toBe("2026-07-28T12:00:00.000Z  ");
    expect(linhaLog("", AGORA)).toBe("2026-07-28T12:00:00.000Z  ");
  });
});

describe("gravação em arquivo", () => {
  it("grava no ponte.log da pasta de dados", () => {
    expect(caminhoLog()).toBe(path.join(sandbox, "ponte.log"));
    logar("a ponte subiu");
    expect(fs.readFileSync(caminhoLog(), "utf8")).toContain("a ponte subiu");
  });

  it("nunca grava o token, mesmo vindo de logar()", () => {
    logar(`No celular: http://192.168.0.42:8123/palm?t=${TOKEN}`);
    expect(fs.readFileSync(caminhoLog(), "utf8")).not.toContain(TOKEN);
  });

  it("acumula uma linha por evento", () => {
    logar("primeiro");
    logar("segundo");
    const linhas = fs.readFileSync(caminhoLog(), "utf8").trim().split(/\r?\n/);
    expect(linhas).toHaveLength(2);
  });

  it("logarErro junta a mensagem do erro e o código", () => {
    const erro = new Error("porta ocupada");
    erro.code = "EADDRINUSE";
    logarErro("não deu para subir", erro);
    const conteudo = fs.readFileSync(caminhoLog(), "utf8");
    expect(conteudo).toContain("não deu para subir: porta ocupada [EADDRINUSE]");
  });

  it("logarErro aguenta erro que não é Error (ou ausente)", () => {
    expect(() => logarErro("sem detalhe")).not.toThrow();
    expect(() => logarErro("texto solto", "deu ruim")).not.toThrow();
    expect(fs.readFileSync(caminhoLog(), "utf8")).toContain("texto solto: deu ruim");
  });

  it("rotaciona para .1 quando passa do limite, em vez de crescer sem fim", () => {
    fs.writeFileSync(caminhoLog(), "x".repeat(LIMITE_BYTES + 1), "utf8");
    logar("depois da poda");
    expect(fs.existsSync(`${caminhoLog()}.1`)).toBe(true);
    const novo = fs.readFileSync(caminhoLog(), "utf8");
    expect(novo).toContain("depois da poda");
    expect(novo.length).toBeLessThan(LIMITE_BYTES);
  });

  it("guarda uma geração só (o .1 antigo é substituído)", () => {
    fs.writeFileSync(`${caminhoLog()}.1`, "geração velha", "utf8");
    fs.writeFileSync(caminhoLog(), "y".repeat(LIMITE_BYTES + 1), "utf8");
    logar("nova rodada");
    expect(fs.readFileSync(`${caminhoLog()}.1`, "utf8")).not.toContain("geração velha");
  });

  it("não lança quando a pasta do log não existe (log nunca derruba a ponte)", () => {
    configurarLog({ arquivo: path.join(sandbox, "pasta-que-nao-existe", "ponte.log"), eco: false });
    expect(() => logar("some no vazio")).not.toThrow();
    expect(() => logarErro("erro também", new Error("x"))).not.toThrow();
  });
});
