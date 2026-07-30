/**
 * Helpers para verificação de senha admin e gestão de usuários.
 * Substitui o antigo padrão de hash SHA-256 no cliente.
 */
import { supabase } from "./supabase";

const EDGE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-user`;

const semRede = () => typeof navigator !== "undefined" && navigator.onLine === false;

// ── Verificação de senha ──────────────────────────────────────────
//
// Contrato: `{ ok, erro }`.
//   ok: true            → a senha confere.
//   ok: false, erro null → a senha foi comparada e NÃO confere.
//   ok: false, erro txt  → não deu para comparar; `erro` é o que dizer na tela.
//
// A separação existe porque as duas funções abaixo devolviam só `false`, e a
// tela traduzia todo `false` em "Senha incorreta". A RPC `verificar_senha_admin`
// (migration 20260802) trava em 5 falhas por minuto e avisa com RAISE EXCEPTION
// — esse aviso virava "senha incorreta", então o gerente ficava digitando a
// senha CERTA, sendo recusado, sem nenhuma pista de que era só esperar um
// minuto. Sem rede acontecia o mesmo: "senha incorreta" para quem digitou certo.
//
// Continua falhando FECHADO: qualquer imprevisto é `ok: false`. O que muda é a
// tela poder dizer a verdade.

const MSG_INDISPONIVEL = "Não foi possível validar a senha agora. Tente de novo em instantes.";
const MSG_SEM_REDE     = "Sem internet: a senha de administrador só pode ser validada online.";

/**
 * Traduz a falha da RPC no que cabe mostrar ao operador.
 *
 * O texto do rate-limit é nosso (está na migration), então pode ir para a tela.
 * Qualquer outra mensagem do Postgres fica de fora: não ajuda quem está no
 * balcão e pode expor nome de tabela/função.
 */
const motivoDaFalha = (error) => {
  const msg = String(error?.message ?? "");
  if (/muitas tentativas/i.test(msg)) return msg;
  if (semRede()) return MSG_SEM_REDE;
  return MSG_INDISPONIVEL;
};

/**
 * Verifica se a senha é válida para qualquer admin/gerente ativo do tenant.
 * @returns {Promise<{ok: boolean, erro: string|null}>}
 */
export async function verificarSenhaAdmin(password) {
  try {
    const { data, error } = await supabase.rpc("verificar_senha_admin", {
      p_password: password,
    });
    if (error) return { ok: false, erro: motivoDaFalha(error) };
    return { ok: !!data, erro: null };
  } catch (e) {
    // A RPC não deveria rejeitar (o supabase-js resolve o erro), mas isto é
    // gate de ação destrutiva no meio do atendimento: se rejeitar, nega.
    return { ok: false, erro: motivoDaFalha(e) };
  }
}

/**
 * Verifica se a senha é válida para um usuário específico com papel admin/gerente.
 * @returns {Promise<{ok: boolean, erro: string|null}>}
 */
export async function verificarSenhaUsuario(username, password) {
  try {
    const { data, error } = await supabase.rpc("verificar_senha_admin", {
      p_password: password,
      p_username: username,
    });
    if (error) return { ok: false, erro: motivoDaFalha(error) };
    return { ok: !!data, erro: null };
  } catch (e) {
    return { ok: false, erro: motivoDaFalha(e) };
  }
}

// ── Gestão de usuários via Edge Function ─────────────────────────

/**
 * Chama a Edge Function `manage-user`. NUNCA rejeita: devolve sempre
 * `{ data }` ou `{ error: <texto> }`, que é o contrato que todos os chamadores
 * já assumem (`const { error } = await criarAuthUsuario(...)`).
 *
 * Antes, três caminhos escapavam como exceção: `fetch` sem rede, um corpo que
 * não é JSON (502 do gateway, página de erro em HTML) e a desestruturação de
 * `getSession()`. Na exclusão de funcionário isso deixava o botão travado em
 * "Excluindo…" para sempre, com a linha de `users` já apagada.
 */
async function chamarEdge(body) {
  let res;
  try {
    const { data } = await supabase.auth.getSession();
    res = await fetch(EDGE_URL, {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${data?.session?.access_token ?? ""}`,
        "apikey":        import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify(body),
    });
  } catch {
    return { error: semRede() ? "Sem internet: esta ação precisa de conexão." : "Não foi possível falar com o servidor. Tente de novo." };
  }
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* corpo vazio ou não-JSON: decide pelo status abaixo */
  }
  if (!res.ok) return { error: json?.error ?? `Erro na Edge Function (HTTP ${res.status}).` };
  return { data: json };
}

export async function criarAuthUsuario({ username, password, name, role }) {
  return chamarEdge({ action: "create", username, password, name, role });
}

export async function atualizarSenhaAuth(auth_id, password) {
  return chamarEdge({ action: "update_password", auth_id, password });
}

export async function deletarAuthUsuario(auth_id) {
  return chamarEdge({ action: "delete", auth_id });
}
