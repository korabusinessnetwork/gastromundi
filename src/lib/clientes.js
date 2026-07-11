import { supabase } from "./supabase";
import { emitirEvento } from "./jarvas";
import { baixarConta } from "./financeiro";

/**
 * Clientes — F010 (docs/03_REGRAS_DE_NEGOCIO/CLIENTES.md).
 *
 * Cadastro, histórico de compras e fiado. O fiado JÁ é um lançamento
 * do Financeiro (public.lancamentos, origem='venda' — ver
 * src/lib/financeiro.js) — este módulo só filtra/soma por cliente e
 * reaproveita `baixarConta` para a baixa, sem criar um segundo
 * sistema de fiado.
 *
 * Requer a migração supabase/migrations/20260713_clientes.sql aplicada.
 */

/**
 * Valida os dados de cadastro rápido antes de chamar o Supabase —
 * exposta separadamente para uso síncrono em formulários (ex.:
 * desabilitar o botão salvar sem round-trip ao banco).
 *
 * @param {{ nome?: string, telefone?: string }} dados
 * @returns {{ valido: boolean, erro: string|null }}
 */
export function validarCadastroCliente(dados) {
  const nome = String(dados?.nome ?? "").trim();
  const telefone = String(dados?.telefone ?? "").trim();
  if (!nome) return { valido: false, erro: "Nome é obrigatório." };
  if (!telefone) return { valido: false, erro: "Telefone é obrigatório (contato mínimo para fiado/delivery)." };
  return { valido: true, erro: null };
}

/**
 * Cadastra um cliente. Valida nome/telefone e checa duplicidade óbvia
 * por telefone antes de inserir (CLIENTES.md: "não permitir
 * duplicidade óbvia — sugerir mesclagem").
 *
 * @param {{ nome: string, telefone: string, endereco?: string, observacoes?: string }} dados
 * @param {string} [usuario]
 * @returns {Promise<{data: object|null, error: (object & { clienteExistente?: object })|null}>}
 */
export async function cadastrarCliente(dados, usuario) {
  const { valido, erro } = validarCadastroCliente(dados);
  if (!valido) return { data: null, error: { message: erro } };

  const nome = String(dados.nome).trim();
  const telefone = String(dados.telefone).trim();

  const { data: existentes, error: eBusca } = await supabase
    .from("clientes")
    .select("id, nome, telefone")
    .eq("telefone", telefone)
    .eq("anonimizado", false)
    .limit(1);
  if (eBusca) return { data: null, error: eBusca };
  if (existentes?.length > 0) {
    return {
      data: null,
      error: { message: `Já existe um cliente com esse telefone: ${existentes[0].nome}.`, clienteExistente: existentes[0] },
    };
  }

  const payload = {
    nome,
    telefone,
    endereco: dados.endereco?.trim() || null,
    observacoes: dados.observacoes?.trim() || null,
    criado_por: usuario ?? null,
  };

  const { data, error } = await supabase.from("clientes").insert(payload).select().single();
  if (!error) {
    emitirEvento("cliente.criado", "clientes", { cliente_id: data?.id, nome }, usuario);
  }
  return { data, error };
}

/**
 * Atualiza campos de um cliente já cadastrado.
 *
 * @param {string} id
 * @param {{ nome?: string, telefone?: string, endereco?: string, observacoes?: string }} dados
 * @param {string} [usuario]
 * @returns {Promise<{data: object|null, error: object|null}>}
 */
export async function atualizarCliente(id, dados, usuario) {
  const payload = { updated_at: new Date().toISOString() };
  if (dados.nome != null) payload.nome = String(dados.nome).trim();
  if (dados.telefone != null) payload.telefone = String(dados.telefone).trim();
  if (dados.endereco !== undefined) payload.endereco = dados.endereco?.trim() || null;
  if (dados.observacoes !== undefined) payload.observacoes = dados.observacoes?.trim() || null;

  const { data, error } = await supabase.from("clientes").update(payload).eq("id", id).select().single();
  if (!error) emitirEvento("cliente.atualizado", "clientes", { cliente_id: id }, usuario);
  return { data, error };
}

/**
 * Lista clientes ativos (não anonimizados), com busca opcional por
 * nome ou telefone.
 *
 * @param {{ busca?: string }} [opts]
 * @returns {Promise<{data: object[]|null, error: object|null}>}
 */
export async function listarClientes({ busca } = {}) {
  let query = supabase
    .from("clientes")
    .select("id, nome, telefone, endereco, observacoes, created_at")
    .eq("anonimizado", false)
    .order("nome");
  const termo = busca?.trim();
  if (termo) query = query.or(`nome.ilike.%${termo}%,telefone.ilike.%${termo}%`);

  const { data, error } = await query;
  return { data, error };
}

/**
 * Histórico do cliente: vendas anteriores + lançamentos de fiado
 * (Financeiro), buscados em paralelo com campos explícitos.
 *
 * @param {string} clienteId
 * @returns {Promise<{ vendas: object[], lancamentosFiado: object[], error: object|null }>}
 */
export async function buscarHistoricoCliente(clienteId) {
  const [vendasRes, lancamentosRes] = await Promise.all([
    supabase
      .from("vendas")
      .select("id, comanda, total, at")
      .eq("cliente_id", clienteId)
      .order("at", { ascending: false })
      .limit(200),
    supabase
      .from("lancamentos")
      .select("id, valor, status, competencia, vencimento, descricao, created_at")
      .eq("cliente_id", clienteId)
      .eq("tipo", "receita")
      .order("competencia", { ascending: false })
      .limit(200),
  ]);

  return {
    vendas: vendasRes.data ?? [],
    lancamentosFiado: lancamentosRes.data ?? [],
    error: vendasRes.error ?? lancamentosRes.error ?? null,
  };
}

/**
 * Registra o pagamento de uma conta de fiado do cliente — reaproveita
 * `baixarConta` do Financeiro (não duplica a lógica de baixa).
 *
 * @param {string} lancamentoId
 * @param {string} [usuario]
 * @returns {Promise<{data: object|null, error: object|null}>}
 */
export async function registrarPagamentoFiado(lancamentoId, usuario) {
  return baixarConta(lancamentoId, usuario);
}

// ── Funções puras (testadas em clientes.test.js) ────────────────────

/**
 * Saldo devedor do cliente: soma dos lançamentos de fiado ainda não
 * quitados (previsto ou vencido). Contas já pagas/recebidas não contam.
 *
 * @param {object[]} lancamentosFiado
 * @returns {number}
 */
export function calcularSaldoDevedor(lancamentosFiado) {
  return (lancamentosFiado ?? [])
    .filter((l) => l.status === "previsto" || l.status === "vencido")
    .reduce((s, l) => s + (Number(l.valor) || 0), 0);
}
