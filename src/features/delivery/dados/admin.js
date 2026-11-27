import { supabase } from "@/lib/supabase";
import { produtosParaImportar, sanitizarConfig } from "../regras/admin";

// Acesso a dados da administração do delivery: configuração, produtos publicados, grupos e complementos.
// ════════════════════════════════════════════════════════════════
// ACESSO A DADOS (I/O) — admin autenticado, tabelas diretas (RLS)
// ════════════════════════════════════════════════════════════════

// ── config_delivery ────────────────────────────────────────────────

/** Lê a config do delivery do tenant (ou null se ainda não existe). */
export async function carregarConfigDelivery() {
  const { data, error } = await supabase
    .from("config_delivery")
    .select("tenant_id, aberto, pedido_minimo, tempo_preparo_min, horario, faixas_taxa, origem_lat, origem_lng, endereco_origem, endereco_origem_bloqueado, permite_retirada, whatsapp_no_aceite, aceite_automatico, espelhar_desabilitado, sincronizar_automatico, updated_at")
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
export async function importarProdutosDelivery(products, jaPublicados, idsEscolhidos = null) {
  let faltantes = produtosParaImportar(products, jaPublicados);
  // `idsEscolhidos` null = importa tudo o que falta (o comportamento antigo,
  // que continua valendo para quem chama sem escolher). Com uma lista, só
  // ela entra — e o filtro é aplicado DEPOIS de produtosParaImportar, então
  // um id já publicado ou não publicável não volta pela porta dos fundos
  // mesmo que a tela mande.
  if (Array.isArray(idsEscolhidos)) {
    const querem = new Set(idsEscolhidos.map((id) => String(id)));
    faltantes = faltantes.filter((p) => querem.has(String(p.id)));
  }
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
  let aninhamentos = [];
  if (ids.length > 0) {
    const [
      { data: comps, error: eComps },
      { data: links, error: eLinks },
      { data: subs, error: eSubs },
    ] = await Promise.all([
      supabase
        .from("complementos")
        .select("id, grupo_id, produto_id, nome, preco, disponivel, ordem")
        .in("grupo_id", ids)
        .order("ordem", { ascending: true }),
      supabase
        .from("produto_grupos")
        .select("grupo_id, produto_id, ordem")
        .in("grupo_id", ids),
      supabase
        .from("grupo_subgrupos")
        .select("grupo_pai_id, grupo_filho_id, ordem")
        .in("grupo_pai_id", ids)
        .order("ordem", { ascending: true }),
    ]);
    if (eComps) return { data: [], error: eComps };
    if (eLinks) return { data: [], error: eLinks };
    if (eSubs) return { data: [], error: eSubs };
    complementos = comps ?? [];
    vinculos = links ?? [];
    aninhamentos = subs ?? [];
  }

  const porGrupo = (grupos ?? []).map((g) => ({
    ...g,
    itens: complementos.filter((c) => c.grupo_id === g.id),
    produtoIds: vinculos
      .filter((v) => v.grupo_id === g.id)
      .map((v) => v.produto_id),
    // Ids dos subgrupos filhos, já em ordem (para render/reordenação).
    subgrupoIds: aninhamentos
      .filter((s) => s.grupo_pai_id === g.id)
      .map((s) => s.grupo_filho_id),
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

// ── grupo_subgrupos (aninhamento reciclável estilo iFood) ───────────

/**
 * Aninha um grupo existente (filho) sob outro (pai). Idempotente
 * (onConflict ignora duplicado). O CHECK do banco barra auto-vínculo
 * direto; a UI já barra ciclos indiretos via subgrupoCriaCiclo antes.
 * @param {string} paiId
 * @param {string} filhoId
 * @param {number} [ordem]
 */
export async function vincularSubgrupo(paiId, filhoId, ordem = 0) {
  const { error } = await supabase
    .from("grupo_subgrupos")
    .upsert(
      { grupo_pai_id: paiId, grupo_filho_id: filhoId, ordem: Number(ordem) || 0 },
      { onConflict: "grupo_pai_id,grupo_filho_id", ignoreDuplicates: true }
    );
  return { error };
}

/** Desfaz o aninhamento (não apaga o grupo filho — ele continua na biblioteca). */
export async function desvincularSubgrupo(paiId, filhoId) {
  const { error } = await supabase
    .from("grupo_subgrupos")
    .delete()
    .eq("grupo_pai_id", paiId)
    .eq("grupo_filho_id", filhoId);
  return { error };
}

/**
 * Persiste a ORDEM dos subgrupos de um pai (após arrastar pra cima/baixo).
 * Recebe os ids filhos já na ordem desejada e grava ordem = índice.
 * @param {string} paiId
 * @param {string[]} filhoIdsEmOrdem
 */
export async function reordenarSubgrupos(paiId, filhoIdsEmOrdem) {
  const lista = Array.isArray(filhoIdsEmOrdem) ? filhoIdsEmOrdem : [];
  for (let i = 0; i < lista.length; i++) {
    const { error } = await supabase
      .from("grupo_subgrupos")
      .update({ ordem: i })
      .eq("grupo_pai_id", paiId)
      .eq("grupo_filho_id", lista[i]);
    if (error) return { error };
  }
  return { error: null };
}

/**
 * Persiste a ORDEM dos itens (complementos) de um grupo após reordenar
 * arrastando. Recebe os ids na ordem desejada; grava ordem = índice.
 * @param {string[]} complementoIdsEmOrdem
 */
export async function reordenarComplementos(complementoIdsEmOrdem) {
  const lista = Array.isArray(complementoIdsEmOrdem) ? complementoIdsEmOrdem : [];
  for (let i = 0; i < lista.length; i++) {
    const { error } = await supabase
      .from("complementos")
      .update({ ordem: i })
      .eq("id", lista[i]);
    if (error) return { error };
  }
  return { error: null };
}

/**
 * Persiste a ORDEM dos grupos da biblioteca após reordenar arrastando.
 * Recebe os ids na ordem desejada; grava ordem = índice.
 * @param {string[]} grupoIdsEmOrdem
 */
export async function reordenarGrupos(grupoIdsEmOrdem) {
  const lista = Array.isArray(grupoIdsEmOrdem) ? grupoIdsEmOrdem : [];
  for (let i = 0; i < lista.length; i++) {
    const { error } = await supabase
      .from("grupos_complemento")
      .update({ ordem: i })
      .eq("id", lista[i]);
    if (error) return { error };
  }
  return { error: null };
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
    // 0 = SEM LIMITE (o cliente escolhe quantas quiser). O piso era 1, e
    // por isso a vitrine sabia ler "sem limite" — grupoSatisfeito só cobra
    // teto com `max > 0` — mas não havia como cadastrar um.
    max_escolhas: Math.max(0, Number(grupo.max_escolhas) || 0),
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
