import { registrarInsight, buscarInsights } from "./jarvas";

/**
 * Estoque — F008: baixa automática + alertas de mínimo
 * (docs/03_REGRAS_DE_NEGOCIO/ESTOQUE.md).
 *
 * O Jarvas NUNCA repõe/ajusta estoque sozinho — só alerta; a
 * reposição é sempre confirmada por humano (docs/03_REGRAS_DE_NEGOCIO/
 * JARVAS.md, decisão 010).
 *
 * Complementar à regra periódica em src/lib/jarvasEngine.js
 * (regraEstoque, que varre todos os produtos a cada 6h e agrega vários
 * itens num único insight): este alerta é imediato, por produto, e
 * dispara no instante em que a baixa de uma venda cruza o mínimo —
 * não espera a próxima rodada da análise periódica.
 */

/**
 * Uma baixa "cruza" o mínimo quando o saldo estava OK (> mínimo) antes
 * e ficou baixo (<= mínimo) depois — mesmo critério de "baixo" já
 * usado em EstoqueView e jarvasEngine (qty <= minimo). Não dispara de
 * novo se o produto já estava abaixo do mínimo antes da baixa (evita
 * repetir o alerta a cada venda seguinte — o dedupe em
 * gerarAlertaEstoque cobre o resto).
 *
 * @param {number} quantidadeAnterior
 * @param {number} quantidadeNova
 * @param {number} minimo
 * @returns {boolean}
 */
export function verificarEstoqueMinimo(quantidadeAnterior, quantidadeNova, minimo) {
  const min = Number(minimo) || 0;
  return Number(quantidadeAnterior) > min && Number(quantidadeNova) <= min;
}

const chaveAlerta = (produtoId) => `estoque:minimo:produto:${produtoId}`;

/**
 * Gera o alerta de estoque mínimo no Jarvas (jarvas_insights), com
 * dedupe: não registra se já existe um alerta aberto (novo/lido) para
 * o mesmo produto. Fire-and-forget — nunca lança, nunca bloqueia a
 * venda (chame sem await, como emitirEvento/logAction).
 *
 * @param {{ produtoId: string|number, nome: string, quantidade: number, minimo: number }} produto
 * @param {string} [usuario]
 * @returns {Promise<void>}
 */
export async function gerarAlertaEstoque({ produtoId, nome, quantidade, minimo }, usuario) {
  try {
    const chave = chaveAlerta(produtoId);
    const { data: abertos } = await buscarInsights({ status: ["novo", "lido"], limite: 200 });
    const jaExiste = (abertos ?? []).some((i) => i?.origem?.chave === chave);
    if (jaExiste) return;

    const zerado = Number(quantidade) === 0;
    await registrarInsight({
      tipo: "alerta",
      severidade: zerado ? "danger" : "warning",
      visibilidade: "operacional",
      modulo: "estoque",
      titulo: zerado ? `Ruptura de estoque: ${nome}` : `Estoque baixo: ${nome} (${quantidade}/${minimo})`,
      descricao: zerado
        ? `${nome} zerou o estoque após uma venda. Vendas deste item podem ser perdidas.`
        : `${nome} caiu para ${quantidade} unidade(s) após uma venda, abaixo do mínimo de ${minimo}.`,
      acao: { label: "Ver estoque", tipo: "abrir_estoque", params: { produto_ids: [produtoId] } },
      origem: { chave, dados: { produto_id: produtoId, nome, quantidade, minimo } },
    });
  } catch (err) {
    // intencionalmente silencioso — alerta do Jarvas nunca pode quebrar a venda
    console.error("[estoque] falha ao gerar alerta de mínimo:", err);
  }
}

/**
 * Orquestra uma baixa de estoque: chama a RPC (injetada, para ser
 * testável sem montar o AppProvider inteiro), decide se a baixa
 * cruzou o mínimo e dispara o alerta do Jarvas quando necessário.
 * Extraído de AppContext.baixarEstoque — mesma lógica, sem mudar
 * comportamento.
 *
 * @param {object} params
 * @param {string|number} params.produtoId
 * @param {number} params.qty
 * @param {number} params.quantidadeAnterior - saldo antes da baixa (estado local)
 * @param {string} params.nomeProduto
 * @param {number} [params.minimoFallback] - usado só se a RPC não devolver minimo
 * @param {string} [params.usuario]
 * @param {(produtoId: string|number, qty: number) => Promise<{data: any, error: any}>} params.chamarRpc
 * @returns {Promise<{ quantidade: number, error: object|null }>}
 */
export async function processarBaixaEstoque({
  produtoId, qty, quantidadeAnterior, nomeProduto, minimoFallback = 10, usuario, chamarRpc,
}) {
  const { data, error } = await chamarRpc(produtoId, qty);
  if (error) {
    console.error("[estoque] falha ao baixar estoque:", error);
    return { quantidade: Math.max(0, Number(quantidadeAnterior) - qty), error };
  }

  const linha = Array.isArray(data) ? data[0] : data;
  const quantidade = linha ? Number(linha.quantidade) : Math.max(0, Number(quantidadeAnterior) - qty);
  const minimo = linha?.minimo != null ? Number(linha.minimo) : minimoFallback;

  if (verificarEstoqueMinimo(quantidadeAnterior, quantidade, minimo)) {
    void gerarAlertaEstoque({ produtoId, nome: nomeProduto, quantidade, minimo }, usuario);
  }

  return { quantidade, error: null };
}
