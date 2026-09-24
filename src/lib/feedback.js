import { supabase } from "./supabase";

/**
 * Feedback — dois canais, uma tabela (migração 20261010).
 *
 *  • EQUIPE   — quem opera relata o que quebrou, de dentro do sistema,
 *    com a tela em que estava. Escreve autenticado.
 *  • CLIENTE  — quem pediu pela vitrine avalia de 1 a 5 com comentário.
 *    Escreve ANÔNIMO, por RPC: a vitrine não tem sessão, e dar INSERT
 *    direto ao anon abriria a tabela.
 *
 * As validações são puras e exportadas à parte para a tela desabilitar o
 * botão sem ida ao banco — prevenir o erro em vez de avisar depois.
 *
 * A RLS já isola por tenant. Nunca lança: erro vira `{ ..., error }`.
 */

/** Teto de texto: campo aberto sem limite entope a tabela. O servidor corta igual. */
export const LIMITE_TEXTO = 2000;

/**
 * A nota do cliente dita por extenso. A MESMA palavra dos dois lados: o
 * cliente escolheu "Ótimo" na vitrine, e é "Ótimo" que o dono lê na tela
 * de feedbacks. Cor e estrela sozinhas não são informação.
 *
 * @param {number} nota
 * @returns {string} "" quando a nota não é de 1 a 5
 */
export function rotuloDaNota(nota) {
  return ROTULOS_NOTA[Number(nota)] ?? "";
}

const ROTULOS_NOTA = ["", "Ruim", "Fraco", "Ok", "Bom", "Ótimo"];

/**
 * O relato da equipe vale a pena? Texto vazio não é relato; texto de duas
 * letras também não, e deixar passar enche a lista de ruído que o dono
 * teria de filtrar à mão depois.
 *
 * @param {string} texto
 * @returns {{valido: boolean, erro: (string|null)}}
 */
export function validarFeedbackEquipe(texto) {
  const t = String(texto ?? "").trim();
  if (!t) return { valido: false, erro: "Escreva o que aconteceu." };
  if (t.length < 5) return { valido: false, erro: "Conte um pouco mais, assim não dá para entender." };
  return { valido: true, erro: null };
}

/**
 * A avaliação do cliente exige só a NOTA. O comentário é opcional de
 * propósito: obrigar a escrever depois de a comida chegar é o jeito mais
 * rápido de não receber avaliação nenhuma.
 *
 * @param {number} nota
 * @returns {{valido: boolean, erro: (string|null)}}
 */
export function validarAvaliacaoCliente(nota) {
  const n = Number(nota);
  if (!Number.isInteger(n) || n < 1 || n > 5) {
    return { valido: false, erro: "Escolha de 1 a 5 estrelas." };
  }
  return { valido: true, erro: null };
}

/**
 * Registra o relato da equipe.
 *
 * @param {{texto: string, tela?: string, autor?: string}} dados
 * @returns {Promise<{data: object|null, error: object|null}>}
 */
export async function enviarFeedbackEquipe({ texto, tela, autor }) {
  const { valido, erro } = validarFeedbackEquipe(texto);
  if (!valido) return { data: null, error: { message: erro } };

  const { data, error } = await supabase
    .from("feedbacks")
    .insert({
      origem: "equipe",
      texto: String(texto).trim().slice(0, LIMITE_TEXTO),
      tela: tela ? String(tela).slice(0, 80) : null,
      autor: autor ? String(autor).slice(0, 80) : null,
    })
    .select("id")
    .single();
  return { data, error };
}

/**
 * Registra a avaliação do cliente na vitrine. Passa pela RPC porque a
 * página é anônima — ver o comentário da migração 20261010.
 *
 * @param {{slug: string, nota: number, texto?: string, pedidoId?: string}} dados
 * @returns {Promise<{data: string|null, error: object|null}>}
 */
export async function enviarAvaliacaoCliente({ slug, nota, texto, pedidoId }) {
  const { valido, erro } = validarAvaliacaoCliente(nota);
  if (!valido) return { data: null, error: { message: erro } };
  if (!slug) return { data: null, error: { message: "Estabelecimento não informado." } };

  const { data, error } = await supabase.rpc("registrar_feedback_cliente", {
    p_slug: slug,
    p_nota: Number(nota),
    p_texto: String(texto ?? "").trim().slice(0, LIMITE_TEXTO) || null,
    p_pedido_id: pedidoId ?? null,
  });
  return { data: data ?? null, error };
}

/**
 * Lista os feedbacks do estabelecimento, recentes primeiro. Campos
 * explícitos (nunca select * — CLAUDE.md).
 *
 * @param {{origem?: 'equipe'|'cliente', apenasAbertos?: boolean, limite?: number}} [opts]
 * @returns {Promise<{data: Array<object>, error: object|null}>}
 */
export async function listarFeedbacks({ origem, apenasAbertos = false, limite = 200 } = {}) {
  let q = supabase
    .from("feedbacks")
    .select("id, origem, texto, nota, tela, autor, pedido_id, resolvido, created_at")
    .order("created_at", { ascending: false })
    .limit(limite);
  if (origem) q = q.eq("origem", origem);
  if (apenasAbertos) q = q.eq("resolvido", false);
  const { data, error } = await q;
  return { data: data ?? [], error };
}

/**
 * Marca (ou desmarca) um feedback como resolvido.
 *
 * @param {string} id
 * @param {boolean} resolvido
 * @returns {Promise<{error: object|null}>}
 */
export async function marcarResolvido(id, resolvido = true) {
  if (!id) return { error: { message: "Feedback inválido." } };
  const { error } = await supabase.from("feedbacks").update({ resolvido }).eq("id", id);
  return { error };
}

// ── Leitura: filtrar, contar e datar (tudo puro) ───────────────────

/**
 * Os feedbacks que casam com o filtro escolhido na tela.
 *
 * `origem` e `situacao` são independentes de propósito: "o que os
 * clientes ainda não responderam" é uma pergunta legítima, e obrigar a
 * escolher só um eixo faria o dono filtrar de cabeça.
 *
 * Valor desconhecido em qualquer um dos dois não filtra nada, em vez de
 * devolver lista vazia: sumir tudo por causa de um estado inesperado da
 * tela parece que os feedbacks foram apagados.
 *
 * @param {Array<object>} lista
 * @param {{origem?: 'equipe'|'cliente'|'todas', situacao?: 'abertos'|'resolvidos'|'todos'}} [filtro]
 * @returns {Array<object>}
 */
export function filtrarFeedbacks(lista, { origem = "todas", situacao = "todos" } = {}) {
  const todos = Array.isArray(lista) ? lista : [];
  return todos.filter((f) => {
    if (!f) return false;
    if ((origem === "equipe" || origem === "cliente") && f.origem !== origem) return false;
    if (situacao === "abertos" && f.resolvido) return false;
    if (situacao === "resolvidos" && !f.resolvido) return false;
    return true;
  });
}

/**
 * As contagens que vão DENTRO dos botões de filtro. O número no botão é o
 * que diz se vale a pena clicar: sem ele, o dono descobre que a aba está
 * vazia depois de trocar de aba.
 *
 * @param {Array<object>} lista
 * @returns {{total: number, equipe: number, cliente: number, abertos: number, resolvidos: number}}
 */
export function contarFeedbacks(lista) {
  const todos = (Array.isArray(lista) ? lista : []).filter(Boolean);
  return {
    total: todos.length,
    equipe: todos.filter((f) => f.origem === "equipe").length,
    cliente: todos.filter((f) => f.origem === "cliente").length,
    abertos: todos.filter((f) => !f.resolvido).length,
    resolvidos: todos.filter((f) => f.resolvido).length,
  };
}

/**
 * Quando o feedback chegou, na medida que importa aqui.
 *
 * Relato não é pedido na fila: ninguém precisa saber que ele tem 47
 * minutos. Precisa saber se é de hoje, de ontem, ou de duas semanas atrás
 * e continua aberto. Por isso a granularidade é de dias, e a partir de
 * uma semana vira data, que é como se fala de algo antigo.
 *
 * `agora` injetável para teste determinístico.
 *
 * @param {string} iso
 * @param {Date} [agora]
 * @returns {string} "" quando a data não dá para ler
 */
export function quandoChegou(iso, agora = new Date()) {
  if (!iso) return "";
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return "";
  const dias = Math.floor((agora.getTime() - t.getTime()) / 86400000);
  if (dias < 0) return "hoje";
  if (dias === 0) return "hoje";
  if (dias === 1) return "ontem";
  if (dias < 7) return `há ${dias} dias`;
  return t.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/**
 * Média das notas dos clientes e quantas avaliações somaram. Pura.
 * Devolve `media: null` sem avaliação — é diferente de zero, e a tela
 * precisa poder dizer "ainda não avaliaram" em vez de "nota 0".
 *
 * @param {Array<{nota?: number}>} feedbacks
 * @returns {{media: number|null, quantas: number}}
 */
export function mediaDasNotas(feedbacks) {
  const notas = (Array.isArray(feedbacks) ? feedbacks : [])
    .map((f) => Number(f?.nota))
    .filter((n) => Number.isFinite(n) && n >= 1 && n <= 5);
  if (notas.length === 0) return { media: null, quantas: 0 };
  return { media: notas.reduce((s, n) => s + n, 0) / notas.length, quantas: notas.length };
}
