import { supabase } from "./supabase";
import { nomeExibicaoTenant, logoUrlTenant } from "./tema";
import { normalizarPontos } from "./impressao/pontos";
import { layoutComandaDeConfig, normalizarLayoutComanda } from "./impressao/layoutComanda";

/**
 * Impressão — F015 (docs/09_BACKLOG/features.md).
 *
 * Só o LAYOUT/template de impressão (comprovante, via de produção,
 * cupom/pré-nota) — a emissão fiscal de verdade (NF-e/NFC-e) é add-on
 * pago à parte (F019, decisão 019) e não entra aqui. `montarCupomPreNota`
 * já nasce com o formato que o F019 vai estender (`dadosFiscais: null`
 * é o ponto de extensão — o provedor fiscal real preenche esse campo
 * depois, sem mudar o resto do template).
 *
 * Identidade do estabelecimento vem sempre de `tenant.tema` (Fase 6,
 * ADR-007) — nunca hardcoded. `config_impressao` (tabela `config`,
 * mesmo padrão de `taxa_servico`/`meios_pagamento`) guarda só as
 * preferências de exibição (mostrar logo, endereço/CNPJ, rodapé),
 * não identidade — identidade e tema continuam em `tenants.tema`.
 */

// F020 — perfil de impressora: driver trocável (decisão 025) + papel
// físico (largura/margem/corte/fonte). `driver: "browser-raster"` é o
// default gratuito (window.print); `"escpos-ponte"` manda o texto pra
// Ponte KORA (Node local, já instalado no PC do caixa), que monta os
// bytes ESC/POS e reimprime sozinha — sem QZ Tray e sem certificado
// pago (Restrições de Custo). `fonteBase: null` = usa o tamanho
// default de cada template (comprovante 13px, via de produção 15px);
// só é sobrescrito se o estabelecimento pedir letra maior (impressora
// que "corta" texto pequeno).
//
// `impressora` é o destino que a Ponte entende — dois formatos:
//   { tipo: "windows", nome: "EPSON TM-T20" }        → fila do Windows
//   { tipo: "rede", host: "192.168.0.50", porta: 9100 } → socket RAW
// `null` = ainda não escolhida (o driver da Ponte recusa com mensagem
// clara em vez de imprimir no vazio).
//
// DIVISÃO (Leva 15): o perfil é PAPEL/LAYOUT (largura, margem, corte,
// fonte, driver) + a impressora DO CAIXA — comprovante, cupom/pré-nota,
// pré-conta, tudo que sai perto de quem cobra. A impressora da PRODUÇÃO
// deixou de morar aqui e passou a ser POR PONTO (`pontosImpressao`),
// porque um restaurante tem um caixa e pode ter várias estações
// (cozinha, chapa, bar). O papel continua único e compartilhado: quem
// tem duas térmicas usa o mesmo rolo nas duas, e obrigar a reconfigurar
// largura/fonte em cada ponto seria repetição sem ganho. `impressora`
// do perfil segue sendo a semente do primeiro ponto (ver
// `mesclarConfigImpressao`) — é o que faz quem já usava não perder nada.
export const PERFIL_IMPRESSORA_PADRAO = {
  larguraMm: 80,
  margemMm: 2,
  cortaPapel: true,
  fonteBase: null,
  driver: "browser-raster",
  impressora: null,
};

// Roteamento — para onde vai cada item da produção (Leva 15, decisão do
// dono 2026-07-28). `categorias` mapeia `products.category` (texto livre)
// → id do ponto; `produtos` mapeia `String(product.id)` → id do ponto e
// funciona como EXCEÇÃO: vence a categoria por ser a regra mais
// específica. Item sem entrada em nenhum dos dois sai no ponto padrão.
export const ROTEAMENTO_PADRAO = { categorias: {}, produtos: {} };

export const CONFIG_IMPRESSAO_PADRAO = {
  mostrarLogo: true,
  mostrarEnderecoCnpj: false,
  endereco: "",
  cnpj: "",
  rodapePersonalizado: "Obrigado pela preferência!",
  // Imprimir a via de produção sozinho, assim que o garçom lança o
  // pedido (decisão do dono 2026-07-29). LIGADO por padrão porque é o
  // que todo mundo espera de um PDV de restaurante: lançou, saiu papel
  // na cozinha. Quem corrige lançamento no balcão e não quer gastar
  // bobina desliga aqui, por estabelecimento (decisão 017).
  imprimirAoLancar: true,
  // Imprimir a conta do cliente (pré-nota) sozinho ao abrir o fechamento
  // da comanda (decisão do dono 2026-07-29). DESLIGADO por padrão: o dono
  // pediu como opção, e casa que fecha muita conta no cartão sem mostrar
  // extrato não quer gastar bobina em toda venda. Os botões manuais
  // "Comprovante" e "Pré-nota" do checkout continuam existindo dos dois jeitos.
  imprimirContaNoCheckout: false,
  perfilImpressora: PERFIL_IMPRESSORA_PADRAO,
  // Layout da comanda montado pelo dono (blocos: ordem, o que aparece,
  // alinhamento, texto livre) — ver `impressao/layoutComanda.js`. Vazio
  // = nunca editado: aí vale o padrão de fábrica semeado com os campos
  // acima, e o papel sai idêntico ao de sempre.
  layoutComanda: [],
  // Vazio no default e SEMPRE preenchido pela normalização da leitura —
  // ninguém consome a config sem pelo menos um ponto (ver
  // `mesclarConfigImpressao`).
  pontosImpressao: [],
  roteamento: ROTEAMENTO_PADRAO,
};

// Cache local da config de impressão — impressão local (window.print /
// Ponte KORA em localhost) não depende de internet; só a config dependia.
// Guardando a última config lida, imprimir continua funcionando offline.
//
// ISOLAMENTO MULTI-TENANT (hardening): o cache é carimbado com o tenant_id
// do JWT de quem gravou; na leitura, se o tenant atual não bater, o cache é
// ignorado (evita usar a config de impressão de outro estabelecimento quando
// dois tenants dividem a mesma origem de navegador). Formato legado (sem
// carimbo) segue sendo lido — a config é convenience e é revalidada online.
const CHAVE_CACHE_CONFIG_IMPRESSAO = "kora.cache.config_impressao.v1";

// tenant_id do JWT da sessão atual (disponível offline — vem do storage do
// supabase-js, sem rede). Nunca lança: falha → null (cache fica sem carimbo).
async function tenantIdAtual() {
  try {
    const { data } = await supabase.auth.getSession();
    return data?.session?.user?.app_metadata?.tenant_id ?? null;
  } catch {
    return null;
  }
}

function lerCacheConfigImpressao(tenantId = undefined) {
  try {
    const bruto = localStorage.getItem(CHAVE_CACHE_CONFIG_IMPRESSAO);
    const parsed = bruto ? JSON.parse(bruto) : null;
    if (!parsed || typeof parsed !== "object") return null;
    // Formato novo: { __tenant, valor }. Legado: o próprio valor cru.
    if (Object.prototype.hasOwnProperty.call(parsed, "__tenant")) {
      if (tenantId !== undefined && (parsed.__tenant ?? null) !== (tenantId ?? null)) return null;
      const valor = parsed.valor;
      return valor && typeof valor === "object" ? valor : null;
    }
    return parsed; // legado (sem carimbo) — lenient
  } catch {
    return null;
  }
}

function salvarCacheConfigImpressao(valor, tenantId = null) {
  try {
    localStorage.setItem(
      CHAVE_CACHE_CONFIG_IMPRESSAO,
      JSON.stringify({ __tenant: tenantId ?? null, valor: valor ?? {} })
    );
  } catch {
    // cache é conveniência — sem espaço/permissão, segue sem ele
  }
}

// Campos que existiram em versões anteriores da impressão (QZ Tray,
// fila no banco) e hoje não significam nada. Ficam gravados em `config`
// de quem já usava o sistema — a leitura só os IGNORA, sem quebrar e
// sem exigir migration destrutiva no banco do estabelecimento.
const CAMPOS_LEGADOS_CONFIG = ["impressaoEmRede"];
const CAMPOS_LEGADOS_PERFIL = ["impressoraQz"];
const DRIVERS_LEGADOS = ["escpos-qztray"];

function semCamposLegados(objeto, campos) {
  const limpo = { ...(objeto ?? {}) };
  for (const campo of campos) delete limpo[campo];
  return limpo;
}

function mapaDeRotas(valor) {
  // O que vem do banco é JSON livre: um `roteamento.categorias` que não
  // seja objeto (string, array, número) seria espalhado em índices e
  // viraria rota fantasma. Fora do formato = mapa vazio.
  return valor && typeof valor === "object" && !Array.isArray(valor) ? { ...valor } : {};
}

// Merge próprio pro perfil (aninhado) — senão salvar só 1 campo
// do perfil apagaria os demais defaults (largura, driver etc.).
function mesclarConfigImpressao(valor) {
  const perfilGravado = semCamposLegados(valor?.perfilImpressora, CAMPOS_LEGADOS_PERFIL);
  // Driver que não existe mais volta pro default gratuito — senão a tela
  // de perfil mostraria uma opção fantasma e a impressão cairia em
  // fallback silencioso.
  if (DRIVERS_LEGADOS.includes(perfilGravado.driver)) delete perfilGravado.driver;
  const perfilImpressora = { ...PERFIL_IMPRESSORA_PADRAO, ...perfilGravado };
  return {
    ...CONFIG_IMPRESSAO_PADRAO,
    ...semCamposLegados(valor, CAMPOS_LEGADOS_CONFIG),
    // O que vem do banco é JSON livre e o campo é novo: instalação antiga
    // não tem a chave. Só `false` explícito desliga — qualquer outra coisa
    // (ausente, null, lixo) cai no ligado, que é o default acordado.
    imprimirAoLancar: valor?.imprimirAoLancar !== false,
    // Espelho invertido da chave acima: esta nasce DESLIGADA, então só
    // `true` explícito liga. Instalação antiga não imprime conta sozinha.
    imprimirContaNoCheckout: valor?.imprimirContaNoCheckout === true,
    perfilImpressora,
    // Quem já usava o sistema tem `pontosImpressao` ausente/vazio: a
    // normalização sintetiza o ponto padrão a partir da impressora do
    // perfil, então a comanda continua saindo na mesma impressora depois
    // de atualizar — sem migration, sem susto, sem reconfigurar nada.
    // Também é aqui que dado sujo (dois padrões, id repetido) é reparado
    // antes de chegar na tela ou no despacho.
    pontosImpressao: normalizarPontos(valor?.pontosImpressao, perfilImpressora),
    // JSON livre do banco: tipo desconhecido, bloco único repetido e id
    // colidindo são reparados aqui, antes de chegar na tela ou no papel.
    layoutComanda: normalizarLayoutComanda(valor?.layoutComanda),
    roteamento: {
      categorias: mapaDeRotas(valor?.roteamento?.categorias),
      produtos: mapaDeRotas(valor?.roteamento?.produtos),
    },
  };
}

/**
 * Busca as preferências de impressão do estabelecimento. Nunca lança:
 * falha cai no cache local (última config lida com sucesso — mantém a
 * impressão local funcionando offline) e, sem cache, nos defaults.
 *
 * O retorno passa SEMPRE por `mesclarConfigImpressao`, inclusive nos
 * caminhos de erro: assim `data.pontosImpressao` nunca chega vazio em
 * quem imprime, e o despacho não precisa saber se a config veio do
 * banco, do cache ou do default.
 *
 * @returns {Promise<{data: object, error: object|null}>}
 */
export async function buscarConfigImpressao() {
  const tid = await tenantIdAtual();
  try {
    const { data, error } = await supabase
      .from("config")
      .select("key, value")
      .eq("key", "config_impressao")
      .maybeSingle();
    if (error) {
      const cache = lerCacheConfigImpressao(tid);
      if (cache) return { data: mesclarConfigImpressao(cache), error: null };
      return { data: mesclarConfigImpressao({}), error };
    }
    const valor = data?.value ?? {};
    salvarCacheConfigImpressao(valor, tid);
    return { data: mesclarConfigImpressao(valor), error: null };
  } catch (err) {
    const cache = lerCacheConfigImpressao(tid);
    if (cache) return { data: mesclarConfigImpressao(cache), error: null };
    return { data: mesclarConfigImpressao({}), error: { message: err?.message ?? "Falha ao buscar configuração de impressão." } };
  }
}

/**
 * Salva as preferências de impressão do estabelecimento.
 *
 * @param {object} config
 * @returns {Promise<{error: object|null}>}
 */
export async function salvarConfigImpressao(config) {
  try {
    const { error } = await supabase.from("config").upsert({ key: "config_impressao", value: config ?? {} });
    if (!error) salvarCacheConfigImpressao(config ?? {}, await tenantIdAtual());
    return { error };
  } catch (err) {
    return { error: { message: err?.message ?? "Falha ao salvar configuração de impressão." } };
  }
}

/**
 * Resolve a identidade do estabelecimento para um cabeçalho de impressão —
 * nome/logo de `tenant.tema`, caindo no nome CADASTRADO do estabelecimento
 * (`tenant.nome`) e, em último caso, na marca neutra da plataforma;
 * endereço/CNPJ só aparecem se a config do estabelecimento pedir
 * explicitamente. Função pura.
 *
 * O cupom é a saída mais séria desta cadeia: é papel que vai para a mão do
 * cliente. Enquanto o último degrau era a marca de um cliente específico,
 * qualquer tenant sem `nome_exibicao` imprimia o nome de outra empresa no
 * cabeçalho do próprio cupom (decisão 017).
 *
 * @param {{tema?: object, nome?: string}|null|undefined} tenant
 * @param {object} [configImpressao]
 * @returns {{nome: string, logoUrl: string|null, endereco: string, cnpj: string, rodape: string}}
 */
export function resolverIdentidadeTenant(tenant, configImpressao) {
  const cfg = { ...CONFIG_IMPRESSAO_PADRAO, ...(configImpressao ?? {}) };
  return {
    nome: nomeExibicaoTenant(tenant?.tema, tenant?.nome),
    logoUrl: cfg.mostrarLogo ? logoUrlTenant(tenant?.tema) : null,
    endereco: cfg.mostrarEnderecoCnpj ? (cfg.endereco || "") : "",
    cnpj: cfg.mostrarEnderecoCnpj ? (cfg.cnpj || "") : "",
    rodape: cfg.rodapePersonalizado || "",
  };
}

// Normaliza os itens de uma venda para o formato de impressão —
// exclui cancelados (nunca aparecem em comprovante/cupom).
function normalizarItensVenda(itens) {
  return (Array.isArray(itens) ? itens : [])
    .filter((i) => !i?.cancelado)
    .map((i) => ({
      nome: i.name ?? "",
      qty: Number(i.qty) || 1,
      preco: Number(i.price) || 0,
      emoji: i.emoji ?? "",
      obs: Array.isArray(i.obs) ? i.obs : (i.obs ? [i.obs] : []),
    }));
}

/**
 * Monta os dados do comprovante de pagamento (itens, totais,
 * pagamentos/troco, identidade do tenant) — pura, pronta para
 * renderizar. Chamada depois da venda finalizada.
 *
 * @param {{venda: object, tenant?: object, configImpressao?: object}} params
 * @returns {object}
 */
export function montarComprovantePagamento({ venda, tenant, configImpressao } = {}) {
  const itens = normalizarItensVenda(venda?.items);
  const subtotal = itens.reduce((s, i) => s + i.preco * i.qty, 0);
  const pagamentos = Array.isArray(venda?.pagamentos) ? venda.pagamentos : [];
  const trocoTotal = pagamentos.reduce((s, p) => s + (Number(p?.troco) || 0), 0);

  return {
    tipo: "comprovante",
    identidade: resolverIdentidadeTenant(tenant, configImpressao),
    // O layout viaja DENTRO do documento: assim todo caminho de
    // impressão que já monta o comprovante (checkout, pré-nota, mobile)
    // passa a respeitar o que o dono montou, sem mudar nenhum chamador.
    layout: layoutComandaDeConfig(configImpressao),
    comanda: venda?.comanda ?? null,
    itens,
    subtotal,
    valorTaxa: Number(venda?.valorTaxa) || 0,
    ajuste: venda?.ajuste ?? null,
    valorAjuste: Number(venda?.valorAjuste) || 0,
    total: Number(venda?.total) || subtotal,
    pagamentos,
    trocoTotal,
  };
}

/**
 * Monta o cupom/pré-nota (não fiscal) — mesma base do comprovante,
 * mais o aviso de "sem valor fiscal" e o ponto de extensão para
 * quando o add-on fiscal (F019) entrar: `dadosFiscais` fica pronto
 * para receber número/QR/autorização sem mudar o resto do template.
 *
 * @param {{venda: object, tenant?: object, configImpressao?: object}} params
 * @returns {object}
 */
export function montarCupomPreNota({ venda, tenant, configImpressao } = {}) {
  const base = montarComprovantePagamento({ venda, tenant, configImpressao });
  return {
    ...base,
    tipo: "cupom_pre_nota",
    naoFiscal: true,
    avisoNaoFiscal: "Documento sem valor fiscal — não substitui a nota fiscal.",
    dadosFiscais: null,
  };
}

/**
 * Monta a via de produção (ticket de cozinha) — só itens produzíveis
 * (exclui cancelados e os marcados `produzivel: false`), sem preço,
 * sem forma de pagamento: só o que a cozinha precisa saber.
 *
 * @param {{pedido: object}} params
 * @returns {object}
 */
export function montarViaProducao({ pedido } = {}) {
  const itens = (Array.isArray(pedido?.items) ? pedido.items : [])
    .filter((i) => !i?.cancelado && i?.produzivel !== false)
    .map((i) => ({
      // `id` (do produto) e `category` não são impressos — são o que o
      // roteamento por ponto de impressão consulta (src/lib/impressao/
      // pontos.js). Sem eles aqui, a via chegaria no despacho sem como
      // saber em qual estação cada item sai e tudo cairia no padrão.
      id: i.id ?? null,
      category: typeof i.category === "string" ? i.category : "",
      nome: i.name ?? "",
      qty: Number(i.qty) || 1,
      emoji: i.emoji ?? "",
      obs: Array.isArray(i.obs) ? i.obs : (i.obs ? [i.obs] : []),
    }));

  return {
    tipo: "via_producao",
    comanda: pedido?.comanda ?? null,
    // Complemento opcional da comanda (o "nome" que o garçom digita no
    // /palm, ex.: "Mesa VIP", "João da esquina"). Separado do número da
    // comanda: sai impresso como referência, sem se misturar com ele.
    apelido: pedido?.apelido ?? null,
    mesa: pedido?.mesa ?? null,
    garcom: pedido?.garcom ?? null,
    // Horário de LANÇAMENTO (B1): mais recente launched_at entre os itens
    // (última rodada enviada à produção). Fallback para created_at em
    // comandas antigas cujos itens não têm launched_at.
    horario: horarioLancamentoPedido(pedido),
    itens,
  };
}

/**
 * Resolve o horário de lançamento de um pedido para a via de produção:
 * o launched_at mais recente entre os itens (a última rodada enviada à
 * cozinha). Cai para pedido.launched_at e depois created_at quando os
 * itens não carregam o marco (comandas anteriores ao B1). Pura.
 *
 * @param {object} pedido
 * @returns {string} timestamp ISO8601
 */
export function horarioLancamentoPedido(pedido) {
  const marcos = (Array.isArray(pedido?.items) ? pedido.items : [])
    .map((i) => i?.launched_at)
    .filter(Boolean);
  if (marcos.length > 0) {
    return marcos.reduce((maisRecente, m) => (m > maisRecente ? m : maisRecente));
  }
  return pedido?.launched_at ?? pedido?.created_at ?? new Date().toISOString();
}
