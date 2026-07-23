import { supabase } from "../supabase";
import { buscarConfigImpressao, montarViaProducao } from "../impressao";
import { imprimirDocumento } from "./drivers";
import { rotearPedidoPorLocal } from "./roteador";
import { resolverPerfilDoLocal } from "./resolverPerfil";

/**
 * Orquestra a impressão da via de produção COM roteamento por local —
 * Fase 1 do plano de impressão de comandas. É o único ponto que os
 * fluxos de UI (Cozinha, Ponte/Palm) chamam; toda a lógica de rota +
 * perfil por local fica aqui e nas peças puras (roteador/resolverPerfil).
 *
 * Fluxo:
 *   1. carrega config de impressão + roteamento (categorias_roteamento)
 *      + locais ativos (locais_impressao);
 *   2. roteia o pedido em N vias (uma por local de destino);
 *   3. imprime cada via no perfil (impressora) vinculado ao seu local.
 *
 * Fallback de segurança (sem regressão): se NENHUMA rota resolver —
 * roteamento não configurado, banco indisponível, ou nenhuma categoria
 * do pedido mapeada — cai no comportamento de hoje: 1 via única no
 * perfil global. Nunca deixa a comanda sem sair.
 */

// roteamento: { [categoria]: local_impressao_id } · locais: [{ id, nome }] ativos
async function buscarRoteamento() {
  try {
    const [rot, loc] = await Promise.all([
      supabase.from("categorias_roteamento").select("categoria, local_impressao_id"),
      supabase.from("locais_impressao").select("id, nome").eq("ativo", true),
    ]);
    const roteamento = {};
    for (const r of rot?.data ?? []) {
      if (r?.categoria != null && r?.local_impressao_id) roteamento[r.categoria] = r.local_impressao_id;
    }
    return { roteamento, locais: loc?.data ?? [] };
  } catch {
    // Sem roteamento → o fallback do chamador imprime a via única global.
    return { roteamento: {}, locais: [] };
  }
}

/**
 * @param {object} pedido - shape do `pending` (com `items[].category`)
 * @returns {Promise<{ error: {message: string}|null }>}
 */
export async function imprimirViaProducaoRoteada(pedido) {
  const { data: configImpressao } = await buscarConfigImpressao();
  const { roteamento, locais } = await buscarRoteamento();
  const rotas = rotearPedidoPorLocal(pedido, { roteamento, locais });

  // Fallback: nada roteado → comportamento de hoje (1 via no perfil global).
  if (rotas.length === 0) {
    const dados = montarViaProducao({ pedido });
    return imprimirDocumento(dados, configImpressao?.perfilImpressora);
  }

  const erros = [];
  for (const rota of rotas) {
    const perfil = resolverPerfilDoLocal(rota.local_impressao_id, configImpressao);
    const { error } = await imprimirDocumento(rota.documento, perfil);
    if (error) erros.push(`${rota.local_nome ?? "Local"}: ${error.message ?? "falha na impressão"}`);
  }
  if (erros.length > 0) return { error: { message: erros.join(" · ") } };
  return { error: null };
}
