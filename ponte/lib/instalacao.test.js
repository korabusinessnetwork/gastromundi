// Testes da instalação da Ponte KORA.
//
// O que estes testes protegem:
// - Em dev, `dados/` continua exatamente onde sempre esteve (ao lado do
//   servidor.js). Se isso quebrar, quem clona o repositório perde token e fila.
// - No .exe, os dados vão para uma pasta estável do usuário — o snapshot do
//   pkg é somente leitura e o exe pode estar num pen drive.
// - Nada lança: instalar fora do empacotado responde `{ok:false}` com texto,
//   e remover atalho que não existe é operação normal, não erro.
//
// Regra do arquivo: nenhum teste toca em pasta real do usuário (Inicialização,
// Área de Trabalho, %LOCALAPPDATA%). Tudo acontece em os.tmpdir() e é apagado
// no fim — rodar a suíte não pode mexer no PC de quem roda.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  EMPACOTADO,
  NOME_EXE,
  NOME_ATALHO,
  dirDados,
  dirInstalacao,
  caminhoExeInstalado,
  estadoInstalacao,
  instalar,
  removerAtalhos,
  resolverDirDados,
  resolverDirInstalacao,
  resolverCaminhosAtalhos,
  montarEstado,
  mesmoCaminho,
  montarConfigAtalhos,
  ARG_AUTOSTART,
  DESCRICAO_ATALHO,
} from "./instalacao.js";

const EH_WINDOWS = process.platform === "win32";

// Sandbox de disco: tudo que estes testes criam nasce e morre aqui.
let sandbox;

beforeAll(() => {
  sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "kora-teste-inst-"));
});

afterAll(() => {
  fs.rmSync(sandbox, { recursive: true, force: true });
});

const HOME_FALSO = path.join("C:\\", "Users", "caixa");

describe("resolverDirDados", () => {
  it("em dev, usa a raiz passada — dados/ fica ao lado do servidor.js", () => {
    const raiz = path.join("C:\\", "repo", "ponte");
    expect(resolverDirDados({ empacotado: false, raizDev: raiz })).toBe(path.join(raiz, "dados"));
  });

  it("em dev, ignora LOCALAPPDATA por completo", () => {
    const raiz = path.join("D:\\", "projetos", "ponte");
    const r = resolverDirDados({
      empacotado: false,
      raizDev: raiz,
      env: { LOCALAPPDATA: path.join("C:\\", "Users", "caixa", "AppData", "Local") },
      homedir: HOME_FALSO,
    });
    expect(r).toBe(path.join(raiz, "dados"));
  });

  it("empacotado, vai para %LOCALAPPDATA%\\KORA\\Ponte\\dados (fora da pasta do exe)", () => {
    const local = path.join("C:\\", "Users", "caixa", "AppData", "Local");
    const r = resolverDirDados({
      empacotado: true,
      raizDev: path.join("E:\\", "pendrive"), // pen drive: NUNCA pode ser usado
      env: { LOCALAPPDATA: local },
      homedir: HOME_FALSO,
    });
    expect(r).toBe(path.join(local, "KORA", "Ponte", "dados"));
    expect(r).not.toContain("pendrive");
  });

  it("empacotado sem LOCALAPPDATA (Linux/Mac), cai para ~/.kora-ponte/dados", () => {
    const r = resolverDirDados({ empacotado: true, env: {}, homedir: "/home/caixa" });
    expect(r).toBe(path.join("/home/caixa", ".kora-ponte", "dados"));
  });

  it("LOCALAPPDATA vazio/só espaço conta como ausente", () => {
    const r = resolverDirDados({ empacotado: true, env: { LOCALAPPDATA: "   " }, homedir: "/home/caixa" });
    expect(r).toBe(path.join("/home/caixa", ".kora-ponte", "dados"));
  });
});

describe("dirDados (ambiente real)", () => {
  it("na suíte de testes (não empacotado) usa a raiz passada e cria a pasta", () => {
    expect(EMPACOTADO).toBe(false); // vitest roda em Node, nunca no exe
    const raiz = path.join(sandbox, "repo-fake");
    const dir = dirDados(raiz);
    expect(dir).toBe(path.join(raiz, "dados"));
    expect(fs.existsSync(dir)).toBe(true);
  });

  it("não lança quando a raiz é impossível de criar", () => {
    // Caractere proibido em nome de arquivo no Windows: mkdir falha e a
    // função tem que engolir — quem grava depois é que dá a mensagem boa.
    expect(() => dirDados(path.join(sandbox, "in\u0000valido"))).not.toThrow();
  });
});

describe("resolverDirInstalacao / dirInstalacao", () => {
  it("é a pasta do usuário, sem Program Files (por isso não pede admin)", () => {
    const local = path.join("C:\\", "Users", "caixa", "AppData", "Local");
    const r = resolverDirInstalacao({ env: { LOCALAPPDATA: local }, homedir: HOME_FALSO });
    expect(r).toBe(path.join(local, "KORA", "Ponte"));
    expect(r.toLowerCase()).not.toContain("program files");
  });

  it("fora do Windows, cai para ~/.kora-ponte", () => {
    expect(resolverDirInstalacao({ env: {}, homedir: "/home/caixa" })).toBe(path.join("/home/caixa", ".kora-ponte"));
  });

  it("é estável: chamar duas vezes dá o mesmo caminho absoluto", () => {
    const a = dirInstalacao();
    const b = dirInstalacao();
    expect(a).toBe(b);
    expect(path.isAbsolute(a)).toBe(true);
    expect(caminhoExeInstalado()).toBe(path.join(a, NOME_EXE));
  });
});

describe("resolverCaminhosAtalhos", () => {
  const env = { APPDATA: path.join(HOME_FALSO, "AppData", "Roaming") };

  it("o atalho de auto-start vai para a pasta Inicialização do Windows", () => {
    const { startup } = resolverCaminhosAtalhos({ env, homedir: HOME_FALSO, existe: () => false });
    expect(startup).toBe(path.join(env.APPDATA, "Microsoft", "Windows", "Start Menu", "Programs", "Startup", NOME_ATALHO));
  });

  it("prefere a Área de Trabalho do OneDrive quando ela existe (senão o atalho não aparece na tela)", () => {
    const comOneDrive = path.join(HOME_FALSO, "OneDrive", "Desktop");
    const { areaTrabalho } = resolverCaminhosAtalhos({
      env,
      homedir: HOME_FALSO,
      existe: (c) => c === comOneDrive,
    });
    expect(areaTrabalho).toBe(path.join(comOneDrive, NOME_ATALHO));
  });

  it("sem OneDrive, usa o Desktop clássico do perfil", () => {
    const { areaTrabalho } = resolverCaminhosAtalhos({ env, homedir: HOME_FALSO, existe: () => false });
    expect(areaTrabalho).toBe(path.join(HOME_FALSO, "Desktop", NOME_ATALHO));
  });

  it("sem APPDATA no ambiente, monta o caminho a partir do perfil do usuário", () => {
    const { startup } = resolverCaminhosAtalhos({ env: {}, homedir: HOME_FALSO, existe: () => false });
    expect(startup).toContain(path.join("AppData", "Roaming", "Microsoft"));
  });
});

describe("montarConfigAtalhos", () => {
  const alvo = path.join(HOME_FALSO, "AppData", "Local", "KORA", "Ponte", NOME_EXE);
  const startup = path.join(HOME_FALSO, "Startup", NOME_ATALHO);
  const areaTrabalho = path.join(HOME_FALSO, "Desktop", NOME_ATALHO);

  function config() {
    return montarConfigAtalhos({ alvo, startup, areaTrabalho });
  }

  it("cria exatamente dois atalhos, ambos apontando para o exe instalado", () => {
    const { atalhos } = config();
    expect(atalhos).toHaveLength(2);
    for (const a of atalhos) {
      expect(a.alvo).toBe(alvo);
      expect(a.trabalho).toBe(path.dirname(alvo));
      expect(a.descricao).toBe(DESCRICAO_ATALHO);
    }
  });

  it("só o atalho da Inicialização leva --autostart (senão o navegador abriria a cada boot)", () => {
    const { atalhos } = config();
    const naInicializacao = atalhos.find((a) => a.lnk === startup);
    const naAreaDeTrabalho = atalhos.find((a) => a.lnk === areaTrabalho);
    expect(naInicializacao.argumentos).toBe(ARG_AUTOSTART);
    expect(naAreaDeTrabalho.argumentos).toBe("");
  });

  it("o campo argumentos existe sempre (o PowerShell não pode receber propriedade faltando)", () => {
    for (const a of config().atalhos) expect(typeof a.argumentos).toBe("string");
  });
});

describe("mesmoCaminho", () => {
  it("ignora barra e maiúscula no Windows (senão a ponte se copiaria em cima de si mesma)", () => {
    if (!EH_WINDOWS) return;
    expect(mesmoCaminho("C:\\Users\\Caixa\\KoraPonte.exe", "c:/users/caixa/KORAPONTE.EXE")).toBe(true);
  });

  it("caminhos diferentes continuam diferentes", () => {
    expect(mesmoCaminho(path.join(sandbox, "a.exe"), path.join(sandbox, "b.exe"))).toBe(false);
  });

  it("tolera valor ausente ou vazio", () => {
    expect(mesmoCaminho(null, "x")).toBe(false);
    expect(mesmoCaminho("", "")).toBe(false);
    expect(mesmoCaminho(undefined, undefined)).toBe(false);
  });
});

describe("montarEstado / estadoInstalacao", () => {
  it("pasta inexistente ⇒ não instalado e sem auto-start", () => {
    const raiz = path.join(sandbox, "nunca-criada");
    const estado = montarEstado({
      empacotado: true,
      execPath: path.join("E:\\", "pendrive", NOME_EXE),
      caminhoInstalado: path.join(raiz, NOME_EXE),
      caminhoAutoStart: path.join(raiz, "Startup", NOME_ATALHO),
    });
    expect(estado).toEqual({
      empacotado: true,
      instalado: false,
      autoStart: false,
      caminhoAtual: path.join("E:\\", "pendrive", NOME_EXE),
      caminhoInstalado: path.join(raiz, NOME_EXE),
    });
  });

  it("com o exe e o atalho no lugar ⇒ instalado e auto-start ligados", () => {
    const raiz = path.join(sandbox, "instalado");
    fs.mkdirSync(raiz, { recursive: true });
    const exe = path.join(raiz, NOME_EXE);
    const lnk = path.join(raiz, NOME_ATALHO);
    fs.writeFileSync(exe, "fingindo ser um exe");
    fs.writeFileSync(lnk, "fingindo ser um atalho");

    const estado = montarEstado({
      empacotado: true,
      execPath: exe,
      caminhoInstalado: exe,
      caminhoAutoStart: lnk,
    });
    expect(estado.instalado).toBe(true);
    expect(estado.autoStart).toBe(true);
  });

  it("exe instalado sem o atalho da Inicialização ⇒ instalado, mas auto-start desligado", () => {
    const raiz = path.join(sandbox, "sem-autostart");
    fs.mkdirSync(raiz, { recursive: true });
    const exe = path.join(raiz, NOME_EXE);
    fs.writeFileSync(exe, "exe");

    const estado = montarEstado({
      empacotado: false,
      execPath: process.execPath,
      caminhoInstalado: exe,
      caminhoAutoStart: path.join(raiz, NOME_ATALHO),
    });
    expect(estado.instalado).toBe(true);
    expect(estado.autoStart).toBe(false);
  });

  it("estadoInstalacao() responde o formato completo sem tocar em disco do usuário", () => {
    const estado = estadoInstalacao();
    expect(Object.keys(estado).sort()).toEqual(
      ["autoStart", "caminhoAtual", "caminhoInstalado", "empacotado", "instalado"],
    );
    expect(estado.empacotado).toBe(false); // rodando em Node, não no exe
    expect(typeof estado.instalado).toBe("boolean");
    expect(typeof estado.autoStart).toBe("boolean");
    expect(estado.caminhoAtual).toBe(process.execPath);
    expect(estado.caminhoInstalado.endsWith(NOME_EXE)).toBe(true);
  });
});

describe("instalar", () => {
  it("fora do empacotado, recusa com explicação e NÃO lança", async () => {
    const r = await instalar();
    expect(r.ok).toBe(false);
    expect(r.jaEstava).toBe(false);
    expect(r.reiniciar).toBe(false);
    expect(r.caminho).toBe(null);
    expect(typeof r.erro).toBe("string");
    expect(r.erro).toMatch(/KoraPonte\.exe/);
  });

  it("devolve sempre o mesmo formato de resultado", async () => {
    const r = await instalar();
    expect(Object.keys(r).sort()).toEqual(["caminho", "erro", "jaEstava", "ok", "reiniciar"]);
  });

  it("não copia nada para a pasta de instalação em modo de desenvolvimento", async () => {
    const antes = fs.existsSync(caminhoExeInstalado());
    await instalar();
    expect(fs.existsSync(caminhoExeInstalado())).toBe(antes);
  });
});

describe("removerAtalhos", () => {
  it("é idempotente: sem nada para remover, devolve ok com 0", async () => {
    const alvos = [path.join(sandbox, "nada", "a.lnk"), path.join(sandbox, "nada", "b.lnk")];
    expect(await removerAtalhos(alvos)).toEqual({ ok: true, removidos: 0, erro: null });
    expect(await removerAtalhos(alvos)).toEqual({ ok: true, removidos: 0, erro: null });
  });

  it("remove os atalhos que existem e conta quantos saíram", async () => {
    const raiz = path.join(sandbox, "atalhos");
    fs.mkdirSync(raiz, { recursive: true });
    const a = path.join(raiz, "startup.lnk");
    const b = path.join(raiz, "desktop.lnk");
    fs.writeFileSync(a, "lnk");
    fs.writeFileSync(b, "lnk");

    const r = await removerAtalhos([a, b]);
    expect(r).toEqual({ ok: true, removidos: 2, erro: null });
    expect(fs.existsSync(a)).toBe(false);
    expect(fs.existsSync(b)).toBe(false);

    // Chamar de novo não vira erro — o painel pode clicar duas vezes.
    expect(await removerAtalhos([a, b])).toEqual({ ok: true, removidos: 0, erro: null });
  });

  it("nunca encosta na pasta de dados (token e comandas na fila moram lá)", async () => {
    const raiz = path.join(sandbox, "com-dados");
    const dados = path.join(raiz, "dados");
    fs.mkdirSync(dados, { recursive: true });
    const config = path.join(dados, "config.json");
    fs.writeFileSync(config, '{"token":"abc"}');
    const lnk = path.join(raiz, NOME_ATALHO);
    fs.writeFileSync(lnk, "lnk");

    await removerAtalhos([lnk]);
    expect(fs.existsSync(dados)).toBe(true);
    expect(fs.readFileSync(config, "utf8")).toBe('{"token":"abc"}');
  });
});
