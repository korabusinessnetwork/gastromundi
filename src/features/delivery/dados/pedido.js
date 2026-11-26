import { supabase } from "@/lib/supabase";
import { apenasDigitosCep, valorDigitado, dataNascimentoUtil } from "../regras/carrinho";
import { ehUuid } from "../regras/deliveryDispositivo";
import { apenasDigitosTelefone } from "@/lib/telefone";

// Pedido de delivery: montagem do payload, leitura do cardápio, taxa de entrega e envio.
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

// ── Rua e número (campos separados na tela, uma linha no pedido) ────

/**
 * Junta rua e número na linha única que o servidor, o mapa e a etiqueta
 * do entregador sempre usaram: "Rua das Flores, 100".
 *
 * A tela pergunta em dois campos (é onde o erro acontece: o número ia
 * grudado na rua e sumia junto quando a pessoa corrigia a grafia), mas o
 * pedido continua guardando uma linha só — mudar o formato gravado
 * quebraria o histórico e a geocodificação.
 *
 * Sem número não inventa nada: quem mora em endereço sem número manda a
 * rua sozinha, e o complemento diz o resto.
 *
 * @param {string} rua
 * @param {string} numero
 * @returns {string} a linha pronta, ou "" quando não há rua
 */
export function juntarRuaNumero(rua, numero) {
  const r = String(rua ?? "").trim().replace(/\s+/g, " ");
  const n = String(numero ?? "").trim().replace(/\s+/g, " ");
  if (!r) return "";
  return n ? `${r}, ${n}` : r;
}

/**
 * Desmonta a linha única em rua e número, para reabrir o formulário com
 * o endereço que o aparelho lembrava de antes desta tela existir.
 *
 * Só separa o que é reconhecidamente número de porta no FIM da linha
 * ("100", "100A", "s/n"). Na dúvida devolve tudo em `rua`: chutar errado
 * aqui apaga parte do endereço na frente do cliente, e um número que
 * ficou na rua ainda entrega — uma rua truncada, não.
 *
 * @param {string} endereco
 * @returns {{rua: string, numero: string}}
 */
export function separarRuaNumero(endereco) {
  const bruto = String(endereco ?? "").trim().replace(/\s+/g, " ");
  if (!bruto) return { rua: "", numero: "" };
  // Vírgula é a marca explícita de "aqui começa o número" — e só vale
  // quando o que vem depois PARECE número de porta.
  const comVirgula = bruto.match(/^(.*?),\s*(\d+[A-Za-z]?|s\/?n\.?)$/i);
  if (comVirgula) return { rua: comVirgula[1].trim(), numero: comVirgula[2].trim() };
  // Sem vírgula, só um número solto no fim. "Rua 25 de Março" não cai
  // aqui porque o número não está no fim.
  const semVirgula = bruto.match(/^(.*\S)\s+(\d+[A-Za-z]?)$/);
  if (semVirgula) return { rua: semVirgula[1].trim(), numero: semVirgula[2].trim() };
  return { rua: bruto, numero: "" };
}

/**
 * Monta o payload jsonb do pedido. NÃO envia preço/total: o servidor
 * recalcula tudo. Envia só a intenção (o que o cliente escolheu).
 * @param {{cliente: object, entrega: object, pagamento: object, itens: Array}} dados
 */
/**
 * As opções escolhidas do jeito que a RPC espera.
 *
 * O formato de sempre é uma lista de ids, uma entrada por opção. Ele não
 * sabe dizer "duas de calabresa": o servidor junta ids repetidos, e a
 * segunda fatia sumiria sem ninguém notar.
 *
 * Quando o cliente pede a MESMA opção mais de uma vez, a lista passa a
 * levar `{ id, qtd }`. Quando não pede (que é o pedido de todo dia), sai
 * exatamente a lista de ids de antes — de propósito: o navegador guarda o
 * app em cache, então uma tela nova pode chegar a um banco onde a
 * migração ainda não rodou, e nesse encontro só o que é novo falha, em
 * vez de derrubar todo pedido que tenha um complemento.
 *
 * @param {Array<{id: (string|number), qtd?: number}>|null|undefined} escolhidos
 * @returns {Array<string|number|{id: (string|number), qtd: number}>}
 */
export function complementosDoPayload(escolhidos) {
  const lista = escolhidos ?? [];
  const qtdDe = (c) => Math.max(1, Number(c?.qtd) || 1);
  if (!lista.some((c) => qtdDe(c) > 1)) return lista.map((c) => c.id);
  return lista.map((c) => ({ id: c.id, qtd: qtdDe(c) }));
}

export function montarPayloadPedido({ cliente, entrega, pagamento, itens, dispositivo }) {
  const lat = coordenada(entrega?.lat);
  const lng = coordenada(entrega?.lng);
  const trocoPara = valorDigitado(pagamento?.trocoPara);
  const retirada = entrega?.tipo === "retirada";
  return {
    // Identidade anônima do aparelho — é ela que deixa a pessoa acompanhar
    // o pedido e ver o histórico sem criar conta. Ausente (armazenamento
    // bloqueado), o pedido segue normal e só não entra no histórico.
    ...(ehUuid(dispositivo) ? { dispositivo_id: dispositivo } : {}),
    cliente: {
      nome: (cliente?.nome ?? "").trim(),
      // Só os dígitos, como o cadastro de clientes já guarda (clientes.js):
      // o painel formata na hora de mostrar, e o link de WhatsApp precisa do
      // número limpo. Gravar "(11) 91234-5678" faria a mesma pessoa virar
      // dois contatos diferentes conforme quem digitou a máscara.
      telefone: apenasDigitosTelefone(cliente?.telefone) || null,
      // Opcional, e só vai quando dá para aproveitar (ver
      // dataNascimentoUtil). O servidor cria o cadastro do cliente no
      // primeiro pedido daquele telefone e guarda a data ali — a mesma
      // pessoa pedindo de novo não é perguntada outra vez.
      data_nascimento: dataNascimentoUtil(cliente?.dataNascimento),
    },
    entrega: retirada
      ? // Retirada: o cliente vai buscar. Mandar CEP, endereço e coordenada
        // dele seria mandar dado de endereço que ninguém vai usar — e o
        // servidor guardaria isso no pedido sem necessidade nenhuma.
        { tipo: "retirada" }
      : {
          tipo: "entrega",
          // CEP é opcional: a faixa por bairro — que é a que a maioria dos
          // estabelecimentos cadastra — nunca precisou dele. Quem não sabe
          // o próprio CEP informa cidade e bairro e pede do mesmo jeito.
          cep: apenasDigitosCep(entrega?.cep),
          cidade: (entrega?.cidade ?? "").trim(),
          bairro: (entrega?.bairro ?? "").trim(),
          // A tela pergunta rua e número em campos separados; o pedido
          // guarda a linha única de sempre. Quem ainda mandar `endereco`
          // pronto (aparelho que lembrou de antes) continua valendo.
          endereco: entrega?.rua
            ? juntarRuaNumero(entrega.rua, entrega.numero)
            : (entrega?.endereco ?? "").trim(),
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
      complementos: complementosDoPayload(item?.complementosEscolhidos),
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

/**
 * Os pedidos DESTE aparelho no estabelecimento — o acompanhamento sem
 * conta. `dispositivo` é o UUID de `deliveryDispositivo.js`; o servidor
 * filtra por tenant + aparelho e devolve no máximo os 20 últimos.
 *
 * Nunca lança e nunca deixa a vitrine em erro por causa disto: histórico
 * é conveniência, e uma falha aqui não pode atrapalhar quem só quer pedir.
 *
 * @param {string} slug
 * @param {string} dispositivo - UUID do aparelho
 * @returns {Promise<{data: Array, error: object|null}>}
 */
export async function meusPedidos(slug, dispositivo) {
  if (!slug || !dispositivo) return { data: [], error: null };
  try {
    const { data, error } = await supabase.rpc("meus_pedidos_delivery", {
      p_slug: slug,
      p_dispositivo: dispositivo,
    });
    if (error) return { data: [], error };
    return { data: Array.isArray(data) ? data : [], error: null };
  } catch (err) {
    return {
      data: [],
      error: { message: err?.message ?? "Falha ao carregar seus pedidos." },
    };
  }
}
