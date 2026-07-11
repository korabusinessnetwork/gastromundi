import { colunasPorLargura } from "../largura";
import { formatarComprovanteEscpos, formatarViaProducaoEscpos } from "../escposFormatador";

/**
 * Driver "escpos-qztray" — F020 (decisão 025). SUBSTITUÍVEL, não é
 * dependência cravada: só entra em jogo se o perfil de impressora
 * escolher explicitamente `driver: "escpos-qztray"` e apontar uma
 * impressora (`impressoraQz`, nome retornado por
 * `src/lib/qztray.js#listarImpressoras`). Exige o app QZ Tray rodando
 * na máquina (já integrado, `ImpressorasConfig.jsx`) — certificado de
 * assinatura pago do QZ Tray (impressão silenciosa sem aviso em
 * produção) fica como opção adiável, não é pré-requisito pra usar
 * este driver (ele funciona com o aviso de segurança do QZ Tray).
 *
 * LIMITAÇÃO CONHECIDA: corte de papel/densidade real só se valida numa
 * térmica física — aqui só decide SE manda avanço de linha extra
 * (`cortaPapel`), não manda comandos ESC/POS de corte de guilhotina
 * (varia por modelo; fica para quando houver hardware pra testar).
 */

const FONTE_PADRAO_POR_TIPO = { via_producao: 15, comprovante: 13, cupom_pre_nota: 13 };

function linhasDocumento(documento, colunas) {
  return documento?.tipo === "via_producao"
    ? formatarViaProducaoEscpos(documento, colunas)
    : formatarComprovanteEscpos(documento, colunas);
}

/**
 * @param {object} documento - retorno de montarComprovantePagamento/montarCupomPreNota/montarViaProducao
 * @param {object} perfil - perfilImpressora (precisa de driver="escpos-qztray" + impressoraQz)
 * @returns {Promise<{error: object|null}>}
 */
export async function imprimir(documento, perfil) {
  try {
    const nomeImpressora = perfil?.impressoraQz;
    if (!nomeImpressora) {
      return { error: { message: "Nenhuma impressora QZ Tray selecionada no perfil de impressão." } };
    }

    const larguraMm = Number(perfil?.larguraMm) || 80;
    const fontePx = Number(perfil?.fonteBase) || FONTE_PADRAO_POR_TIPO[documento?.tipo] || 13;
    const colunas = colunasPorLargura(larguraMm, fontePx);

    const linhas = linhasDocumento(documento, colunas);
    if (perfil?.cortaPapel !== false) linhas.push("", ""); // avanço extra antes do corte manual/guilhotina

    // Importação dinâmica (mesmo motivo de ImpressorasConfig.jsx): o
    // pacote qz-tray só entra no bundle de quem realmente usa este
    // driver — quem fica no browser-raster (default) nunca o carrega.
    const { imprimirBruto } = await import("../../qztray");
    await imprimirBruto(nomeImpressora, linhas);
    return { error: null };
  } catch (err) {
    return { error: { message: err?.message ?? "Falha ao imprimir via QZ Tray." } };
  }
}
