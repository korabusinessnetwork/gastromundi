// ──────────────────────────────────────────────────────────────────
// Delivery — camada de acesso do PAINEL DO DONO (admin autenticado)
//
// Diferente da vitrine pública (src/lib/delivery.js, que só fala com as
// 3 RPCs por slug): aqui o admin autenticado lê/escreve as tabelas do
// delivery DIRETO pelo client normal. A RLS RESTRICTIVE
// (tenant_id = tenant_atual_id()) da migration 20260804 garante o
// isolamento — cada tenant só enxerga o próprio delivery.
//
// produto_delivery é uma CAMADA sobre products (foto/descrição/ordem/
// disponibilidade no delivery), não um catálogo à parte. Por isso a
// "importação" (addon) é só criar a linha de produto_delivery para cada
// produto do PDV que ainda não está publicado no delivery — o produto
// em si continua vindo de products.
//
// tenant_id nos inserts: produto_delivery / grupos_complemento /
// complementos têm DEFAULT tenant_atual_id() (não precisa passar).
// config_delivery.tenant_id é a PK sem default → passar explícito.
//
// Funções puras (importação, faixas de taxa, sanitização) nascem com
// teste (deliveryAdmin.test.js) — dinheiro/regra do negócio.
// ──────────────────────────────────────────────────────────────────
import { supabase } from "@/lib/supabase";
import { normalizarTexto } from "@/lib/importacao/planilha";

// ════════════════════════════════════════════════════════════════
// FUNÇÕES PURAS (testadas) — nada de I/O aqui
// ════════════════════════════════════════════════════════════════

/**
 * Produtos do PDV que ainda NÃO estão publicados no delivery.
 * Usada na importação (addon): traz o cardápio inteiro pra dentro do
 * delivery de uma vez, sem duplicar o que já foi importado.
 *
 * @param {Array<{id:number|string, active?:boolean}>} products - cardápio do PDV
 * @param {Array<{produto_id:number|string}>} jaPublicados - linhas de produto_delivery
 * @returns {Array} subconjunto de `products` que falta importar
 */
export function produtosParaImportar(products, jaPublicados) {
  const lista = Array.isArray(products) ? products : [];
  const publicados = new Set(
    (Array.isArray(jaPublicados) ? jaPublicados : []).map((p) => String(p?.produto_id))
  );
  return lista.filter(
    (p) => p && p.active !== false && !publicados.has(String(p.id))
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
 * Normaliza uma faixa de taxa vinda da UI para o formato gravado no
 * jsonb faixas_taxa. Dois tipos:
 *   { tipo:'bairro', bairro, taxa }
 *   { tipo:'cep', cep_ini, cep_fim, taxa }
 * Sempre devolve um objeto (com taxa numérica ≥ 0); campos de texto
 * aparados. NÃO decide validade — para isso use validarFaixa.
 */
export function normalizarFaixaTaxa(faixa) {
  const tipo = faixa?.tipo === "cep" ? "cep" : "bairro";
  const taxa = Math.max(0, Number(faixa?.taxa) || 0);
  if (tipo === "cep") {
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
 * (Taxa 0 é válida — entrega grátis naquela faixa.)
 */
export function validarFaixa(faixa) {
  const f = normalizarFaixaTaxa(faixa);
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
  if (f.tipo === "cep") {
    return `CEP ${formatarCep(f.cep_ini)} a ${formatarCep(f.cep_fim)} — ${valor}`;
  }
  return `${f.bairro || "Bairro"} — ${valor}`;
}

/**
 * Sanitiza o objeto de configuração antes de gravar em config_delivery.
 * Garante tipos corretos, números não-negativos, faixas normalizadas e
 * só as válidas. Nunca confia direto no que veio da UI.
 */
export function sanitizarConfig(config) {
  const faixas = (Array.isArray(config?.faixas_taxa) ? config.faixas_taxa : [])
    .filter(validarFaixa)
    .map(normalizarFaixaTaxa);
  return {
    aberto: !!config?.aberto,
    pedido_minimo: Math.max(0, Number(config?.pedido_minimo) || 0),
    tempo_preparo_min: Math.max(0, Math.round(Number(config?.tempo_preparo_min) || 0)),
    horario: config?.horario && typeof config.horario === "object" ? config.horario : {},
    faixas_taxa: faixas,
  };
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

// ════════════════════════════════════════════════════════════════
// ACESSO A DADOS (I/O) — admin autenticado, tabelas diretas (RLS)
// ════════════════════════════════════════════════════════════════

// ── config_delivery ────────────────────────────────────────────────

/** Lê a config do delivery do tenant (ou null se ainda não existe). */
export async function carregarConfigDelivery() {
  const { data, error } = await supabase
    .from("config_delivery")
    .select("tenant_id, aberto, pedido_minimo, tempo_preparo_min, horario, faixas_taxa, updated_at")
    .maybeSingle();
  return { data, error };
}

/**
 * Grava (upsert) a config do delivery. tenant_id é a PK SEM default —
 * precisa vir explícito (do useApp().tenant.id).
 * @param {string} tenantId
 * @param {object} config - já passado por sanitizarConfig (ou será aqui)
 */
export async function salvarConfigDelivery(tenantId, config) {
  if (!tenantId) return { data: null, error: new Error("tenant ausente") };
  const payload = {
    tenant_id: tenantId,
    ...sanitizarConfig(config),
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase
    .from("config_delivery")
    .upsert(payload, { onConflict: "tenant_id" })
    .select()
    .single();
  return { data, error };
}

// ── produto_delivery (camada sobre products) ────────────────────────

/** Lista as linhas de produto_delivery do tenant. */
export async function listarProdutosDelivery() {
  const { data, error } = await supabase
    .from("produto_delivery")
    .select("id, produto_id, foto_url, descricao, disponivel, ordem, updated_at")
    .order("ordem", { ascending: true });
  return { data: data ?? [], error };
}

/**
 * Cria/atualiza a camada de delivery de um produto (foto/descrição/
 * disponibilidade/ordem). tenant_id vem do DEFAULT tenant_atual_id().
 * @param {object} row - { id?, produto_id, foto_url, descricao, disponivel, ordem }
 */
export async function salvarProdutoDelivery(row) {
  const payload = {
    produto_id: row.produto_id,
    foto_url: row.foto_url ?? null,
    descricao: row.descricao ?? null,
    disponivel: row.disponivel ?? true,
    ordem: Number(row.ordem) || 0,
    updated_at: new Date().toISOString(),
  };
  if (row.id) payload.id = row.id;
  const { data, error } = await supabase
    .from("produto_delivery")
    .upsert(payload, { onConflict: "tenant_id,produto_id" })
    .select()
    .single();
  return { data, error };
}

/** Remove um produto do delivery (não apaga o produto do PDV). */
export async function removerProdutoDelivery(id) {
  const { error } = await supabase.from("produto_delivery").delete().eq("id", id);
  return { error };
}

/**
 * Importa em lote (addon): publica no delivery todos os produtos do PDV
 * que ainda não estão lá. Só cria a camada produto_delivery — o produto
 * continua vindo de products. Idempotente: nada a importar → ok, 0.
 *
 * @param {Array} products - cardápio do PDV (do AppContext)
 * @param {Array} jaPublicados - linhas atuais de produto_delivery
 * @returns {{ data:{importados:number}, error:any }}
 */
export async function importarProdutosDelivery(products, jaPublicados) {
  const faltantes = produtosParaImportar(products, jaPublicados);
  if (faltantes.length === 0) return { data: { importados: 0 }, error: null };
  const linhas = faltantes.map((p, i) => ({
    produto_id: p.id,
    // Herda a descrição/foto que o produto já tenha; senão fica vazio
    // para o dono preencher depois. Ordem preserva a sequência atual.
    descricao: null,
    foto_url: null,
    disponivel: true,
    ordem: i,
  }));
  const { data, error } = await supabase
    .from("produto_delivery")
    .insert(linhas)
    .select("id");
  return { data: { importados: error ? 0 : (data?.length ?? 0) }, error };
}

// ── grupos_complemento + complementos ───────────────────────────────

/**
 * Biblioteca de grupos do tenant: TODOS os grupos (não mais de um produto
 * só), cada um com seus itens e a lista de produtos onde aparece
 * (produtoIds, via tabela de ligação produto_grupos). É a base da tela
 * "biblioteca de complementos reutilizáveis" (dono, 2026-07-20).
 */
export async function listarBibliotecaGrupos() {
  const { data: grupos, error: eGrupos } = await supabase
    .from("grupos_complemento")
    .select("id, produto_id, nome, min_escolhas, max_escolhas, ordem")
    .order("ordem", { ascending: true })
    .order("nome", { ascending: true });
  if (eGrupos) return { data: [], error: eGrupos };

  const ids = (grupos ?? []).map((g) => g.id);
  let complementos = [];
  let vinculos = [];
  if (ids.length > 0) {
    const [{ data: comps, error: eComps }, { data: links, error: eLinks }] =
      await Promise.all([
        supabase
          .from("complementos")
          .select("id, grupo_id, produto_id, nome, preco, disponivel, ordem")
          .in("grupo_id", ids)
          .order("ordem", { ascending: true }),
        supabase
          .from("produto_grupos")
          .select("grupo_id, produto_id, ordem")
          .in("grupo_id", ids),
      ]);
    if (eComps) return { data: [], error: eComps };
    if (eLinks) return { data: [], error: eLinks };
    complementos = comps ?? [];
    vinculos = links ?? [];
  }

  const porGrupo = (grupos ?? []).map((g) => ({
    ...g,
    itens: complementos.filter((c) => c.grupo_id === g.id),
    produtoIds: vinculos
      .filter((v) => v.grupo_id === g.id)
      .map((v) => v.produto_id),
  }));
  return { data: porGrupo, error: null };
}

/** Vincula um grupo a um produto (checklist "aparece nestes produtos"). */
export async function vincularGrupoProduto(grupoId, produtoId) {
  const { error } = await supabase
    .from("produto_grupos")
    .upsert(
      { grupo_id: grupoId, produto_id: produtoId },
      { onConflict: "produto_id,grupo_id", ignoreDuplicates: true }
    );
  return { error };
}

/** Desvincula um grupo de um produto. */
export async function desvincularGrupoProduto(grupoId, produtoId) {
  const { error } = await supabase
    .from("produto_grupos")
    .delete()
    .eq("grupo_id", grupoId)
    .eq("produto_id", produtoId);
  return { error };
}

/** Grupos de complemento de um produto, com seus itens. */
export async function listarGruposComplemento(produtoId) {
  const { data: grupos, error: eGrupos } = await supabase
    .from("grupos_complemento")
    .select("id, produto_id, nome, min_escolhas, max_escolhas, ordem")
    .eq("produto_id", produtoId)
    .order("ordem", { ascending: true });
  if (eGrupos) return { data: [], error: eGrupos };

  const ids = (grupos ?? []).map((g) => g.id);
  let complementos = [];
  if (ids.length > 0) {
    const { data: comps, error: eComps } = await supabase
      .from("complementos")
      .select("id, grupo_id, produto_id, nome, preco, disponivel, ordem")
      .in("grupo_id", ids)
      .order("ordem", { ascending: true });
    if (eComps) return { data: [], error: eComps };
    complementos = comps ?? [];
  }

  const porGrupo = (grupos ?? []).map((g) => ({
    ...g,
    itens: complementos.filter((c) => c.grupo_id === g.id),
  }));
  return { data: porGrupo, error: null };
}

/**
 * Cria/atualiza um grupo de complemento na biblioteca do tenant.
 * tenant_id via DEFAULT. O grupo NÃO pertence mais a um produto — o
 * vínculo é feito à parte (produto_grupos / vincularGrupoProduto).
 */
export async function salvarGrupoComplemento(grupo) {
  const payload = {
    nome: String(grupo.nome ?? "").trim(),
    min_escolhas: Math.max(0, Number(grupo.min_escolhas) || 0),
    max_escolhas: Math.max(1, Number(grupo.max_escolhas) || 1),
    ordem: Number(grupo.ordem) || 0,
  };
  if (grupo.id) payload.id = grupo.id;
  const { data, error } = await supabase
    .from("grupos_complemento")
    .upsert(payload)
    .select()
    .single();
  return { data, error };
}

/** Remove um grupo (cascata apaga os complementos dele). */
export async function removerGrupoComplemento(id) {
  const { error } = await supabase.from("grupos_complemento").delete().eq("id", id);
  return { error };
}

/** Cria/atualiza um complemento de um grupo. tenant_id via DEFAULT. */
export async function salvarComplemento(comp) {
  const payload = {
    grupo_id: comp.grupo_id,
    // Vínculo com o produto do catálogo (item já criado). NULL mantém a
    // compatibilidade com complementos antigos de texto livre.
    produto_id: comp.produto_id != null ? comp.produto_id : null,
    nome: String(comp.nome ?? "").trim(),
    preco: Math.max(0, Number(comp.preco) || 0),
    disponivel: comp.disponivel ?? true,
    ordem: Number(comp.ordem) || 0,
  };
  if (comp.id) payload.id = comp.id;
  const { data, error } = await supabase
    .from("complementos")
    .upsert(payload)
    .select()
    .single();
  return { data, error };
}

/** Remove um complemento. */
export async function removerComplemento(id) {
  const { error } = await supabase.from("complementos").delete().eq("id", id);
  return { error };
}
