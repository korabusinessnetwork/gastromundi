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
  const t = Number(trocoPara) || 0;
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
 * O produto pode ir pra sacola? Todos os grupos precisam estar satisfeitos.
 * @param {{grupos?: Array}} produto
 * @param {Record<string, string[]>} selecoesPorGrupo - grupoId → ids escolhidos
 */
export function produtoPodeAdicionar(produto, selecoesPorGrupo) {
  const grupos = produto?.grupos ?? [];
  return grupos.every((g) =>
    grupoSatisfeito(g, (selecoesPorGrupo?.[g.id] ?? []).length)
  );
}

// ── Payload do pedido (o que a RPC criar_pedido_delivery espera) ────

/**
 * Monta o payload jsonb do pedido. NÃO envia preço/total: o servidor
 * recalcula tudo. Envia só a intenção (o que o cliente escolheu).
 * @param {{cliente: object, entrega: object, pagamento: object, itens: Array}} dados
 */
export function montarPayloadPedido({ cliente, entrega, pagamento, itens }) {
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
      ...(Number.isFinite(Number(entrega?.lat)) && Number.isFinite(Number(entrega?.lng))
        ? { lat: Number(entrega.lat), lng: Number(entrega.lng) }
        : {}),
    },
    pagamento: {
      forma: pagamento?.forma ?? null,
      troco_para:
        pagamento?.forma === "dinheiro" && Number(pagamento?.trocoPara) > 0
          ? Number(pagamento.trocoPara)
          : null,
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
    const resp = await fetch(`https://viacep.com.br/ws/${d}/json/`);
    if (!resp.ok) return { data: null, error: null };
    const json = await resp.json();
    if (json?.erro) return { data: null, error: null };
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
    const resp = await fetch(url, { headers: { Accept: "application/json" } });
    if (!resp.ok) return { data: null, error: null };
    const json = await resp.json();
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
