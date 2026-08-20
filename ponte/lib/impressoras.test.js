// Testes do transporte da Ponte KORA — a parte que faz a comanda sair (ou
// falhar em alto e bom som).
//
// O que estes testes protegem, em linguagem de restaurante:
// 1. Que o script mandado ao Windows seja lido com acento certo. O PC do caixa
//    costuma ter usuário "José"/"Conceição", e o caminho da pasta temporária
//    entra dentro do script — sem o BOM, o PowerShell 5.1 lê tudo na página de
//    código antiga, não acha o arquivo e NENHUMA comanda imprime naquele PC.
// 2. Que impressora de rede que aceita a conexão e corta no meio (sem papel,
//    buffer cheio, cabo puxado) seja tratada como FALHA. Se virar "concluído",
//    a fila apaga o trabalho e o prato não sai sem ninguém perceber.
import { EventEmitter } from "node:events";
import net from "node:net";
import { describe, it, expect, vi, afterEach } from "vitest";

// Para os casos de impressora de rede usamos um dublê de socket: é o único
// jeito de mandar a conexão fechar exatamente no meio do envio, que é o
// acidente que a gente quer provar que falha. `vi.hoisted` porque a fábrica do
// mock roda antes do resto do arquivo.
const estado = vi.hoisted(() => ({ duble: null }));

vi.mock("node:net", async (importOriginal) => {
  const real = await importOriginal();
  const base = real.default ?? real;
  function Socket(...args) {
    if (estado.duble) return estado.duble;
    return new base.Socket(...args);
  }
  // Só o Socket é dublado — createServer continua o de verdade, para o teste
  // de ponta a ponta subir um "servidor de impressora" local.
  return { ...real, default: { ...base, Socket }, Socket };
});

const { enviarBytes, montarScriptRaw, TIMEOUT_REDE_MS } = await import("./impressoras.js");

class SocketDeMentira extends EventEmitter {
  constructor() {
    super();
    this.timeoutMs = null;
    this.escrito = null;
    this.pediuFim = false;
    this.destruido = false;
  }
  setTimeout(ms) {
    this.timeoutMs = ms;
  }
  connect(porta, host, aoConectar) {
    this.porta = porta;
    this.host = host;
    this.aoConectar = aoConectar;
    return this;
  }
  write(bytes, aoEscrever) {
    this.escrito = bytes;
    this.aoEscrever = aoEscrever;
    return true;
  }
  end(aoTerminar) {
    this.pediuFim = true;
    this.aoTerminar = aoTerminar;
    return this;
  }
  destroy() {
    this.destruido = true;
  }
}

function comDuble() {
  const duble = new SocketDeMentira();
  estado.duble = duble;
  return duble;
}

afterEach(() => {
  estado.duble = null;
});

const DESTINO_REDE = { tipo: "rede", host: "10.0.0.9", porta: 9100 };
const COMANDA = Buffer.from("MESA 4 - 2x Feijoada\n");

describe("montarScriptRaw — o script que fala com o spooler do Windows", () => {
  const CAMINHO_NOME = "C:\\Users\\José\\AppData\\Local\\Temp\\kora-imp-ab12.txt";
  const CAMINHO_DADOS = "C:\\Users\\José\\AppData\\Local\\Temp\\kora-imp-ab12.bin";

  it("começa com BOM UTF-8 (EF BB BF) — senão o PowerShell lê o caminho em Windows-1252", () => {
    const script = montarScriptRaw(CAMINHO_NOME, CAMINHO_DADOS);

    expect(script.startsWith("\uFEFF")).toBe(true);
    // É assim que o arquivo chega ao disco: fs.writeFile(..., "utf8").
    expect([...Buffer.from(script, "utf8").subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  });

  it("leva os caminhos com acento inteiros para dentro do script", () => {
    const script = montarScriptRaw(CAMINHO_NOME, CAMINHO_DADOS);

    expect(script).toContain(`ReadAllText('${CAMINHO_NOME}'`);
    expect(script).toContain(`ReadAllBytes('${CAMINHO_DADOS}')`);
  });

  it("lê o nome da impressora dizendo UTF-8 na cara — 'Cozinha Fria - Balcão' tem que passar", () => {
    const script = montarScriptRaw(CAMINHO_NOME, CAMINHO_DADOS);

    // O arquivo do nome é gravado em utf8 sem BOM; a leitura precisa declarar
    // a codificação, senão o Windows adivinha errado e o acento vira lixo.
    expect(script).toContain(`ReadAllText('${CAMINHO_NOME}', [System.Text.Encoding]::UTF8)`);
  });
});

describe("enviarBytes — impressora de rede", () => {
  it("resolve quando a comanda inteira saiu (write concluído + despedida concluída)", async () => {
    const duble = comDuble();
    const promessa = enviarBytes(DESTINO_REDE, COMANDA);

    duble.aoConectar();
    expect(duble.escrito).toBe(COMANDA);
    duble.aoEscrever();
    expect(duble.pediuFim).toBe(true);
    duble.aoTerminar();
    duble.emit("close");

    await expect(promessa).resolves.toBeUndefined();
  });

  it("REJEITA quando a impressora fecha a conexão antes de receber tudo", async () => {
    const duble = comDuble();
    const promessa = enviarBytes(DESTINO_REDE, COMANDA);

    duble.aoConectar();
    duble.aoEscrever();
    // A despedida foi pedida mas nunca terminou: a impressora cortou no meio.
    duble.emit("close");

    await expect(promessa).rejects.toThrow(
      "A impressora 10.0.0.9:9100 fechou a conexão antes de receber a comanda inteira. Confira papel e conexão.",
    );
  });

  it("REJEITA quando fecha logo depois de conectar, sem nem escrever", async () => {
    const duble = comDuble();
    const promessa = enviarBytes(DESTINO_REDE, COMANDA);

    duble.aoConectar();
    duble.emit("close");

    await expect(promessa).rejects.toThrow(/fechou a conexão antes de receber a comanda inteira/);
  });

  it("rejeita quando a impressora não responde no tempo combinado", async () => {
    const duble = comDuble();
    const promessa = enviarBytes(DESTINO_REDE, COMANDA);

    expect(duble.timeoutMs).toBe(TIMEOUT_REDE_MS);
    duble.aoConectar();
    duble.emit("timeout");

    await expect(promessa).rejects.toThrow(
      `A impressora 10.0.0.9:9100 não respondeu em ${TIMEOUT_REDE_MS / 1000} segundos. Confira se ela está ligada e na rede.`,
    );
    expect(duble.destruido).toBe(true);
  });

  it("não muda de ideia depois de decidir: fechamento posterior não vira sucesso", async () => {
    const duble = comDuble();
    const promessa = enviarBytes(DESTINO_REDE, COMANDA);

    duble.aoConectar();
    duble.emit("timeout");
    duble.aoEscrever?.();
    duble.emit("close");

    await expect(promessa).rejects.toThrow(/não respondeu/);
  });

  it("de ponta a ponta: manda os bytes para um servidor local e só então resolve", async () => {
    const recebido = [];
    const servidor = net.createServer((conexao) => {
      conexao.on("data", (pedaco) => recebido.push(pedaco));
      conexao.on("end", () => conexao.end());
    });
    await new Promise((pronto) => servidor.listen(0, "127.0.0.1", pronto));
    const { port } = servidor.address();

    try {
      await enviarBytes({ tipo: "rede", host: "127.0.0.1", porta: port }, COMANDA);
      expect(Buffer.concat(recebido).toString("utf8")).toBe(COMANDA.toString("utf8"));
    } finally {
      await new Promise((pronto) => servidor.close(pronto));
    }
  });

  it("avisa em português quando ninguém atende naquele IP e porta", async () => {
    // Sobe e derruba o servidor só para pegar uma porta que com certeza está livre.
    const servidor = net.createServer();
    await new Promise((pronto) => servidor.listen(0, "127.0.0.1", pronto));
    const { port } = servidor.address();
    await new Promise((pronto) => servidor.close(pronto));

    await expect(
      enviarBytes({ tipo: "rede", host: "127.0.0.1", porta: port }, COMANDA),
    ).rejects.toThrow(/Não foi possível falar com a impressora 127\.0\.0\.1:/);
  });
});

describe("enviarBytes — guardas de entrada", () => {
  it("recusa comanda vazia antes de encostar na impressora", async () => {
    await expect(enviarBytes(DESTINO_REDE, Buffer.alloc(0))).rejects.toThrow(
      "Não há nada para enviar à impressora.",
    );
  });

  it("recusa destino desconhecido", async () => {
    await expect(enviarBytes({ tipo: "fax" }, COMANDA)).rejects.toThrow(
      "Destino de impressão desconhecido.",
    );
  });
});
