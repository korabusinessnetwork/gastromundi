import { colunasEscpos } from "../largura";
import { formatarComprovanteEscpos, formatarViaProducaoEscpos, formatarComprovanteCaixaEscpos } from "../escposFormatador";
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
 * Junto com ele viaja o `perfil.idImpressao`, o identificador da ação que
 * pediu o papel (ver impressao/despacho.js).
 */

const AVISO_SEM_IMPRESSORA = "Escolha a impressora em Configurações → Impressão.";

function linhasDocumento(documento, colunas) {
  if (documento?.tipo === "via_producao") return formatarViaProducaoEscpos(documento, colunas);
  if (documento?.tipo === "comprovante_caixa") return formatarComprovanteCaixaEscpos(documento, colunas);
  return formatarComprovanteEscpos(documento, colunas);
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

    // Quantos caracteres cabem na linha é decisão da IMPRESSORA, não da
    // tela: 48 no papel de 80mm, 32 no de 58mm. O tamanho de fonte do
    // preview (perfil.fonteBase) não entra nessa conta — quando entrava,
    // a comanda saía quebrada em 33 colunas num papel de 48, gastando
    // papel em todo pedido e desalinhando os preços da direita.
    // O que continua vindo do perfil, porque muda de estabelecimento
    // pra estabelecimento, é a largura do papel.
    const colunas = colunasEscpos(perfil?.larguraMm);

    const { error } = await enviarImpressaoPonte({
      destino: perfil.impressora,
      linhas: linhasDocumento(documento, colunas),
      cortaPapel: perfil?.cortaPapel !== false,
      copias: Number(perfil?.copias) > 0 ? Number(perfil.copias) : 1,
      // Id da ação que pediu a impressão, montado em impressao/despacho.js
      // (um para cada ponto de impressão). É por ele que a Ponte reconhece o
      // clique repetido e responde "duplicado" em vez de gastar papel de
      // novo. Perfil sem `idImpressao` manda `undefined`, que sai do corpo no
      // JSON: aí vale a rede de segurança de `enviarImpressaoPonte`.
      id: perfil?.idImpressao,
    });
    if (error) return { error: { message: error.message ?? "Falha ao enviar a impressão para a Ponte KORA." } };
    return { error: null };
  } catch (err) {
    return { error: { message: err?.message ?? "Falha ao imprimir na impressora térmica." } };
  }
}
