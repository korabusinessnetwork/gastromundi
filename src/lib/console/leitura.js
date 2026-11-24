import { supabase } from "../supabase";

// Leituras do banco: estabelecimentos, planos e assinaturas.
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

export const EDGE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/provisionar-estabelecimento`;

/**
 * Lista os estabelecimentos (tenants) da plataforma. Só o super-admin
 * enxerga mais de um — a policy de `tenants` filtra por
 * `id = tenant_atual_id() OR is_super_admin()`; um `plataforma` cai no
 * segundo ramo e vê todos. Campos explícitos (nunca `select *`).
 *
 * Nunca lança: falha de rede/RLS volta como { data: [], error } para o
 * chamador tratar o estado de erro na UI.
 *
 * O `slug` vem junto porque é o endereço da vitrine pública do
 * estabelecimento — é dele que sai o atalho "Ver cardápio" da lista
 * (CONSOLE-UX 15). Pode ser null em tenant anterior à 20260740.
 *
 * @returns {Promise<{data: Array<{id:string,nome:string,plano_codigo:string,tema:object|null,slug:string|null,created_at:string}>, error: object|null}>}
 */
export async function listarEstabelecimentos() {
  try {
    const { data, error } = await supabase
      .from("tenants")
      .select("id, nome, plano_codigo, tema, slug, created_at")
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
 * Lista as assinaturas de TODOS os tenants — leitura cross-tenant do
 * Console. Só o super-admin `plataforma` enxerga mais de uma: a policy
 * `assinaturas_select_auth` (20260726) filtra por
 * `tenant_id = tenant_atual_id() OR is_super_admin()`, e um `plataforma`
 * (tenant_id NULL) cai no segundo ramo e vê todas. Campos explícitos
 * (nunca `select *` em tabela sensível de billing).
 *
 * O `status` que vem aqui é só o CACHE do banco (pode estar defasado sem
 * pg_cron) — quem decide o status exibido é `resumirPlataforma`, que o
 * recalcula com `calcularStatusAssinatura` a partir de data/carência.
 *
 * Nunca lança: falha de rede/RLS volta como { data: [], error }.
 *
 * @returns {Promise<{data: Array<{tenant_id:string, valor_mensal:number, data_vencimento:string, carencia_dias:number, status:string}>, error: object|null}>}
 */
export async function listarAssinaturas() {
  try {
    const { data, error } = await supabase
      .from("assinaturas")
      .select("tenant_id, valor_mensal, data_vencimento, carencia_dias, status");
    if (error) return { data: [], error };
    return { data: data ?? [], error: null };
  } catch (err) {
    return { data: [], error: { message: err?.message ?? "Falha ao listar as assinaturas." } };
  }
}
