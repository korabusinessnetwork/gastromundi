import { supabase } from "./supabase";
import { buscarAssinaturaAtual, calcularStatusAssinatura, calcularDiasParaVencimento } from "./assinatura";

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
 *
 * Fase 3 (`supabase/migrations/20260718_addons.sql`, decisão 019)
 * acrescenta os add-ons pagos (NF-e, TEF) — eixo ORTOGONAL ao plano:
 * disponíveis em qualquer tier, ligados/desligados por tenant.
 * `addonHabilitado` é a única fonte de verdade equivalente para
 * add-ons; nenhum componente deve ler `tenant_addons` diretamente.
 *
 * Fase 4 (`supabase/migrations/20260719_assinaturas.sql`, ADR-006)
 * acrescenta a assinatura/mensalidade — SEM enforcement ainda (Fase 5).
 * O status exposto aqui é só para exibição (banner informativo).
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
 * Branding de um tenant a partir do SLUG do subdomínio — para a TELA DE
 * LOGIN, que é PRÉ-autenticação (ADR-009). Antes do login não há JWT, e a
 * RLS de `tenants` (id = tenant_atual_id()) devolve zero linhas ao anon —
 * por isso a leitura passa por uma RPC SECURITY DEFINER (`branding_por_slug`,
 * 20260742) que expõe SÓ nome + tema (marca), nunca dados operacionais.
 *
 * Sem slug, slug desconhecido ou erro → { data: null } e o chamador cai no
 * branding padrão (GastroMundi). Nunca lança.
 *
 * @param {string} slug
 * @returns {Promise<{data: {nome: string, tema: object}|null, error: object|null}>}
 */
export async function buscarBrandingPorSlug(slug) {
  if (!slug) return { data: null, error: null };
  try {
    const { data, error } = await supabase.rpc("branding_por_slug", { p_slug: slug });
    if (error) return { data: null, error };
    const row = Array.isArray(data) ? data[0] : data;
    return { data: row ?? null, error: null };
  } catch (err) {
    return { data: null, error: { message: err?.message ?? "Falha ao buscar o branding do estabelecimento." } };
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
 * Busca os códigos de add-on ATIVOS de um tenant, direto do registro
 * central (`public.tenant_addons`). Nenhum tenant tem add-on ativo por
 * padrão — lista vazia é o caso normal, não um erro.
 *
 * @param {string} tenantId
 * @returns {Promise<{data: string[], error: object|null}>}
 */
export async function buscarAddonsAtivos(tenantId) {
  if (!tenantId) return { data: [], error: null };
  try {
    const { data, error } = await supabase
      .from("tenant_addons")
      .select("addon_codigo")
      .eq("tenant_id", tenantId)
      .eq("ativo", true);
    if (error) return { data: [], error };
    return { data: (data ?? []).map((r) => r.addon_codigo), error: null };
  } catch (err) {
    return { data: [], error: { message: err?.message ?? "Falha ao buscar os add-ons do tenant." } };
  }
}

/**
 * Busca tenant + módulos do plano + add-ons ativos + assinatura num
 * único ponto de entrada — é o que o bootstrap do app deve chamar (não
 * as buscas separadamente). Nunca lança: erro em qualquer uma das
 * buscas resulta em lista vazia/assinatura nula, nunca em módulo/
 * add-on/status inventado.
 *
 * `assinatura.status` já vem CALCULADO (não é o cache do banco) —
 * Fase 4 é só exibição; nenhuma escrita é bloqueada aqui (Fase 5).
 *
 * @returns {Promise<{data: {id: string, nome: string, tema: object, planoCodigo: string, modulosDisponiveis: string[], addonsAtivos: string[], assinatura: {status: string, diasParaVencer: number, valorMensal: number, dataVencimento: string}|null}|null, error: object|null}>}
 */
export async function buscarBootstrapTenant() {
  const { data: tenantData, error: eTenant } = await buscarTenantAtual();
  if (eTenant || !tenantData) return { data: null, error: eTenant };

  const [
    { data: modulos, error: eModulos },
    { data: addons, error: eAddons },
    { data: assinaturaData, error: eAssinatura },
  ] = await Promise.all([
    buscarModulosDoPlano(tenantData.plano_codigo),
    buscarAddonsAtivos(tenantData.id),
    buscarAssinaturaAtual(tenantData.id),
  ]);
  if (eModulos) return { data: null, error: eModulos };
  if (eAddons) return { data: null, error: eAddons };
  if (eAssinatura) return { data: null, error: eAssinatura };

  const assinatura = assinaturaData
    ? {
        status: calcularStatusAssinatura(assinaturaData.dataVencimento, assinaturaData.carenciaDias),
        diasParaVencer: calcularDiasParaVencimento(assinaturaData.dataVencimento),
        carenciaDias: assinaturaData.carenciaDias,
        valorMensal: assinaturaData.valorMensal,
        dataVencimento: assinaturaData.dataVencimento,
      }
    : null;

  return {
    data: {
      id: tenantData.id,
      nome: tenantData.nome,
      tema: tenantData.tema,
      planoCodigo: tenantData.plano_codigo,
      modulosDisponiveis: modulos,
      addonsAtivos: addons,
      assinatura,
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

/**
 * Função pura — equivalente a `moduloHabilitado`, para add-ons.
 * Add-ons NÃO dependem de plano/tier (decisão 019, ADR-005 §3): um
 * tenant no plano Básico pode ter o add-on `nfe` ativo, por exemplo.
 * Único lugar do front que decide "esse add-on está ativo?" — hooks
 * de NF-e/TEF devem checar por aqui (via `useApp().addonHabilitado`),
 * nunca ler `tenant_addons`/`addonsAtivos` diretamente.
 *
 * @param {string[]|undefined|null} addonsAtivos
 * @param {string} addonCodigo
 * @returns {boolean}
 */
export function addonHabilitado(addonsAtivos, addonCodigo) {
  if (!Array.isArray(addonsAtivos)) return false;
  return addonsAtivos.includes(addonCodigo);
}
