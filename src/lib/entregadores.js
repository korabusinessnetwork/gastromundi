// ──────────────────────────────────────────────────────────────────
// entregadores — cadastro de motoboys/entregadores + fechamento do dia.
//
// O dono cadastra seus entregadores (nome, telefone, valor por entrega) e,
// no painel de pedidos, atribui um entregador a cada pedido de delivery.
// Ao atribuir, o valor por entrega do entregador é FOTOGRAFADO em
// delivery_pedidos.valor_entregador — o fechamento histórico não muda se o
// dono reajustar o valor depois, e o operador pode ajustar por pedido
// (corrida mais longa vale mais) sem afetar os outros.
//
// Duas leituras derivam disso:
//   • acompanhamento — quantos pedidos cada entregador tem em rota agora;
//   • fechamento do dia — quanto pagar a cada entregador pelas entregas
//     CONFIRMADAS (status 'entregue') no período.
//
// Puras (validação, sanitização, fechamento — dinheiro/regra) nascem com
// teste: entregadores.test.js. Nunca faz select * (CLAUDE.md): campos
// explícitos. Admin lê/escreve direto; a RLS RESTRICTIVE isola o tenant.
// tenant_id tem DEFAULT public.tenant_atual_id() (migration 20260919) —
// os inserts não precisam passá-lo.
// ──────────────────────────────────────────────────────────────────
import { supabase } from "./supabase";

// ════════════════════════════════════════════════════════════════
// FUNÇÕES PURAS (testadas) — nada de I/O aqui
// ════════════════════════════════════════════════════════════════

/**
 * Nome de entregador é aceitável? (prevenção de erro > mensagem de erro,
 * Princípio nº 1: habilita o Salvar só quando dá pra salvar). Exige ao
 * menos 2 caracteres não-espaço.
 * @param {*} nome
 * @returns {boolean}
 */
export function nomeEntregadorValido(nome) {
  return typeof nome === "string" && nome.trim().length >= 2;
}

/**
 * Normaliza um valor de dinheiro vindo da UI: número finito e não-negativo,
 * ou 0. Aceita string ("12,50" ou "12.50") e número. Nunca lança.
 * @param {*} valor
 * @returns {number}
 */
export function sanitizarValorEntrega(valor) {
  if (typeof valor === "number") {
    return Number.isFinite(valor) && valor > 0 ? valor : 0;
  }
  if (typeof valor === "string") {
    const n = Number(valor.trim().replace(",", "."));
    return Number.isFinite(n) && n > 0 ? n : 0;
  }
  return 0;
}

/**
 * Sanitiza o objeto de entregador vindo do formulário para o insert/update:
 * apara textos, normaliza o valor. Não decide validade (isso é
 * nomeEntregadorValido) — só limpa. `ativo` só entra quando informado.
 * @param {*} bruto
 * @returns {{nome:string, telefone:string|null, valor_por_entrega:number, ativo?:boolean}}
 */
export function sanitizarEntregador(bruto) {
  const b = bruto && typeof bruto === "object" ? bruto : {};
  const nome = typeof b.nome === "string" ? b.nome.trim() : "";
  const telBruto = typeof b.telefone === "string" ? b.telefone.trim() : "";
  const saida = {
    nome,
    telefone: telBruto || null,
    valor_por_entrega: sanitizarValorEntrega(b.valor_por_entrega),
  };
  if (typeof b.ativo === "boolean") saida.ativo = b.ativo;
  return saida;
}

/**
 * Só os entregadores ativos, ordenados por nome (pt-BR) — para o seletor de
 * atribuição no pedido. Safe com entradas nulas/estranhas.
 * @param {Array} lista
 * @returns {Array}
 */
export function entregadoresAtivos(lista) {
  return (Array.isArray(lista) ? lista : [])
    .filter((e) => e && e.ativo !== false)
    .sort((a, b) => String(a.nome ?? "").localeCompare(String(b.nome ?? ""), "pt-BR"));
}

/**
 * Valor a fotografar no pedido ao atribuir este entregador (o padrão dele).
 * @param {*} entregador
 * @returns {number}
 */
export function valorPadraoParaPedido(entregador) {
  return sanitizarValorEntrega(entregador?.valor_por_entrega);
}

/**
 * Filtra pedidos cujo created_at cai no intervalo [inicio, fim]. Limites
 * opcionais (null = sem limite naquele lado). Aceita Date, ISO string ou ms.
 * Pedido sem created_at válido fica de fora quando há algum limite.
 * @param {Array} pedidos
 * @param {Date|string|number|null} inicio
 * @param {Date|string|number|null} fim
 * @returns {Array}
 */
export function filtrarPedidosPorPeriodo(pedidos, inicio = null, fim = null) {
  const lista = Array.isArray(pedidos) ? pedidos : [];
  const ini = inicio == null ? null : new Date(inicio).getTime();
  const f = fim == null ? null : new Date(fim).getTime();
  const semLimite = ini == null && f == null;
  return lista.filter((p) => {
    if (!p) return false;
    if (semLimite) return true;
    const t = new Date(p.created_at).getTime();
    if (Number.isNaN(t)) return false;
    if (ini != null && t < ini) return false;
    if (f != null && t > f) return false;
    return true;
  });
}

/**
 * Fechamento por entregador: para cada entregador com pedido atribuído no
 * conjunto, quantas entregas confirmadas, quantas em rota, e quanto pagar.
 *
 *   • entregues  — pedidos status 'entregue' (base do pagamento);
 *   • emRota     — pedidos status 'saiu_entrega' (ainda na rua, não pagos);
 *   • totalPagar — soma de valor_entregador SÓ das entregas confirmadas
 *                  (nunca paga por corrida não concluída — dinheiro).
 *
 * Pedidos sem entregador atribuído são ignorados. Entregador que já foi
 * removido (id no pedido, mas fora da lista) aparece como "Entregador
 * removido" para o histórico não sumir.
 *
 * @param {Array} pedidos
 * @param {Array} entregadores  lista para resolver nome por id
 * @returns {{linhas:Array<{entregador_id:string, nome:string, entregues:number, emRota:number, totalPagar:number}>, totalGeral:number, totalEntregues:number, totalEmRota:number}}
 */
export function calcularFechamento(pedidos, entregadores = []) {
  const lista = Array.isArray(pedidos) ? pedidos : [];
  const nomePorId = new Map(
    (Array.isArray(entregadores) ? entregadores : [])
      .filter((e) => e && e.id != null)
      .map((e) => [String(e.id), String(e.nome ?? "").trim()])
  );
  const porEntregador = new Map();
  const garantir = (id) => {
    const chave = String(id);
    if (!porEntregador.has(chave)) {
      porEntregador.set(chave, {
        entregador_id: chave,
        nome: nomePorId.get(chave) || "Entregador removido",
        entregues: 0,
        emRota: 0,
        totalPagar: 0,
      });
    }
    return porEntregador.get(chave);
  };
  for (const p of lista) {
    if (!p || p.entregador_id == null) continue; // não atribuído: fora do fechamento
    const linha = garantir(p.entregador_id);
    if (p.status === "entregue") {
      linha.entregues += 1;
      linha.totalPagar += sanitizarValorEntrega(p.valor_entregador);
    } else if (p.status === "saiu_entrega") {
      linha.emRota += 1;
    }
  }
  const linhas = [...porEntregador.values()].sort((a, b) =>
    a.nome.localeCompare(b.nome, "pt-BR")
  );
  return {
    linhas,
    totalGeral: linhas.reduce((s, l) => s + l.totalPagar, 0),
    totalEntregues: linhas.reduce((s, l) => s + l.entregues, 0),
    totalEmRota: linhas.reduce((s, l) => s + l.emRota, 0),
  };
}

// ════════════════════════════════════════════════════════════════
// I/O (Supabase) — admin autenticado; RLS RESTRICTIVE isola o tenant
// ════════════════════════════════════════════════════════════════

// Campos explícitos (nunca select * — CLAUDE.md).
const CAMPOS_ENTREGADOR = "id,nome,telefone,ativo,valor_por_entrega,created_at,updated_at";

/**
 * Lista os entregadores do tenant (por nome). `apenasAtivos` filtra os
 * desativados. Nunca lança: erro vira { data: [], error }.
 * @param {{apenasAtivos?:boolean}} [opcoes]
 */
export async function listarEntregadores({ apenasAtivos = false } = {}) {
  try {
    let query = supabase
      .from("delivery_entregadores")
      .select(CAMPOS_ENTREGADOR)
      .order("nome", { ascending: true });
    if (apenasAtivos) query = query.eq("ativo", true);
    const { data, error } = await query;
    if (error) return { data: [], error };
    return { data: data ?? [], error: null };
  } catch (error) {
    return { data: [], error };
  }
}

/**
 * Cria um entregador. Valida o nome (prevenção de erro). tenant_id entra
 * pelo DEFAULT tenant_atual_id(). Nunca lança.
 * @param {{nome:string, telefone?:string, valor_por_entrega?:number|string, ativo?:boolean}} bruto
 */
export async function criarEntregador(bruto) {
  const dados = sanitizarEntregador(bruto);
  if (!nomeEntregadorValido(dados.nome)) {
    return { data: null, error: new Error("Informe o nome do entregador.") };
  }
  try {
    const { data, error } = await supabase
      .from("delivery_entregadores")
      .insert(dados)
      .select(CAMPOS_ENTREGADOR)
      .maybeSingle();
    if (error) return { data: null, error };
    return { data, error: null };
  } catch (error) {
    return { data: null, error };
  }
}

/**
 * Atualiza dados de um entregador (nome/telefone/valor). Sanitiza e valida
 * o nome. Toca updated_at. Nunca lança.
 * @param {string} id
 * @param {{nome?:string, telefone?:string, valor_por_entrega?:number|string}} patch
 */
export async function atualizarEntregador(id, patch) {
  if (!id) return { data: null, error: new Error("Entregador ausente.") };
  const dados = sanitizarEntregador(patch);
  if (!nomeEntregadorValido(dados.nome)) {
    return { data: null, error: new Error("Informe o nome do entregador.") };
  }
  try {
    const { data, error } = await supabase
      .from("delivery_entregadores")
      .update({
        nome: dados.nome,
        telefone: dados.telefone,
        valor_por_entrega: dados.valor_por_entrega,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select(CAMPOS_ENTREGADOR)
      .maybeSingle();
    if (error) return { data: null, error };
    if (!data) {
      return {
        data: null,
        error: new Error("Não foi possível atualizar (não encontrado ou sem permissão)."),
      };
    }
    return { data, error: null };
  } catch (error) {
    return { data: null, error };
  }
}

/**
 * Ativa/desativa um entregador (não apaga — preserva histórico e fechamento).
 * @param {string} id
 * @param {boolean} ativo
 */
export async function definirAtivoEntregador(id, ativo) {
  if (!id) return { data: null, error: new Error("Entregador ausente.") };
  try {
    const { data, error } = await supabase
      .from("delivery_entregadores")
      .update({ ativo: !!ativo, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select(CAMPOS_ENTREGADOR)
      .maybeSingle();
    if (error) return { data: null, error };
    if (!data) {
      return {
        data: null,
        error: new Error("Não foi possível atualizar (não encontrado ou sem permissão)."),
      };
    }
    return { data, error: null };
  } catch (error) {
    return { data: null, error };
  }
}

/**
 * Atribui (ou desatribui) um entregador a um pedido, fotografando o valor da
 * corrida em delivery_pedidos.valor_entregador. `entregadorId` nulo limpa a
 * atribuição (e o valor). `valor` opcional sobrescreve o valor fotografado
 * (ex.: corrida mais longa); ausente, mantém o que veio ou 0. Nunca lança.
 * @param {string} pedidoId
 * @param {string|null} entregadorId
 * @param {number|string|null} [valor]
 */
export async function atribuirEntregadorPedido(pedidoId, entregadorId, valor = null) {
  if (!pedidoId) return { data: null, error: new Error("Pedido ausente.") };
  const patch = entregadorId
    ? { entregador_id: entregadorId, valor_entregador: sanitizarValorEntrega(valor) }
    : { entregador_id: null, valor_entregador: null };
  patch.updated_at = new Date().toISOString();
  try {
    const { data, error } = await supabase
      .from("delivery_pedidos")
      .update(patch)
      .eq("id", pedidoId)
      .select("id,entregador_id,valor_entregador,status,updated_at")
      .maybeSingle();
    if (error) return { data: null, error };
    if (!data) {
      return {
        data: null,
        error: new Error("Não foi possível atribuir (pedido não encontrado ou sem permissão)."),
      };
    }
    return { data, error: null };
  } catch (error) {
    return { data: null, error };
  }
}
