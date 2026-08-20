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
  VERSAO,
  NOME_REGRA_FIREWALL,
  NOME_TAREFA,
  PORTA_PADRAO,
  REPETICAO_TAREFA,
  resolverPorta,
  argsConsultarRegraFirewall,
  argsCriarRegraFirewall,
  argsRemoverRegraFirewall,
  interpretarConsultaFirewall,
  argsCriarTarefa,
  argsConsultarTarefa,
  argsRemoverTarefa,
  interpretarConsultaTarefa,
  montarXmlTarefa,
  escaparXml,
  compararVersoes,
  decidirAtualizacao,
  lerVersaoDoPacote,
  atualizarInstalado,
  montarSondagemFirewall,
  montarFalhaFirewall,
  montarResultadoDesativacao,
  montarAmbienteFirewall,
  deveSondar,
  trocarExecutavel,
  limparRestos,
  NOME_MARCA,
} from "./instalacao.js";
import fsp from "node:fs/promises";

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
      autoStartPorTarefa: false,
      versao: VERSAO,
      caminhoAtual: path.join("E:\\", "pendrive", NOME_EXE),
      caminhoInstalado: path.join(raiz, NOME_EXE),
      firewall: { verificado: false, liberado: null, erro: null, em: 0 },
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
      ["autoStart", "autoStartPorTarefa", "caminhoAtual", "caminhoInstalado", "empacotado", "firewall", "instalado", "versao"],
    );
    expect(estado.empacotado).toBe(false); // rodando em Node, não no exe
    expect(typeof estado.instalado).toBe("boolean");
    expect(typeof estado.autoStart).toBe("boolean");
    expect(estado.caminhoAtual).toBe(process.execPath);
    expect(estado.caminhoInstalado.endsWith(NOME_EXE)).toBe(true);
    // O painel decide pelo carimbo se a resposta sobre o firewall é mais nova
    // que o clique do dono; sem ele no formato, essa conta não existe.
    expect(Object.keys(estado.firewall).sort()).toEqual(["em", "erro", "liberado", "verificado"]);
    expect(typeof estado.firewall.em).toBe("number");
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
    expect(Object.keys(r).sort()).toEqual(
      ["atualizou", "autoStart", "caminho", "erro", "firewall", "jaEstava", "motivo", "ok", "reiniciar"],
    );
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

// ── Porta ───────────────────────────────────────────────────────────────

describe("resolverPorta", () => {
  it("sem configuração, é a porta padrão da ponte", () => {
    expect(resolverPorta({ env: {} })).toBe(PORTA_PADRAO);
  });

  it("aceita a porta configurada por ambiente", () => {
    expect(resolverPorta({ env: { KORA_PONTE_PORTA: "9000" } })).toBe(9000);
  });

  it("lixo no ambiente não vira porta — cai no padrão", () => {
    // Se isto passasse adiante, o valor entraria na linha do netsh.
    for (const bruta of ["", "  ", "abc", "0", "-1", "70000", "8123; calc"]) {
      expect(resolverPorta({ env: { KORA_PONTE_PORTA: bruta } })).toBe(PORTA_PADRAO);
    }
  });
});

// ── Firewall (só a decisão; nenhum netsh é chamado de verdade) ──────────

describe("argumentos do netsh", () => {
  it("a consulta pergunta pela regra de ENTRADA, pelo nome", () => {
    const args = argsConsultarRegraFirewall();
    expect(args[0]).toBe("advfirewall");
    expect(args).toContain("show");
    expect(args).toContain(`name=${NOME_REGRA_FIREWALL}`);
    expect(args).toContain("dir=in");
  });

  it("a criação é do escopo mínimo: porta da ponte, TCP, entrada, rede privada", () => {
    const args = argsCriarRegraFirewall({ porta: 8123 });
    expect(args).toContain("dir=in");
    expect(args).toContain("action=allow");
    expect(args).toContain("protocol=TCP");
    expect(args).toContain("localport=8123");
    expect(args).toContain("profile=private");
    // O que NÃO pode estar lá: liberar em rede pública, qualquer porta ou
    // qualquer protocolo.
    expect(args.join(" ")).not.toMatch(/profile=(any|public|domain)/);
    expect(args.join(" ")).not.toMatch(/localport=any/);
    expect(args.join(" ")).not.toMatch(/protocol=any/);
  });

  it("porta inválida não vira regra nenhuma", () => {
    for (const porta of [0, -1, 70000, 1.5, "abc", null, undefined]) {
      expect(argsCriarRegraFirewall({ porta })).toBe(null);
    }
  });

  it("cada argumento é um item da lista (nada de linha de comando concatenada)", () => {
    const args = argsCriarRegraFirewall({ porta: 8123 });
    for (const a of args) expect(typeof a).toBe("string");
    // Nome com espaço vai inteiro num item só — não é o shell que separa.
    expect(args).toContain(`name=${NOME_REGRA_FIREWALL}`);
  });

  it("o nome da regra é ASCII (netsh responde na página de código antiga)", () => {
    expect(/^[\x20-\x7E]+$/.test(NOME_REGRA_FIREWALL)).toBe(true);
  });

  it("a remoção mira a mesma regra de entrada", () => {
    const args = argsRemoverRegraFirewall();
    expect(args).toContain("delete");
    expect(args).toContain(`name=${NOME_REGRA_FIREWALL}`);
    expect(args).toContain("dir=in");
  });
});

describe("interpretarConsultaFirewall", () => {
  // Saída real do netsh quando a regra existe (aqui em inglês; o teste não
  // depende do idioma porque procura o NOME, que é ASCII).
  const achou = [
    "",
    `Rule Name:                            ${NOME_REGRA_FIREWALL}`,
    "----------------------------------------------------------------------",
    "Enabled:                              Yes",
    "Direction:                            In",
    "Profiles:                             Private",
    "LocalPort:                            8123",
    "Protocol:                             TCP",
    "Action:                               Allow",
  ].join("\n");

  it("regra presente ⇒ liberado", () => {
    expect(interpretarConsultaFirewall({ codigo: 0, saida: achou })).toBe(true);
  });

  it("código de saída diferente de zero ⇒ não liberado (é assim que o netsh diz 'não achei')", () => {
    expect(interpretarConsultaFirewall({ codigo: 1, saida: "No rules match the specified criteria." })).toBe(false);
  });

  it("código zero mas sem o nome na saída ⇒ não liberado", () => {
    // Algumas versões respondem 0 mesmo sem achar nada.
    expect(interpretarConsultaFirewall({ codigo: 0, saida: "No rules match the specified criteria." })).toBe(false);
    expect(interpretarConsultaFirewall({ codigo: 0, saida: "" })).toBe(false);
  });

  it("não se importa com maiúscula/minúscula", () => {
    expect(interpretarConsultaFirewall({ codigo: 0, saida: achou.toUpperCase() })).toBe(true);
  });

  it("tolera saída ausente e nome vazio sem lançar", () => {
    expect(interpretarConsultaFirewall({ codigo: 0 })).toBe(false);
    expect(interpretarConsultaFirewall({ codigo: 0, saida: "qualquer", nome: "" })).toBe(false);
    expect(interpretarConsultaFirewall({})).toBe(false);
  });
});

// ── Tarefa agendada (só a decisão; nenhum schtasks é chamado) ───────────

describe("argumentos do schtasks", () => {
  it("cria a tarefa a partir do XML, substituindo a anterior", () => {
    const args = argsCriarTarefa({ arquivoXml: path.join(sandbox, "t.xml") });
    expect(args[0]).toBe("/Create");
    expect(args).toContain("/TN");
    expect(args).toContain(NOME_TAREFA);
    expect(args).toContain("/XML");
    expect(args).toContain("/F"); // reinstalar não pode falhar por já existir
  });

  it("consulta e remoção miram a mesma tarefa", () => {
    expect(argsConsultarTarefa()).toEqual(["/Query", "/TN", NOME_TAREFA]);
    expect(argsRemoverTarefa()).toEqual(["/Delete", "/TN", NOME_TAREFA, "/F"]);
  });

  it("interpretarConsultaTarefa: 0 é 'existe', qualquer outro é 'não existe'", () => {
    expect(interpretarConsultaTarefa({ codigo: 0 })).toBe(true);
    expect(interpretarConsultaTarefa({ codigo: 1 })).toBe(false);
    expect(interpretarConsultaTarefa({})).toBe(false);
  });
});

describe("escaparXml", () => {
  it("não deixa caractere de marcação virar estrutura do XML", () => {
    expect(escaparXml('Bar & Grill <"do Zé">')).toBe("Bar &amp; Grill &lt;&quot;do Zé&quot;&gt;");
  });

  it("tolera ausente", () => {
    expect(escaparXml(undefined)).toBe("");
    expect(escaparXml(null)).toBe("");
  });
});

describe("montarXmlTarefa", () => {
  const exe = path.join("C:\\", "Users", "caixa", "AppData", "Local", "KORA", "Ponte", NOME_EXE);

  it("aponta para o exe instalado e sobe calada (--autostart)", () => {
    const xml = montarXmlTarefa({ exe });
    expect(xml).toContain(`<Command>${exe}</Command>`);
    expect(xml).toContain(`<Arguments>${ARG_AUTOSTART}</Arguments>`);
  });

  it("tenta de novo de tempos em tempos — é isso que faz a ponte VOLTAR sozinha", () => {
    const xml = montarXmlTarefa({ exe });
    expect(xml).toContain(`<Interval>${REPETICAO_TAREFA}</Interval>`);
    expect(xml).toContain("<RestartOnFailure>");
  });

  it("nunca sobe uma segunda ponte (IgnoreNew)", () => {
    expect(montarXmlTarefa({ exe })).toContain("<MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>");
  });

  it("sem limite de tempo: o padrão do Windows MATA a tarefa depois de 3 dias", () => {
    const xml = montarXmlTarefa({ exe });
    expect(xml).toContain("<ExecutionTimeLimit>PT0S</ExecutionTimeLimit>");
    expect(xml).not.toContain("P3D");
  });

  it("bateria não desliga a ponte (caixa que é notebook)", () => {
    const xml = montarXmlTarefa({ exe });
    expect(xml).toContain("<DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>");
    expect(xml).toContain("<StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>");
  });

  it("roda como o próprio usuário, sem pedir administrador", () => {
    const xml = montarXmlTarefa({ exe, usuario: "caixa" });
    expect(xml).toContain("<LogonType>InteractiveToken</LogonType>");
    expect(xml).toContain("<RunLevel>LeastPrivilege</RunLevel>");
    expect(xml).toContain("<UserId>caixa</UserId>");
    expect(xml).not.toContain("HighestAvailable");
    expect(xml).not.toContain("S-1-5-18"); // conta SISTEMA: exigiria UAC
  });

  it("sem nome de usuário, omite o elemento em vez de escrever vazio", () => {
    const xml = montarXmlTarefa({ exe, usuario: "" });
    expect(xml).not.toContain("<UserId>");
  });

  it("caminho com & não quebra o XML", () => {
    const xml = montarXmlTarefa({ exe: path.join("C:\\", "Bar & Grill", NOME_EXE), usuario: "d'Avila" });
    expect(xml).toContain("Bar &amp; Grill");
    expect(xml).toContain("d&apos;Avila");
    expect(xml).not.toMatch(/&(?!amp;|lt;|gt;|quot;|apos;)/);
  });
});

// ── Atualização ─────────────────────────────────────────────────────────

describe("compararVersoes", () => {
  it("compara número a número, não texto", () => {
    expect(compararVersoes("1.0.10", "1.0.9")).toBe(1); // "10" < "9" como texto
    expect(compararVersoes("1.2.0", "1.10.0")).toBe(-1);
    expect(compararVersoes("2.0.0", "1.9.9")).toBe(1);
    expect(compararVersoes("1.0.0", "1.0.0")).toBe(0);
  });

  it("versão desconhecida devolve empate — quem decide é a data, não um palpite", () => {
    expect(compararVersoes("1.0.0", "")).toBe(0);
    expect(compararVersoes("", "1.0.0")).toBe(0);
    expect(compararVersoes(undefined, null)).toBe(0);
    expect(compararVersoes("versão nova", "1.0.0")).toBe(0);
  });
});

describe("decidirAtualizacao", () => {
  const ontem = "2026-07-28T10:58:00.000Z";
  const hoje = "2026-08-19T09:00:00.000Z";

  it("nada instalado ⇒ instala", () => {
    expect(decidirAtualizacao({ atual: { hash: "a", versao: "1.0.0" }, instalado: null }).atualizar).toBe(true);
  });

  it("mesmo arquivo ⇒ não mexe (nem copia 58 MB à toa)", () => {
    const r = decidirAtualizacao({
      atual: { hash: "abc", versao: "1.0.0", origemEm: hoje },
      instalado: { hash: "abc", versao: "1.0.0", origemEm: ontem },
    });
    expect(r.atualizar).toBe(false);
  });

  it("versão maior ganha", () => {
    const r = decidirAtualizacao({
      atual: { hash: "novo", versao: "1.1.0", origemEm: ontem },
      instalado: { hash: "velho", versao: "1.0.0", origemEm: hoje },
    });
    expect(r.atualizar).toBe(true);
  });

  it("nunca REBAIXA: exe antigo esquecido no Downloads não substitui o instalado", () => {
    const r = decidirAtualizacao({
      atual: { hash: "velho", versao: "0.9.0", origemEm: hoje },
      instalado: { hash: "novo", versao: "1.0.0", origemEm: ontem },
    });
    expect(r.atualizar).toBe(false);
    expect(r.motivo).toMatch(/mais novo/);
  });

  it("mesma versão e arquivo diferente ⇒ ganha o mais novo (o caso do dia a dia)", () => {
    // É exatamente o defeito de produção: 1.0.0 instalado em 28/07 e uma build
    // nova, também 1.0.0, com correções de segurança.
    expect(decidirAtualizacao({
      atual: { hash: "novo", versao: "1.0.0", origemEm: hoje },
      instalado: { hash: "velho", versao: "1.0.0", origemEm: ontem },
    }).atualizar).toBe(true);

    expect(decidirAtualizacao({
      atual: { hash: "velho", versao: "1.0.0", origemEm: ontem },
      instalado: { hash: "novo", versao: "1.0.0", origemEm: hoje },
    }).atualizar).toBe(false);
  });

  it("mesma versão, mesma data, arquivo diferente ⇒ não mexe (empate não troca nada)", () => {
    expect(decidirAtualizacao({
      atual: { hash: "a", versao: "1.0.0", origemEm: hoje },
      instalado: { hash: "b", versao: "1.0.0", origemEm: hoje },
    }).atualizar).toBe(false);
  });

  it("instalação antiga sem ficha ⇒ o arquivo que se identifica ganha", () => {
    expect(decidirAtualizacao({
      atual: { hash: "novo", versao: "1.0.0", origemEm: hoje },
      instalado: { hash: "velho", versao: "", origemEm: null },
    }).atualizar).toBe(true);
  });

  it("sem data de nenhum lado ⇒ prefere não mexer", () => {
    expect(decidirAtualizacao({
      atual: { hash: "a", versao: "", origemEm: null },
      instalado: { hash: "b", versao: "", origemEm: null },
    }).atualizar).toBe(false);
  });

  it("aceita Date além de texto ISO", () => {
    expect(decidirAtualizacao({
      atual: { hash: "a", versao: "1.0.0", origemEm: new Date(hoje) },
      instalado: { hash: "b", versao: "1.0.0", origemEm: new Date(ontem) },
    }).atualizar).toBe(true);
  });

  it("nunca lança, mesmo chamada sem nada", () => {
    expect(() => decidirAtualizacao()).not.toThrow();
    expect(decidirAtualizacao().atualizar).toBe(true);
  });

  it("sempre explica em português o que decidiu", () => {
    const r = decidirAtualizacao({
      atual: { hash: "a", versao: "1.0.0", origemEm: hoje },
      instalado: { hash: "b", versao: "1.0.0", origemEm: ontem },
    });
    expect(typeof r.motivo).toBe("string");
    expect(r.motivo.length).toBeGreaterThan(0);
  });
});

describe("lerVersaoDoPacote", () => {
  it("lê a versão do package.json — mesma fonte que o pkg usa para gerar o exe", () => {
    expect(lerVersaoDoPacote()).toMatch(/^\d+\.\d+\.\d+/);
    expect(VERSAO).toBe(lerVersaoDoPacote());
  });
});

// ── Auto-start: tarefa e atalho não podem coexistir ─────────────────────

describe("montarConfigAtalhos com a tarefa agendada no lugar", () => {
  const alvo = path.join(HOME_FALSO, "AppData", "Local", "KORA", "Ponte", NOME_EXE);
  const startup = path.join(HOME_FALSO, "Startup", NOME_ATALHO);
  const areaTrabalho = path.join(HOME_FALSO, "Desktop", NOME_ATALHO);

  it("quando a tarefa cuida do auto-start, o atalho da Inicialização não é criado", () => {
    // Os dois juntos fariam o Windows tentar subir a ponte duas vezes no logon.
    const { atalhos } = montarConfigAtalhos({ alvo, startup, areaTrabalho, incluirInicializacao: false });
    expect(atalhos).toHaveLength(1);
    expect(atalhos[0].lnk).toBe(areaTrabalho);
    expect(atalhos[0].argumentos).toBe("");
  });

  it("o ícone da Área de Trabalho continua existindo nos dois casos", () => {
    for (const incluir of [true, false]) {
      const { atalhos } = montarConfigAtalhos({ alvo, startup, areaTrabalho, incluirInicializacao: incluir });
      expect(atalhos.some((a) => a.lnk === areaTrabalho)).toBe(true);
    }
  });
});

describe("montarEstado com tarefa e firewall", () => {
  const raiz = path.join("C:\\", "nunca-existe-kora");

  function estado(extra) {
    return montarEstado({
      empacotado: true,
      execPath: path.join(raiz, NOME_EXE),
      caminhoInstalado: path.join(raiz, NOME_EXE),
      caminhoAutoStart: path.join(raiz, NOME_ATALHO),
      existe: () => false,
      ...extra,
    });
  }

  it("tarefa agendada sozinha já conta como auto-start ligado", () => {
    const e = estado({ tarefaAgendada: true });
    expect(e.autoStart).toBe(true);
    expect(e.autoStartPorTarefa).toBe(true);
  });

  it("quem só tem o atalho antigo continua com auto-start ligado (compatibilidade)", () => {
    const e = estado({ tarefaAgendada: false, existe: (c) => c.endsWith(NOME_ATALHO) });
    expect(e.autoStart).toBe(true);
    expect(e.autoStartPorTarefa).toBe(false);
  });

  it("antes de perguntar ao Windows, o firewall é 'não sei' — nunca 'liberado'", () => {
    // Se isto virasse `true`, o painel diria que está tudo certo enquanto o
    // celular do garçom continua bloqueado.
    expect(estado().firewall).toEqual({ verificado: false, liberado: null, erro: null, em: 0 });
  });

  it("depois da consulta, informa liberado ou bloqueado", () => {
    expect(estado({ firewall: { verificado: true, liberado: false, erro: null } }).firewall.liberado).toBe(false);
    expect(estado({ firewall: { verificado: true, liberado: true, erro: null } }).firewall.liberado).toBe(true);
  });

  // ── O carimbo de QUANDO essa resposta foi apurada ─────────────────────
  //
  // O painel pergunta o estado de 3 em 3 segundos, mas a ponte só pergunta ao
  // Windows de minuto em minuto: o que volta aqui pode ser a resposta de ANTES
  // do dono clicar em "Liberar o celular no Wi-Fi". Sem o carimbo, o painel
  // cravaria "o Windows não liberou" com a janela de permissão ainda aberta na
  // frente do dono.

  it("repassa a hora em que a sondagem do firewall foi apurada", () => {
    const em = Date.parse("2026-08-19T12:00:00.000Z");
    expect(estado({ firewall: { verificado: true, liberado: false, erro: null, em } }).firewall.em).toBe(em);
  });

  it("o carimbo sobrevive mesmo quando a ponte não conseguiu saber (verificado false com erro)", () => {
    // É justo o caso do painel: bloco na tela por causa do erro, e o carimbo é
    // o que diz se essa resposta já é posterior ao clique.
    const em = Date.parse("2026-08-19T12:00:00.000Z");
    const f = estado({ firewall: { verificado: false, liberado: null, erro: "ninguém respondeu à janela de permissão do Windows", em } }).firewall;
    expect(f).toEqual({ verificado: false, liberado: null, erro: "ninguém respondeu à janela de permissão do Windows", em });
  });

  it("sondagem sem carimbo vira 0 — nunca NaN, que estragaria a comparação do painel", () => {
    expect(estado({ firewall: { verificado: true, liberado: true } }).firewall.em).toBe(0);
    expect(estado({ firewall: { verificado: true, liberado: true, em: "ontem" } }).firewall.em).toBe(0);
  });
});

// ── Sondagem do firewall: o que fazer com a resposta do netsh ───────────
//
// Nenhum destes testes chama o `netsh`. Eles entregam a resposta já pronta
// (como se o Windows tivesse respondido) e conferem a decisão.

describe("montarSondagemFirewall", () => {
  const REGRA_ACHADA = { codigo: 0, saida: `Nome da Regra: ${NOME_REGRA_FIREWALL}
Ativada: Sim` };
  const REGRA_AUSENTE = { codigo: 1, saida: "Nenhuma regra corresponde aos critérios especificados." };

  it("regra encontrada: firewall liberado e nada no log", () => {
    const r = montarSondagemFirewall({ resultado: REGRA_ACHADA });
    expect(r.sondagem).toEqual({ verificado: true, liberado: true, erro: null });
    expect(r.resposta).toEqual({ ok: true, liberado: true, erro: null });
    expect(r.log).toBe(null);
  });

  it("regra ausente: avisa uma vez, com a porta e o caminho da solução", () => {
    const r = montarSondagemFirewall({ resultado: REGRA_AUSENTE, porta: 8123 });
    expect(r.sondagem.liberado).toBe(false);
    expect(r.log).toContain("8123");
    // O nome tem que ser o do botão que está no painel — mandar procurar
    // outro nome é mandar procurar o que não existe na tela.
    expect(r.log).toContain('"Liberar o celular no Wi-Fi"');
  });

  it("continuando bloqueado, NÃO repete a linha no log", () => {
    // A sondagem se repete de minuto em minuto. Sem isto, o ponte.log viraria
    // a mesma frase mil vezes e empurraria para fora pedido e erro de verdade.
    const antes = { verificado: true, liberado: false, erro: null };
    const r = montarSondagemFirewall({ antes, resultado: REGRA_AUSENTE });
    expect(r.sondagem.liberado).toBe(false);
    expect(r.log).toBe(null);
  });

  it("quando destrava, registra que passou a estar liberado", () => {
    const antes = { verificado: true, liberado: false, erro: null };
    const r = montarSondagemFirewall({ antes, resultado: REGRA_ACHADA, porta: 8123 });
    expect(r.sondagem.liberado).toBe(true);
    expect(r.log).toContain("liberado");
  });

  it("netsh que não respondeu vira 'não sei', nunca 'bloqueado'", () => {
    // Dizer `liberado: false` aqui faria o painel acusar bloqueio que ninguém
    // confirmou; e a sondagem PRECISA sair marcada, senão o painel (de 3 em 3
    // segundos) mandaria lançar netsh sem parar.
    const r = montarSondagemFirewall({ resultado: { codigo: null, saida: "", expirou: true } });
    expect(r.sondagem.verificado).toBe(false);
    expect(r.sondagem.liberado).toBe(null);
    expect(r.sondagem.erro).toMatch(/demorou/);
    expect(r.resposta.ok).toBe(false);
    expect(r.log).toBe(null);
  });
});

// ── Quando a liberação do firewall não vai até o fim ───────────────────
//
// Nenhum destes testes cria regra de firewall nem abre janela de permissão:
// entregam o erro já pronto (como se o Windows tivesse respondido) e conferem
// o que a ponte passa a saber e o que ela diz na tela do caixa.

describe("montarFalhaFirewall", () => {
  const JA_SABIA_BLOQUEADO = { verificado: true, liberado: false, erro: null };
  const expirado = (msg) => Object.assign(new Error(msg), { expirou: true });

  it("Windows recusou de verdade: bloqueio confirmado e convite para tentar de novo", () => {
    const r = montarFalhaFirewall({ antes: JA_SABIA_BLOQUEADO, erro: new Error("acesso negado") });
    expect(r.sondagem.verificado).toBe(true);
    expect(r.sondagem.liberado).toBe(false);
    expect(r.resposta.ok).toBe(false);
    expect(r.resposta.erro).toContain('"Sim"');
    // O botão para o qual a frase manda voltar é o que está no painel, com
    // este nome exato (ponte/painel.html). Mandar clicar em "Liberar o acesso
    // do celular" é mandar o dono procurar um botão que não existe.
    expect(r.resposta.erro).toContain('"Liberar o celular no Wi-Fi"');
  });

  it("ninguém respondeu à janela: vira 'não sei', nunca bloqueio confirmado", () => {
    // O dono pode responder "Sim" depois dos dois minutos e a regra nascer.
    // Dizer `liberado: false` aqui é acusar bloqueio que ninguém confirmou —
    // é a mesma regra que vale para o netsh que não respondeu.
    const r = montarFalhaFirewall({ antes: JA_SABIA_BLOQUEADO, erro: expirado("o Windows demorou demais para responder") });
    expect(r.sondagem.verificado).toBe(false);
    expect(r.sondagem.liberado).toBe(null);
    expect(r.resposta.erro).toContain("ninguém respondeu");
  });

  it("nem chegou a rodar: não manda clicar 'Sim' em janela que não apareceu", () => {
    // Falhou ao gravar o .ps1 (pasta temporária cheia, antivírus). Culpar o
    // Windows aqui manda o dono esperar uma janela que nunca vai abrir.
    const r = montarFalhaFirewall({
      antes: JA_SABIA_BLOQUEADO,
      erro: Object.assign(new Error("ENOSPC: no space left on device"), { code: "ENOSPC" }),
      tentouRodar: false,
    });
    expect(r.resposta.erro).toContain("preparar");
    expect(r.resposta.erro).not.toContain('"Sim"');
    expect(r.resposta.erro).not.toContain("janela");
    expect(r.resposta.erro).not.toContain("Windows");
  });

  it("nem chegou a rodar: o que a ponte já sabia do firewall continua valendo", () => {
    // Nada foi mexido no Windows — apagar a informação confirmada faria o
    // painel esquecer o bloqueio que ele acabou de medir.
    const r = montarFalhaFirewall({ antes: JA_SABIA_BLOQUEADO, erro: new Error("EACCES"), tentouRodar: false });
    expect(r.sondagem.verificado).toBe(true);
    expect(r.sondagem.liberado).toBe(false);
  });

  it("sem nada sabido antes, quem não chegou a rodar continua sem saber", () => {
    const r = montarFalhaFirewall({ erro: new Error("EACCES"), tentouRodar: false });
    expect(r.sondagem.verificado).toBe(false);
    expect(r.sondagem.liberado).toBe(null);
  });

  it("o texto cru do Windows vai para o ponte.log, nunca para a tela", () => {
    const cru = "Start-Process : Exception calling CreateProcess with 3 arguments";
    const r = montarFalhaFirewall({ erro: new Error(cru) });
    expect(r.resposta.erro).not.toContain("Start-Process");
    expect(r.log).toContain(cru);
  });

  it("erro sem mensagem não deixa parêntese vazio no log", () => {
    const r = montarFalhaFirewall({ erro: expirado("") });
    expect(r.log).toContain("ninguém respondeu");
    expect(r.log).not.toContain("()");
  });
});

// ── O elo entre a ponte e o script que cria a regra ────────────────────
//
// A regra de firewall nasce assim: a ponte grava um JSON com os argumentos do
// netsh e diz ao PowerShell ONDE esse arquivo está — pela variável de ambiente
// KORA_PONTE_FIREWALL, que é a única coisa que o script lê de fora. Se ela não
// chegar, o script para na terceira linha, o netsh nunca roda e o celular do
// garçom continua bloqueado sem que ninguém veja janela nenhuma.

describe("montarAmbienteFirewall", () => {
  const arqConfig = path.join("C:\\", "Temp", "kora-fw-a1b2c3d4.json");

  it("entrega o caminho da configuração na variável que o script lê", () => {
    // O nome está escrito por extenso de propósito: é o mesmo texto que está
    // dentro do script do PowerShell, e os dois lados têm que bater.
    const ambiente = montarAmbienteFirewall({ env: {}, arqConfig });
    expect(ambiente.KORA_PONTE_FIREWALL).toBe(arqConfig);
  });

  it("preserva o resto do ambiente (sem PATH o Windows nem acha o powershell.exe)", () => {
    const ambiente = montarAmbienteFirewall({ env: { PATH: "C:\\Windows\\System32", QUALQUER: "x" }, arqConfig });
    expect(ambiente.PATH).toBe("C:\\Windows\\System32");
    expect(ambiente.QUALQUER).toBe("x");
    expect(ambiente.KORA_PONTE_FIREWALL).toBe(arqConfig);
  });

  it("não deixa a variável virar o texto 'undefined'", () => {
    // O script trata vazio como "não me informaram" e sai avisando; a palavra
    // "undefined" viraria um caminho de arquivo que não existe.
    expect(montarAmbienteFirewall({ env: {} }).KORA_PONTE_FIREWALL).toBe("");
  });
});

// ── De quanto em quanto tempo perguntar ao Windows ─────────────────────

describe("deveSondar", () => {
  const agora = 1_766_000_000_000;

  it("na primeira vez pergunta na hora (ninguém perguntou nada ainda)", () => {
    const nunca = { verificado: false, em: 0 };
    expect(deveSondar({ firewall: nunca, tarefa: nunca, agora })).toBe(true);
  });

  it("netsh que travou há 5 segundos NÃO manda perguntar de novo", () => {
    // Este é o PC do caixa em que o netsh não responde. O painel pergunta o
    // estado de 3 em 3 segundos: sem isto, a ponte lançaria um netsh atrás do
    // outro, para sempre, no computador que está atendendo o restaurante.
    const semResposta = { verificado: false, liberado: null, erro: "demorou", em: agora - 5000 };
    const tarefaOk = { verificado: true, existe: true, em: agora - 5000 };
    expect(deveSondar({ firewall: semResposta, tarefa: tarefaOk, agora })).toBe(false);
  });

  it("passada a validade, pergunta de novo", () => {
    const respondeu = (quando) => ({ verificado: true, em: quando });
    expect(deveSondar({
      firewall: respondeu(agora - 5000),
      tarefa: respondeu(agora - 5000),
      agora,
      validade: 1000,
    })).toBe(true);
  });

  it("basta uma das duas estar vencida", () => {
    expect(deveSondar({
      firewall: { verificado: true, em: agora },
      tarefa: { verificado: true, em: agora - 5000 },
      agora,
      validade: 1000,
    })).toBe(true);
  });

  it("não lança com estado ausente ou estragado", () => {
    expect(deveSondar()).toBe(true);
    expect(deveSondar({ firewall: null, tarefa: undefined, agora })).toBe(true);
    expect(deveSondar({ firewall: { em: "abc" }, tarefa: { em: agora }, agora })).toBe(true);
  });
});

// ── Desligar o auto-start ──────────────────────────────────────────────

describe("montarResultadoDesativacao", () => {
  const removeuTudo = {
    tarefa: { ok: true, removida: true, erro: null },
    atalhos: { ok: true, removidos: 1, erro: null },
  };

  it("tarefa e atalho removidos: ok, sem erro, e o log conta o que saiu", () => {
    const r = montarResultadoDesativacao(removeuTudo);
    expect(r.ok).toBe(true);
    expect(r.erro).toBe(null);
    expect(r.tarefaRemovida).toBe(true);
    expect(r.atalhosRemovidos).toBe(1);
    expect(r.log).toContain("removida");
  });

  it("não havia nada para remover: continua ok (clicar duas vezes não é erro)", () => {
    const r = montarResultadoDesativacao({
      tarefa: { ok: true, removida: false, erro: null },
      atalhos: { ok: true, removidos: 0, erro: null },
    });
    expect(r.ok).toBe(true);
    expect(r.erro).toBe(null);
    expect(r.log).toContain("não havia");
  });

  it("se o Windows recusou apagar a tarefa, o dono ouve o motivo", () => {
    const r = montarResultadoDesativacao({
      tarefa: { ok: false, removida: false, erro: "acesso negado" },
      atalhos: { ok: true, removidos: 1, erro: null },
    });
    expect(r.ok).toBe(false);
    expect(r.erro).toContain("acesso negado");
    expect(r.erro).toMatch(/abertura automática/);
  });

  it("atalho travado também derruba o ok — nada de dizer que desligou quando não desligou", () => {
    const r = montarResultadoDesativacao({
      tarefa: { ok: true, removida: true, erro: null },
      atalhos: { ok: false, removidos: 0, erro: "arquivo em uso" },
    });
    expect(r.ok).toBe(false);
    expect(r.erro).toContain("arquivo em uso");
  });
});

// ── Atualizar o executável instalado ───────────────────────────────────

describe("atualizarInstalado", () => {
  it("fora do empacotado, recusa com explicação e NÃO lança", async () => {
    const r = await atualizarInstalado();
    expect(r.ok).toBe(false);
    expect(r.atualizou).toBe(false);
    expect(r.caminho).toBe(null);
    expect(r.erro).toMatch(/KoraPonte.exe/);
  });

  it("devolve sempre o mesmo formato de resultado", async () => {
    const r = await atualizarInstalado();
    expect(Object.keys(r).sort()).toEqual(
      ["atualizou", "caminho", "erro", "jaEraEste", "motivo", "ok"],
    );
  });

  it("não copia nada para a pasta de instalação em modo de desenvolvimento", async () => {
    const antes = fs.existsSync(caminhoExeInstalado());
    await atualizarInstalado();
    expect(fs.existsSync(caminhoExeInstalado())).toBe(antes);
  });
});

// ── A troca do executável em si ────────────────────────────────────────
//
// Aqui é onde um erro custa caro: se a troca falhar no meio do caminho, o PC
// do caixa pode ficar SEM KoraPonte.exe — nenhuma comanda sai e ninguém sabe
// por quê. Estes testes fazem a troca de verdade em os.tmpdir(), com arquivos
// de mentira, e forçam os dois desastres pelas operações de arquivo injetadas.

describe("trocarExecutavel", () => {
  function cenario(nome) {
    const dir = path.join(sandbox, nome);
    fs.mkdirSync(dir, { recursive: true });
    const origem = path.join(dir, "baixado.exe");
    const destino = path.join(dir, NOME_EXE);
    fs.writeFileSync(origem, "programa novo");
    fs.writeFileSync(destino, "programa velho");
    return { dir, origem, destino };
  }

  const sobras = (dir) => fs.readdirSync(dir).filter((n) => n.includes(".antigo-"));

  it("troca normal: o destino fica com o programa novo e não sobra nada na pasta", async () => {
    const { dir, origem, destino } = cenario("troca-normal");

    const r = await trocarExecutavel({ origem, destino });

    expect(fs.readFileSync(destino, "utf8")).toBe("programa novo");
    expect(r.sobrou).toBe(false);
    expect(sobras(dir)).toEqual([]);
  });

  it("primeira instalação (nada no destino): copia e não tenta renomear nada", async () => {
    const dir = path.join(sandbox, "troca-primeira");
    fs.mkdirSync(dir, { recursive: true });
    const origem = path.join(dir, "baixado.exe");
    const destino = path.join(dir, NOME_EXE);
    fs.writeFileSync(origem, "programa novo");

    const r = await trocarExecutavel({ origem, destino });

    expect(fs.readFileSync(destino, "utf8")).toBe("programa novo");
    expect(r.sobrou).toBe(false);
    expect(sobras(dir)).toEqual([]);
  });

  it("cópia que falha no meio: o programa antigo VOLTA para o lugar", async () => {
    // Disco cheio, antivírus mordendo o arquivo, pen drive arrancado. Durante
    // a troca a pasta fica um instante sem executável nenhum (o antigo sai da
    // frente antes de o novo ser gravado) — o que este teste cobra é o FIM
    // dela: deu errado, o programa velho tem que estar de volta no lugar.
    //
    // O `copyFile` de mentira ESCREVE antes de estourar porque é isso que o
    // disco cheio faz: o do sistema cria e trunca o destino antes de copiar os
    // bytes. Se ele só lançasse, o cenário ensaiado seria "a cópia nem
    // começou" — e é justamente o outro, o exe pela metade no lugar do bom,
    // que deixa o caixa sem comanda saindo.
    const { dir, origem, destino } = cenario("troca-copia-falha");

    await expect(trocarExecutavel({
      origem,
      destino,
      fs: {
        copyFile: async (de, para) => {
          await fsp.writeFile(para, "progra");
          throw Object.assign(new Error("no space left on device"), { code: "ENOSPC" });
        },
      },
    })).rejects.toThrow("no space left on device");

    expect(fs.existsSync(destino)).toBe(true);
    expect(fs.readFileSync(destino, "utf8")).toBe("programa velho");
    expect(sobras(dir)).toEqual([]);
  });

  it("Windows segurando o exe antigo: a troca vale mesmo assim e a sobra fica para depois", async () => {
    // O exe antigo ainda está no ar (é ele quem está fazendo esta troca). O
    // Windows recusa apagá-lo, e tudo bem: `limparRestos` varre na subida
    // seguinte. O que não pode é a atualização inteira falhar por causa disso.
    const { dir, origem, destino } = cenario("troca-antigo-travado");

    const r = await trocarExecutavel({
      origem,
      destino,
      fs: { rm: async () => { throw Object.assign(new Error("resource busy"), { code: "EBUSY" }); } },
    });

    expect(fs.readFileSync(destino, "utf8")).toBe("programa novo");
    expect(r.sobrou).toBe(true);
    expect(fs.readFileSync(r.antigo, "utf8")).toBe("programa velho");
    expect(sobras(dir)).toEqual([path.basename(r.antigo)]);
  });
});

describe("limparRestos", () => {
  it("varre só as sobras da atualização, sem encostar no programa nem na ficha", async () => {
    const dir = path.join(sandbox, "restos");
    fs.mkdirSync(dir, { recursive: true });
    const exe = path.join(dir, NOME_EXE);
    const ficha = path.join(dir, NOME_MARCA);
    const resto1 = path.join(dir, `${NOME_EXE}.antigo-a1b2c3d4`);
    const resto2 = path.join(dir, `${NOME_EXE}.antigo-99887766`);
    fs.writeFileSync(exe, "programa");
    fs.writeFileSync(ficha, '{"versao":"1.0.0"}');
    fs.writeFileSync(resto1, "sobra");
    fs.writeFileSync(resto2, "sobra");

    await limparRestos(dir);

    expect(fs.existsSync(resto1)).toBe(false);
    expect(fs.existsSync(resto2)).toBe(false);
    expect(fs.readFileSync(exe, "utf8")).toBe("programa");
    expect(fs.readFileSync(ficha, "utf8")).toBe('{"versao":"1.0.0"}');
  });

  it("pasta que ainda não existe não é erro (primeira instalação)", async () => {
    await expect(limparRestos(path.join(sandbox, "nunca-existiu"))).resolves.toBeUndefined();
  });

  it("sobra travada pelo Windows não derruba a limpeza das outras", async () => {
    const dir = path.join(sandbox, "restos-travado");
    fs.mkdirSync(dir, { recursive: true });
    // Pasta com o nome de uma sobra: `rm` sem `recursive` recusa apagar, que é
    // o mais perto de "arquivo em uso" que dá para montar sem travar o disco.
    const travado = path.join(dir, `${NOME_EXE}.antigo-travado0`);
    const solto = path.join(dir, `${NOME_EXE}.antigo-11223344`);
    fs.mkdirSync(travado);
    fs.writeFileSync(path.join(travado, "dentro.txt"), "x");
    fs.writeFileSync(solto, "sobra");

    await expect(limparRestos(dir)).resolves.toBeUndefined();
    expect(fs.existsSync(solto)).toBe(false);

    await fsp.rm(travado, { recursive: true, force: true });
  });
});
