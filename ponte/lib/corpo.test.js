// Testes da leitura do corpo da requisição.
//
// O que estes testes protegem, em linguagem do restaurante:
// - O acento do nome do cliente tem que chegar inteiro na comanda, mesmo
//   quando a rede parte o "ã" no meio e manda cada metade separada.
// - O teto de tamanho tem que contar BYTES: em português, letra com acento
//   ocupa dois — contando letras, um envio o dobro do permitido passaria.
// - Envio grande demais tem que ser RECUSADO NA HORA. Se a ponte ficar
//   esperando o fim de uma conexão que ela mesma cortou, o garçom fica com a
//   tela rodando para sempre e o PC do caixa segura aquela memória à toa.
// - E o motivo desse "grande demais" tem que CHEGAR ao outro lado: quem corta
//   a conexão é quem responde, depois de responder. Cortando aqui dentro, a
//   resposta morria junto com o socket e o celular mostrava só "erro de rede".
// - "Grande demais" e "formato errado" são problemas DIFERENTES e precisam sair
//   daqui como motivos diferentes. Enquanto os dois viravam a mesma frase
//   ("tente de novo"), o caixa reenviava o mesmo arquivo gigante em looping,
//   recebendo sempre o mesmo erro. Quem escreve a frase é a rota, em
//   servidor.js (`recadoDeCorpo`) — este arquivo só garante que ela recebe o
//   motivo certo para escolher.
import { describe, it, expect } from "vitest";
import { EventEmitter } from "node:events";
import http from "node:http";
import { lerCorpoJson, MAX_CORPO } from "./corpo.js";

/** Requisição de mentira: emite os pedaços na mão, como a rede faria. */
class RequisicaoFalsa extends EventEmitter {
  constructor() {
    super();
    this.destruida = 0;
  }

  destroy() {
    this.destruida += 1;
  }
}

/** Espera a promessa, mas desiste rápido — promessa pendurada é defeito. */
function comPrazo(promessa, ms = 50) {
  return Promise.race([
    promessa,
    new Promise((res) => setTimeout(() => res({ erro: "ficou pendurada" }), ms)),
  ]);
}

describe("acento partido entre dois pedaços da rede", () => {
  it("junta os bytes antes de virar texto — o nome chega inteiro", async () => {
    const req = new RequisicaoFalsa();
    const promessa = lerCorpoJson(req);
    const inteiro = Buffer.from(JSON.stringify({ cliente: "João", obs: "sem cebola, açaí à parte" }), "utf8");

    // Corta EXATAMENTE no meio do "ã" (dois bytes) — é o que a rede faz
    // quando o pacote enche na hora errada.
    const meio = inteiro.indexOf(Buffer.from("ã", "utf8")) + 1;
    req.emit("data", inteiro.subarray(0, meio));
    req.emit("data", inteiro.subarray(meio));
    req.emit("end");

    const { dados, erro } = await comPrazo(promessa);
    expect(erro).toBeUndefined();
    expect(dados.cliente).toBe("João");
    expect(dados.obs).toBe("sem cebola, açaí à parte");
  });

  it("aguenta o corpo chegando byte a byte", async () => {
    const req = new RequisicaoFalsa();
    const promessa = lerCorpoJson(req);
    const inteiro = Buffer.from(JSON.stringify({ item: "Pão de queijo — porção" }), "utf8");

    for (const byte of inteiro) req.emit("data", Buffer.from([byte]));
    req.emit("end");

    const { dados } = await comPrazo(promessa);
    expect(dados.item).toBe("Pão de queijo — porção");
  });
});

describe("teto de tamanho", () => {
  it("conta bytes, não letras — texto acentuado no dobro do teto é recusado", async () => {
    const req = new RequisicaoFalsa();
    const promessa = lerCorpoJson(req, { max: 10 });

    // 6 letras "ç" = 6 letras, mas 12 bytes. Contando letras isso passaria.
    req.emit("data", Buffer.from("çççççç", "utf8"));

    const { erro } = await comPrazo(promessa);
    expect(erro).toBe("muito grande");
  });

  it("deixa passar o corpo que cabe exatamente no teto", async () => {
    const req = new RequisicaoFalsa();
    const corpo = Buffer.from(JSON.stringify({ ok: true }), "utf8");
    const promessa = lerCorpoJson(req, { max: corpo.length });

    req.emit("data", corpo);
    req.emit("end");

    const { dados, erro } = await comPrazo(promessa);
    expect(erro).toBeUndefined();
    expect(dados).toEqual({ ok: true });
  });

  it("o teto padrão é 1 MiB", () => {
    expect(MAX_CORPO).toBe(1024 * 1024);
  });
});

describe("corpo gigante", () => {
  it("responde na hora, sem esperar o fim de uma conexão que já foi cortada", async () => {
    const req = new RequisicaoFalsa();
    const promessa = lerCorpoJson(req, { max: 64 });

    req.emit("data", Buffer.alloc(65, 0x61));
    // De propósito: NUNCA emitimos "end". É o que acontece de verdade quando
    // a requisição é destruída — e é aí que a ponte ficava pendurada.
    const { erro, encerrar } = await comPrazo(promessa);

    expect(erro).toBe("muito grande");
    // A conexão continua de pé neste instante: é nela que a rota ainda vai
    // escrever a frase explicando o que houve. O desligamento vem junto da
    // resposta, em `encerrar`, e só acontece quando quem chama manda.
    expect(req.destruida).toBe(0);
    expect(typeof encerrar).toBe("function");
    encerrar();
    expect(req.destruida).toBe(1);
  });

  it("não muda de resposta se a conexão morrer logo depois", async () => {
    const req = new RequisicaoFalsa();
    const promessa = lerCorpoJson(req, { max: 8 });

    req.emit("data", Buffer.alloc(9, 0x61));
    req.emit("error", new Error("socket hang up"));
    req.emit("close");

    const { erro } = await comPrazo(promessa);
    expect(erro).toBe("muito grande");
  });

  it("guarda só o que já veio — para de acumular assim que estoura", async () => {
    const req = new RequisicaoFalsa();
    const promessa = lerCorpoJson(req, { max: 4 });

    req.emit("data", Buffer.alloc(5, 0x61));
    req.emit("data", Buffer.alloc(1024 * 1024, 0x61)); // chegou atrasado
    req.emit("end");

    const { erro, encerrar } = await comPrazo(promessa);
    expect(erro).toBe("muito grande");
    // Nada de acumular o que chegou atrasado — e nada de cortar por conta
    // própria: o corte é de quem responde, e só depois de responder.
    expect(req.destruida).toBe(0);
    encerrar();
    expect(req.destruida).toBe(1);
  });

  it("a resposta da rota chega inteira ao cliente antes de a conexão cair", async () => {
    // Servidor e socket de verdade, porque é exatamente aqui que o defeito
    // aparecia: cortando a conexão junto com a resposta da leitura, o navegador
    // via ECONNRESET e o garçom lia "erro de rede" no lugar da explicação.
    // Este é o arranjo que `servidor.js` usa — desligar só no `finish`.
    //
    // O que este teste NÃO confere: a frase que a ponte de verdade responde.
    // Ela nasce em `recadoDeCorpo`, dentro de servidor.js, e importar aquele
    // arquivo aqui subiria o servidor numa porta e gravaria na pasta de dados
    // da máquina — não dá, num teste. A rota abaixo é de mentira e as frases
    // são DELA, marcadas para ninguém confundir: escrever aqui uma frase
    // bonita e dizer que é a da ponte seria o teste mentindo.
    //
    // O que se prova, e é o que importa: o motivo chega separado até a rota,
    // a rota consegue responder coisas DIFERENTES para problemas diferentes,
    // e o que ela escreveu chega inteiro do outro lado.
    const FRASE_DA_ROTA_DE_MENTIRA = {
      "muito grande": "teste: passou do teto",
      "json inválido": "teste: formato errado",
    };

    const servidor = http.createServer((req, res) => {
      lerCorpoJson(req, { max: 64 }).then(({ erro, encerrar }) => {
        if (typeof encerrar === "function") res.once("finish", encerrar);
        res.writeHead(erro ? 400 : 200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: !erro, erro: FRASE_DA_ROTA_DE_MENTIRA[erro] ?? null }));
      });
    });
    await new Promise((pronto) => servidor.listen(0, "127.0.0.1", pronto));

    const mandar = (corpo) => new Promise((resolve, reject) => {
      const pedido = http.request({
        host: "127.0.0.1",
        port: servidor.address().port,
        method: "POST",
        path: "/pedido",
        headers: { "Content-Type": "application/json" },
      }, (res) => {
        let texto = "";
        res.setEncoding("utf8");
        res.on("data", (parte) => { texto += parte; });
        res.on("end", () => resolve({ status: res.statusCode, corpo: texto }));
      });
      pedido.on("error", reject);
      pedido.end(corpo);
    });

    try {
      // Envio que estoura o teto: é o caso em que a conexão vai ser cortada
      // logo depois, e em que a resposta corria o risco de morrer no caminho.
      const gigante = await mandar(Buffer.alloc(200 * 1024, 0x61));
      expect(gigante.status).toBe(400);
      expect(JSON.parse(gigante.corpo).erro).toBe(FRASE_DA_ROTA_DE_MENTIRA["muito grande"]);

      // Mesmo tamanho de problema, motivo outro — e a rota respondeu outra
      // coisa. É essa separação que impede o "tente de novo" para todo caso.
      const quebrado = await mandar(Buffer.from("{isso não é json", "utf8"));
      expect(quebrado.status).toBe(400);
      expect(JSON.parse(quebrado.corpo).erro).toBe(FRASE_DA_ROTA_DE_MENTIRA["json inválido"]);
      expect(JSON.parse(quebrado.corpo).erro).not.toBe(JSON.parse(gigante.corpo).erro);
    } finally {
      await new Promise((pronto) => servidor.close(pronto));
    }
  });
});

describe("conteúdo do corpo", () => {
  it("corpo vazio vira null em vez de erro", async () => {
    const req = new RequisicaoFalsa();
    const promessa = lerCorpoJson(req);
    req.emit("end");

    const { dados, erro } = await comPrazo(promessa);
    expect(erro).toBeUndefined();
    expect(dados).toBe(null);
  });

  it("texto que não é JSON vira 'json inválido'", async () => {
    const req = new RequisicaoFalsa();
    const promessa = lerCorpoJson(req);
    req.emit("data", Buffer.from("{isso não é json", "utf8"));
    req.emit("end");

    const { erro } = await comPrazo(promessa);
    expect(erro).toBe("json inválido");
  });
});

describe("conexão que cai no meio", () => {
  it("erro na conexão termina a espera", async () => {
    const req = new RequisicaoFalsa();
    const promessa = lerCorpoJson(req);
    req.emit("data", Buffer.from('{"comanda":"12"', "utf8"));
    req.emit("error", new Error("ECONNRESET"));

    const { erro } = await comPrazo(promessa);
    expect(erro).toBe("conexão interrompida");
  });

  it("celular que sai do Wi-Fi no meio do envio termina a espera", async () => {
    const req = new RequisicaoFalsa();
    const promessa = lerCorpoJson(req);
    req.emit("data", Buffer.from('{"comanda":"12"', "utf8"));
    req.emit("aborted");

    const { erro } = await comPrazo(promessa);
    expect(erro).toBe("conexão interrompida");
  });

  it("conexão fechada sem terminar o envio termina a espera", async () => {
    const req = new RequisicaoFalsa();
    const promessa = lerCorpoJson(req);
    req.emit("close");

    const { erro } = await comPrazo(promessa);
    expect(erro).toBe("conexão interrompida");
  });

  it("o 'close' que vem depois do fim normal não estraga a resposta", async () => {
    const req = new RequisicaoFalsa();
    const promessa = lerCorpoJson(req);
    req.emit("data", Buffer.from('{"comanda":"12"}', "utf8"));
    req.emit("end");
    req.emit("close"); // o Node sempre emite este depois do "end"

    const { dados, erro } = await comPrazo(promessa);
    expect(erro).toBeUndefined();
    expect(dados).toEqual({ comanda: "12" });
  });
});
