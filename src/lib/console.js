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

// Ordem de urgência para o "alerta de validade" do Console: sem assinatura
// primeiro (o pior caso comercial — o estabelecimento opera e a plataforma
// não cobra nada por ele), depois bloqueado (já perdeu acesso), carência
// (atrasado, ainda no prazo) e por fim ativo vencendo em breve. Dentro do
// mesmo status, ordena por dias a vencer.
const URGENCIA_STATUS = { sem_assinatura: 0, bloqueado: 1, carencia: 2, ativo: 3 };

/** Janela do "vencendo em breve" (espelha o banner do tenant). */
const VENCE_EM_DIAS = 5;

/**
 * Uma linha de `resumirPlataforma` pede ação da plataforma agora?
 * Régua única: o alerta de validade e a ordem da lista de estabelecimentos
 * usam esta mesma função, para as duas telas nunca discordarem sobre quem
 * é urgente. 'cancelado' fica de fora de propósito (decisão manual já
 * resolvida, não pendência).
 */
function precisaAtencao(l) {
  return (
    l.status === "sem_assinatura" ||
    l.status === "bloqueado" ||
    l.status === "carencia" ||
    (l.status === "ativo" && l.diasParaVencer != null && l.diasParaVencer <= VENCE_EM_DIAS)
  );
}

/**
 * Função PURA — reordena uma lista de estabelecimentos colocando quem
 * precisa de ação no topo, na mesma ordem de urgência do alerta de
 * validade (`precisamAtencao`). Quem não precisa de nada mantém a ordem
 * original em que chegou; empate dentro do bloco urgente também cai na
 * ordem original, para a lista não dançar entre renders.
 *
 * Não faz I/O e não muda os arrays recebidos.
 *
 * @param {Array<{id:string}>} itens estabelecimentos, na ordem do banco
 * @param {Array<{tenantId:string, status:string, diasParaVencer:number|null}>} linhas saída de `resumirPlataforma`
 * @returns {Array<object>} novo array com os mesmos itens, reordenados
 */
export function ordenarPorUrgencia(itens = [], linhas = []) {
  const porId = new Map((linhas ?? []).map((l) => [l.tenantId, l]));
  return (itens ?? [])
    .map((item, indice) => ({ item, indice, linha: porId.get(item?.id) ?? null }))
    .sort((a, b) => {
      const urgenteA = a.linha && precisaAtencao(a.linha) ? 0 : 1;
      const urgenteB = b.linha && precisaAtencao(b.linha) ? 0 : 1;
      if (urgenteA !== urgenteB) return urgenteA - urgenteB;
      if (urgenteA === 0) {
        const porStatus =
          (URGENCIA_STATUS[a.linha.status] ?? 9) - (URGENCIA_STATUS[b.linha.status] ?? 9);
        if (porStatus !== 0) return porStatus;
        const porDias = (a.linha.diasParaVencer ?? 0) - (b.linha.diasParaVencer ?? 0);
        if (porDias !== 0) return porDias;
      }
      return a.indice - b.indice;
    })
    .map((x) => x.item);
}

/** Texto comparável: sem caixa, sem acento e sem espaço sobrando. Existe
 *  porque "Café Central" precisa ser encontrado digitando "cafe". */
function paraBusca(texto) {
  return String(texto ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, ""); // remove acentos
}

/**
 * Função PURA — filtra estabelecimentos pelo nome OU pelo endereço (o `slug`,
 * rótulo que aparece no link do cardápio e no acesso). Casa qualquer trecho
 * (não só o começo), ignorando caixa e acento. Termo vazio devolve a lista
 * inteira, na ordem em que chegou — filtrar não reordena.
 *
 * O endereço entra na busca porque é assim que o cliente se identifica ao
 * dono ("meu link é casacoffee"), e porque dois estabelecimentos de nome
 * parecido só se distinguem por ele. Tenant sem slug (anterior à 20260740)
 * simplesmente não casa por endereço — continua achável pelo nome.
 *
 * Não faz I/O e não muda o array recebido.
 *
 * @param {Array<{nome?:string, slug?:string}>} itens
 * @param {string} termo
 * @returns {Array<object>}
 */
export function filtrarEstabelecimentos(itens = [], termo = "") {
  const alvo = paraBusca(termo);
  if (!alvo) return [...(itens ?? [])];
  return (itens ?? []).filter(
    (t) => paraBusca(t?.nome).includes(alvo) || paraBusca(t?.slug).includes(alvo)
  );
}

/** Recortes possíveis da lista. Só estes três — o resto é "todos". */
export const FILTROS_SITUACAO = ["todos", "atencao", "em_dia"];

/**
 * Função PURA — recorta a lista por situação de cobrança. Não define quem
 * "precisa de atenção": recebe o conjunto de ids já decidido pela mesma régua
 * que ordena a lista e dispara o alerta de validade (`ordenarPorUrgencia`),
 * para não existir uma segunda definição do que é estar com problema.
 *
 * Filtro desconhecido, ausente ou "todos" devolve a lista inteira, na ordem em
 * que chegou — estado inválido nunca esconde estabelecimento.
 *
 * Não faz I/O e não muda o array recebido.
 *
 * @param {Array<{id?:string}>} itens
 * @param {string} filtro  "todos" | "atencao" | "em_dia"
 * @param {Set<string>} idsAtencao
 * @returns {Array<object>}
 */
export function filtrarPorSituacao(itens = [], filtro = "todos", idsAtencao = new Set()) {
  const lista = itens ?? [];
  const pendentes = idsAtencao ?? new Set();
  if (filtro === "atencao") return lista.filter((t) => pendentes.has(t?.id));
  if (filtro === "em_dia") return lista.filter((t) => !pendentes.has(t?.id));
  return [...lista];
}

/**
 * Função PURA — traduz o que veio da URL (`?situacao=...`) para um filtro
 * válido. O parâmetro é texto de fora: pode ter sido digitado, colado de um
 * link antigo ou vir repetido. Qualquer coisa que não seja exatamente um dos
 * três recortes vira "todos" — o estado que não esconde ninguém.
 *
 * Aceita `null`/`undefined` (parâmetro ausente) e o array que alguns leitores
 * de query string devolvem quando a chave aparece duas vezes; nesse caso não
 * há escolha honesta a fazer, então cai em "todos" também.
 *
 * Não lê `window` nem o roteador — quem faz isso é a tela.
 *
 * @param {string|string[]|null|undefined} bruto
 * @returns {"todos"|"atencao"|"em_dia"}
 */
export function normalizarFiltroSituacao(bruto) {
  if (typeof bruto !== "string") return "todos";
  return FILTROS_SITUACAO.includes(bruto) ? bruto : "todos";
}

/** Seções do Console, na ordem em que aparecem. A primeira é a padrão. */
export const ABAS_CONSOLE = ["estabelecimentos", "planos", "uso"];

/**
 * Função PURA — traduz o que veio da URL (`?aba=...`) para uma aba válida.
 * Mesmo molde do `normalizarFiltroSituacao`: o parâmetro é texto de fora, e
 * qualquer coisa que não seja exatamente uma das seções cai na primeira —
 * o Console nunca abre sem conteúdo por causa de um endereço torto.
 *
 * Não lê `window` nem o roteador — quem faz isso é a tela.
 *
 * @param {string|string[]|null|undefined} bruto
 * @returns {"estabelecimentos"|"planos"|"uso"}
 */
export function normalizarAba(bruto) {
  if (typeof bruto !== "string") return ABAS_CONSOLE[0];
  return ABAS_CONSOLE.includes(bruto) ? bruto : ABAS_CONSOLE[0];
}

/** Período padrão da aba de uso — o mesmo que a tela já abria antes da URL. */
export const PERIODO_PADRAO = 30;

/**
 * Função PURA — traduz o que veio da URL (`?dias=...`) para um dos períodos
 * oferecidos pela aba de uso. O parâmetro chega como texto; só um texto que
 * seja exatamente um número do conjunto passa. `"90.0"`, `"45"`, `"-30"`,
 * `"abc"` e parâmetro repetido caem no padrão — o período tem que casar com um
 * dos botões da tela, senão nenhum apareceria marcado.
 *
 * Não lê `window` nem o roteador — quem faz isso é a tela.
 *
 * @param {string|string[]|null|undefined} bruto
 * @returns {number}
 */
export function normalizarPeriodo(bruto) {
  if (typeof bruto !== "string" || !/^\d+$/.test(bruto)) return PERIODO_PADRAO;
  const n = Number(bruto);
  return PERIODOS_ANALYTICS.includes(n) ? n : PERIODO_PADRAO;
}

/**
 * Função PURA — recorta a lista pelo plano contratado. `"todos"` (ou qualquer
 * coisa fora de um código de plano) devolve a lista inteira, na ordem em que
 * chegou.
 *
 * Estabelecimento sem plano (`plano_codigo` nulo) só aparece em "todos": ele
 * não está em nenhum plano, e mostrá-lo dentro de um recorte de plano seria
 * afirmar algo falso na tela.
 *
 * Não faz I/O e não muda o array recebido.
 *
 * @param {Array<{plano_codigo?:string|null}>} itens
 * @param {string} codigo  "todos" ou o código do plano
 * @returns {Array<object>}
 */
export function filtrarPorPlano(itens = [], codigo = "todos") {
  const lista = itens ?? [];
  if (typeof codigo !== "string" || codigo === "todos") return [...lista];
  return lista.filter((t) => t?.plano_codigo === codigo);
}

/**
 * Função PURA — traduz o que veio da URL (`?plano=...`) para um código de
 * plano que existe no catálogo RECEBIDO, nunca numa lista fixa: o catálogo é
 * do banco e muda por estabelecimento (decisão 017), então plano novo passa a
 * valer sozinho e nenhum código fica cravado aqui.
 *
 * Código inexistente, vazio, ausente, com caixa diferente ou repetido cai em
 * "todos" — o estado que não esconde ninguém. Catálogo vazio (ou que falhou ao
 * carregar) também: sem catálogo confiável não há recorte honesto.
 *
 * Não lê `window` nem o roteador — quem faz isso é a tela.
 *
 * @param {string|string[]|null|undefined} bruto
 * @param {Array<{codigo:string}>} planos  catálogo vindo do banco
 * @returns {string} "todos" ou um código do catálogo
 */
export function normalizarFiltroPlano(bruto, planos = []) {
  if (typeof bruto !== "string" || bruto === "") return "todos";
  const catalogo = Array.isArray(planos) ? planos : [];
  return catalogo.some((p) => p?.codigo === bruto) ? bruto : "todos";
}

/**
 * Função PURA — quantos estabelecimentos há em cada plano do catálogo, para a
 * contagem aparecer dentro do próprio atalho (clicar não é aposta).
 *
 * Conta sobre a base inteira que foi passada: quem chama decide se manda a
 * lista já recortada por situação ou a lista completa.
 *
 * @param {Array<{plano_codigo?:string|null}>} itens
 * @returns {Record<string, number>} código do plano → quantidade
 */
export function contarPorPlano(itens = []) {
  const lista = itens ?? [];
  const contagem = {};
  for (const t of lista) {
    const codigo = t?.plano_codigo;
    if (!codigo) continue;
    contagem[codigo] = (contagem[codigo] ?? 0) + 1;
  }
  return contagem;
}

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
    .filter(precisaAtencao)
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

/** Períodos aceitos pela RPC `analytics_plataforma` (20260912) — a lista é
 *  fechada no BANCO; aqui é só o que a tela oferece. */
export const PERIODOS_ANALYTICS = [7, 30, 90];

/**
 * Uso da base por estabelecimento (F022-ANALYTICS) via RPC
 * `analytics_plataforma` (20260912): faturamento, pedidos e última venda.
 *
 * Por que RPC e não `.from("vendas")`: a policy de `vendas` NÃO tem o ramo
 * `OR is_super_admin()` — e isso é decisão escrita (ADR-008, decisão v2
 * nº 2), não esquecimento. O super-admin não lê o dado operacional bruto
 * de todos os tenants; lê AGREGADO, por uma RPC SECURITY DEFINER que
 * revalida o papel dentro do banco. Uma leitura direta daqui voltaria
 * vazia, e é assim que tem que ser.
 *
 * A RPC devolve só quatro colunas, nenhuma identificando uma venda.
 *
 * Nunca lança: falha de rede/RLS/função ausente volta como
 * { data: [], error } — a tela precisa dizer que não sabe, não mostrar zero.
 *
 * @param {number} dias 7, 30 ou 90 (o banco recusa o resto)
 * @returns {Promise<{data: Array<{tenant_id:string, faturamento_centavos:number, pedidos:number, ultima_venda:string|null}>, error: object|null}>}
 */
export async function listarAnalitico(dias = 30) {
  try {
    const { data, error } = await supabase.rpc("analytics_plataforma", { p_dias: dias });
    if (error) return { data: [], error };
    return { data: data ?? [], error: null };
  } catch (err) {
    return { data: [], error: { message: err?.message ?? "Falha ao carregar o uso dos estabelecimentos." } };
  }
}

/** Dias de CALENDÁRIO desde uma data ISO. `null` quando não há data (nunca
 *  vendeu) ou quando a data é inválida — a tela distingue "nunca" de "há 0
 *  dias".
 *
 *  A conta é de dias de calendário, não de intervalo decorrido: a venda das
 *  22h de ontem vista às 9h de hoje passou 11 horas, e `floor(11h/24h)` daria
 *  0 — a tela diria "Hoje" para um estabelecimento que ainda não abriu o
 *  caixa. Normalizamos as duas pontas para o dia local antes de subtrair.
 *  `ultima_venda` é `timestamptz`, então os getters locais são os corretos. */
export function diasDesde(iso, hoje) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const diaVenda = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  const diaHoje = Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  return Math.max(0, Math.round((diaHoje - diaVenda) / 86400000));
}

/**
 * Função PURA — cruza os estabelecimentos, as assinaturas e o agregado de
 * uso na visão "a base está operando?". Não faz I/O (CLAUDE.md: função
 * pura nasce com teste).
 *
 * O cruzamento é o produto aqui: faturamento sozinho é um número; o que o
 * dono precisa ver é **quem paga e não usa** — assinatura em dia e zero
 * pedidos no período. Esse é o churn que hoje só aparece no cancelamento.
 *
 * "Paga" usa o mesmo critério do MRR de `resumirPlataforma` (ativo ou
 * carência, com o status recalculado por `calcularStatusAssinatura`, não o
 * cache do banco). Bloqueado fica fora de propósito: perdeu o acesso, não
 * vender é consequência, não sintoma. Cancelado e sem assinatura também —
 * não pagam.
 *
 * Dinheiro em CENTAVOS INTEIROS do começo ao fim: a RPC já devolve assim e
 * nada aqui divide por 100 — isso é trabalho da formatação, na tela.
 *
 * @param {Array<{id:string, nome:string}>} tenants
 * @param {Array<{tenant_id:string, data_vencimento:string, carencia_dias:number, status:string}>} assinaturas
 * @param {Array<{tenant_id:string, faturamento_centavos:number, pedidos:number, ultima_venda:string|null}>} analitico
 * @param {Date} [hoje]
 * @returns {{linhas:Array<object>, kpis:object, pagandoSemUso:Array<object>}}
 */
export function resumirUso(tenants = [], assinaturas = [], analitico = [], hoje = new Date()) {
  const usoDe = new Map((analitico ?? []).map((u) => [u.tenant_id, u]));
  const assinaturaDe = new Map((assinaturas ?? []).map((a) => [a.tenant_id, a]));

  const linhas = (tenants ?? []).map((t) => {
    const u = usoDe.get(t.id) ?? null;
    const a = assinaturaDe.get(t.id) ?? null;
    // Number(undefined) é NaN e NaN || 0 é 0 — o `|| 0` cobre ausente,
    // nulo e lixo de uma vez.
    const faturamentoCentavos = Math.round(Number(u?.faturamento_centavos) || 0);
    const pedidos = Math.trunc(Number(u?.pedidos) || 0);

    let statusAssinatura = "sem_assinatura";
    if (a) {
      statusAssinatura = a.status === "cancelado"
        ? "cancelado"
        : calcularStatusAssinatura(a.data_vencimento, a.carencia_dias, hoje);
    }

    return {
      tenantId: t.id,
      nome: t.nome,
      faturamentoCentavos,
      pedidos,
      // Divisão inteira: ticket médio de 3 pedidos somando 1000 centavos é
      // 333, não 333.3333. Sem pedido não existe ticket — `null` vira "—"
      // na tela, nunca 0 (que leria como "vendeu de graça").
      ticketMedioCentavos: pedidos > 0 ? Math.round(faturamentoCentavos / pedidos) : null,
      ultimaVenda: u?.ultima_venda ?? null,
      diasSemVender: diasDesde(u?.ultima_venda, hoje),
      paga: statusAssinatura === "ativo" || statusAssinatura === "carencia",
    };
  });

  // Quem mais fatura primeiro. Empate em zero é o caso comum (base nova):
  // desempata por pedidos e depois por nome, para a lista não dançar entre
  // dois carregamentos.
  const ordenadas = [...linhas].sort(
    (x, y) =>
      y.faturamentoCentavos - x.faturamentoCentavos ||
      y.pedidos - x.pedidos ||
      String(x.nome ?? "").localeCompare(String(y.nome ?? ""), "pt-BR")
  );

  const faturamentoCentavos = linhas.reduce((s, l) => s + l.faturamentoCentavos, 0);
  const pedidos = linhas.reduce((s, l) => s + l.pedidos, 0);

  // Paga e não vendeu nada no período. Mais tempo parado = mais urgente;
  // "nunca vendeu" (sem data) é o pior de todos e vem primeiro. O sentinela
  // é finito de propósito: com Infinity, dois "nunca vendeu" dariam
  // `Infinity - Infinity` = NaN e o comparador ficaria indefinido.
  const NUNCA = Number.MAX_SAFE_INTEGER;
  const pagandoSemUso = ordenadas
    .filter((l) => l.paga && l.pedidos === 0)
    .sort((x, y) => (y.diasSemVender ?? NUNCA) - (x.diasSemVender ?? NUNCA));

  return {
    linhas: ordenadas,
    kpis: {
      faturamentoCentavos,
      pedidos,
      ticketMedioCentavos: pedidos > 0 ? Math.round(faturamentoCentavos / pedidos) : null,
      operando: linhas.filter((l) => l.pedidos > 0).length,
      semUso: pagandoSemUso.length,
    },
    pagandoSemUso,
  };
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

// Colisão de credencial no Auth. Enquanto `TENANT_ROOT_DOMAIN` está
// desligado, a Edge Function usa o namespace de e-mail 'gastromundi' para
// TODO estabelecimento — então o username precisa ser único na plataforma
// inteira, e o segundo estabelecimento que reusar "admin" bate aqui. O
// próprio index.ts chama esse caminho de "esperado"; é o modo de falha mais
// provável ao pôr um cliente novo no ar.
const ERRO_USUARIO_EM_USO =
  /already[ _]been[ _]registered|already registered|email[_ ]?exists|user_already_exists|duplicate key[\s\S]*username/i;

/**
 * Traduz o erro cru do provisionamento para uma frase que o dono entende e
 * diz QUAL campo do formulário corrigir (Princípio nº1: nada de jargão
 * técnico na tela). Função pura — sem I/O.
 *
 * O Supabase Auth responde a colisão em inglês e falando de um "email
 * address" que ninguém digitou (o e-mail é montado pelo servidor a partir do
 * usuário). Cru, a mensagem não diz o que fazer; traduzida, ela aponta o
 * campo "Usuário de acesso" e o caminho é óbvio: escolher outro.
 *
 * O `aviso` de compensação (o " ATENÇÃO: ... " que a Edge Function acrescenta
 * quando NÃO conseguiu apagar o estabelecimento órfão) volta separado e
 * NUNCA é descartado: ele exige ação manual do dono e não cabe colado num
 * campo de formulário.
 *
 * @param {string} bruto mensagem devolvida por `provisionarEstabelecimento`
 * @returns {{campo: string|null, mensagem: string, aviso: string}}
 */
export function traduzirErroProvisionamento(bruto) {
  const texto = String(bruto ?? "").trim();
  const corte = texto.indexOf("ATENÇÃO:");
  const principal = (corte >= 0 ? texto.slice(0, corte) : texto).trim();
  const aviso = corte >= 0 ? texto.slice(corte).trim() : "";

  if (ERRO_USUARIO_EM_USO.test(principal)) {
    return {
      campo: "adminUsername",
      mensagem: "Este usuário de acesso já existe na plataforma. Escolha outro — por exemplo, o nome do responsável junto do nome da loja.",
      aviso,
    };
  }

  return {
    campo: null,
    mensagem: principal || "Falha ao criar o estabelecimento.",
    aviso,
  };
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

/**
 * Função PURA — monta a mensagem de primeiro acesso que o dono entrega ao
 * cliente no minuto seguinte à venda (CONSOLE-UX 11).
 *
 * A senha NÃO entra aqui de propósito: ela foi digitada pelo dono no
 * cadastro e não é relida de lugar nenhum. Área de transferência e
 * histórico de conversa não são lugar de senha — a mensagem pede para
 * mandá-la por outro canal.
 *
 * Nada de marca da plataforma no texto (decisão 017): a mensagem fala do
 * estabelecimento criado, não de quem vende o sistema.
 *
 * Campo ausente some da mensagem em vez de virar "undefined" ou linha
 * vazia — meia informação correta vale mais do que linha quebrada.
 *
 * @param {{estabelecimento?:string, plano?:string, endereco?:string, usuario?:string}} dados
 * @returns {string} mensagem pronta para colar no WhatsApp/e-mail
 */
export function montarMensagemPrimeiroAcesso(dados = {}) {
  const limpo = (v) => (typeof v === "string" ? v.trim() : "");
  const estabelecimento = limpo(dados?.estabelecimento);
  const plano = limpo(dados?.plano);
  const endereco = limpo(dados?.endereco);
  const usuario = limpo(dados?.usuario);

  const cabecalho = [
    estabelecimento ? `Acesso do ${estabelecimento}` : "Acesso ao sistema",
    plano ? `Plano: ${plano}` : null,
  ].filter(Boolean);

  const acesso = [
    endereco ? `Endereço: ${endereco}` : null,
    usuario ? `Usuário: ${usuario}` : null,
  ].filter(Boolean);

  const senha = [
    "Senha: a que foi definida no cadastro.",
    "Por segurança, envie a senha em uma mensagem separada desta.",
  ];

  return [cabecalho, acesso, senha]
    .filter((bloco) => bloco.length > 0)
    .map((bloco) => bloco.join("\n"))
    .join("\n\n");
}
