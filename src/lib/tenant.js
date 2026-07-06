import { supabase } from "./supabase";

/**
 * Tenant — Fases 1 e 2 da camada de comercialização
 * (docs/08_DECISOES/adr-005.md · docs/09_BACKLOG/plano_tecnico_comercializacao.md).
 *
 * Hoje existe exatamente UM tenant (a instalação atual do GastroMundi,
 * `supabase/migrations/20260716_tenants_minimo.sql`) — não é a
 * migração multi-tenant completa (decisão 002), só a base para as
 * fases seguintes (planos, add-ons, billing, theming) terem o que
 * referenciar via `REFERENCES public.tenants(id)`.
 *
 * Fase 2 (`supabase/migrations/20260717_planos_modulos.sql`) acrescenta
 * o plano do tenant e o registro central plano→módulos. `moduloHabilitado`
 * é a ÚNICA fonte de verdade no front para "esse módulo está no plano
 * atual?" — nenhum componente deve comparar `plano_codigo` diretamente.
 */

/**
 * Busca o tenant atual (única linha nesta fase), incluindo o plano.
 * Nunca lança: falha de rede/RLS retorna { data: null, error }, para
 * o chamador decidir o fallback (ex.: identidade/tema hardcoded).
 *
 * @returns {Promise<{data: {id: string, nome: string, tema: object, plano_codigo: string}|null, error: object|null}>}
 */
export async function buscarTenantAtual() {
  try {
    const { data, error } = await supabase
      .from("tenants")
      .select("id, nome, tema, plano_codigo, created_at")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) return { data: null, error };
    return { data, error: null };
  } catch (err) {
    return { data: null, error: { message: err?.message ?? "Falha ao buscar o tenant atual." } };
  }
}

/**
 * Busca os códigos de módulo incluídos num plano, direto do registro
 * central (`public.planos_modulos`) — nunca hardcoded no front.
 *
 * @param {string} planoCodigo
 * @returns {Promise<{data: string[], error: object|null}>}
 */
export async function buscarModulosDoPlano(planoCodigo) {
  if (!planoCodigo) return { data: [], error: null };
  try {
    const { data, error } = await supabase
      .from("planos_modulos")
      .select("modulo_codigo")
      .eq("plano_codigo", planoCodigo);
    if (error) return { data: [], error };
    return { data: (data ?? []).map((r) => r.modulo_codigo), error: null };
  } catch (err) {
    return { data: [], error: { message: err?.message ?? "Falha ao buscar os módulos do plano." } };
  }
}

/**
 * Busca tenant + módulos do plano num único ponto de entrada — é o
 * que o bootstrap do app deve chamar (não os dois separadamente).
 * Nunca lança: erro em qualquer uma das duas buscas resulta em
 * `modulosDisponiveis: []` (nada liberado), nunca em módulos
 * inventados.
 *
 * @returns {Promise<{data: {id: string, nome: string, tema: object, planoCodigo: string, modulosDisponiveis: string[]}|null, error: object|null}>}
 */
export async function buscarBootstrapTenant() {
  const { data: tenantData, error: eTenant } = await buscarTenantAtual();
  if (eTenant || !tenantData) return { data: null, error: eTenant };

  const { data: modulos, error: eModulos } = await buscarModulosDoPlano(tenantData.plano_codigo);
  if (eModulos) return { data: null, error: eModulos };

  return {
    data: {
      id: tenantData.id,
      nome: tenantData.nome,
      tema: tenantData.tema,
      planoCodigo: tenantData.plano_codigo,
      modulosDisponiveis: modulos,
    },
    error: null,
  };
}

/**
 * Função pura — a checagem de gating em si. Único lugar do front que
 * decide "esse módulo está disponível?"; Sidebar, rotas e qualquer
 * tela nova devem chamar esta função (via `useApp().moduloHabilitado`),
 * nunca comparar `plano_codigo`/`modulosDisponiveis` diretamente.
 *
 * @param {string[]|undefined|null} modulosDisponiveis
 * @param {string} moduloCodigo
 * @returns {boolean}
 */
export function moduloHabilitado(modulosDisponiveis, moduloCodigo) {
  if (!Array.isArray(modulosDisponiveis)) return false;
  return modulosDisponiveis.includes(moduloCodigo);
}
