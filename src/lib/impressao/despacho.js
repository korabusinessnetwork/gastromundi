import { buscarConfigImpressao, montarViaProducao } from "../impressao";
import { agruparItensPorPonto, normalizarPontos, pontoDoItem } from "./pontos";
import { imprimirDocumento } from "./drivers";

/**
 * Ponto único que os fluxos de UI (Cozinha, Ponte/Palm) chamam pra
 * mandar a via de produção pra produção.
 *
 * Leva 15 — PONTOS DE IMPRESSÃO. O estabelecimento pode nomear vários
 * pontos (Cozinha, Bar, Chapa…), cada um ligado a uma impressora, e
 * dizer para onde vai cada categoria/produto (`config_impressao.
 * pontosImpressao` + `.roteamento`). Aqui a via montada é fatiada por
 * ponto e cada fatia sai na impressora do seu ponto — o bar não recebe
 * mais o papel do prato quente.
 *
 * Com UM ponto configurado (que é o que toda instalação existente
 * ganha por síntese em `mesclarConfigImpressao`), sai exatamente uma
 * via, no perfil do estabelecimento, com a mesma mensagem de erro de
 * sempre: o comportamento de hoje é preservado byte a byte.
 *
 * `perfilImpressora` continua mandando no papel/layout (largura,
 * margem, corte, driver); só a `impressora` de destino é trocada pela
 * do ponto — é o que o `escposPonte` usa como `destino`.
 *
 * Nunca lança: `buscarConfigImpressao` já cai no cache local/defaults
 * quando o banco está fora, então uma queda de internet não impede a
 * comanda de sair na cozinha.
 */

/**
 * Junta as falhas de vários pontos numa mensagem que diz o que NÃO
 * saiu — a cozinha não pode achar que saiu tudo quando saiu metade.
 * Com um destino só, devolve o erro do driver intacto (nada de
 * reescrever a mensagem que o usuário já conhece).
 *
 * @param {Array<{nome: string, error: {message: string}}>} falhas
 * @param {number} totalDestinos
 * @returns {{message: string}|null}
 */
function consolidarErros(falhas, totalDestinos) {
  if (falhas.length === 0) return null;
  if (totalDestinos === 1) return falhas[0].error;

  const nomes = falhas.map((f) => f.nome).join(", ");
  const detalhe = falhas[0].error?.message ?? "";
  const saiuAlgo = falhas.length < totalDestinos;
  return {
    message:
      `Não saiu em: ${nomes}.` +
      (saiuAlgo ? " Os demais pontos imprimiram." : "") +
      (detalhe ? ` ${detalhe}` : ""),
  };
}

/**
 * @param {object} order - shape do pedido/`pending` (comanda, mesa, garçom, items[])
 * @returns {Promise<{ error: {message: string}|null }>}
 */
export async function enviarViaProducao(order) {
  const { data: configImpressao } = await buscarConfigImpressao();
  const documento = montarViaProducao({ pedido: order });

  // Normaliza uma vez só (é idempotente — a config lida já vem normalizada)
  // para saber, antes de imprimir, se o estabelecimento tem mais de um ponto.
  const pontos = normalizarPontos(configImpressao?.pontosImpressao, configImpressao?.perfilImpressora);
  const contexto = { pontos, roteamento: configImpressao?.roteamento };

  let grupos = agruparItensPorPonto(documento.itens, contexto);
  if (grupos.length === 0) {
    // Comanda sem nenhum item produzível: hoje ela ainda gera um papel
    // ("Nenhum item produzível nesta comanda"). Agrupar por ponto não
    // devolveria grupo nenhum e a via sumiria — regressão silenciosa.
    // Um item vazio resolve pro ponto padrão, que é onde esse papel sai.
    grupos = [{ ponto: pontoDoItem({}, contexto), itens: documento.itens }];
  }

  // Carimba o nome do ponto sempre que o estabelecimento tem mais de um
  // ponto — e não só quando ESTE pedido saiu fatiado. Se dependesse do
  // pedido, o mesmo papel do Bar viria nomeado numa comanda e anônimo na
  // seguinte, e quem está na bancada aprenderia a desconfiar do rótulo.
  // Com um ponto só (toda instalação de hoje), nada é carimbado.
  const varios = pontos.length > 1;
  const falhas = [];

  // Sequencial de propósito: são poucos pontos e a Ponte KORA atende um
  // trabalho por vez; disparar em paralelo só embaralharia a ordem dos
  // papéis na bancada.
  for (const { ponto, itens } of grupos) {
    const documentoDoPonto = { ...documento, itens };
    // Só carimba o nome quando há mais de um destino — com um ponto só,
    // o cabeçalho tem que continuar igual ao de hoje.
    if (varios) documentoDoPonto.pontoNome = ponto.nome;

    const perfil = { ...configImpressao?.perfilImpressora, impressora: ponto.impressora };

    let resultado;
    try {
      resultado = await imprimirDocumento(documentoDoPonto, perfil);
    } catch (err) {
      // Um driver que lança não pode derrubar os outros pontos: o resto
      // da comanda ainda tem que sair.
      resultado = { error: { message: err?.message ?? "Falha ao imprimir." } };
    }
    if (resultado?.error) falhas.push({ nome: ponto.nome, error: resultado.error });
  }

  return { error: consolidarErros(falhas, grupos.length) };
}
