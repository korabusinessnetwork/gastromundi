import { supabase } from "@/lib/supabase";
import { apenasDigitosCep, valorDigitado } from "./carrinho";

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
