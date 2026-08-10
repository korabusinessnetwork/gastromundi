// ──────────────────────────────────────────────────────────────────
// Delivery — camada de acesso da vitrine pública (anon, por slug)
//
// A vitrine NUNCA toca tabela: fala só com as 3 RPCs SECURITY DEFINER
// (migration 20260804_delivery_fundacao.sql), resolvidas pelo slug do
// subdomínio. Preço e taxa são SEMPRE recalculados no servidor — o que
// esta camada calcula no cliente é só para MOSTRAR (subtotal, troco);
// o valor que vale é o que a RPC devolve/grava.
//
// Funções puras (carrinho, CEP, payload) nascem com teste (delivery.test.js).
// ──────────────────────────────────────────────────────────────────
import { supabase } from "@/lib/supabase";

// ── CEP ────────────────────────────────────────────────────────────

/** Só os dígitos do CEP (até 8). */
export function apenasDigitosCep(bruto) {
  return String(bruto ?? "").replace(/\D/g, "").slice(0, 8);
}

/** Formata "90000000" → "90000-000" (parcial enquanto digita). */
export function formatarCep(bruto) {
  const d = apenasDigitosCep(bruto);
  if (d.length <= 5) return d;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

/** CEP tem 8 dígitos? */
export function cepCompleto(bruto) {
  return apenasDigitosCep(bruto).length === 8;
}

// ── Dinheiro (exibição) ────────────────────────────────────────────

/**
 * Formata um valor em reais para exibição (ex.: 12.5 → "R$ 12,50").
 * Só para MOSTRAR — nunca é o valor que vale (o servidor recalcula).
 * @param {number} valor
 */
export function formatarPreco(valor) {
  const n = Number(valor) || 0;
  return `R$ ${n.toFixed(2).replace(".", ",")}`;
}

/**
 * Lê o que o cliente DIGITOU num campo de dinheiro. O teclado brasileiro
 * escreve "50,00", e `Number("50,00")` é NaN — era por isso que o "troco
 * para" sumia sem aviso nenhum entre a tela e o servidor.
 * Devolve null quando não há número (campo vazio ou rabisco).
 * @param {string|number|null|undefined} texto
 * @returns {number|null}
 */
export function valorDigitado(texto) {
  if (texto === null || texto === undefined) return null;
  const bruto = String(texto).trim();
  if (!bruto) return null;
  // Com vírgula, ela é o decimal e o ponto é separador de milhar
  // ("1.234,56" → 1234.56). Sem vírgula, o ponto é o próprio decimal.
  const normalizado = bruto.includes(",")
    ? bruto.replace(/\./g, "").replace(",", ".")
    : bruto;
  const n = Number(normalizado);
  return Number.isFinite(n) ? n : null;
}

// ── Carrinho (cálculo só para exibição) ────────────────────────────

/**
 * Soma dos complementos escolhidos de um item do carrinho.
 * @param {{complementosEscolhidos?: Array<{preco?: number}>}} item
 */
export function somaComplementos(item) {
  const lista = item?.complementosEscolhidos ?? [];
  return lista.reduce((acc, c) => acc + (Number(c?.preco) || 0), 0);
}

/** Preço unitário (base + complementos) de um item do carrinho. */
export function precoUnitario(item) {
  return (Number(item?.preco) || 0) + somaComplementos(item);
}

/** Preço total de uma linha do carrinho (unitário × qtd). */
export function precoLinha(item) {
  return precoUnitario(item) * Math.max(1, Number(item?.qtd) || 1);
}

/** Subtotal do carrinho inteiro. */
export function calcularSubtotal(itens) {
  return (itens ?? []).reduce((acc, item) => acc + precoLinha(item), 0);
}

/** Quantidade total de itens (para o badge da sacola). */
export function totalItens(itens) {
  return (itens ?? []).reduce((acc, item) => acc + Math.max(1, Number(item?.qtd) || 1), 0);
}

/**
 * Troco a levar quando o pagamento é em dinheiro. Retorna 0 quando não há
 * "troco para" válido ou quando é menor que o total (o motoboy não deve
 * receber "troco para" abaixo do total — a UI trata como sem troco).
 */
export function calcularTroco(trocoPara, total) {
  const t = valorDigitado(trocoPara) ?? 0;
  const tot = Number(total) || 0;
  if (t <= tot) return 0;
  return t - tot;
}

// ── Regras de complementos (min/max por grupo) ─────────────────────

/**
 * Um grupo está satisfeito quando a quantidade de escolhas respeita
 * min_escolhas e max_escolhas. Grupo sem mínimo (min=0) já nasce ok.
 * @param {{min?: number, max?: number}} grupo
 * @param {number} qtdEscolhida
 */
export function grupoSatisfeito(grupo, qtdEscolhida) {
  const min = Math.max(0, Number(grupo?.min) || 0);
  const max = Number(grupo?.max);
  const q = Math.max(0, Number(qtdEscolhida) || 0);
  if (q < min) return false;
  if (Number.isFinite(max) && max > 0 && q > max) return false;
  return true;
}

/**
 * Achata a árvore de grupos (raiz → subgrupos → ...) numa lista plana, em
 * ordem de exibição (pré-ordem/DFS). Cada subgrupo é um grupo NORMAL com id
 * único, então achatar preserva o espaço de seleção plano (grupoId → ids).
 * Usada para varrer TODOS os grupos independentemente da profundidade
 * (validação, soma de complementos, condução ao pendente).
 * @param {Array} grupos
 * @returns {Array} todos os grupos da árvore, em pré-ordem
 */
export function achatarGrupos(grupos) {
  const saida = [];
  const visitar = (lista) => {
    for (const g of lista ?? []) {
      if (!g) continue;
      saida.push(g);
      if (g.subgrupos?.length) visitar(g.subgrupos);
    }
  };
  visitar(grupos);
  return saida;
}

/**
 * Uma árvore de grupo está satisfeita quando o PRÓPRIO grupo respeita seu
 * min/max E todos os subgrupos (recursivamente) também estão satisfeitos.
 * Cada grupo é chaveado pelo próprio id no mapa plano de seleções.
 * @param {{id: string, subgrupos?: Array}} grupo
 * @param {Record<string, string[]>} selecoesPorGrupo
 * @returns {boolean}
 */
export function grupoArvoreSatisfeita(grupo, selecoesPorGrupo) {
  if (!grupo) return true;
  const proprio = grupoSatisfeito(grupo, (selecoesPorGrupo?.[grupo.id] ?? []).length);
  if (!proprio) return false;
  return (grupo.subgrupos ?? []).every((sub) =>
    grupoArvoreSatisfeita(sub, selecoesPorGrupo)
  );
}

/**
 * O produto pode ir pra sacola? Toda a árvore de grupos (raiz + subgrupos,
 * em qualquer profundidade) precisa estar satisfeita.
 * @param {{grupos?: Array}} produto
 * @param {Record<string, string[]>} selecoesPorGrupo - grupoId → ids escolhidos
 */
export function produtoPodeAdicionar(produto, selecoesPorGrupo) {
  const grupos = produto?.grupos ?? [];
  return grupos.every((g) => grupoArvoreSatisfeita(g, selecoesPorGrupo));
}

/**
 * Um grupo é IMPOSSÍVEL quando escolha nenhuma consegue satisfazê-lo. Dá
 * pra chegar nesse estado com dados perfeitamente salvos, de dois jeitos:
 *
 *  · o grupo exige mais opções do que existem para escolher. O dono marca
 *    "acabou o bacon" e o grupo "Escolha 1" fica sem nenhuma opção — a RPC
 *    do cardápio esconde o complemento indisponível, mas o mínimo do grupo
 *    continua valendo;
 *  · o máximo é menor que o mínimo, regra que se contradiz sozinha.
 *
 * Sem enxergar isso, o produto sai do ar em silêncio: o botão trava em
 * "Escolha os obrigatórios" para sempre e não há o que escolher. E o
 * servidor recusaria de qualquer forma (criar_pedido_delivery cobra o
 * min_escolhas do grupo), então insistir só gasta o tempo do cliente.
 * @param {{min?: number, max?: number, itens?: Array}} grupo
 * @returns {boolean}
 */
export function grupoImpossivel(grupo) {
  const min = Math.max(0, Number(grupo?.min) || 0);
  if (min === 0) return false; // grupo opcional nunca trava nada
  const maxRaw = Number(grupo?.max);
  const max = Number.isFinite(maxRaw) && maxRaw > 0 ? maxRaw : 0; // 0 = sem limite
  if (max > 0 && min > max) return true;
  return min > (grupo?.itens?.length ?? 0);
}

/**
 * O produto tem algum grupo impossível na árvore? Varre raiz e subgrupos em
 * qualquer profundidade — a mesma varredura que grupoArvoreSatisfeita faz,
 * porque um subgrupo obrigatório trava o produto mesmo pendurado num pai
 * opcional.
 * @param {{grupos?: Array}} produto
 * @returns {boolean}
 */
export function produtoImpossivel(produto) {
  return achatarGrupos(produto?.grupos ?? []).some(grupoImpossivel);
}

/**
 * Rótulo humano da regra de um grupo — linguagem do dia a dia, não jargão
 * (Princípio nº 1). Ex.: "Escolha 1", "Escolha de 1 a 3", "Opcional · até 3".
 * @param {{min?: number, max?: number}} grupo
 * @returns {string}
 */
export function rotuloRegraGrupo(grupo) {
  // Pedir "Escolha 1" num grupo sem opção é mandar fazer o impossível.
  if (grupoImpossivel(grupo)) return "Indisponível no momento";
  const min = Math.max(0, Number(grupo?.min) || 0);
  const maxRaw = Number(grupo?.max);
  const max = Number.isFinite(maxRaw) && maxRaw > 0 ? maxRaw : 0; // 0 = sem limite
  if (min > 0) {
    if (max > 0 && max === min) return `Escolha ${min}`;
    if (max > 0) return `Escolha de ${min} a ${max}`;
    return `Escolha ao menos ${min}`;
  }
  if (max > 1) return `Opcional · até ${max}`;
  return "Opcional";
}

/**
 * Primeiro grupo ainda não satisfeito — usado para GUIAR o cliente até o
 * campo que falta (prevenção/condução de erro > mensagem seca).
 * @param {{grupos?: Array<{id: string}>}} produto
 * @param {Record<string, string[]>} selecoesPorGrupo
 * @returns {string|null} id do grupo pendente, ou null se tudo satisfeito
 */
export function primeiroGrupoPendente(produto, selecoesPorGrupo) {
  // Caminhada DFS em pré-ordem: mesma ordem em que os grupos aparecem na
  // tela, então rolamos para o PRIMEIRO campo que falta (pai antes dos
  // filhos), incluindo subgrupos em qualquer profundidade.
  for (const g of achatarGrupos(produto?.grupos ?? [])) {
    const qtd = (selecoesPorGrupo?.[g.id] ?? []).length;
    if (!grupoSatisfeito(g, qtd)) return g.id;
  }
  return null;
}

// ── Sacola velha × cardápio de agora ───────────────────────────────

/**
 * Dinheiro em centavos inteiros. Os dois lados da comparação vêm de JSONs
 * diferentes (um do sessionStorage, outro da RPC de agora), então 12.30 de
 * um lado e 12.299999999999999 do outro apareceriam como "preço mudou" sem
 * nada ter mudado. Comparar em centavos mata o ruído de ponto flutuante.
 */
function centavos(valor) {
  return Math.round((Number(valor) || 0) * 100);
}

/** Ids atravessam JSON como bigint ou uuid — comparar sempre como texto. */
function mesmoId(a, b) {
  if (a === null || a === undefined || b === null || b === undefined) return false;
  return String(a) === String(b);
}

/**
 * Confere a sacola guardada contra o cardápio que está no ar AGORA.
 *
 * A sacola vive em sessionStorage e sobrevive a recarregar a aba; o cardápio
 * é carregado uma vez e não se atualiza sozinho. Quando o dono tira um
 * produto do ar (ou marca um complemento como indisponível) no meio da
 * compra, o servidor recusa o pedido inteiro no ÚLTIMO clique com um seco
 * "Item indisponível." que não diz QUAL item. O cliente volta pra sacola,
 * não vê nada de errado, tenta de novo e leva a mesma recusa — beco sem
 * saída, só sai fechando a aba. Preço é a mesma história por outro caminho:
 * a linha guarda o preço de quando foi escolhida, o servidor cobra o de
 * agora, e o cliente descobre que pagou diferente só na confirmação.
 *
 * Aqui a divergência aparece ANTES, na sacola, com o nome do item e o preço
 * novo na tela (prevenção de erro > mensagem de erro, Princípio nº 1).
 *
 * @param {Array} itens linhas da sacola (useCarrinho)
 * @param {{produtos?: Array, combos?: Array}|null} cardapio resposta de cardapio_publico
 * @returns {{linhas: Array, temFora: boolean, temPrecoNovo: boolean, subtotal: number}}
 *   cada linha é o item + `situacao`: "ok" | "fora" | "preco". Nas linhas que
 *   sobrevivem, `preco` e `complementosEscolhidos` já vêm com o valor de agora.
 */
export function revisarSacola(itens, cardapio) {
  const lista = itens ?? [];
  // Sem cardápio na mão (RPC ainda carregando, ou falhou) não dá para
  // afirmar nada. Acusar "saiu do cardápio" aqui seria apagar a sacola do
  // cliente por causa de uma falha nossa de rede.
  if (!cardapio) {
    const linhas = lista.map((item) => ({ ...item, situacao: "ok" }));
    return { linhas, temFora: false, temPrecoNovo: false, subtotal: calcularSubtotal(linhas) };
  }

  const produtos = cardapio.produtos ?? [];
  const combos = cardapio.combos ?? [];

  const linhas = lista.map((item) => {
    const ehCombo = item?.combo_id !== null && item?.combo_id !== undefined;
    const atual = ehCombo
      ? combos.find((c) => mesmoId(c?.combo_id, item.combo_id))
      : produtos.find((p) => mesmoId(p?.produto_id, item?.produto_id));

    // Sumiu do cardápio: desativado, esgotado ou fora do delivery.
    if (!atual) return { ...item, situacao: "fora" };

    // Complementos: a RPC já esconde os indisponíveis, então "não está mais
    // na árvore de grupos" é exatamente "não dá mais para pedir".
    const disponiveis = new Map();
    for (const g of achatarGrupos(atual.grupos ?? [])) {
      for (const c of g?.itens ?? []) disponiveis.set(String(c?.id), c);
    }

    const escolhidos = item?.complementosEscolhidos ?? [];
    let algumSumiu = false;
    let complementoMudouPreco = false;
    const complementosAtuais = escolhidos.map((c) => {
      const vivo = disponiveis.get(String(c?.id));
      if (!vivo) {
        algumSumiu = true;
        return c;
      }
      if (centavos(vivo.preco) !== centavos(c?.preco)) complementoMudouPreco = true;
      return { ...c, preco: Number(vivo.preco) || 0 };
    });

    if (algumSumiu) return { ...item, situacao: "fora" };

    const precoMudou = centavos(atual.preco) !== centavos(item?.preco);
    return {
      ...item,
      preco: Number(atual.preco) || 0,
      complementosEscolhidos: complementosAtuais,
      situacao: precoMudou || complementoMudouPreco ? "preco" : "ok",
    };
  });

  return {
    linhas,
    temFora: linhas.some((l) => l.situacao === "fora"),
    temPrecoNovo: linhas.some((l) => l.situacao === "preco"),
    // O subtotal soma TODAS as linhas, inclusive as que saíram do cardápio:
    // ele tem que bater com o que está desenhado na tela. Nenhum pedido
    // errado escapa por isso — o avanço fica bloqueado até a linha sair.
    subtotal: calcularSubtotal(linhas),
  };
}

// ── Payload do pedido (o que a RPC criar_pedido_delivery espera) ────

/**
 * Coordenada só é coordenada quando é número de verdade. `Number(null)` é
 * 0 — e um 0 aceito aqui joga o cliente no meio do Atlântico (0,0), fazendo
 * o servidor cobrar (ou recusar) a entrega por uma distância inventada.
 * A tela grava `lat: null` sempre que a taxa foi resolvida por bairro/CEP.
 */
function coordenada(valor) {
  if (valor === null || valor === undefined || valor === "") return null;
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

/**
 * Monta o payload jsonb do pedido. NÃO envia preço/total: o servidor
 * recalcula tudo. Envia só a intenção (o que o cliente escolheu).
 * @param {{cliente: object, entrega: object, pagamento: object, itens: Array}} dados
 */
export function montarPayloadPedido({ cliente, entrega, pagamento, itens }) {
  const lat = coordenada(entrega?.lat);
  const lng = coordenada(entrega?.lng);
  const trocoPara = valorDigitado(pagamento?.trocoPara);
  return {
    cliente: {
      nome: (cliente?.nome ?? "").trim(),
      telefone: (cliente?.telefone ?? "").trim() || null,
    },
    entrega: {
      cep: apenasDigitosCep(entrega?.cep),
      bairro: (entrega?.bairro ?? "").trim(),
      endereco: (entrega?.endereco ?? "").trim(),
      complemento: (entrega?.complemento ?? "").trim() || null,
      // Coordenadas só entram quando o modo é por km e o navegador
      // conseguiu geocodificar o endereço. O servidor recalcula a taxa a
      // partir delas (haversine); quando ausentes, cai no fluxo CEP/bairro.
      ...(lat !== null && lng !== null ? { lat, lng } : {}),
    },
    pagamento: {
      forma: pagamento?.forma ?? null,
      troco_para:
        pagamento?.forma === "dinheiro" && trocoPara > 0 ? trocoPara : null,
      levar_maquininha:
        pagamento?.forma === "cartao" ? !!pagamento?.levarMaquininha : false,
    },
    itens: (itens ?? []).map((item) => ({
      produto_id: item?.produto_id ?? null,
      combo_id: item?.combo_id ?? null,
      qtd: Math.max(1, Number(item?.qtd) || 1),
      complementos: (item?.complementosEscolhidos ?? []).map((c) => c.id),
      obs: (item?.obs ?? "").trim() || null,
    })),
  };
}

// ── RPCs (side-effectful; anon por slug) ───────────────────────────

/**
 * Carrega o cardápio público do tenant pelo slug.
 * @param {string} slug
 * @returns {Promise<{data: object|null, error: object|null}>}
 */
export async function carregarCardapio(slug) {
  if (!slug) return { data: null, error: null };
  try {
    const { data, error } = await supabase.rpc("cardapio_publico", { p_slug: slug });
    if (error) return { data: null, error };
    return { data: data ?? null, error: null };
  } catch (err) {
    return {
      data: null,
      error: { message: err?.message ?? "Falha ao carregar o cardápio." },
    };
  }
}

/**
 * Calcula a taxa de entrega (faixa do tenant) a partir do CEP/bairro e,
 * quando o estabelecimento cobra por distância, das coordenadas do cliente
 * (lat/lng). O servidor é a fonte da verdade: ele decide o modo, calcula a
 * distância (haversine) e escolhe o anel. lat/lng só vão quando existem.
 * @returns {Promise<{data: object|null, error: object|null}>}
 */
export async function calcularTaxaEntrega(slug, cep, bairro, lat, lng) {
  if (!slug) return { data: null, error: null };
  try {
    const temCoord = Number.isFinite(Number(lat)) && Number.isFinite(Number(lng));
    const { data, error } = await supabase.rpc("calcular_taxa_entrega", {
      p_slug: slug,
      p_cep: apenasDigitosCep(cep),
      p_bairro: (bairro ?? "").trim() || null,
      p_lat: temCoord ? Number(lat) : null,
      p_lng: temCoord ? Number(lng) : null,
    });
    if (error) return { data: null, error };
    return { data: data ?? null, error: null };
  } catch (err) {
    return {
      data: null,
      error: { message: err?.message ?? "Falha ao calcular a taxa de entrega." },
    };
  }
}

// Os dois únicos códigos em que o texto do erro foi ESCRITO PARA SER LIDO
// por um cliente: todo `RAISE EXCEPTION 'texto'` do plpgsql sai como P0001,
// e os limites de entrada (20260905) e o guard de status (20260815) usam
// `USING ERRCODE = 'check_violation'`, que é 23514. Qualquer outro código é
// falha de infraestrutura, e o texto dela vem em inglês técnico.
const CODIGOS_COM_RECADO_HUMANO = new Set(["P0001", "23514"]);

const RECADO_GENERICO = "Não foi possível enviar o pedido. Tente novamente.";

/**
 * Traduz o erro do envio para algo que uma pessoa comum entenda.
 *
 * A vitrine é a única tela do produto que um anônimo vê, e ela mostrava o
 * `error.message` cru. Quando o problema era do servidor e não do pedido, o
 * cliente lia coisas como "TypeError: Failed to fetch", "Could not find the
 * function public.criar_pedido_delivery in the schema cache" ou "new row
 * violates row-level security policy" — jargão técnico em inglês na tela de
 * quem só queria pedir um lanche.
 *
 * As recusas de propósito (endereço vazio, pedido mínimo, muitos pedidos em
 * sequência) continuam passando na íntegra: são elas que dizem ao cliente o
 * que ele precisa corrigir.
 *
 * @param {{code?: string, message?: string}|null|undefined} error
 * @returns {string} sempre uma frase em português, nunca vazia
 */
export function mensagemDeErroDoPedido(error) {
  const texto = typeof error?.message === "string" ? error.message.trim() : "";
  if (!texto) return RECADO_GENERICO;
  return CODIGOS_COM_RECADO_HUMANO.has(error?.code) ? texto : RECADO_GENERICO;
}

/**
 * Envia o pedido. O servidor revalida preço/taxa e grava; devolve
 * { ok, numero, status, total } ou lança (RAISE) com mensagem humana.
 * @returns {Promise<{data: object|null, error: object|null}>}
 */
export async function enviarPedido(slug, payload) {
  if (!slug) return { data: null, error: { message: "Estabelecimento não identificado." } };
  try {
    const { data, error } = await supabase.rpc("criar_pedido_delivery", {
      p_slug: slug,
      p_payload: payload,
    });
    if (error) return { data: null, error };
    return { data: data ?? null, error: null };
  } catch (err) {
    return {
      data: null,
      error: { message: err?.message ?? "Falha ao enviar o pedido." },
    };
  }
}

// ── Terceiros (ViaCEP / Nominatim) — prazo para responder ──────────

/**
 * Prazo máximo para um serviço de terceiro responder. Nem o `fetch` nem o
 * navegador impõem um limite curto: um socket que abre e não responde fica
 * pendurado por minutos.
 *
 * Sem prazo, o Nominatim (grátis, limite de 1 req/s, sujeito a engasgar)
 * deixava o checkout MORTO no modo "por distância": a tela ficava em
 * "Calculando a taxa de entrega…" para sempre, o "Ir para o pagamento"
 * nunca liberava e o "Tentar de novo" nem aparecia — os dois dependem de a
 * busca ter TERMINADO. A única saída era recarregar a página no meio da
 * compra. O ViaCEP pendurado deixava o "Buscando endereço…" colado na tela
 * pelo resto da sessão.
 */
const PRAZO_TERCEIRO_MS = 8000;

/**
 * Busca JSON num terceiro com prazo. Estourado o prazo, o abort estoura no
 * `catch` de quem chamou e vira a mesma degradação graciosa de qualquer
 * falha de rede — nunca travar por terceiro é regra da spec.
 *
 * O prazo cobre a leitura do corpo também, não só os cabeçalhos: um corpo
 * que começa a chegar e para no meio pendura igual.
 *
 * AbortController em vez de AbortSignal.timeout: o Safari só ganhou o
 * timeout na 16, e a vitrine roda no celular do cliente (mesmo cuidado do
 * crypto.randomUUID em useCarrinho.js). Um `signal` de fora continua
 * valendo — quem cancela busca obsoleta (autocomplete) não perde nada.
 *
 * @returns {Promise<any|null>} JSON, ou null se a resposta não vier ok.
 */
async function jsonComPrazo(url, { signal, ...opcoes } = {}, ms = PRAZO_TERCEIRO_MS) {
  const controle = new AbortController();
  const alarme = setTimeout(() => controle.abort(), ms);
  const repassar = () => controle.abort();
  if (signal?.aborted) controle.abort();
  else signal?.addEventListener("abort", repassar);
  try {
    const resp = await fetch(url, { ...opcoes, signal: controle.signal });
    if (!resp.ok) return null;
    return await resp.json();
  } finally {
    clearTimeout(alarme);
    signal?.removeEventListener("abort", repassar);
  }
}

// ── ViaCEP (grátis, frontend) — degradação graciosa ────────────────

/**
 * Resolve endereço a partir do CEP via ViaCEP. Nunca lança: falha de rede
 * ou CEP inexistente vira { data: null } e a tela deixa o cliente digitar
 * o bairro/endereço à mão (exceção da spec: nunca travar por terceiro).
 * @param {string} cep
 * @returns {Promise<{data: {bairro: string, logradouro: string, cidade: string, uf: string}|null, error: object|null}>}
 */
export async function buscarEnderecoViaCep(cep) {
  const d = apenasDigitosCep(cep);
  if (d.length !== 8) return { data: null, error: null };
  try {
    const json = await jsonComPrazo(`https://viacep.com.br/ws/${d}/json/`);
    if (!json || json.erro) return { data: null, error: null };
    return {
      data: {
        bairro: json.bairro ?? "",
        logradouro: json.logradouro ?? "",
        cidade: json.localidade ?? "",
        uf: json.uf ?? "",
      },
      error: null,
    };
  } catch {
    return { data: null, error: null };
  }
}

// ── Nominatim / OpenStreetMap (grátis) — geocodificação p/ taxa por km ──

/**
 * Resolve latitude/longitude a partir de um endereço em texto, usando o
 * Nominatim (OpenStreetMap) — grátis, sem chave. Usado só no modo "por
 * distância": o navegador do cliente geocodifica o endereço digitado e
 * manda a coordenada pro servidor, que calcula a distância e a taxa.
 *
 * Degradação graciosa (mesma regra do ViaCEP): nunca lança. Falha de rede
 * ou endereço não encontrado vira { data: null } — a tela deixa o cliente
 * seguir/tentar de novo, nunca trava por causa de terceiro.
 *
 * @param {string} endereco - endereço livre (rua, número, bairro, cidade…)
 * @returns {Promise<{data: {lat:number, lng:number}|null, error: object|null}>}
 */
export async function geocodificarEndereco(endereco) {
  const q = String(endereco ?? "").trim();
  if (q.length < 4) return { data: null, error: null };
  try {
    const url =
      "https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&q=" +
      encodeURIComponent(q);
    const json = await jsonComPrazo(url, { headers: { Accept: "application/json" } });
    const primeiro = Array.isArray(json) ? json[0] : null;
    if (!primeiro) return { data: null, error: null };
    const lat = Number(primeiro.lat);
    const lng = Number(primeiro.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return { data: null, error: null };
    }
    return { data: { lat, lng }, error: null };
  } catch {
    return { data: null, error: null };
  }
}

/**
 * Autocomplete de endereço: a partir de um texto parcial, sugere até 5
 * opções (rótulo legível + coordenada) via Nominatim (OpenStreetMap) —
 * grátis, sem chave. O dono escolhe a origem do delivery sem precisar
 * digitar o endereço exato.
 *
 * Mesma degradação graciosa do geocodificarEndereco: nunca lança; rede,
 * abort ou vazio → { data: [] }. Aceita um AbortSignal para cancelar buscas
 * obsoletas enquanto o usuário continua digitando (debounce no chamador —
 * respeita o limite de 1 req/s do Nominatim).
 *
 * @param {string} texto - endereço parcial digitado
 * @param {{signal?: AbortSignal}} [opts]
 * @returns {Promise<{data: Array<{nome:string, lat:number, lng:number}>, error: object|null}>}
 */
export async function sugerirEnderecos(texto, { signal } = {}) {
  const q = String(texto ?? "").trim();
  if (q.length < 4) return { data: [], error: null };
  try {
    const url =
      "https://nominatim.openstreetmap.org/search?format=json&limit=5&countrycodes=br&q=" +
      encodeURIComponent(q);
    const json = await jsonComPrazo(url, { headers: { Accept: "application/json" }, signal });
    const lista = Array.isArray(json) ? json : [];
    const data = lista
      .map((it) => ({
        nome: String(it?.display_name ?? "").trim(),
        lat: Number(it?.lat),
        lng: Number(it?.lon),
      }))
      .filter((it) => it.nome && Number.isFinite(it.lat) && Number.isFinite(it.lng));
    return { data, error: null };
  } catch {
    return { data: [], error: null };
  }
}
