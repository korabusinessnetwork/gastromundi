import { supabase } from "@/lib/supabase";

/**
 * Busca o local de impressão para uma categoria específica.
 * Retorna o objeto { id, nome } do local ou null se não houver roteamento
 * ou se o local estiver inativo / configurado como "Não imprimir".
 */
export async function getLocalImpressao(categoria) {
  try {
    const { data, error } = await supabase
      .from("categorias_roteamento")
      .select("local_impressao_id, locais_impressao(id, nome, ativo)")
      .eq("categoria", categoria)
      .maybeSingle();
    if (error || !data?.locais_impressao) return null;
    const local = data.locais_impressao;
    if (!local.ativo) return null;
    return { id: local.id, nome: local.nome };
  } catch {
    return null;
  }
}

/**
 * Versão síncrona para uso com mapa pré-carregado (evita múltiplas queries).
 * roteamentoMap: { [categoria]: { id, nome } | null }
 */
export function getLocalImpressaoSync(categoria, roteamentoMap = {}) {
  return roteamentoMap[categoria] ?? null;
}

/**
 * Monta o mapa de roteamento completo de uma vez só.
 * Útil para carregar antes de imprimir múltiplos itens.
 * Retorna { [categoria]: { id, nome } | null }
 */
export async function buildRoteamentoMap() {
  try {
    const { data, error } = await supabase
      .from("categorias_roteamento")
      .select("categoria, local_impressao_id, locais_impressao(id, nome, ativo)");
    if (error || !data) return {};
    return Object.fromEntries(
      data.map(r => [
        r.categoria,
        r.locais_impressao?.ativo ? { id: r.locais_impressao.id, nome: r.locais_impressao.nome } : null,
      ])
    );
  } catch {
    return {};
  }
}
