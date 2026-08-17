import { supabase } from "./supabase";
import { emailDoSocio, slugDoSocio } from "./pautasHost";
import { esquecerTokenAuthLocal } from "@/utils/session";

/**
 * Autenticação dos sócios nas Pautas da Kora.
 *
 * Separada do login do PDV (AppContext.login) de propósito: aqui não existe
 * tabela `usuarios`, nem papel, nem tenant, nem fila offline. A sessão é só
 * o Supabase Auth no namespace `@pautas.local` — a mesma credencial que a
 * RLS (`public.eh_socio_pautas()`) exige para ler ou escrever qualquer
 * pauta. Sem esse namespace, o banco nega tudo.
 *
 * As contas são criadas à mão no painel (Authentication → Users), uma por
 * sócio, com e-mail `<slug>@pautas.local` — não há cadastro pela tela.
 */

/**
 * Entra com usuário e senha de sócio.
 *
 * @param {string} usuario - ex.: "matheus"
 * @param {string} senha
 * @returns {Promise<{ok: boolean, slug: string|null, error: string|null}>}
 */
export async function entrar(usuario, senha) {
  const email = emailDoSocio(usuario);
  // Usuário que nem forma um endereço válido não é erro de senha: não vai à
  // rede, e a mensagem fala do campo, não da credencial.
  if (!email) return { ok: false, slug: null, error: "Usuário inválido. Use apenas letras e números." };
  const password = String(senha ?? "").slice(0, 100);
  if (!password) return { ok: false, slug: null, error: "Digite sua senha." };

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, slug: null, error: mensagemDaFalha(error) };

  return { ok: true, slug: slugDoSocio(data?.user?.email), error: null };
}

/**
 * Traduz a falha do Supabase Auth para uma frase que ajude a resolver.
 *
 * Usuário inexistente e senha errada continuam com a MESMA frase de
 * propósito: dizer qual dos dois falhou confirmaria a lista de sócios para
 * quem estivesse tentando. Já "conta não confirmada", "muitas tentativas" e
 * "servidor fora do ar" não contam nada sobre quem existe — e sem elas a
 * tela culpa a senha por um problema que não é de senha, e quem está
 * tentando entrar fica sem saber o que fazer a seguir.
 *
 * @param {{code?: string, status?: number}} error
 * @returns {string}
 */
export function mensagemDaFalha(error) {
  const codigo = String(error?.code ?? "");
  const status = Number(error?.status ?? 0);

  // Conta existe e a senha está certa, mas ninguém confirmou o e-mail no
  // painel. Insistir na senha aqui é procurar no lugar errado.
  if (codigo === "email_not_confirmed") {
    return "Conta ainda não confirmada. Peça para confirmar no painel e tente de novo.";
  }
  if (codigo === "over_request_rate_limit" || status === 429) {
    return "Muitas tentativas seguidas. Espere um minuto e tente de novo.";
  }
  // Sem status (falha de rede do fetch) ou 5xx: o problema não é a credencial.
  if (!status || status >= 500) {
    return "Não conseguimos falar com o servidor. Confira sua internet e tente de novo.";
  }
  return "Usuário ou senha incorretos.";
}

/**
 * Encerra a sessão. Se o servidor não confirmar (offline, fora do ar), o
 * token do Supabase é apagado deste navegador na mão — senão o próximo
 * carregamento religaria a sessão sem pedir senha.
 *
 * @returns {Promise<{error: object|null}>}
 */
export async function sair() {
  const { error } = await supabase.auth.signOut();
  if (error) esquecerTokenAuthLocal();
  return { error: error ?? null };
}

/**
 * Slug do sócio da sessão atual, ou null se não há sessão de sócio.
 * @returns {Promise<string|null>}
 */
export async function socioDaSessao() {
  const { data } = await supabase.auth.getSession();
  return slugDoSocio(data?.session?.user?.email);
}

/**
 * Avisa quando a sessão muda (login, logout, expiração do token) para a tela
 * voltar ao login sozinha em vez de mostrar uma lista que já não carrega.
 *
 * @param {(slug: string|null) => void} callback
 * @returns {() => void} cancela a inscrição
 */
export function observarSessao(callback) {
  const { data } = supabase.auth.onAuthStateChange((_evento, session) => {
    callback(slugDoSocio(session?.user?.email));
  });
  return () => data?.subscription?.unsubscribe?.();
}
