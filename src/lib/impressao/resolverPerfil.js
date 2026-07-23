/**
 * Resolve o PERFIL de impressora (driver + impressora física) para um
 * local de impressão.
 *
 * PONTO ÚNICO que sabe DE ONDE vem o vínculo local→impressora. Na Fase 2
 * o vínculo é POR ESTAÇÃO e vive no banco (`estacoes.impressoras`). Para
 * o caminho de impressão continuar SÍNCRONO e funcionar OFFLINE, lemos um
 * CACHE local dos vínculos da estação atual — gravado por
 * `src/lib/estacao.js` (chave `gastromundi:estacao_bindings.v1`, shape
 * `{ estacaoId, impressoras: { [localId]: { nome } } }`). A fonte de
 * verdade é o banco; o cache é só a cópia de leitura desta máquina.
 *
 * Fallback: se não há cache de estação (ex.: máquina recém-configurada
 * ainda sem sincronizar), tenta o mapa legado da Fase 1
 * (`gastromundi:impressoras_config_v2`, vínculo por máquina) para não
 * regredir instalações que já tinham impressoras configuradas. Sem
 * nenhum vínculo → cai no perfil global (normalmente browser-raster).
 *
 * Roteador/despacho/telas NÃO mudam — só o corpo desta função.
 */

// Escritas por src/lib/estacao.js (CHAVE_BINDINGS_CACHE) e, no legado,
// por ImpressorasConfig da Fase 1. Mantidas como string aqui de propósito:
// resolverPerfil fica puro/síncrono, sem importar o repo (que puxa o supabase).
const CHAVE_BINDINGS_CACHE = "gastromundi:estacao_bindings.v1";
const LS_KEY_LEGADO = "gastromundi:impressoras_config_v2";

function lerJson(chave) {
  try {
    const bruto = typeof localStorage !== "undefined" ? localStorage.getItem(chave) : null;
    const valor = bruto ? JSON.parse(bruto) : null;
    return valor && typeof valor === "object" ? valor : null;
  } catch {
    return null;
  }
}

/**
 * Mapa efetivo { [localId]: { nome } } desta máquina: os vínculos da
 * estação atual (cache do banco) ou, se não houver, o mapa legado.
 */
function lerVinculoImpressoras() {
  const cacheEstacao = lerJson(CHAVE_BINDINGS_CACHE);
  const impressoras = cacheEstacao?.impressoras;
  if (impressoras && typeof impressoras === "object") return impressoras;
  return lerJson(LS_KEY_LEGADO) ?? {};
}

/**
 * @param {string} localId - id do local de impressão (`locais_impressao.id`)
 * @param {object} [configImpressao] - retorno de buscarConfigImpressao (tem perfilImpressora)
 * @returns {object|undefined} perfil de impressora pronto pra `imprimirDocumento`
 */
export function resolverPerfilDoLocal(localId, configImpressao) {
  const perfilGlobal = configImpressao?.perfilImpressora;
  const vinculo = lerVinculoImpressoras()[localId];
  if (vinculo?.nome) {
    return {
      ...(perfilGlobal ?? {}),
      driver: "escpos-qztray",
      impressoraQz: vinculo.nome,
    };
  }
  return perfilGlobal;
}
