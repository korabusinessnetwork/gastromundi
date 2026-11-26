import { supabase } from "@/lib/supabase";
import { LAYOUT_PADRAO_NOVOS } from "@/layouts";
import { geocodificarEndereco } from "@/features/delivery/delivery";
import { ROTULOS_MODULO } from "@/constants/modulos";
import {
  normalizarSlug
} from "@/lib/slugEstabelecimento";
import { normalizarUsername } from "../regras/cadastro";
import { EDGE_URL } from "./leitura";

// Gravações do Console: criar estabelecimento, trocar plano e layout, mensalidade e add-ons.
/**
 * Provisiona um estabelecimento novo (tenant + 1º admin) via Edge
 * Function `provisionar-estabelecimento`. A função de borda é a única
 * que pode criar a credencial em auth.users (Admin API/service_role) e
 * faz a operação de forma atômica com compensação — o front só monta o
 * payload e repassa o token do super-admin.
 *
 * Nunca lança: erro de rede/autorização volta como { error } para a UI.
 *
 * @param {{nome:string, slug?:string, planoCodigo:string, tema?:object, adminNome:string, adminUsername:string, adminPassword:string, endereco?:string}} payload
 * @returns {Promise<{data?:object, error?:string}>}
 */
export async function provisionarEstabelecimento(payload) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return { error: "Sessão expirada. Entre novamente." };

    // Endereço de origem do delivery (opcional — só quem quer delivery
    // integrado). Geocodifica aqui (Nominatim, grátis) para já nascer com
    // o pino no mapa; se falhar, guarda só o texto e o dono ajusta depois
    // arrastando o pino na tela "Entrega e taxas". Nunca trava a criação.
    const endereco = String(payload.endereco ?? "").trim();
    let delivery = null;
    if (endereco) {
      const { data: coord } = await geocodificarEndereco(endereco);
      delivery = {
        endereco_origem: endereco,
        ...(coord ? { origem_lat: coord.lat, origem_lng: coord.lng } : {}),
      };
    }

    // Endereço (slug) escolhido no formulário. A borda já aceita `slug` no
    // corpo e cai na derivação a partir do nome quando ele não vem — por isso
    // só mandamos quando há valor, e nunca um vazio que sobrescreveria o
    // fallback do servidor por nada.
    const slug = normalizarSlug(payload.slug);

    const res = await fetch(EDGE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${session.access_token}`,
        "apikey": import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({
        nome: payload.nome,
        ...(slug ? { slug } : {}),
        plano_codigo: payload.planoCodigo,
        // Estabelecimento novo nasce no layout da marca (1b, dia/noite
        // automático) — regra do dono. O payload pode sobrescrever.
        tema: { layout: LAYOUT_PADRAO_NOVOS, ...(payload.tema ?? {}) },
        admin: {
          name: payload.adminNome,
          username: normalizarUsername(payload.adminUsername),
          password: payload.adminPassword,
        },
        // Só vai quando há endereço — a Edge Function semeia config_delivery.
        ...(delivery ? { delivery } : {}),
      }),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { error: json.error ?? "Falha ao criar o estabelecimento." };
    return { data: json };
  } catch (err) {
    return { error: err?.message ?? "Falha de rede ao criar o estabelecimento." };
  }
}

/**
 * Troca o plano de um estabelecimento já existente (upgrade/downgrade)
 * via RPC `alterar_plano_tenant` (20260729). A autorização REAL vive no
 * banco: a RPC é SECURITY DEFINER com guarda `is_super_admin()`, então
 * mesmo que alguém chame daqui sem ser plataforma, o banco recusa. Trocar
 * o `plano_codigo` do tenant muda na hora os módulos que ele enxerga
 * (planos_modulos). Campos explícitos; nenhuma decisão de acesso no front.
 *
 * Nunca lança: falha de rede/RLS volta como { data: null, error } para a
 * UI tratar.
 *
 * @param {string} tenantId    id do estabelecimento
 * @param {string} planoCodigo código do novo plano (catálogo public.planos)
 * @returns {Promise<{data: object|null, error: object|null}>}
 */
export async function alterarPlano(tenantId, planoCodigo) {
  try {
    const { data, error } = await supabase.rpc("alterar_plano_tenant", {
      p_tenant_id: tenantId,
      p_plano_codigo: planoCodigo,
    });
    if (error) return { data: null, error };
    return { data, error: null };
  } catch (err) {
    return { data: null, error: { message: err?.message ?? "Falha ao alterar o plano." } };
  }
}

/**
 * Função PURA — compara os módulos de dois planos e diz, em português, o
 * que o estabelecimento PERDE e o que GANHA na troca.
 *
 * Existe porque trocar de plano tem efeito imediato e silencioso: o tenant
 * deixa de ver o módulo na hora, e desde 20260906 um plano sem `delivery`
 * derruba o site público de pedidos do cliente. A tela precisa nomear a
 * perda antes de a pessoa clicar (CLAUDE.md: prevenção de erro > mensagem
 * de erro; confirmar ações destrutivas).
 *
 * A ordem de saída é a do registro central de módulos, não a ordem em que
 * o banco devolveu as linhas — lista estável entre duas aberturas do modal.
 * Código sem rótulo cadastrado sai com o próprio código (não some da lista:
 * é melhor mostrar um código do que esconder uma perda).
 *
 * @param {string[]} modulosAtuais códigos do plano atual
 * @param {string[]} modulosNovos  códigos do plano escolhido
 * @returns {{perdidos: Array<{codigo:string,nome:string}>, ganhos: Array<{codigo:string,nome:string}>}}
 */
export function compararModulosDoPlano(modulosAtuais, modulosNovos) {
  // `new Set(null)` já nasce vazio: tolerar lista ausente é de graça aqui, e a
  // tela chama isto antes de a leitura dos módulos voltar.
  const atuais = new Set(modulosAtuais);
  const novos = new Set(modulosNovos);
  const ordenar = (conjunto, fora) => {
    const conhecidos = Object.keys(ROTULOS_MODULO);
    const codigos = [...conjunto].filter((c) => !fora.has(c));
    return codigos
      .sort((a, b) => {
        const ia = conhecidos.indexOf(a);
        const ib = conhecidos.indexOf(b);
        // Desconhecido vai para o fim, mas nunca desaparece.
        return (ia === -1 ? conhecidos.length : ia) - (ib === -1 ? conhecidos.length : ib);
      })
      .map((codigo) => ({ codigo, nome: ROTULOS_MODULO[codigo] ?? codigo }));
  };
  return { perdidos: ordenar(atuais, novos), ganhos: ordenar(novos, atuais) };
}

/**
 * Troca o LAYOUT de um estabelecimento via RPC `alterar_layout_tenant`
 * (20260801). Mesmo desenho do alterarPlano: a autorização real é do
 * banco (SECURITY DEFINER + is_super_admin()); a RPC grava
 * `tema.layout` e LIMPA os overrides de paleta antigos, para que o
 * layout escolhido apareça de fato (overrides finos por cima de outro
 * layout mascarariam a escolha) — nome de exibição e logo são mantidos.
 *
 * Nunca lança: falha de rede/RLS volta como { data: null, error }.
 *
 * @param {string} tenantId     id do estabelecimento
 * @param {string} layoutCodigo código do layout (catálogo src/layouts)
 * @returns {Promise<{data: object|null, error: object|null}>}
 */
export async function alterarLayout(tenantId, layoutCodigo) {
  try {
    const { data, error } = await supabase.rpc("alterar_layout_tenant", {
      p_tenant_id: tenantId,
      p_layout: layoutCodigo,
    });
    if (error) return { data: null, error };
    return { data, error: null };
  } catch (err) {
    return { data: null, error: { message: err?.message ?? "Falha ao alterar o layout." } };
  }
}

/** Teto de sanidade da mensalidade — o MESMO `c_teto` da RPC (20260911). */
export const MENSALIDADE_MAXIMA = 100000;

/**
 * Define quanto a plataforma cobra por mês deste estabelecimento.
 *
 * `assinaturas.valor_mensal` nasce em 0 e NÃO tem policy de UPDATE — a
 * escrita é só pela RPC `definir_mensalidade_tenant` (20260911, SECURITY
 * DEFINER + is_super_admin()). Antes dela nenhum caminho do sistema gravava
 * este campo: o único jeito era um UPDATE cru no SQL Editor, e o cartão
 * "Receita mensal" do Console era estruturalmente R$ 0,00.
 *
 * Zero é aceito de propósito (cortesia, piloto) — a tela mostra que está sem
 * mensalidade definida em vez de esconder.
 *
 * Nunca lança: falha de rede/RLS volta como { data: null, error }.
 *
 * @param {string} tenantId id do estabelecimento
 * @param {number} valor    mensalidade em reais (>= 0)
 * @returns {Promise<{data: object|null, error: object|null}>}
 */
export async function definirMensalidade(tenantId, valor) {
  try {
    const { data, error } = await supabase.rpc("definir_mensalidade_tenant", {
      p_tenant_id: tenantId,
      p_valor: valor,
    });
    if (error) return { data: null, error };
    return { data, error: null };
  } catch (err) {
    return { data: null, error: { message: err?.message ?? "Falha ao definir a mensalidade." } };
  }
}

/**
 * Catálogo de add-ons pagos (`public.addons`) — o que a plataforma tem
 * para oferecer. Add-on é eixo ORTOGONAL ao plano (decisão 019/021):
 * disponível em qualquer tier, contratado à parte.
 *
 * A lista vem do BANCO, não do front: um add-on novo aparece no Console
 * sem release. Campos explícitos (nunca `select *`).
 *
 * Nunca lança: falha volta como { data: [], error }.
 *
 * @returns {Promise<{data: Array<{codigo:string, nome:string, descricao:string|null}>, error: object|null}>}
 */
export async function listarAddons() {
  try {
    const { data, error } = await supabase
      .from("addons")
      .select("codigo, nome, descricao")
      .order("codigo", { ascending: true });
    if (error) return { data: [], error };
    return { data: data ?? [], error: null };
  } catch (err) {
    return { data: [], error: { message: err?.message ?? "Falha ao buscar os add-ons." } };
  }
}

/**
 * Add-ons contratados de TODOS os estabelecimentos — leitura cross-tenant
 * do Console. Só o super-admin enxerga mais de um tenant: a policy
 * `tenant_addons_select_auth` (20260726) filtra por
 * `tenant_id = tenant_atual_id() OR is_super_admin()`.
 *
 * Traz também as linhas com `ativo = false` de propósito: desligar
 * PRESERVA a linha (20260915), e o Console precisa saber a diferença
 * entre "nunca contratou" e "contratou e está desligado".
 *
 * Nunca lança: falha volta como { data: [], error }.
 *
 * @returns {Promise<{data: Array<{tenant_id:string, addon_codigo:string, ativo:boolean, ativado_em:string}>, error: object|null}>}
 */
export async function listarAddonsPorTenant() {
  try {
    const { data, error } = await supabase
      .from("tenant_addons")
      .select("tenant_id, addon_codigo, ativo, ativado_em");
    if (error) return { data: [], error };
    return { data: data ?? [], error: null };
  } catch (err) {
    return { data: [], error: { message: err?.message ?? "Falha ao buscar os add-ons dos estabelecimentos." } };
  }
}

/**
 * Liga ou desliga um add-on de um estabelecimento via RPC
 * `alternar_addon_tenant` (20260915).
 *
 * `tenant_addons` NÃO tem policy de escrita (20260718): a única via é
 * esta RPC SECURITY DEFINER com guarda `is_super_admin()` — antes dela, o
 * jeito de habilitar NF-e/TEF para um cliente era INSERT no SQL Editor.
 * A autorização real é do banco; o front só monta a chamada.
 *
 * Nunca lança: falha de rede/RLS volta como { data: null, error }.
 *
 * @param {string} tenantId     id do estabelecimento
 * @param {string} addonCodigo  código do add-on (catálogo public.addons)
 * @param {boolean} ativo       true liga, false desliga
 * @returns {Promise<{data: object|null, error: object|null}>}
 */
export async function alternarAddon(tenantId, addonCodigo, ativo) {
  try {
    const { data, error } = await supabase.rpc("alternar_addon_tenant", {
      p_tenant_id: tenantId,
      p_addon_codigo: addonCodigo,
      p_ativo: ativo,
    });
    if (error) return { data: null, error };
    return { data, error: null };
  } catch (err) {
    return { data: null, error: { message: err?.message ?? "Falha ao alterar o add-on." } };
  }
}

/**
 * Função PURA — cruza o catálogo de add-ons com o que um estabelecimento
 * tem contratado e devolve a lista que a tela mostra.
 *
 * Roda pelo CATÁLOGO, não pelas linhas do tenant: add-on sem linha sai
 * como desligado (é o estado normal — nenhum tenant nasce com add-on,
 * 20260718), e linha órfã de um código removido do catálogo não aparece
 * nem quebra a tela.
 *
 * @param {Array<{codigo:string, nome:string, descricao?:string|null}>} addons catálogo
 * @param {Array<{tenant_id:string, addon_codigo:string, ativo:boolean}>} tenantAddons
 * @param {string} tenantId
 * @returns {Array<{codigo:string, nome:string, descricao:string|null, ativo:boolean}>}
 */
export function resumirAddonsDoTenant(addons, tenantAddons, tenantId) {
  const catalogo = Array.isArray(addons) ? addons : [];
  const linhas = Array.isArray(tenantAddons) ? tenantAddons : [];
  // Sem tenant não existe "ligado": comparar direto casaria tenantId nulo
  // com linha de tenant_id nulo e a tela mostraria add-on ativo sem saber
  // de quem.
  const ativos = new Set(
    tenantId
      ? linhas
          .filter((l) => l?.tenant_id === tenantId && l?.ativo === true)
          .map((l) => l.addon_codigo)
      : []
  );
  return catalogo.map((a) => ({
    codigo: a.codigo,
    nome: a.nome ?? a.codigo,
    descricao: a.descricao ?? null,
    ativo: ativos.has(a.codigo),
  }));
}

/**
 * Função PURA — quantos add-ons cada estabelecimento tem LIGADOS, para o
 * botão do card dizer o estado sem abrir o modal.
 *
 * @param {Array<{tenant_id:string, ativo:boolean}>} tenantAddons
 * @returns {Record<string, number>} id do tenant → quantidade ligada
 */
export function contarAddonsPorTenant(tenantAddons) {
  const linhas = Array.isArray(tenantAddons) ? tenantAddons : [];
  const contagem = {};
  for (const l of linhas) {
    if (!l?.tenant_id || l?.ativo !== true) continue;
    contagem[l.tenant_id] = (contagem[l.tenant_id] ?? 0) + 1;
  }
  return contagem;
}
