import { normalizarPagamentos } from "@/utils/pagamentos";

/**
 * P7 — arredonda um valor monetário para 2 casas sem viés de ponto
 * flutuante (0.1 + 0.2 !== 0.3). Sem isso, subtotal/total acumulam
 * erro de centavo ao longo de várias vendas — pouco por venda, mas
 * some do caixa no fechamento do dia. Função pura, local a este
 * módulo (mesma técnica usada em outras camadas de dinheiro do app).
 *
 * @param {any} v
 * @returns {number}
 */
export function round2(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Teto do ajuste percentual — o mesmo `max` que o input do checkout declara. */
export const AJUSTE_PERCENTUAL_MAX = 100;

/**
 * Valida o desconto/acréscimo do checkout ANTES de aplicar.
 *
 * O popup declarava o limite só no HTML (`<input type="number" max="100">`),
 * que não impede digitar: `max` apenas trava as setinhas e marca o campo como
 * inválido para um `checkValidity()` que ninguém chamava. Digitar 150 no modo
 * Percentual — que é o modo PADRÃO, e 150 é um valor de "R$ 150" perfeitamente
 * plausível de quem esqueceu de trocar para Valor Fixo — passava direto: o
 * cálculo dava -150% da conta e o `Math.max(0, ...)` do total transformava
 * isso em R$ 0,00. Venda de graça, sem aviso nenhum. Mesma coisa no modo fixo
 * com desconto maior que a conta.
 *
 * Por que barrar o acréscimo acima de 100% também: cobrar 6× a conta por um
 * dígito a mais é o mesmo erro de digitação, com o prejuízo do outro lado do
 * balcão. O limite já era o anunciado pela tela.
 *
 * Função pura — o checkout usa para desabilitar o botão e dizer o motivo
 * (prevenção antes da mensagem de erro), sem round-trip.
 *
 * @param {{ tipo?: 'desconto'|'acrescimo', mode?: 'percentual'|'fixo', valor?: any }} ajuste
 * @param {number} base - valor da conta já com a taxa de serviço
 * @returns {{ valido: boolean, erro: string|null }}
 */
export function validarAjuste(ajuste, base) {
  const v = Number.parseFloat(ajuste?.valor);
  if (!Number.isFinite(v) || v <= 0) {
    return { valido: false, erro: "Informe um valor maior que zero." };
  }

  if (ajuste?.mode === "percentual") {
    if (v > AJUSTE_PERCENTUAL_MAX) {
      return {
        valido: false,
        erro: `O ${ajuste?.tipo === "desconto" ? "desconto" : "acréscimo"} não pode passar de ${AJUSTE_PERCENTUAL_MAX}%. Para um valor em reais, troque para "Valor Fixo (R$)".`,
      };
    }
    return { valido: true, erro: null };
  }

  const conta = round2(base);
  if (ajuste?.tipo === "desconto" && round2(v) > conta) {
    return {
      valido: false,
      erro: `O desconto não pode ser maior que a conta (R$ ${conta.toFixed(2)}).`,
    };
  }

  return { valido: true, erro: null };
}

/**
 * Desconto exige senha de gerente/admin — SEMPRE, sem faixa de tolerância.
 *
 * No mesmo checkout, remover UM item da conta já pedia senha de gerente e um
 * motivo; zerar a conta inteira com 100% de desconto não pedia nada. Desconto
 * é a rota clássica de vazamento de caixa no PDV (o valor sai da conta e o
 * dinheiro pode não entrar na gaveta), e a trava não pode ser mais fraca do
 * que a de cancelar um refrigerante.
 *
 * Acréscimo não passa pela senha: ele AUMENTA o total (taxa de entrega,
 * embalagem, adicional combinado com o cliente). Não tira dinheiro do caixa,
 * e o cliente confere o valor no ato do pagamento.
 *
 * Função pura — a tela usa para decidir se mostra o campo de senha e se
 * libera o botão Aplicar.
 *
 * @param {{ tipo?: 'desconto'|'acrescimo' }} ajuste
 * @returns {boolean}
 */
export function ajusteExigeSenha(ajuste) {
  return ajuste?.tipo === "desconto";
}

/**
 * TD009 (etapa 1) — mapeia uma venda no formato antigo (blob de
 * sales.data) para as linhas das tabelas relacionais novas
 * (vendas, venda_itens, venda_pagamentos). Função pura — não faz
 * I/O; quem chama decide como/quando persistir.
 *
 * Não ignora nenhum item: itens cancelados também viram linha em
 * venda_itens (com cancelado=true), para manter o histórico completo.
 *
 * @param {object} sale - mesmo shape gravado em sales.data (ver PDVView.handleConfirmPayment)
 * @returns {{ venda: object, itens: object[], pagamentos: object[] }}
 */
export function mapearVendaParaLinhas(sale) {
  const venda = {
    id: sale.id,
    comanda: sale.comanda ?? null,
    mesa: sale.mesa ?? null,
    // P7: arredonda pra 2 casas antes de persistir — evita erro de
    // centavo acumulado (ponto flutuante) no subtotal/total gravado.
    subtotal: sale.subtotal != null ? round2(sale.subtotal) : null,
    taxa_servico: !!sale.taxaServico,
    valor_taxa: round2(sale.valorTaxa ?? 0),
    valor_ajuste: round2(sale.valorAjuste ?? 0),
    total: round2(sale.total ?? 0),
    cashier: sale.cashier ?? null,
    cliente_id: sale.clienteId ?? null, // F010 — vínculo opcional ao cliente
    ...(sale.at ? { at: sale.at } : {}),
  };

  const itens = (Array.isArray(sale.items) ? sale.items : []).map((item) => ({
    venda_id: sale.id,
    product_id: item.id ?? null,
    nome: item.name ?? "",
    preco: round2(item.price),
    qtd: item.qty ?? 1,
    cancelado: !!item.cancelado,
    motivo_cancelamento: item.motivoCancelamento ?? null,
    cancelado_por: item.canceladoPor ?? null,
  }));

  const pagamentos = normalizarPagamentos(sale)
    .filter((p) => p?.metodo != null)
    .map((p) => ({
      venda_id: sale.id,
      metodo: p.metodo,
      valor: round2(p.valor),
    }));

  return { venda, itens, pagamentos };
}

/**
 * TD009 (etapa 2) — inversa de mapearVendaParaLinhas: remonta o shape
 * legado (camelCase, mesmo formato de sales.data) a partir das linhas
 * das tabelas relacionais. Função pura — não faz I/O.
 *
 * Só reconstrói os campos que sobrevivem no schema novo: `ajuste`
 * (o descritor bruto de desconto/acréscimo usado só durante o
 * checkout) e `recebido`/`troco` por pagamento não são persistidos
 * nas tabelas novas — nenhum consumidor de `sales` os lê depois de
 * finalizada a venda (confirmado por grep antes de escrever isto).
 *
 * @param {{ venda: object, itens: object[], pagamentos: object[] }} linhas
 * @returns {object} venda no shape legado de sales.data
 */
export function montarVendaLegada({ venda, itens, pagamentos }) {
  return {
    id: venda.id,
    comanda: venda.comanda ?? null,
    mesa: venda.mesa ?? null,
    subtotal: venda.subtotal ?? null,
    taxaServico: !!venda.taxa_servico,
    valorTaxa: venda.valor_taxa ?? 0,
    valorAjuste: venda.valor_ajuste ?? 0,
    total: venda.total ?? 0,
    cashier: venda.cashier ?? null,
    clienteId: venda.cliente_id ?? null,
    at: venda.at,
    items: (itens ?? []).map((item) => ({
      id: item.product_id ?? null,
      name: item.nome,
      price: item.preco,
      qty: item.qtd,
      cancelado: !!item.cancelado,
      motivoCancelamento: item.motivo_cancelamento ?? null,
      canceladoPor: item.cancelado_por ?? null,
    })),
    pagamentos: (pagamentos ?? []).map((p) => ({
      metodo: p.metodo,
      valor: p.valor,
    })),
  };
}

// Código Postgres de violação de unicidade (chave/PK duplicada).
const PG_UNIQUE_VIOLATION = "23505";

/**
 * TD009 (etapa 1) — persiste uma venda nas tabelas relacionais
 * (dual-write). Extraído de AppContext.addSale para ser testável sem
 * montar a árvore React, e para corrigir o furo silencioso: o
 * supabase-js NÃO lança em erro de RLS/constraint (resolve com
 * `{ error }`), então o try/catch antigo nunca capturava a falha e as
 * linhas normalizadas ganhavam buracos sem nenhum log — foi o que
 * aconteceu na janela do bug de claim do 20260722.
 *
 * Contrato (mantém o de antes): fire-and-forget total — NUNCA lança e
 * NUNCA bloqueia a finalização. `sales` é a fonte de verdade e já foi
 * gravada por quem chama; o backfill idempotente (20260708) cobre
 * qualquer buraco residual. Aqui só garantimos que toda falha seja
 * detectada e registrada (via `onFalha`), não engolida.
 *
 * Idempotência sem chave natural nas filhas: se o cabeçalho `vendas`
 * bate em violação de unicidade, a venda já existe (dual-write repetido
 * — StrictMode, resync, clique duplo). Isso é sucesso idempotente, não
 * falha, e as filhas NÃO são reinseridas — venda_itens/venda_pagamentos
 * não têm chave natural, então reinserir duplicaria linhas.
 *
 * @param {object} client - client supabase (injetado p/ testabilidade)
 * @param {object} sale   - venda no shape de sales.data
 * @param {{ onFalha?: (info: {etapa: string, error: any, venda_id: string|null}) => void }} [opts]
 * @returns {Promise<{ ok: boolean, falhas: {etapa: string, error: any}[] }>}
 */
export async function persistirVendaNormalizada(client, sale, { onFalha } = {}) {
  const falhas = [];
  const registrar = (etapa, error) => {
    falhas.push({ etapa, error });
    // A trilha nunca pode quebrar a venda — isola qualquer erro do callback.
    try { onFalha?.({ etapa, error, venda_id: sale?.id ?? null }); } catch { /* silencioso */ }
  };

  try {
    const { venda, itens, pagamentos } = mapearVendaParaLinhas(sale);

    const { error: eVenda } = await client.from("vendas").insert(venda);
    if (eVenda) {
      // Unicidade = venda já gravada (idempotente): não é falha e não
      // reinsere as filhas, para não duplicá-las.
      if (eVenda.code !== PG_UNIQUE_VIOLATION) registrar("vendas", eVenda);
      return { ok: falhas.length === 0, falhas };
    }

    if (itens.length > 0) {
      const { error: eItens } = await client.from("venda_itens").insert(itens);
      if (eItens) registrar("venda_itens", eItens);
    }
    if (pagamentos.length > 0) {
      const { error: ePags } = await client.from("venda_pagamentos").insert(pagamentos);
      if (ePags) registrar("venda_pagamentos", ePags);
    }
  } catch (err) {
    // client lançou de fato (rede, etc.) — nunca propaga: registra e segue.
    registrar("excecao", err);
  }

  return { ok: falhas.length === 0, falhas };
}
