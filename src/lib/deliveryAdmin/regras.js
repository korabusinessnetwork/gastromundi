import { normalizarTexto } from "@/lib/importacao/planilha";
import { ehCategoriaFixa } from "@/lib/categoriasProduto";
import { normalizarHorario } from "@/lib/deliveryHorario";

// Regras puras da administração do delivery: publicação, filtros, faixas de taxa, distância, subgrupos e formatação.
// ════════════════════════════════════════════════════════════════
// FUNÇÕES PURAS (testadas) — nada de I/O aqui
// ════════════════════════════════════════════════════════════════

/**
 * O produto do PDV pode ir para a vitrine pública do delivery?
 *
 * Nem tudo que vive em `products` é item de cardápio. Insumo e Produção
 * moram lá porque a ficha técnica precisa deles para baixar estoque —
 * mas farinha de trigo e presunto não se vendem por delivery. E produto
 * sem preço (R$ 0,00) é cadastro pela metade: publicado, o cliente pede
 * de graça.
 *
 * Mesma regra do servidor (`public.categoria_interna` + preço > 0 nas
 * RPCs `cardapio_publico` / `criar_pedido_delivery`, migration
 * 20260918). Aqui é só para não OFERECER a importação do que o servidor
 * não publicaria — quem manda continua sendo o banco.
 *
 * @param {{category?:string, price?:number|string}} p - produto do PDV
 * @returns {boolean}
 */
export function produtoPublicavelNoDelivery(p) {
  if (!p) return false;
  if (ehCategoriaFixa(p.category)) return false;
  return Number(p.price) > 0;
}

/**
 * Produtos do PDV que ainda NÃO estão publicados no delivery.
 * Usada na importação (addon): traz o cardápio inteiro pra dentro do
 * delivery de uma vez, sem duplicar o que já foi importado e sem
 * arrastar junto o que não é item de cardápio (ver
 * `produtoPublicavelNoDelivery`).
 *
 * @param {Array<{id:number|string, active?:boolean, category?:string, price?:number}>} products - cardápio do PDV
 * @param {Array<{produto_id:number|string}>} jaPublicados - linhas de produto_delivery
 * @returns {Array} subconjunto de `products` que falta importar
 */
export function produtosParaImportar(products, jaPublicados) {
  const lista = Array.isArray(products) ? products : [];
  const publicados = new Set(
    (Array.isArray(jaPublicados) ? jaPublicados : []).map((p) => String(p?.produto_id))
  );
  return lista.filter(
    (p) =>
      p &&
      p.active !== false &&
      produtoPublicavelNoDelivery(p) &&
      !publicados.has(String(p.id))
  );
}

/**
 * Filtra o catálogo do PDV para o menu de busca de complementos: só
 * produtos ativos, casando o termo pelo nome (sem acento/caixa), já
 * excluindo os que o grupo atual JÁ tem (evita adicionar o mesmo item
 * duas vezes — prevenção de erro > mensagem de erro). Termo vazio lista
 * todos (ativos, não excluídos). Ordenado por nome; teto de resultados
 * para a lista não estourar a tela.
 *
 * @param {Array<{id:number|string, name?:string, active?:boolean}>} products
 * @param {string} termo - texto digitado na busca
 * @param {Array<number|string>} [idsExcluir] - produto_id já no grupo
 * @param {number} [limite] - máximo de resultados (padrão 30)
 * @returns {Array} subconjunto de `products`
 */
export function filtrarProdutos(products, termo, idsExcluir = [], limite = 30) {
  const lista = Array.isArray(products) ? products : [];
  const excluir = new Set(
    (Array.isArray(idsExcluir) ? idsExcluir : []).map((id) => String(id))
  );
  const t = normalizarTexto(termo);
  return lista
    .filter((p) => p && p.active !== false && !excluir.has(String(p.id)))
    .filter((p) => (t === "" ? true : normalizarTexto(p.name).includes(t)))
    .sort((a, b) => normalizarTexto(a.name).localeCompare(normalizarTexto(b.name)))
    .slice(0, Math.max(0, Number(limite) || 30));
}

/**
 * Liga/desliga um produto na lista de vínculos de um grupo (checklist
 * "aparece nestes produtos"). Comparação por String para não tropeçar em
 * bigint vindo do banco vs. number/string vindo da UI. Não muta a lista
 * original — sempre devolve um array novo, ordem preservada.
 *
 * @param {Array<number|string>} ids - produto_ids já vinculados
 * @param {number|string} id - produto a alternar
 * @returns {Array<number|string>} nova lista de vínculos
 */
export function alternarProdutoId(ids, id) {
  const lista = Array.isArray(ids) ? ids : [];
  const alvo = String(id);
  if (lista.some((x) => String(x) === alvo)) {
    return lista.filter((x) => String(x) !== alvo);
  }
  return [...lista, id];
}

/**
 * Filtra os itens do cardápio do DELIVERY (não o catálogo do PDV) para a
 * busca "aparece nestes produtos": casa o termo pelo nome do produto (sem
 * acento/caixa), excluindo os que o grupo JÁ tem vinculados. Termo vazio
 * lista todos (não excluídos). Ordena por nome; teto de resultados.
 *
 * Diferente de filtrarProdutos porque a fonte aqui é o cardápio do
 * delivery — cada item tem shape { produto_id, produto: { name, ... } } —
 * e o que importa é o produto_id do vínculo, não o id do catálogo.
 *
 * @param {Array<{produto_id:number|string, produto?:{name?:string}}>} itens
 * @param {string} termo - texto digitado na busca
 * @param {Array<number|string>} [idsExcluir] - produto_id já vinculados
 * @param {number} [limite] - máximo de resultados (padrão 30)
 * @returns {Array} subconjunto de `itens`
 */
export function filtrarItensDelivery(itens, termo, idsExcluir = [], limite = 30) {
  const lista = Array.isArray(itens) ? itens : [];
  const excluir = new Set(
    (Array.isArray(idsExcluir) ? idsExcluir : []).map((id) => String(id))
  );
  const t = normalizarTexto(termo);
  return lista
    .filter((it) => it && !excluir.has(String(it.produto_id)))
    .filter((it) => (t === "" ? true : normalizarTexto(it.produto?.name).includes(t)))
    .sort((a, b) =>
      normalizarTexto(a.produto?.name).localeCompare(normalizarTexto(b.produto?.name))
    )
    .slice(0, Math.max(0, Number(limite) || 30));
}

/**
 * Normaliza uma faixa de taxa vinda da UI para o formato gravado no
 * jsonb faixas_taxa. Três tipos:
 *   { tipo:'bairro', bairro, taxa }
 *   { tipo:'cep', cep_ini, cep_fim, taxa }
 *   { tipo:'km', km_ate, taxa }   (anel: cobre até km_ate km do ponto)
 * Sempre devolve um objeto (com taxa numérica ≥ 0); campos de texto
 * aparados. NÃO decide validade — para isso use validarFaixa.
 */
export function normalizarFaixaTaxa(faixa) {
  const taxa = Math.max(0, Number(faixa?.taxa) || 0);
  if (faixa?.tipo === "km") {
    return {
      tipo: "km",
      km_ate: Math.max(0, Number(faixa?.km_ate) || 0),
      taxa,
    };
  }
  if (faixa?.tipo === "cep") {
    return {
      tipo: "cep",
      cep_ini: soDigitos(faixa?.cep_ini, 8),
      cep_fim: soDigitos(faixa?.cep_fim, 8),
      taxa,
    };
  }
  return {
    tipo: "bairro",
    bairro: String(faixa?.bairro ?? "").trim(),
    taxa,
  };
}

/**
 * Uma faixa está pronta para gravar?
 *   bairro: precisa de nome de bairro.
 *   cep: precisa dos 8 dígitos em cada ponta e cep_ini ≤ cep_fim.
 *   km: precisa de km_ate > 0 (o anel tem que ter raio).
 * (Taxa 0 é válida — entrega grátis naquela faixa.)
 */
export function validarFaixa(faixa) {
  const f = normalizarFaixaTaxa(faixa);
  if (f.tipo === "km") {
    return f.km_ate > 0;
  }
  if (f.tipo === "cep") {
    if (f.cep_ini.length !== 8 || f.cep_fim.length !== 8) return false;
    return f.cep_ini <= f.cep_fim;
  }
  return f.bairro.length > 0;
}

/** Rótulo humano de uma faixa, para listar no painel. */
export function faixaResumo(faixa) {
  const f = normalizarFaixaTaxa(faixa);
  const valor = f.taxa > 0 ? formatarReais(f.taxa) : "Grátis";
  if (f.tipo === "km") {
    return `Até ${formatarKm(f.km_ate)} km, ${valor}`;
  }
  if (f.tipo === "cep") {
    return `CEP ${formatarCep(f.cep_ini)} a ${formatarCep(f.cep_fim)}, ${valor}`;
  }
  return `${f.bairro || "Bairro"}, ${valor}`;
}

/**
 * Sanitiza o objeto de configuração antes de gravar em config_delivery.
 * Garante tipos corretos, números não-negativos, faixas normalizadas e
 * só as válidas. Faixas por km ficam ordenadas do menor anel para o maior
 * (para a seleção "menor anel que cobre" ficar previsível). Nunca confia
 * direto no que veio da UI.
 */
export function sanitizarConfig(config) {
  const faixas = (Array.isArray(config?.faixas_taxa) ? config.faixas_taxa : [])
    .filter(validarFaixa)
    .map(normalizarFaixaTaxa)
    .sort((a, b) =>
      a.tipo === "km" && b.tipo === "km" ? a.km_ate - b.km_ate : 0
    );
  return {
    aberto: !!config?.aberto,
    pedido_minimo: Math.max(0, Number(config?.pedido_minimo) || 0),
    tempo_preparo_min: Math.max(0, Math.round(Number(config?.tempo_preparo_min) || 0)),
    horario: normalizarHorario(config?.horario),
    faixas_taxa: faixas,
    origem_lat: coordOuNull(config?.origem_lat, -90, 90),
    origem_lng: coordOuNull(config?.origem_lng, -180, 180),
    endereco_origem:
      typeof config?.endereco_origem === "string"
        ? config.endereco_origem.trim() || null
        : null,
    // Cadeado da UI: trava a edição do endereço de origem depois de salvo.
    // Só afeta a escrita no painel — nada no cálculo da taxa.
    endereco_origem_bloqueado: !!config?.endereco_origem_bloqueado,
  };
}

// ── Distância / anéis por km (cálculo grátis, sem serviço pago) ─────

/**
 * Distância em km, em linha reta, entre dois pontos (lat/lng em graus),
 * pela fórmula de Haversine. É o mesmo cálculo que o servidor faz em SQL
 * (calcular_taxa_entrega) — o front usa só para PRÉ-VISUALIZAR no mapa; o
 * valor que vale é sempre o que a RPC devolve. Coordenada inválida → null.
 */
export function distanciaKm(lat1, lng1, lat2, lng2) {
  const a1 = Number(lat1), o1 = Number(lng1), a2 = Number(lat2), o2 = Number(lng2);
  if ([a1, o1, a2, o2].some((n) => !Number.isFinite(n))) return null;
  const R = 6371; // raio médio da Terra (km)
  const rad = (g) => (g * Math.PI) / 180;
  const dLat = rad(a2 - a1);
  const dLng = rad(o2 - o1);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a1)) * Math.cos(rad(a2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Escolhe o anel por km para uma distância: o MENOR anel (km_ate) que
 * ainda cobre a distância. Fora de todos os anéis → null (fora da área).
 * Ignora faixas que não são do tipo km. Espelha a regra do servidor.
 *
 * @param {Array} faixas - faixas_taxa (mistura tolerada; só km conta)
 * @param {number} dist - distância em km
 * @returns {{tipo:'km', km_ate:number, taxa:number}|null}
 */
export function selecionarFaixaKm(faixas, dist) {
  const d = Number(dist);
  if (!Number.isFinite(d)) return null;
  const aneis = (Array.isArray(faixas) ? faixas : [])
    .filter((f) => f?.tipo === "km")
    .map(normalizarFaixaTaxa)
    .filter((f) => f.km_ate > 0)
    .sort((a, b) => a.km_ate - b.km_ate);
  return aneis.find((f) => f.km_ate >= d) || null;
}

/** A config está no modo "por distância"? (tem ao menos um anel km). */
export function temFaixasKm(faixas) {
  return (Array.isArray(faixas) ? faixas : []).some((f) => f?.tipo === "km");
}

// ── Subgrupos aninhados (reciclagem estilo iFood) ───────────────────

/**
 * Aninhar `filhoId` sob `paiId` criaria um ciclo? Um ciclo trava a
 * recursão (grupo que contém a si mesmo, direta ou indiretamente). A regra
 * do banco (CHECK grupo_pai_id <> grupo_filho_id) barra só o auto-vínculo
 * direto; aqui barramos também o INDIRETO na UI, antes de gravar
 * (prevenção de erro > mensagem de erro, Princípio nº 1).
 *
 * Cria ciclo quando pai === filho OU quando o PAI já é alcançável a partir
 * do FILHO (o filho já tem o pai na sua própria subárvore) — anexar o filho
 * fecharia o laço.
 *
 * @param {Array<{id:string, subgrupoIds?:string[]}>} grupos - biblioteca
 * @param {string} paiId - grupo que receberá o subgrupo
 * @param {string} filhoId - grupo a anexar como subgrupo
 * @returns {boolean}
 */
export function subgrupoCriaCiclo(grupos, paiId, filhoId) {
  if (paiId == null || filhoId == null) return false;
  if (String(paiId) === String(filhoId)) return true;
  const porId = new Map(
    (Array.isArray(grupos) ? grupos : []).map((g) => [String(g?.id), g])
  );
  // BFS a partir do filho: se alcançarmos o pai, anexar fecharia o ciclo.
  const alvo = String(paiId);
  const vistos = new Set();
  const fila = [String(filhoId)];
  while (fila.length > 0) {
    const atual = fila.shift();
    if (atual === alvo) return true;
    if (vistos.has(atual)) continue;
    vistos.add(atual);
    const g = porId.get(atual);
    for (const sub of g?.subgrupoIds ?? []) fila.push(String(sub));
  }
  return false;
}

// ── auxiliares puras internas ──────────────────────────────────────

function soDigitos(bruto, max) {
  const d = String(bruto ?? "").replace(/\D/g, "");
  return max ? d.slice(0, max) : d;
}

/** "90000000" → "90000-000" (parcial enquanto digita). */
export function formatarCep(bruto) {
  const d = soDigitos(bruto, 8);
  if (d.length <= 5) return d;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

/** Número → "R$ 5,00" (pt-BR). */
export function formatarReais(valor) {
  const n = Number(valor) || 0;
  return `R$ ${n.toFixed(2).replace(".", ",")}`;
}

/** Km sem casas inúteis: 3 → "3", 2.5 → "2,5". */
export function formatarKm(valor) {
  const n = Math.max(0, Number(valor) || 0);
  return (Number.isInteger(n) ? String(n) : n.toFixed(1)).replace(".", ",");
}

/** Coordenada válida dentro do intervalo, ou null (não confia na UI). */
function coordOuNull(bruto, min, max) {
  const n = Number(bruto);
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return n;
}
