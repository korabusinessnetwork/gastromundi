// ──────────────────────────────────────────────────────────────────
// deliveryPedidos — OPERAÇÃO do delivery (Fase 4).
//
// O pedido que o cliente enviou pela vitrine (Fase 3) já foi gravado
// pelo backend (RPC criar_pedido_delivery, migration 20260804) em
// `delivery_pedidos` (histórico próprio do delivery) e espelhado em
// `pending` (Realtime) para a Cozinha/caixa consumirem. Aqui o
// dono/operador ACOMPANHA e TOCA esse pedido até a entrega.
//
// DINHEIRO (mudou em 20261002): a venda do delivery é fechada AQUI, e
// não mais na frente de caixa. Antes o espelho em `pending` aparecia na
// lista de comandas do PDV e o caixa o fechava como se fosse uma mesa —
// o que poluía a tela de quem atende no salão (ninguém vai servir aquela
// comanda) e fazia a venda de delivery nascer indistinguível de uma venda
// de balcão. Agora `registrarVendaDelivery` grava a venda com
// `origem = 'delivery'` e o vínculo com o pedido, e o espelho volta a ser
// só o que sempre foi útil de fato: a comanda que a COZINHA lê e a
// impressora imprime.
//
// Contagem dupla não existe: a venda entra uma vez, pela RPC, que é
// idempotente por pedido (UNIQUE em vendas.delivery_pedido_id).
//
// Puras (dinheiro/status/formatos) nascem com teste — deliveryPedidos.test.js.
// Nunca faz select * em tabela sensível (CLAUDE.md): campos explícitos.
// ──────────────────────────────────────────────────────────────────
import { supabase } from "./supabase";
import { logAction } from "./logger";

// Fluxo de status do delivery. A coluna `status` é text livre (sem CHECK
// no banco), então o fluxo é definido AQUI, na única fonte de verdade do
// front. Ordem = avanço natural do pedido.
export const STATUS_FLUXO = ["recebido", "em_preparo", "saiu_entrega", "entregue"];

// 'cancelado' fica fora do fluxo (terminal, desvio) — some do avanço normal.
export const STATUS_CANCELADO = "cancelado";

const ROTULOS = {
  recebido:     "Novo pedido",
  em_preparo:   "Em preparo",
  saiu_entrega: "Saiu para entrega",
  entregue:     "Entregue",
  cancelado:    "Cancelado",
};

// Rótulo do BOTÃO que leva o pedido ao próximo estado (linguagem do dia a
// dia, não jargão — Princípio nº 1). null quando não há próximo passo.
const ACOES = {
  recebido:     "Aceitar e preparar",
  em_preparo:   "Saiu para entrega",
  saiu_entrega: "Confirmar entrega",
};

/** Rótulo humano de um status (fallback: o próprio código). */
export function statusLabel(status) {
  return ROTULOS[status] || String(status ?? "—");
}

/** Chave de cor (do design system C.*) por status — quem chama resolve a cor. */
export function statusCor(status) {
  switch (status) {
    case "recebido":     return "blue";
    case "em_preparo":   return "amber";
    case "saiu_entrega": return "accent";
    case "entregue":     return "green";
    case "cancelado":    return "red";
    default:             return "muted";
  }
}

/** Status é terminal (não avança mais)? entregue e cancelado são. */
export function ehTerminal(status) {
  return status === "entregue" || status === STATUS_CANCELADO;
}

/** Próximo status no fluxo, ou null se terminal / desconhecido. */
export function proximoStatus(status) {
  const i = STATUS_FLUXO.indexOf(status);
  if (i < 0 || i >= STATUS_FLUXO.length - 1) return null;
  return STATUS_FLUXO[i + 1];
}

/** Rótulo do botão de avançar, ou null quando não há avanço possível. */
export function rotuloAcao(status) {
  return ACOES[status] || null;
}

/** Só dá pra cancelar enquanto não chegou ao fim (nem já cancelado). */
export function podeCancelar(status) {
  return !ehTerminal(status);
}

/**
 * Uma transição de status é válida? Fonte de verdade única do fluxo,
 * espelhada pelo trigger BEFORE UPDATE em delivery_pedidos (migration
 * 20260815 — guarda de segurança no banco). Aqui serve à PREVENÇÃO DE
 * ERRO no front (Princípio nº 1): barrar antes do round-trip.
 *
 *   • de terminal (entregue/cancelado) → nada avança (não ressuscita);
 *   • cancelar é permitido de qualquer não-terminal;
 *   • avançar só um passo no STATUS_FLUXO (sem pular etapa);
 *   • mesmo → mesmo é no-op válido (edição de outros campos).
 *
 * @param {string} de status atual
 * @param {string} para status desejado
 * @returns {boolean}
 */
export function transicaoValida(de, para) {
  if (!de || !para) return false;
  if (de === para) return true;
  if (ehTerminal(de)) return false;
  if (para === STATUS_CANCELADO) return true;
  return proximoStatus(de) === para;
}

/**
 * Agrupa a lista de pedidos por status, na ordem do fluxo + cancelado no
 * fim. Retorna [{ status, label, pedidos }] — só colunas com pedido, para
 * a tela não virar um mar de vazios.
 */
export function agruparPorStatus(pedidos) {
  const lista = Array.isArray(pedidos) ? pedidos : [];
  const ordem = [...STATUS_FLUXO, STATUS_CANCELADO];
  return ordem
    .map((status) => ({
      status,
      label: statusLabel(status),
      pedidos: lista.filter((p) => (p?.status ?? "recebido") === status),
    }))
    .filter((col) => col.pedidos.length > 0);
}

/** Monta o resumo de endereço em uma linha, pulando pedaços vazios. */
export function resumoEndereco(pedido) {
  if (!pedido) return "";
  const partes = [
    pedido.endereco,
    pedido.complemento_endereco,
    pedido.bairro,
    // A cidade fecha a linha porque bairro de nome comum não diz de qual
    // cidade é — "Centro" sozinho manda o entregador adivinhar. Pedido
    // antigo não tem o campo e a linha sai como sempre saiu.
    pedido.cidade,
  ]
    .map((p) => (typeof p === "string" ? p.trim() : ""))
    .filter(Boolean);
  return partes.join(" · ");
}

// Máscara e dígitos de telefone moram em src/lib/telefone.js — regra única,
// a mesma que o cadastro de cliente usa para validar. Reexportadas aqui para
// quem já importava deste módulo.
import { apenasDigitosTelefone } from "./telefone";
export { apenasDigitosTelefone, formatarTelefone } from "./telefone";

/**
 * Link do WhatsApp (wa.me) para falar com o cliente. Assume DDI 55 (Brasil)
 * quando o número vem só com DDD+número. Retorna null se não houver telefone
 * utilizável — o front esconde o botão nesse caso.
 */
export function linkWhatsApp(tel, texto) {
  const d = apenasDigitosTelefone(tel);
  if (d.length < 10) return null;
  const comDdi = d.length <= 11 ? `55${d}` : d;
  const base = `https://wa.me/${comDdi}`;
  return texto ? `${base}?text=${encodeURIComponent(texto)}` : base;
}

/** Rótulo humano da forma de pagamento. */
export function formatarFormaPagamento(forma) {
  switch (forma) {
    case "dinheiro": return "Dinheiro";
    case "pix":      return "Pix";
    case "cartao":   return "Cartão na entrega";
    default:         return "—";
  }
}

/**
 * Resumo de pagamento pronto pra tela: forma + troco (só dinheiro) +
 * lembrete de maquininha (só cartão). Ex.: "Dinheiro · troco p/ R$ 50,00".
 */
export function resumoPagamento(pedido) {
  if (!pedido) return "—";
  const partes = [formatarFormaPagamento(pedido.forma_pagamento)];
  if (pedido.forma_pagamento === "dinheiro" && Number(pedido.troco_para) > 0) {
    partes.push(`troco p/ ${formatarReais(pedido.troco_para)}`);
  }
  if (pedido.forma_pagamento === "cartao" && pedido.levar_maquininha) {
    partes.push("levar maquininha");
  }
  return partes.join(" · ");
}

/** Formata reais (mesma cara do resto do delivery). */
export function formatarReais(valor) {
  const n = Number(valor) || 0;
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/**
 * "há X" desde created_at, em linguagem curta (agora / 5 min / 2 h / 1 d).
 * `agora` injetável para teste determinístico.
 */
export function tempoDecorrido(createdAt, agora = new Date()) {
  if (!createdAt) return "";
  const t = new Date(createdAt).getTime();
  if (Number.isNaN(t)) return "";
  const diffMs = agora.getTime() - t;
  if (diffMs < 0) return "agora";
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h`;
  const d = Math.floor(h / 24);
  return `${d} d`;
}

// ── I/O (Supabase) — admin lê/escreve direto; RLS RESTRICTIVE isola o tenant ──

// Campos explícitos (nunca select * em tabela sensível — CLAUDE.md).
const CAMPOS_PEDIDO =
  "id,numero,cliente_nome,cliente_telefone,cep,bairro,endereco,complemento_endereco," +
  "subtotal,taxa_entrega,total,forma_pagamento,troco_para,levar_maquininha,status,pending_id," +
  "entregador_id,valor_entregador,entregador_pago_em,tipo_entrega,created_at,updated_at";

/**
 * Lista os pedidos de delivery do tenant (recente → antigo). A RLS já
 * filtra por tenant. Nunca lança: erro vira { data: [], error }.
 */
export async function listarPedidosDelivery() {
  try {
    const { data, error } = await supabase
      .from("delivery_pedidos")
      .select(CAMPOS_PEDIDO)
      .order("created_at", { ascending: false });
    if (error) return { data: [], error };
    return { data: data ?? [], error: null };
  } catch (error) {
    return { data: [], error };
  }
}

/**
 * Itens de um pedido (carregados sob demanda quando o operador abre o
 * cartão — evita puxar item de todo pedido de uma vez). Campos explícitos.
 */
export async function carregarItensPedido(pedidoId) {
  if (!pedidoId) return { data: [], error: null };
  try {
    const { data, error } = await supabase
      .from("delivery_pedido_itens")
      .select("id,produto_id,combo_id,nome,qtd,preco_unit,complementos,obs")
      .eq("pedido_id", pedidoId)
      .order("id", { ascending: true });
    if (error) return { data: [], error };
    return { data: data ?? [], error: null };
  } catch (error) {
    return { data: [], error };
  }
}

/**
 * Avança/muda o status de um pedido. Admin escreve direto (RLS RESTRICTIVE).
 * `updated_at` é tocado para o realtime/histórico. Nunca lança.
 *
 * `contexto` (opcional, retrocompatível): { operador, numero } só para a
 * AUDITORIA da transição em operator_logs (fire-and-forget — nunca bloqueia
 * nem quebra a operação; ver DELIVERY.md §Auditoria).
 */
export async function atualizarStatusPedido(pedidoId, novoStatus, contexto = {}) {
  if (!pedidoId || !novoStatus) {
    return { data: null, error: new Error("Pedido ou status ausente.") };
  }
  // Prevenção de erro (Princípio nº 1): se o chamador informa o status
  // atual (`contexto.de`), barra transição inválida antes do round-trip —
  // erro humano em vez de esperar a rejeição do trigger. Retrocompatível:
  // sem `de`, segue direto e o trigger (20260815) continua sendo a guarda.
  if (contexto?.de && !transicaoValida(contexto.de, novoStatus)) {
    return {
      data: null,
      error: new Error("Essa mudança de status não é permitida para este pedido."),
    };
  }
  try {
    const { data, error } = await supabase
      .from("delivery_pedidos")
      .update({ status: novoStatus, updated_at: new Date().toISOString() })
      .eq("id", pedidoId)
      .select(CAMPOS_PEDIDO)
      .maybeSingle();
    if (error) return { data: null, error };
    // DL2: supabase-js não lança quando o UPDATE não bate em nenhuma
    // linha (pedido de outro tenant sob a RLS RESTRICTIVE, ou id que já
    // não existe mais) — vem sem `error`, mas `data: null` (maybeSingle).
    // Sem essa checagem o operador via "atualizado" no toast enquanto o
    // status no banco não mudou nada — sucesso falso. Trata como erro
    // pro chamador não seguir como se a transição tivesse acontecido.
    if (!data) {
      return {
        data: null,
        error: new Error("Não foi possível atualizar este pedido (não encontrado ou sem permissão)."),
      };
    }
    // Auditoria da transição (fire-and-forget, nunca bloqueia).
    logAction(contexto?.operador, "delivery:status", {
      pedido_id: pedidoId,
      numero: contexto?.numero ?? data?.numero ?? null,
      para: novoStatus,
    });
    return { data, error: null };
  } catch (error) {
    return { data: null, error };
  }
}

/**
 * Fecha o pedido entregue como VENDA, com registro próprio de delivery
 * (`vendas.origem = 'delivery'`).
 *
 * Antes, quem registrava a venda do delivery era o PDV: o espelho em
 * `pending` aparecia na lista de comandas e o caixa o fechava como se
 * fosse uma mesa. Isso poluía a tela de quem atende no salão — ninguém
 * vai servir aquela comanda — e fazia a venda de delivery nascer
 * indistinguível de uma venda de balcão, sem como separar quanto o
 * delivery vendeu.
 *
 * Venda, itens e pagamento entram JUNTOS ou não entram: por isso é uma
 * RPC, e não três gravações daqui. A aba fechando no meio deixaria uma
 * venda sem itens no relatório — dinheiro registrado sem lastro.
 *
 * Idempotente no servidor: o mesmo pedido devolve sempre a mesma venda
 * (`ja_existia: true`), então clique duplo, eco do realtime e operador
 * voltando na tela não rendem venda dobrada.
 *
 * @param {string} pedidoId
 * @returns {Promise<{data: {venda_id: string, ja_existia: boolean}|null, error: object|null}>}
 */
export async function registrarVendaDelivery(pedidoId) {
  if (!pedidoId) return { data: null, error: new Error("Pedido ausente.") };
  try {
    const { data, error } = await supabase.rpc("registrar_venda_delivery", {
      p_pedido_id: pedidoId,
    });
    if (error) return { data: null, error };
    if (!data?.ok) {
      return { data: null, error: new Error("Não foi possível registrar a venda deste pedido.") };
    }
    return { data, error: null };
  } catch (error) {
    return { data: null, error };
  }
}

/**
 * O pedido de delivery é do delivery: ele não é uma comanda do salão.
 * O espelho em `pending` existe para a COZINHA ler e a impressora
 * imprimir — não para o garçom atender nem para o caixa fechar.
 *
 * `created_by` é o carimbo que a RPC pública põe em todo espelho
 * (`'delivery'`), e é o único jeito de distinguir a comanda espelho de
 * uma comanda de mesa olhando só para `pending`. Pura.
 *
 * @param {object} comanda - linha de `pending`
 */
export function ehComandaDeDelivery(comanda) {
  return comanda?.created_by === "delivery";
}

/** As comandas do salão — sem os espelhos do delivery. Pura. */
export function comandasDoSalao(pendentes) {
  return (pendentes ?? []).filter((c) => !ehComandaDeDelivery(c));
}

/**
 * A mensagem de confirmação que o estabelecimento manda ao ACEITAR o
 * pedido. Pura — é ela que os testes conferem, não o link.
 *
 * Por que no aceite e não no envio: o cliente já viu "Pedido enviado!" na
 * tela dele. O que ele ainda não sabe é se a loja VIU e vai fazer. É essa
 * a angústia dos primeiros minutos, e é isso que a mensagem responde.
 *
 * Curta de propósito: quem lê está no celular esperando comida, não
 * conferindo nota fiscal. Número do pedido (para ele responder citando),
 * o que vai chegar, quanto custa, e como recebe.
 *
 * @param {object} pedido - linha de delivery_pedidos
 * @param {{nome?: string, tempoPreparo?: number}} loja
 * @returns {string}
 */
export function mensagemPedidoAceito(pedido, loja = {}) {
  const nome = String(loja?.nome ?? "").trim();
  const cliente = String(pedido?.cliente_nome ?? "").trim();
  const retirada = pedido?.tipo_entrega === "retirada";
  const preparo = Math.round(Number(loja?.tempoPreparo) || 0);

  // Saudação com o primeiro nome quando há: é a diferença entre parecer um
  // robô e parecer o restaurante da esquina.
  const saudacao = cliente ? `Oi, ${cliente.split(" ")[0]}!` : "Oi!";
  const linhas = [`${saudacao} ${nome ? `Aqui é do ${nome}.` : "Tudo certo por aqui."}`];
  linhas.push("");
  linhas.push(`Recebemos seu pedido *${pedido?.numero ?? ""}* e já começamos a preparar. ✅`);

  if (preparo > 0) {
    linhas.push(
      retirada
        ? `Fica pronto para retirar em cerca de ${preparo} min.`
        : `Deve chegar em cerca de ${preparo} min.`,
    );
  }

  linhas.push("");
  linhas.push(`Total: ${formatarReais(pedido?.total)} — ${formatarFormaPagamento(pedido?.forma_pagamento)}`);
  if (pedido?.forma_pagamento === "dinheiro" && Number(pedido?.troco_para) > 0) {
    linhas.push(`Levamos troco para ${formatarReais(pedido.troco_para)}.`);
  }

  if (retirada) {
    linhas.push("");
    linhas.push("É retirada no local — avisamos assim que estiver pronto.");
  }

  return linhas.join("\n").trim();
}

/**
 * Link pronto para abrir a conversa do WhatsApp com a confirmação já
 * escrita. `null` quando o pedido não tem telefone utilizável — aí o
 * botão simplesmente não aparece, em vez de abrir uma aba morta.
 */
export function linkConfirmacaoWhatsApp(pedido, loja) {
  return linkWhatsApp(pedido?.cliente_telefone, mensagemPedidoAceito(pedido, loja));
}
