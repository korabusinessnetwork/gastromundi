// Testes dos arquivos que guardam o serviço do dia (Leva 16).
//
// O que estes testes protegem, em linguagem do restaurante:
// - O que foi salvo tem que voltar igual depois de reiniciar o PC.
// - Se o disco negar a gravação, a ponte NÃO pode morrer: ela tem que
//   reclamar em português para quem chamou avisar o garçom.
// - Arquivo estragado não pode zerar a fila calado — tem que sobrar
//   evidência guardada e uma linha de ATENÇÃO no ponte.log.
// - Arquivo que ainda não existe (primeiro dia da ponte no PC) é normal e
//   não pode encher o log de aviso à toa.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { configurarLog, caminhoLog } from "./log.js";
import { lerJson, gravarJson, nomeDoCorrompido } from "./persistencia.js";

let sandbox;
let arquivo;

const log = () => (fs.existsSync(caminhoLog()) ? fs.readFileSync(caminhoLog(), "utf8") : "");

beforeEach(() => {
  sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "kora-persistencia-"));
  arquivo = path.join(sandbox, "pedidos.json");
  configurarLog({ dir: sandbox, eco: false });
});

afterEach(() => {
  configurarLog({ arquivo: path.join(os.tmpdir(), "kora-persistencia-inexistente", "ponte.log"), eco: false });
  fs.rmSync(sandbox, { recursive: true, force: true });
});

describe("gravarJson + lerJson", () => {
  it("grava e lê de volta o mesmo conteúdo", () => {
    const fila = [{ id: "abc", comanda: "12", items: [{ name: "Pastel", qty: 2 }] }];
    gravarJson(arquivo, fila);
    expect(lerJson(arquivo, [])).toEqual(fila);
  });

  it("não deixa o arquivo temporário para trás", () => {
    gravarJson(arquivo, { ok: true });
    expect(fs.existsSync(`${arquivo}.tmp`)).toBe(false);
  });

  it("a segunda gravação substitui a primeira por inteiro", () => {
    gravarJson(arquivo, [{ id: "a" }, { id: "b" }]);
    gravarJson(arquivo, [{ id: "c" }]);
    expect(lerJson(arquivo, [])).toEqual([{ id: "c" }]);
  });
});

describe("gravação que o disco recusa", () => {
  it("lança erro com mensagem em português em vez de derrubar a ponte", () => {
    const inalcancavel = path.join(sandbox, "pasta-que-nao-existe", "pedidos.json");
    expect(() => gravarJson(inalcancavel, [{ id: "a" }])).toThrow(/Não consegui salvar pedidos\.json/);
  });

  it("registra o motivo técnico no ponte.log", () => {
    const inalcancavel = path.join(sandbox, "pasta-que-nao-existe", "pedidos.json");
    try { gravarJson(inalcancavel, [{ id: "a" }]); } catch { /* o teste acima já cobre o lançamento */ }
    expect(log()).toContain("não consegui gravar pedidos.json");
    expect(log()).toContain("[ENOENT]");
  });

  it("leva junto o código do erro, para quem quiser decidir pelo motivo", () => {
    const inalcancavel = path.join(sandbox, "pasta-que-nao-existe", "pedidos.json");
    expect.assertions(1);
    try {
      gravarJson(inalcancavel, [{ id: "a" }]);
    } catch (e) {
      expect(e.code).toBe("ENOENT");
    }
  });
});

describe("arquivo corrompido", () => {
  it("devolve o padrão, guarda a evidência e grita no log", () => {
    fs.writeFileSync(arquivo, '[{"id":"abc", "coman', "utf8"); // queda de luz no meio da gravação antiga
    const fila = lerJson(arquivo, [], { oQuePerde: "Os pedidos ainda não puxados pelo caixa se perderam." });

    expect(fila).toEqual([]);
    const guardados = fs.readdirSync(sandbox).filter((n) => n.startsWith("pedidos.json.corrompido-"));
    expect(guardados).toHaveLength(1);
    expect(log()).toContain("ATENÇÃO: o arquivo pedidos.json está corrompido");
    expect(log()).toContain("Os pedidos ainda não puxados pelo caixa se perderam.");
  });

  it("sai da frente para a ponte não tropeçar nele no próximo início", () => {
    fs.writeFileSync(arquivo, "isto não é json", "utf8");
    lerJson(arquivo, []);
    expect(fs.existsSync(arquivo)).toBe(false);

    // Segundo início: o arquivo sumiu, então é só o padrão, sem novo alarme.
    const antes = log().length;
    expect(lerJson(arquivo, [])).toEqual([]);
    expect(log().length).toBe(antes);
  });

  it("o nome guardado não usa caracteres que o Windows recusa em arquivo", () => {
    const nome = path.basename(nomeDoCorrompido(arquivo, new Date("2026-08-19T15:04:05.000Z")));
    expect(nome).toBe("pedidos.json.corrompido-2026-08-19T15-04-05-000Z");
    expect(nome).not.toContain(":");
  });
});

describe("arquivo que ainda não existe", () => {
  it("devolve o padrão sem barulho nenhum no log (primeiro dia da ponte)", () => {
    expect(lerJson(path.join(sandbox, "config.json"), null)).toBe(null);
    expect(lerJson(path.join(sandbox, "snapshot.json"), { vazio: true })).toEqual({ vazio: true });
    expect(log()).toBe("");
  });
});

describe("erro de leitura que não é arquivo ausente", () => {
  it("aparece no log e ainda assim devolve o padrão", () => {
    // Uma PASTA no lugar do arquivo: o Node recusa a leitura com EISDIR.
    const comoPasta = path.join(sandbox, "impressao.json");
    fs.mkdirSync(comoPasta);
    expect(lerJson(comoPasta, [])).toEqual([]);
    expect(log()).toContain("não consegui ler impressao.json");
  });
});
