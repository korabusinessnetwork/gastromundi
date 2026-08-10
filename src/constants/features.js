/**
 * Chaves de funcionalidade da PLATAFORMA — o que está ligado nesta instalação,
 * independentemente do plano contratado por um estabelecimento.
 *
 * Não confundir com módulos (`src/constants/modulos.js`): módulo é o que o
 * tenant COMPROU; chave de funcionalidade é o que a plataforma CONSEGUE
 * entregar hoje. Uma funcionalidade desligada aqui não aparece para ninguém,
 * nem para quem tem o módulo no plano.
 *
 * Regra: sempre com default DESLIGADO. Ligar é decisão explícita de quem opera
 * a plataforma, feita na variável de ambiente do deploy — nunca no código.
 */

/**
 * Jarvas (IA). Desligado por decisão do dono em 10/08/2026: o assistente
 * conversacional depende de `ANTHROPIC_API_KEY` nos secrets da Edge Function e,
 * sem a chave, a aba responde erro 500 na cara do cliente. Enquanto o custo por
 * uso não estiver aprovado, o Jarvas não é vendido nem exibido — na landing ele
 * aparece como "em breve" em vez de item comprável.
 *
 * Para religar: `VITE_JARVAS_ATIVO=true` no ambiente do deploy, DEPOIS de
 * configurar `ANTHROPIC_API_KEY` nos secrets das Edge Functions.
 */
export const JARVAS_ATIVO = import.meta.env.VITE_JARVAS_ATIVO === "true";
