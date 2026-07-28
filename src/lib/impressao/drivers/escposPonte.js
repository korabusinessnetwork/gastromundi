import { colunasPorLargura } from "../largura";
import { formatarComprovanteEscpos, formatarViaProducaoEscpos } from "../escposFormatador";
import { enviarImpressaoPonte } from "../../ponte";

/**
 * Driver "escpos-ponte" — impressora térmica via Ponte KORA (Tarefa I).
 * Substitui o antigo driver de QZ Tray: em vez de um app pago de
 * terceiro, quem fala com a impressora é a Ponte (Node puro, já
 * instalada no PC do caixa pro Palm).
 *
 * Divisão de responsabilidade: aqui o documento vira TEXTO em colunas
 * (o mesmo formatador do driver anterior — o papel impresso não muda);
 * a Ponte é quem monta os bytes ESC/POS, mantém a fila em disco e
 * reimprime sozinha se a impressora estiver ocupada/desligada. Por
 * isso este driver só precisa "entregar e sair": ele nunca espera a
 * folha sair pra liberar o caixa.
 *
 * O destino vem do perfil (`perfil.impressora`) e é repassado cru pra
 * Ponte — `{ tipo: "windows", nome }` ou `{ tipo: "rede", host, porta }`.
 */

// Tamanho de fonte default de cada template — define quantas colunas
// cabem no papel. Mantido igual ao driver anterior pra que o cupom
// impresso continue idêntico ao que o estabelecimento já conhece.
const FONTE_PADRAO_POR_TIPO = { via_producao: 15, comprovante: 13, cupom_pre_nota: 13 };

const AVISO_SEM_IMPRESSORA = "Escolha a impressora em Configurações → Impressão.";

function linhasDocumento(documento, colunas) {
  return documento?.tipo === "via_producao"
    ? formatarViaProducaoEscpos(documento, colunas)
    : formatarComprovanteEscpos(documento, colunas);
}

// Destino incompleto (tipo windows sem nome, rede sem host) é tão
// inútil quanto destino nenhum — melhor barrar aqui, com a mesma
// instrução do que fazer, do que mandar pra fila um trabalho que a
// Ponte só vai conseguir marcar como falhado.
function destinoValido(impressora) {
  if (!impressora || typeof impressora !== "object") return false;
  if (impressora.tipo === "windows") return Boolean(impressora.nome);
  if (impressora.tipo === "rede") return Boolean(impressora.host);
  return false;
}

/**
 * @param {object} documento - retorno de montarComprovantePagamento/montarCupomPreNota/montarViaProducao
 * @param {object} perfil - perfilImpressora (precisa de driver="escpos-ponte" + impressora)
 * @returns {Promise<{error: {message: string}|null}>}
 */
export async function imprimir(documento, perfil) {
  try {
    if (!destinoValido(perfil?.impressora)) {
      return { error: { message: AVISO_SEM_IMPRESSORA } };
    }

    const larguraMm = Number(perfil?.larguraMm) || 80;
    const fontePx = Number(perfil?.fonteBase) || FONTE_PADRAO_POR_TIPO[documento?.tipo] || 13;
    const colunas = colunasPorLargura(larguraMm, fontePx);

    const { error } = await enviarImpressaoPonte({
      destino: perfil.impressora,
      linhas: linhasDocumento(documento, colunas),
      cortaPapel: perfil?.cortaPapel !== false,
      copias: Number(perfil?.copias) > 0 ? Number(perfil.copias) : 1,
    });
    if (error) return { error: { message: error.message ?? "Falha ao enviar a impressão para a Ponte KORA." } };
    return { error: null };
  } catch (err) {
    return { error: { message: err?.message ?? "Falha ao imprimir na impressora térmica." } };
  }
}
