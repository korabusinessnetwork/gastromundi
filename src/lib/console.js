import { supabase } from "./supabase";

/**
 * Console da Plataforma (S1-2, ADR-008 §7) — camada de dados.
 *
 * É o painel do super-admin `plataforma` (o dono do SaaS), NÃO um menu do
 * estabelecimento. Só quem tem papel 'plataforma' (tenant_id NULL) chega
 * aqui (rota protegida por ConsoleRoute) — e a autorização REAL vive no
 * banco: as leituras dependem do ramo `OR is_super_admin()` das policies
 * de `tenants` (Leva 4, 20260726) e a escrita passa pela Edge Function
 * `provisionar-estabelecimento`, que reconfirma o papel. O front aqui é
 * só a casca; nenhuma decisão de acesso é tomada no cliente.
 */

const EDGE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/provisionar-estabelecimento`;

/**
 * Lista os estabelecimentos (tenants) da plataforma. Só o super-admin
 * enxerga mais de um — a policy de `tenants` filtra por
 * `id = tenant_atual_id() OR is_super_admin()`; um `plataforma` cai no
 * segundo ramo e vê todos. Campos explícitos (nunca `select *`).
 *
 * Nunca lança: falha de rede/RLS volta como { data: [], error } para o
 * chamador tratar o estado de erro na UI.
 *
 * @returns {Promise<{data: Array<{id:string,nome:string,plano_codigo:string,created_at:string}>, error: object|null}>}
 */
export async function listarEstabelecimentos() {
  try {
    const { data, error } = await supabase
      .from("tenants")
      .select("id, nome, plano_codigo, created_at")
      .order("created_at", { ascending: false });
    if (error) return { data: [], error };
    return { data: data ?? [], error: null };
  } catch (err) {
    return { data: [], error: { message: err?.message ?? "Falha ao listar estabelecimentos." } };
  }
}

/**
 * Lista os planos disponíveis para o formulário de criação, direto do
 * catálogo central (`public.planos`) — nunca hardcoded no front. Só os
 * planos ativos, na ordem de tier definida no banco.
 *
 * @returns {Promise<{data: Array<{codigo:string,nome:string}>, error: object|null}>}
 */
export async function listarPlanos() {
  try {
    const { data, error } = await supabase
      .from("planos")
      .select("codigo, nome, ordem")
      .eq("ativo", true)
      .order("ordem", { ascending: true });
    if (error) return { data: [], error };
    return { data: (data ?? []).map(({ codigo, nome }) => ({ codigo, nome })), error: null };
  } catch (err) {
    return { data: [], error: { message: err?.message ?? "Falha ao buscar os planos." } };
  }
}

/**
 * Normaliza o username do 1º admin do estabelecimento para a convenção
 * de login global do app (email = `${username}@gastromundi.local`):
 * minúsculas, sem espaços, só [a-z0-9._-]. Enquanto o login não é ciente
 * de tenant, o username precisa ser único na plataforma inteira — por
 * isso a normalização é previsível (o mesmo texto vira sempre o mesmo
 * username, evitando duplicatas "invisíveis" por caixa/acentuação).
 *
 * @param {string} raw
 * @returns {string}
 */
export function normalizarUsername(raw) {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // remove acentos
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9._-]/g, "");
}

/**
 * Função pura — valida o formulário de "Criar estabelecimento" ANTES de
 * chamar a Edge Function (prevenção de erro > mensagem de erro,
 * Princípio nº1). Devolve um mapa de erros por campo; `ok` é true só
 * quando o mapa está vazio. Não faz I/O — testável isoladamente
 * (CLAUDE.md: função pura nasce com teste).
 *
 * @param {{nome?:string, planoCodigo?:string, adminNome?:string, adminUsername?:string, adminPassword?:string}} f
 * @returns {{ok: boolean, erros: Record<string,string>}}
 */
export function validarNovoEstabelecimento(f = {}) {
  const erros = {};

  const nome = String(f.nome ?? "").trim();
  if (!nome) erros.nome = "Informe o nome do estabelecimento.";

  if (!String(f.planoCodigo ?? "").trim()) erros.planoCodigo = "Escolha um plano.";

  const adminNome = String(f.adminNome ?? "").trim();
  if (!adminNome) erros.adminNome = "Informe o nome do responsável.";

  const username = normalizarUsername(f.adminUsername);
  if (!username) {
    erros.adminUsername = "Informe o usuário de acesso do responsável.";
  } else if (username.length < 3) {
    erros.adminUsername = "O usuário precisa ter ao menos 3 caracteres.";
  }

  const senha = String(f.adminPassword ?? "");
  if (!senha) {
    erros.adminPassword = "Defina uma senha para o responsável.";
  } else if (senha.length < 6) {
    erros.adminPassword = "A senha precisa ter ao menos 6 caracteres.";
  }

  return { ok: Object.keys(erros).length === 0, erros };
}

/**
 * Provisiona um estabelecimento novo (tenant + 1º admin) via Edge
 * Function `provisionar-estabelecimento`. A função de borda é a única
 * que pode criar a credencial em auth.users (Admin API/service_role) e
 * faz a operação de forma atômica com compensação — o front só monta o
 * payload e repassa o token do super-admin.
 *
 * Nunca lança: erro de rede/autorização volta como { error } para a UI.
 *
 * @param {{nome:string, planoCodigo:string, tema?:object, adminNome:string, adminUsername:string, adminPassword:string}} payload
 * @returns {Promise<{data?:object, error?:string}>}
 */
export async function provisionarEstabelecimento(payload) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return { error: "Sessão expirada. Entre novamente." };

    const res = await fetch(EDGE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${session.access_token}`,
        "apikey": import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({
        nome: payload.nome,
        plano_codigo: payload.planoCodigo,
        tema: payload.tema ?? {},
        admin: {
          name: payload.adminNome,
          username: normalizarUsername(payload.adminUsername),
          password: payload.adminPassword,
        },
      }),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { error: json.error ?? "Falha ao criar o estabelecimento." };
    return { data: json };
  } catch (err) {
    return { error: err?.message ?? "Falha de rede ao criar o estabelecimento." };
  }
}
