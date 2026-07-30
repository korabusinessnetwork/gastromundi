import { supabase } from "./supabase";
import { LAYOUT_PADRAO_NOVOS } from "@/layouts";
import { geocodificarEndereco } from "@/lib/delivery";
import { calcularStatusAssinatura, calcularDiasParaVencimento } from "./assinatura";
import { ROTULOS_MODULO } from "@/constants/modulos";

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
 * @returns {Promise<{data: Array<{id:string,nome:string,plano_codigo:string,tema:object|null,created_at:string}>, error: object|null}>}
 */
export async function listarEstabelecimentos() {
  try {
    const { data, error } = await supabase
      .from("tenants")
      .select("id, nome, plano_codigo, tema, created_at")
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

// Ordem de urgência para o "alerta de validade" do Console: sem assinatura
// primeiro (o pior caso comercial — o estabelecimento opera e a plataforma
// não cobra nada por ele), depois bloqueado (já perdeu acesso), carência
// (atrasado, ainda no prazo) e por fim ativo vencendo em breve. Dentro do
// mesmo status, ordena por dias a vencer.
const URGENCIA_STATUS = { sem_assinatura: 0, bloqueado: 1, carencia: 2, ativo: 3 };

/**
 * Função PURA — agrega tenants + planos + assinaturas na visão da
 * plataforma (dashboard do Console): status recalculado por tenant, KPIs,
 * o "alerta de validade" (quem precisa de ação) e a distribuição por
 * plano. Não faz I/O — testável isoladamente (CLAUDE.md: função pura
 * nasce com teste).
 *
 * O status NÃO vem do cache do banco: é recalculado com
 * `calcularStatusAssinatura` (mesma fonte de verdade da Fase 4), exceto
 * 'cancelado', que é manual e nunca recalculado (espelha o SQL). Tenant
 * sem linha de assinatura vira status 'sem_assinatura' (não é erro).
 *
 * MRR = soma das mensalidades da base que efetivamente paga (ativo +
 * carência); bloqueado/cancelado/sem_assinatura não contam como receita.
 *
 * @param {Array<{id:string, nome:string, plano_codigo?:string}>} tenants
 * @param {Array<{codigo:string, nome:string}>} planos
 * @param {Array<{tenant_id:string, valor_mensal:number, data_vencimento:string, carencia_dias:number, status:string}>} assinaturas
 * @param {Date} [hoje]
 * @returns {{linhas:Array<object>, kpis:object, precisamAtencao:Array<object>, distribuicaoPlano:Array<object>}}
 */
export function resumirPlataforma(tenants = [], planos = [], assinaturas = [], hoje = new Date()) {
  const VENCE_EM_DIAS = 5; // janela do "vencendo em breve" (espelha o banner do tenant)

  const porTenant = new Map((assinaturas ?? []).map((a) => [a.tenant_id, a]));
  const nomePlano = new Map((planos ?? []).map((p) => [p.codigo, p.nome]));

  const linhas = (tenants ?? []).map((t) => {
    const a = porTenant.get(t.id) ?? null;
    let status = "sem_assinatura";
    let diasParaVencer = null;
    if (a) {
      status = a.status === "cancelado"
        ? "cancelado"
        : calcularStatusAssinatura(a.data_vencimento, a.carencia_dias, hoje);
      diasParaVencer = calcularDiasParaVencimento(a.data_vencimento, hoje);
    }
    return {
      tenantId: t.id,
      nome: t.nome,
      planoCodigo: t.plano_codigo ?? null,
      planoNome: t.plano_codigo ? (nomePlano.get(t.plano_codigo) ?? t.plano_codigo) : null,
      valorMensal: a ? (Number(a.valor_mensal) || 0) : 0,
      dataVencimento: a?.data_vencimento ?? null,
      diasParaVencer,
      status, // ativo | carencia | bloqueado | cancelado | sem_assinatura
    };
  });

  const contar = (s) => linhas.filter((l) => l.status === s).length;

  const kpis = {
    totalTenants: linhas.length,
    ativos: contar("ativo"),
    emCarencia: contar("carencia"),
    bloqueados: contar("bloqueado"),
    cancelados: contar("cancelado"),
    semAssinatura: contar("sem_assinatura"),
    mrr: linhas
      .filter((l) => l.status === "ativo" || l.status === "carencia")
      .reduce((soma, l) => soma + l.valorMensal, 0),
    // Quantos da base que PAGA estão sem mensalidade definida. Existe porque
    // `valor_mensal` nasce em 0 (20260719/20260908) e por muito tempo nada no
    // sistema o escrevia: o MRR acima somava zero com clientes reais na base e
    // a tela afirmava "Receita mensal R$ 0,00" como se fosse fato. Este número
    // é o que permite à tela dizer POR QUE o MRR está baixo.
    semPreco: linhas.filter(
      (l) => (l.status === "ativo" || l.status === "carencia") && l.valorMensal <= 0
    ).length,
  };

  // Alerta de validade — o "alerta" que saiu do banner do tenant e passou
  // a viver no Console: quem precisa de ação da plataforma AGORA.
  //
  // 'sem_assinatura' entra e vem primeiro: é o único estado em que o
  // estabelecimento opera sem NUNCA ser cobrado — não bloqueia (as policies
  // de 20260720 liberam quem não tem linha), não conta no MRR e não aparece
  // em nenhum outro lugar da tela. Ficar fora daqui era justamente o que
  // fazia um cliente vendido operar de graça para sempre em silêncio.
  //
  // 'cancelado' continua fora de propósito: é decisão manual da plataforma
  // (já resolvido), não pendência.
  const precisamAtencao = linhas
    .filter((l) =>
      l.status === "sem_assinatura" ||
      l.status === "bloqueado" ||
      l.status === "carencia" ||
      (l.status === "ativo" && l.diasParaVencer != null && l.diasParaVencer <= VENCE_EM_DIAS)
    )
    .sort((a, b) =>
      (URGENCIA_STATUS[a.status] ?? 9) - (URGENCIA_STATUS[b.status] ?? 9) ||
      (a.diasParaVencer ?? 0) - (b.diasParaVencer ?? 0)
    );

  // Distribuição por plano, na ordem do catálogo; só planos com ao menos
  // um tenant (não polui a tela com planos vazios).
  const distribuicaoPlano = (planos ?? [])
    .map((p) => ({
      codigo: p.codigo,
      nome: p.nome,
      quantidade: linhas.filter((l) => l.planoCodigo === p.codigo).length,
    }))
    .filter((d) => d.quantidade > 0);

  return { linhas, kpis, precisamAtencao, distribuicaoPlano };
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
 * @param {{nome:string, planoCodigo:string, tema?:object, adminNome:string, adminUsername:string, adminPassword:string, endereco?:string}} payload
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
