import { colunasEscpos } from "../largura";
import { tamanhoTermicaDeFonteBase } from "../tamanhoFonte";
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
 * Junto com ele viaja o `perfil.idImpressao`, o identificador da ação que
 * pediu o papel (ver impressao/despacho.js).
 */

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

    // Tamanho da letra na térmica. Os pixels do perfil (`fonteBase`) são
    // medida de TELA; a impressora muda de tamanho por comando, em
    // degraus (ver ../tamanhoFonte.js). Aqui traduzimos o slider naquele
    // degrau e mandamos junto — foi o que faltou durante um tempo: o
    // dono aumentava a letra, o preview crescia e a térmica continuava
    // imprimindo igual, porque nada sobre fonte saía deste driver.
    const tamanhoFonte = tamanhoTermicaDeFonteBase(perfil?.fonteBase);

    // Quantos caracteres cabem na linha é decisão da IMPRESSORA, não da
    // tela: 48 no papel de 80mm e 32 no de 58mm na letra padrão, mais na
    // letra miúda, metade na letra grande (que dobra a largura do
    // caractere). Por isso as colunas vêm do MESMO tamanho que a Ponte
    // vai mandar pra impressora: pedir 48 colunas e imprimir em 24 é a
    // comanda quebrada e o preço desalinhado — foi o que aconteceu
    // quando este driver tentou tirar colunas direto dos pixels.
    const colunas = colunasEscpos(perfil?.larguraMm, tamanhoFonte);

    const { error } = await enviarImpressaoPonte({
      destino: perfil.impressora,
      linhas: linhasDocumento(documento, colunas),
      // A Ponte é quem monta os bytes ESC/POS do tamanho (ESC M / GS !).
      // Ponte antiga ignora este campo e imprime como sempre — nada
      // quebra, só não cresce até o dono atualizar o programa.
      tamanhoFonte,
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
