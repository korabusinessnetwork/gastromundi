import { buscarConfigImpressao, montarViaProducao } from "../impressao";
import { imprimirDocumento } from "./drivers";

/**
 * Ponto único que os fluxos de UI (Cozinha, Ponte/Palm) chamam pra
 * mandar a via de produção pra cozinha.
 *
 * Deliberadamente fino: uma via, um perfil, uma impressora. O
 * roteamento por categoria (locais de impressão, estações, fila no
 * banco) foi removido — quem tem duas impressoras hoje resolve com
 * dois PCs, e quem tem uma não paga o custo de configurar um
 * roteamento que nunca usa. Cada máquina imprime no perfil do próprio
 * estabelecimento (`config_impressao.perfilImpressora`).
 *
 * Nunca lança: `buscarConfigImpressao` já cai no cache local/defaults
 * quando o banco está fora, então uma queda de internet não impede a
 * comanda de sair na cozinha.
 */

/**
 * @param {object} order - shape do pedido/`pending` (comanda, mesa, garçom, items[])
 * @returns {Promise<{ error: {message: string}|null }>}
 */
export async function enviarViaProducao(order) {
  const { data: configImpressao } = await buscarConfigImpressao();
  const documento = montarViaProducao({ pedido: order });
  return imprimirDocumento(documento, configImpressao?.perfilImpressora);
}
