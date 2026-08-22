// Ponte KORA — leitura do corpo de uma requisição (o pedido que chega do
// celular, o catálogo que chega do caixa).
//
// Virou módulo próprio porque o defeito que morava aqui só aparecia no papel
// da cozinha, e ninguém desconfiava do servidor: o nome "João" saía "Jo??o" na
// comanda. A rede entrega o pedido em PEDAÇOS, e um acento ocupa dois bytes —
// quando o pedaço termina no meio de um acento, juntar os pedaços já virados
// em texto estraga a letra. Aqui os pedaços são juntados AINDA COMO BYTES e só
// no fim viram texto, que é a única forma de o acento chegar inteiro.
//
// Duas outras coisas que este módulo garante, e que valem o serviço inteiro:
// - o teto de tamanho conta BYTES (é o que ocupa a memória do PC do caixa),
//   não letras;
// - a promessa SEMPRE termina. Antes, um envio gigante era cortado no meio e a
//   resposta nunca saía: o garçom ficava olhando a tela rodando para sempre e
//   a ponte segurava aquela memória até ser fechada.

/** Teto do corpo: 1 MiB — o catálogo inteiro do cardápio cabe com folga. */
export const MAX_CORPO = 1024 * 1024;

/**
 * Lê o corpo da requisição e devolve o JSON já entendido. Nunca lança e nunca
 * fica pendurada: todo caminho (fim normal, corpo grande demais, conexão que
 * caiu) termina em uma resposta.
 *
 * No caso do corpo grande demais vem junto um `encerrar`: é quem desliga a
 * conexão, e quem chama só usa DEPOIS de responder (ver `servidor.js`). Ele
 * ainda espera o resto do envio escoar antes de desligar de fato — cortar com
 * bytes por ler apagaria a resposta no caminho.
 *
 * @param {import("node:http").IncomingMessage} req
 * @param {{max?: number}} [opcoes] teto em bytes
 * @returns {Promise<{dados?: *, erro?: string, encerrar?: () => void}>}
 */
export function lerCorpoJson(req, { max = MAX_CORPO } = {}) {
  return new Promise((resolve) => {
    const pedacos = [];
    let bytes = 0;
    let respondido = false;

    // Uma resposta só, aconteça o que acontecer. Sem esta trava, uma conexão
    // que cai logo depois de o corpo estourar o teto tentaria responder duas
    // vezes — e a segunda seria ignorada em silêncio, o que esconde o motivo.
    const responder = (resultado) => {
      if (respondido) return;
      respondido = true;
      resolve(resultado);
    };

    req.on("data", (parte) => {
      // Já respondemos (o corpo estourou o teto, a conexão caiu): o que ainda
      // estava a caminho na rede é descartado sem ocupar mais memória.
      if (respondido) return;

      const pedaco = Buffer.isBuffer(parte) ? parte : Buffer.from(parte);
      bytes += pedaco.length;

      if (bytes > max) {
        // Responde AGORA — esperar o "fim" de uma requisição que vai ser
        // cortada deixaria quem mandou o pedido esperando para sempre.
        //
        // Mas desligar aqui era cedo demais: a rota ainda ia escrever, NESTA
        // mesma conexão, o recado explicando que o envio passou do teto. Com
        // o socket já morto, o recado não saía e o garçom via "erro de rede"
        // — a frase existia e ninguém lia. Por isso o desligamento sai daqui
        // e vai junto da resposta, em `encerrar`: quem chama desliga depois
        // de responder.
        //
        // Ficar sem desligar até lá não trava nada: a promessa já terminou e
        // o que ainda chegar pela rede é descartado sem ocupar memória.
        responder({
          erro: "muito grande",
          encerrar: () => {
            const desligar = () => {
              try {
                req.destroy();
              } catch {
                // A conexão já tinha morrido sozinha — nada a desligar.
              }
            };
            // Ainda está chegando corpo pela rede? Cortar neste instante vira
            // um RST, e o RST faz o outro lado JOGAR FORA o que ainda não leu
            // — inclusive a resposta que a rota acabou de escrever. Foi o que
            // mediram: o celular recebia "erro de rede" no lugar da frase.
            // Então o resto escoa (é descartado ali em cima, sem ocupar
            // memória) e o desligamento fica para quando não houver mais nada
            // a ler. Envio que trava no meio não segura a conexão para sempre:
            // quem corta é o requestTimeout do próprio servidor HTTP.
            if (req.readableEnded === false) {
              req.once("end", desligar);
              req.once("close", desligar);
              return;
            }
            desligar();
          },
        });
        return;
      }

      pedacos.push(pedaco);
    });

    req.on("end", () => {
      let texto;
      try {
        texto = Buffer.concat(pedacos).toString("utf8");
      } catch {
        // Só chega aqui se a memória acabar ao juntar os pedaços.
        return responder({ erro: "conexão interrompida" });
      }
      try {
        responder({ dados: JSON.parse(texto || "null") });
      } catch {
        responder({ erro: "json inválido" });
      }
    });

    // A conexão pode morrer de três jeitos diferentes conforme a versão do
    // Node e o que o celular fez (fechou o app, saiu do Wi-Fi, o roteador
    // caiu). Todos precisam terminar a promessa — nenhum pode deixar a rota
    // esperando uma resposta que não vem mais.
    req.on("error", () => responder({ erro: "conexão interrompida" }));
    req.on("aborted", () => responder({ erro: "conexão interrompida" }));
    req.on("close", () => responder({ erro: "conexão interrompida" }));
  });
}
