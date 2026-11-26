import { rotasApex } from "./apex";
import { rotasHostConsole, rotaConsoleNoApp } from "./console";
import { rotaCardapioPublico } from "./cardapioPublico";
import { rotasEstabelecimento } from "./estabelecimento";

/**
 * Escolhe as rotas da superfície pelo endereço. No host dedicado do Console,
 * só o Console. Em qualquer outro host, o app de sempre: o site da Kora (que
 * só aparece no domínio do site), o cardápio público, o `/console` e o
 * estabelecimento. A escolha é de experiência; a autorização real continua no
 * banco.
 *
 * @param {object} host
 * @param {boolean} host.naHostDoConsole - é o host dedicado do Console
 * @param {boolean} host.consoleForaDoHost - Console em subdomínio ligado e este host não é o dele
 * @param {boolean} host.noApex - é o endereço do site da Kora
 */
export function escolherRotas({ naHostDoConsole, consoleForaDoHost, noApex }) {
  if (naHostDoConsole) return rotasHostConsole;
  return [
    ...rotasApex(noApex),
    rotaCardapioPublico,
    rotaConsoleNoApp(consoleForaDoHost),
    ...rotasEstabelecimento,
  ];
}
