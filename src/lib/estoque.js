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
 * Oversell: a venda tentou baixar mais do que havia em estoque — a RPC
 * clampa o saldo em zero e a diferença some sem rastro. Detectado aqui
 * para o Jarvas alertar o gestor (contagem errada ou venda sem reposição).
 *
 * @param {number} quantidadeAnterior - saldo antes da baixa
 * @param {number} qtdBaixa - quantidade baixada (em unidade de estoque)
 * @returns {boolean}
 */
export function verificarOversell(quantidadeAnterior, qtdBaixa) {
  return Number(qtdBaixa) > Math.max(0, Number(quantidadeAnterior) || 0);
}

const chaveOversell = (produtoId) => `estoque:oversell:produto:${produtoId}`;

/**
 * Alerta de venda sem estoque suficiente (oversell), com o mesmo dedupe
 * do alerta de mínimo. Fire-and-forget — nunca lança, nunca bloqueia a venda.
 *
 * @param {{ produtoId: string|number, nome: string, vendido: number, disponivel: number }} dados
 * @param {string} [usuario]
 * @returns {Promise<void>}
 */
export async function gerarAlertaOversell({ produtoId, nome, vendido, disponivel }, usuario) {
  try {
    const chave = chaveOversell(produtoId);
    const { data: abertos } = await buscarInsights({ status: ["novo", "lido"], limite: 200 });
    const jaExiste = (abertos ?? []).some((i) => i?.origem?.chave === chave);
    if (jaExiste) return;

    await registrarInsight({
      tipo: "alerta",
      severidade: "danger",
      visibilidade: "operacional",
      modulo: "estoque",
      titulo: `Venda sem estoque: ${nome}`,
      descricao: `Uma venda baixou ${fmtNum(vendido)} de ${nome}, mas o estoque tinha só ${fmtNum(disponivel)}. O saldo foi zerado e a diferença não existe no sistema — confira a contagem e a reposição.`,
      acao: { label: "Ver estoque", tipo: "abrir_estoque", params: { produto_ids: [produtoId] } },
      origem: { chave, dados: { produto_id: produtoId, nome, vendido, disponivel } },
    });
  } catch (err) {
    // intencionalmente silencioso — alerta do Jarvas nunca pode quebrar a venda
    console.error("[estoque] falha ao gerar alerta de oversell:", err);
  }
}

const fmtNum = (n) => {
  const v = Number(n) || 0;
  return v % 1 === 0 ? String(v) : v.toFixed(3).replace(/\.?0+$/, "");
};

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

const chaveBaixaFalhou = (alvo, id) => `estoque:baixa-falhou:${alvo}:${id}`;

// Mesma leitura de erro usada no AppContext — mensagem, código, ou a forma
// em texto quando o erro nem objeto é.
const textoDoErro = (erro) => (erro ? (erro.message ?? erro.code ?? String(erro)) : null);

/**
 * Alerta de baixa recusada pelo servidor (TD012).
 *
 * A venda gravou, o estoque não desceu, e até aqui isso só existia no Sentry,
 * na tabela de eventos e no log de atividade — três lugares que o gestor não
 * abre. Sem este alerta, o saldo na tela fica maior que o real e ninguém
 * descobre até a contagem física não bater (foi assim que o bug de RLS na
 * `baixar_estoque` passou semanas escondido).
 *
 * Só deve ser chamado para falha de verdade: sem internet a RPC entra na fila
 * e é reaplicada, então alertar ali ensinaria o gestor a ignorar o alerta.
 *
 * Fire-and-forget, com o mesmo dedupe dos irmãos — nunca lança, nunca bloqueia
 * a venda.
 *
 * @param {{ produtoId?: string|number, subprodutoId?: string|number, nome?: string|null, quantidade: number, erro?: object|null }} dados
 * @param {string} [usuario]
 * @returns {Promise<void>}
 */
export async function gerarAlertaBaixaFalhou({ produtoId, subprodutoId, nome, quantidade, erro }, usuario) {
  try {
    const alvo = produtoId != null ? "produto" : "subproduto";
    const id = produtoId != null ? produtoId : subprodutoId;
    const chave = chaveBaixaFalhou(alvo, id);
    const { data: abertos } = await buscarInsights({ status: ["novo", "lido"], limite: 200 });
    const jaExiste = (abertos ?? []).some((i) => i?.origem?.chave === chave);
    if (jaExiste) return;

    const item = nome || (alvo === "produto" ? `Produto ${id}` : `Item ${id}`);
    await registrarInsight({
      tipo: "alerta",
      severidade: "danger",
      visibilidade: "operacional",
      modulo: "estoque",
      titulo: `Estoque não descontado: ${item}`,
      // Sem o texto cru do banco: quem lê isto é dono de restaurante. A
      // mensagem técnica fica em origem.dados.erro, para o diagnóstico.
      descricao: `Uma venda saiu com ${fmtNum(quantidade)} de ${item}, mas o sistema não conseguiu descontar do estoque. O saldo que aparece na tela está maior do que o que existe de verdade — confira a contagem deste item.`,
      acao: {
        label: "Ver estoque",
        tipo: "abrir_estoque",
        params: alvo === "produto" ? { produto_ids: [id] } : { subproduto_ids: [id] },
      },
      origem: { chave, dados: { [`${alvo}_id`]: id, nome: item, quantidade, erro: textoDoErro(erro) } },
    });
  } catch (err) {
    // intencionalmente silencioso — alerta do Jarvas nunca pode quebrar a venda
    console.error("[estoque] falha ao gerar alerta de baixa recusada:", err);
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
  let data = null, error = null;
  try {
    ({ data, error } = (await chamarRpc(produtoId, qty)) ?? {});
  } catch (err) {
    // A RPC normalmente devolve `{ error }`, mas quando ela LANÇA (falha de
    // fetch, URL inválida, resposta ilegível) a exceção subia até o
    // finalizarPagamento, que chama a baixa sem proteção — depois da venda já
    // gravada. Mesma blindagem que entradaEstoque e baixarEstoqueSubproduto
    // já têm no AppContext.
    error = { message: err?.message ?? String(err) };
  }
  if (error) {
    console.error("[estoque] falha ao baixar estoque:", error);
    // Nada foi descontado no banco. Devolver `anterior - qty` seria entregar um
    // saldo que nunca existiu — o TD012 na origem: a estimativa local passava
    // por verdade e escondeu o bug de RLS por semanas. Quem chama recebe o
    // saldo de antes, que é o que o banco de fato tem.
    return { quantidade: Math.max(0, Number(quantidadeAnterior) || 0), error };
  }

  const linha = Array.isArray(data) ? data[0] : data;
  const quantidade = linha ? Number(linha.quantidade) : Math.max(0, Number(quantidadeAnterior) - qty);
  const minimo = linha?.minimo != null ? Number(linha.minimo) : minimoFallback;

  // Oversell tem precedência: já é "danger", cobre a ruptura e explica a causa.
  if (verificarOversell(quantidadeAnterior, qty)) {
    void gerarAlertaOversell(
      { produtoId, nome: nomeProduto, vendido: qty, disponivel: Math.max(0, Number(quantidadeAnterior) || 0) },
      usuario,
    );
  } else if (verificarEstoqueMinimo(quantidadeAnterior, quantidade, minimo)) {
    void gerarAlertaEstoque({ produtoId, nome: nomeProduto, quantidade, minimo }, usuario);
  }

  return { quantidade, error: null };
}

/**
 * A função do banco não existe (migration ainda não aplicada).
 *
 * O app é publicado na Vercel antes de o dono rodar a migration no
 * Supabase, então existe uma janela em que o código novo chama uma RPC
 * que o banco ainda não tem. O PostgREST responde `PGRST202` ("Could not
 * find the function ... in the schema cache").
 *
 * Isso não é erro de rede (reenviar não resolve) nem de permissão (o
 * papel está certo): é o banco atrasado em relação ao app. Quem chama usa
 * isto para cair no caminho antigo em vez de travar a operação — sem
 * isso, dar entrada de mercadoria ficaria impossível até a migration ser
 * aplicada.
 *
 * @param {object|null} error - o `error` devolvido pelo supabase-js
 * @returns {boolean}
 */
export function isRpcAusente(error) {
  if (!error) return false;
  if (error.code === "PGRST202" || error.code === "42883") return true;
  const texto = [error.message, error.details, error.hint]
    .filter((parte) => typeof parte === "string")
    .join(" ");
  if (/could not find the function/i.test(texto)) return true;
  return /function/i.test(texto) && /does not exist/i.test(texto);
}
