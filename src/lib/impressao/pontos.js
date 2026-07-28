/**
 * Pontos de impressão e roteamento de itens (F015/F020 — Leva 15).
 *
 * O estabelecimento deixa de ter "uma impressora da produção" e passa a
 * ter uma LISTA de pontos nomeados (Cozinha, Chapa, Bar…), cada um
 * ligado a uma impressora. Onde cada item sai é decidido por
 * ROTEAMENTO: por categoria do produto, com exceção por produto
 * (decisão do dono, 2026-07-28). A exceção vence a categoria porque é a
 * regra mais específica — é como o dono raciocina ("bebida vai no bar,
 * MENOS o chocolate quente, que é feito na cozinha").
 *
 * Duas garantias sustentam o resto do sistema e valem para dados sujos
 * vindos do banco (config é JSON livre, editável por qualquer versão
 * antiga da tela):
 *   1. a lista NUNCA é vazia e tem sempre EXATAMENTE UM ponto padrão;
 *   2. item sem rota — sem id, sem categoria, ou apontando pra um ponto
 *      que já foi apagado — cai no ponto padrão.
 * Juntas elas fazem com que nenhum item se perca e nenhum item duplique:
 * todo item sai em exatamente um papel.
 *
 * Tudo aqui é PURO (sem fetch, sem supabase, sem localStorage) — é o que
 * permite testar o roteamento inteiro sem subir nada e o que deixa a
 * mesma função rodar na tela de configuração e no despacho da cozinha.
 */

/** Id do primeiro ponto — o que é sintetizado para quem já usava o sistema. */
export const PONTO_PADRAO_ID = "p1";

// Rótulo genérico de restaurante (não é marca de cliente nenhum — o
// produto é white-label multi-tenant, decisão 017).
const NOME_PONTO_PADRAO = "Cozinha";

// 40 caracteres é o que cabe legível no cabeçalho de um papel de 58mm
// sem quebrar linha; nome maior que isso vira ruído no ticket.
const LIMITE_NOME_PONTO = 40;

// Ids são gerados aqui e viram chave de roteamento gravada no banco:
// aceitar qualquer string permitiria id com espaço/acento/controle e
// tornaria a comparação frágil. Id fora do padrão é regerado.
const PADRAO_ID_VALIDO = /^[A-Za-z0-9_-]{1,24}$/;

// Nome é digitado pelo usuário e é impresso (HTML e ESC/POS). Byte de
// controle no meio dele bagunça a impressora térmica e o log. A faixa é
// montada com String.fromCharCode de propósito: byte de controle escrito
// literalmente no fonte já corrompeu arquivo neste repositório.
const CARACTERES_DE_CONTROLE = new RegExp(
  "[" + String.fromCharCode(0) + "-" + String.fromCharCode(31) +
  String.fromCharCode(127) + "-" + String.fromCharCode(159) + "]",
  "g"
);

function objetoOuVazio(valor) {
  return valor && typeof valor === "object" && !Array.isArray(valor) ? valor : {};
}

function sanitizarNome(nome, fallback) {
  const limpo = String(nome ?? "")
    .replace(CARACTERES_DE_CONTROLE, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!limpo) return fallback;
  return limpo.slice(0, LIMITE_NOME_PONTO).trim();
}

// Só os dois destinos que a Ponte KORA entende (ver PERFIL_IMPRESSORA_PADRAO
// em src/lib/impressao.js). Destino incompleto (windows sem nome, rede sem
// host) vira `null` de propósito: o driver recusa `null` com uma mensagem
// clara ("Escolha a impressora em Configurações"), enquanto um destino
// pela metade viraria trabalho de impressão que falha sem explicação.
function normalizarImpressora(impressora) {
  if (!impressora || typeof impressora !== "object") return null;
  if (impressora.tipo === "windows") {
    const nome = String(impressora.nome ?? "").replace(CARACTERES_DE_CONTROLE, "").trim();
    return nome ? { tipo: "windows", nome } : null;
  }
  if (impressora.tipo === "rede") {
    const host = String(impressora.host ?? "").replace(CARACTERES_DE_CONTROLE, "").trim();
    if (!host) return null;
    const porta = Number(impressora.porta) > 0 ? Number(impressora.porta) : 9100;
    return { tipo: "rede", host, porta };
  }
  return null;
}

function gerarId(usados) {
  let n = 1;
  while (usados.has(`p${n}`)) n += 1;
  return `p${n}`;
}

/**
 * Lê um destino do mapa de roteamento. Usa `hasOwnProperty` de propósito:
 * as chaves são texto livre (categoria de produto, id de produto), então
 * um `roteamento.categorias["constructor"]` num acesso ingênuo devolveria
 * uma função do prototype em vez de `undefined` e o roteamento tomaria
 * decisão em cima de lixo.
 */
function lerRota(mapa, chave) {
  if (!mapa || typeof mapa !== "object" || !chave) return null;
  if (!Object.prototype.hasOwnProperty.call(mapa, chave)) return null;
  const destino = mapa[chave];
  return typeof destino === "string" && destino ? destino : null;
}

/**
 * Normaliza/repara a lista de pontos vinda do banco: ids únicos e
 * válidos, nomes limpos e cortados, impressoras num dos dois formatos
 * conhecidos, e EXATAMENTE um `padrao: true`.
 *
 * Lista vazia/ausente (instalação que já existia antes desta versão)
 * sintetiza o ponto padrão a partir da impressora do perfil — é o que
 * faz quem já usava o sistema continuar imprimindo na cozinha depois de
 * atualizar, sem migration e sem mexer em nada.
 *
 * @param {any} pontos
 * @param {{impressora?: object}} [perfilImpressora]
 * @returns {Array<{id: string, nome: string, impressora: object|null, padrao: boolean}>}
 */
export function normalizarPontos(pontos, perfilImpressora) {
  const usados = new Set();
  const lista = [];

  for (const bruto of Array.isArray(pontos) ? pontos : []) {
    if (!bruto || typeof bruto !== "object") continue;
    const idBruto = String(bruto.id ?? "").trim();
    const id = PADRAO_ID_VALIDO.test(idBruto) && !usados.has(idBruto) ? idBruto : gerarId(usados);
    usados.add(id);
    lista.push({
      id,
      nome: sanitizarNome(bruto.nome, lista.length === 0 ? NOME_PONTO_PADRAO : `Ponto ${lista.length + 1}`),
      impressora: normalizarImpressora(bruto.impressora),
      padrao: bruto.padrao === true,
    });
  }

  if (lista.length === 0) {
    return [{
      id: PONTO_PADRAO_ID,
      nome: NOME_PONTO_PADRAO,
      impressora: normalizarImpressora(perfilImpressora?.impressora),
      padrao: true,
    }];
  }

  // Nenhum marcado (findIndex = -1) ou vários marcados: vale o primeiro
  // marcado, e na ausência dele o primeiro da lista. Nunca zero, nunca dois.
  const indicePadrao = Math.max(0, lista.findIndex((p) => p.padrao));
  return lista.map((p, i) => ({ ...p, padrao: i === indicePadrao }));
}

/**
 * Cria um ponto novo com id livre em relação aos existentes. Nasce sem
 * impressora e sem ser padrão — quem acabou de clicar em "adicionar"
 * ainda não escolheu nada, e trocar o padrão sem pedir seria mudar o
 * destino de tudo que hoje sai na cozinha.
 *
 * @param {Array} pontosExistentes
 * @param {string} [nome]
 * @returns {{id: string, nome: string, impressora: null, padrao: false}}
 */
export function novoPonto(pontosExistentes, nome) {
  const existentes = Array.isArray(pontosExistentes) ? pontosExistentes : [];
  const usados = new Set(existentes.map((p) => String(p?.id ?? "")));
  return {
    id: gerarId(usados),
    nome: sanitizarNome(nome, existentes.length === 0 ? NOME_PONTO_PADRAO : `Ponto ${existentes.length + 1}`),
    impressora: null,
    padrao: false,
  };
}

function filtrarMapaRotas(mapa, idsValidos) {
  const limpo = {};
  const origem = objetoOuVazio(mapa);
  for (const chave of Object.keys(origem)) {
    const destino = lerRota(origem, chave);
    if (destino && idsValidos.has(destino)) limpo[chave] = destino;
  }
  return limpo;
}

/**
 * Remove um ponto e devolve pontos + roteamento já sem referência órfã.
 *
 * Duas decisões aqui:
 * - o roteamento é reescrito só com destinos que ainda existem (id órfão
 *   gravado no banco viraria item "roteado" pra lugar nenhum, e quem
 *   lesse a tela depois não entenderia por que aquele item some);
 * - apagar o ÚLTIMO ponto não é permitido (devolve a lista intacta): sem
 *   ponto nenhum a produção ficaria sem destino, e recriar um vazio
 *   perderia a impressora já configurada. A tela esconde o botão quando
 *   só resta um; esta função é a rede de segurança.
 *
 * @param {Array} pontos
 * @param {{categorias?: object, produtos?: object}} roteamento
 * @param {string} id
 * @returns {{pontos: Array, roteamento: {categorias: object, produtos: object}}}
 */
export function removerPonto(pontos, roteamento, id) {
  const lista = normalizarPontos(pontos);
  const restantes = lista.filter((p) => p.id !== String(id ?? ""));
  // Apagar o padrão deixa a lista sem nenhum marcado — normalizarPontos
  // promove o primeiro, então é impossível ficar sem padrão.
  const finais = restantes.length > 0 ? normalizarPontos(restantes) : lista;
  const idsValidos = new Set(finais.map((p) => p.id));
  return {
    pontos: finais,
    roteamento: {
      categorias: filtrarMapaRotas(roteamento?.categorias, idsValidos),
      produtos: filtrarMapaRotas(roteamento?.produtos, idsValidos),
    },
  };
}

/**
 * Marca um ponto como padrão (e desmarca os outros). Id inexistente não
 * faz nada além de normalizar — nunca deixa a lista sem padrão.
 *
 * @param {Array} pontos
 * @param {string} id
 * @returns {Array}
 */
export function definirPadrao(pontos, id) {
  const lista = normalizarPontos(pontos);
  const alvo = String(id ?? "");
  if (!lista.some((p) => p.id === alvo)) return lista;
  return lista.map((p) => ({ ...p, padrao: p.id === alvo }));
}

// Pré-calcula o que o roteamento consulta item a item (lista normalizada,
// índice por id e o ponto padrão) — resolver cada item do zero
// re-normalizaria a lista inteira a cada linha da comanda.
function montarContexto({ pontos, roteamento } = {}) {
  const lista = normalizarPontos(pontos);
  return {
    lista,
    porId: new Map(lista.map((p) => [p.id, p])),
    padrao: lista.find((p) => p.padrao) ?? lista[0],
    roteamento: roteamento ?? null,
  };
}

function resolverPonto(item, ctx) {
  // Exceção por produto vence a categoria: é a regra mais específica.
  const idProduto = item?.id === null || item?.id === undefined ? "" : String(item.id);
  const porProduto = idProduto ? lerRota(ctx.roteamento?.produtos, idProduto) : null;
  if (porProduto && ctx.porId.has(porProduto)) return ctx.porId.get(porProduto);

  const categoria = typeof item?.category === "string" ? item.category : "";
  const porCategoria = categoria ? lerRota(ctx.roteamento?.categorias, categoria) : null;
  if (porCategoria && ctx.porId.has(porCategoria)) return ctx.porId.get(porCategoria);

  // Sem rota, ou rota apontando pra ponto apagado: o padrão. Nunca lança,
  // nunca devolve undefined — um item sem destino seria um item que a
  // cozinha nunca vê.
  return ctx.padrao;
}

/**
 * Resolve em qual ponto UM item deve sair.
 * Exceção por produto > categoria > ponto padrão.
 *
 * @param {{id?: any, category?: any}} item
 * @param {{pontos?: Array, roteamento?: object}} [opcoes]
 * @returns {{id: string, nome: string, impressora: object|null, padrao: boolean}}
 */
export function pontoDoItem(item, opcoes) {
  return resolverPonto(item, montarContexto(opcoes));
}

/**
 * Agrupa os itens de um documento por ponto de impressão. Só devolve
 * grupos com item (ponto configurado que não recebeu nada não gasta
 * papel), na ORDEM DA LISTA DE PONTOS — assim as vias saem sempre na
 * mesma sequência e quem trabalha na produção aprende o ritmo.
 *
 * @param {Array} itens
 * @param {{pontos?: Array, roteamento?: object}} [opcoes]
 * @returns {Array<{ponto: object, itens: Array}>}
 */
export function agruparItensPorPonto(itens, opcoes) {
  const ctx = montarContexto(opcoes);
  const grupos = new Map(ctx.lista.map((p) => [p.id, []]));

  for (const item of Array.isArray(itens) ? itens : []) {
    grupos.get(resolverPonto(item, ctx).id).push(item);
  }

  return ctx.lista
    .filter((p) => grupos.get(p.id).length > 0)
    .map((p) => ({ ponto: p, itens: grupos.get(p.id) }));
}
