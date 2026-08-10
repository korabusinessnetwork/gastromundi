// Trava de tentativas de login — o lado cliente da RPC do servidor.
// Pré-venda §1.9 · TD008 · migração 20260920_login_rate_limit_servidor.sql
//
// O contador do navegador (`getAttempts`/`setAttempts`) continua sendo a
// primeira linha: responde na hora, funciona offline e é o que desenha as
// bolinhas de tentativas restantes. O que este módulo acrescenta é a linha que
// NÃO se apaga limpando o `localStorage`.
//
// Regra de ouro deste arquivo: falhar ABERTO. Se a RPC não responder, se a
// migração ainda não tiver sido aplicada, se a rede cair — o login segue. Uma
// trava que se fecha quando o servidor tosse deixa o restaurante inteiro fora
// do próprio PDV no meio do almoço, o que é muito pior do que o ataque que ela
// evita. Quem realmente barra credencial errada é o Supabase Auth, logo depois.
import { supabase } from "../supabase";

/** Resposta padrão quando não há motivo afirmado para barrar. */
export const LIBERADO = Object.freeze({ podeTentar: true, segundos: 0 });

/**
 * Traduz o retorno cru da RPC (`{ pode_tentar, segundos }`) para o formato que
 * a tela usa. Qualquer coisa fora do formato esperado vira LIBERADO — não se
 * bloqueia ninguém por causa de um payload que não se entendeu.
 *
 * @param {unknown} data - jsonb devolvido por `registrar_tentativa_login`
 * @returns {{podeTentar: boolean, segundos: number}}
 */
export function interpretarTravaDeLogin(data) {
  if (!data || typeof data !== "object" || data.pode_tentar !== false) return LIBERADO;
  const segundos = Math.round(Number(data.segundos));
  // Bloqueio precisa sempre dizer uma espera de pelo menos 1s: "aguarde 0s"
  // manda a pessoa tentar de novo agora e levar a mesma recusa.
  return { podeTentar: false, segundos: Number.isFinite(segundos) ? Math.max(segundos, 1) : 1 };
}

/**
 * Pergunta ao servidor se este endereço de login ainda pode tentar.
 *
 * A senha vai junto porque é ela que dá dente à trava: o servidor confere a
 * senha de verdade, então o contador anda por falha real (e quem acerta a
 * senha nunca é barrado, nem estando bloqueado). A resposta nunca diz se a
 * senha estava certa — só se pode tentar.
 *
 * @param {string} email - endereço montado por `emailDoLogin`
 * @param {string} senha - a senha digitada, já higienizada
 * @returns {Promise<{podeTentar: boolean, segundos: number}>}
 */
export async function consultarTravaDeLogin(email, senha) {
  try {
    const { data, error } = await supabase.rpc("registrar_tentativa_login", {
      p_email: email,
      p_senha: senha,
    });
    if (error) return LIBERADO;
    return interpretarTravaDeLogin(data);
  } catch {
    // Inclui o caso de a RPC não existir ainda no banco daquele cliente.
    return LIBERADO;
  }
}
