import { supabase } from "./supabase";
import { emitirEvento } from "./jarvas";
import { baixarConta } from "./financeiro";
import { apenasDigitos, validarDocumento } from "./documento";
import { telefoneValido, apenasDigitosTelefone } from "./telefone";

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
 * Documento (CPF/CNPJ) é OPCIONAL — nome e telefone seguem sendo os
 * obrigatórios. Quando preenchido, valida pelos dígitos verificadores
 * conforme o tipo escolhido no toggle.
 *
 * @param {{ nome?: string, telefone?: string, documento?: string, documentoTipo?: 'cpf'|'cnpj' }} dados
 * @returns {{ valido: boolean, erro: string|null }}
 */
export function validarCadastroCliente(dados) {
  const nome = String(dados?.nome ?? "").trim();
  const telefone = String(dados?.telefone ?? "").trim();
  if (!nome) return { valido: false, erro: "Nome é obrigatório." };
  if (!telefone) return { valido: false, erro: "Telefone é obrigatório (contato mínimo para fiado/delivery)." };
  // Antes bastava não estar vazio: "123" era salvo calado, e o número só se
  // revelava inútil no dia em que alguém precisava ligar para o cliente.
  if (!telefoneValido(telefone))
    return { valido: false, erro: "Telefone inválido — informe DDD e número, ex: (11) 91234-5678." };

  const documento = apenasDigitos(dados?.documento);
  if (documento) {
    const tipo = dados?.documentoTipo === "cnpj" ? "cnpj" : "cpf";
    if (!validarDocumento(documento, tipo))
      return {
        valido: false,
        erro: tipo === "cnpj" ? "CNPJ inválido — confira os 14 dígitos." : "CPF inválido — confira os 11 dígitos.",
      };
  }
  return { valido: true, erro: null };
}

/**
 * Cadastra um cliente. Valida nome/telefone e checa duplicidade óbvia
 * por telefone antes de inserir (CLIENTES.md: "não permitir
 * duplicidade óbvia — sugerir mesclagem").
 *
 * @param {{ nome: string, telefone: string, documento?: string, documentoTipo?: 'cpf'|'cnpj', endereco?: string, observacoes?: string }} dados
 * @param {string} [usuario]
 * @returns {Promise<{data: object|null, error: (object & { clienteExistente?: object })|null}>}
 */
export async function cadastrarCliente(dados, usuario) {
  const { valido, erro } = validarCadastroCliente(dados);
  if (!valido) return { data: null, error: { message: erro } };

  const nome = String(dados.nome).trim();
  // Guarda só os dígitos: a checagem de duplicidade compara o telefone exato e
  // a busca casa por trecho — com máscara, "(11) 98888-7777" e "11988887777"
  // seriam dois clientes diferentes para o banco.
  const telefone = apenasDigitosTelefone(dados.telefone);
  // Guarda só os dígitos (sem máscara); o tipo só faz sentido com documento.
  const documento = apenasDigitos(dados.documento) || null;
  const documento_tipo = documento ? (dados.documentoTipo === "cnpj" ? "cnpj" : "cpf") : null;

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
    documento,
    documento_tipo,
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
 * @param {{ nome?: string, telefone?: string, documento?: string, documentoTipo?: 'cpf'|'cnpj', endereco?: string, observacoes?: string }} dados
 * @param {string} [usuario]
 * @returns {Promise<{data: object|null, error: object|null}>}
 */
export async function atualizarCliente(id, dados, usuario) {
  const payload = { updated_at: new Date().toISOString() };
  if (dados.nome != null) payload.nome = String(dados.nome).trim();
  if (dados.telefone != null) payload.telefone = apenasDigitosTelefone(dados.telefone);
  if (dados.documento !== undefined) {
    const doc = apenasDigitos(dados.documento) || null;
    payload.documento = doc;
    payload.documento_tipo = doc ? (dados.documentoTipo === "cnpj" ? "cnpj" : "cpf") : null;
  }
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
    .select("id, nome, telefone, documento, documento_tipo, endereco, observacoes, created_at")
    .eq("anonimizado", false)
    .order("nome");
  const termo = busca?.trim();
  if (termo) {
    const termoSanitizado = sanitizarTermoBusca(termo);
    const filtros = [`nome.ilike.%${termoSanitizado}%`, `telefone.ilike.%${termoSanitizado}%`];
    // O telefone é guardado só em dígitos. Quem digita a busca com máscara
    // ("(11) 98888-7777") não acharia ninguém — então, quando o termo é só
    // número/pontuação de telefone, procura também pelos dígitos puros.
    const digitos = apenasDigitosTelefone(termo);
    if (digitos && /^[\d\s()+.-]+$/.test(termo) && digitos !== termoSanitizado) {
      filtros.push(`telefone.ilike.%${digitos}%`);
    }
    query = query.or(filtros.join(","));
  }

  const { data, error } = await query;
  return { data, error };
}

/**
 * Busca um cliente pelo id, com os campos necessários para o checkout
 * (documento/tipo p/ pré-preencher o CPF na nota). Usado ao vincular um
 * cliente à comanda: o PDV guarda só id+nome em `pending`, o restante é
 * lido aqui sob demanda. Retorna `{ data: null }` quando o id é vazio.
 *
 * @param {string} id
 * @returns {Promise<{data: object|null, error: object|null}>}
 */
export async function buscarClientePorId(id) {
  if (!id) return { data: null, error: null };
  const { data, error } = await supabase
    .from("clientes")
    .select("id, nome, telefone, documento, documento_tipo, endereco, observacoes, created_at")
    .eq("id", id)
    .eq("anonimizado", false)
    .maybeSingle();
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
 * Exclui um cliente — que, pela regra do módulo, é **anonimização**:
 * "Exclusão de cliente com histórico é anonimização (preserva
 * integridade de vendas/lançamentos), não remoção física"
 * (CLIENTES.md, Exceções). É também o caminho de remoção de dados
 * pessoais por LGPD.
 *
 * Na prática: apaga os dados pessoais da linha e marca `anonimizado`.
 * Todas as leituras deste módulo já filtram `anonimizado = false`, então
 * o cliente some das listas na hora, enquanto `vendas.cliente_id` e
 * `lancamentos.cliente_id` continuam apontando para uma linha existente —
 * nenhum histórico financeiro se perde.
 *
 * @param {string} id
 * @param {string} [usuario]
 * @returns {Promise<{data: object|null, error: object|null}>}
 */
export async function anonimizarCliente(id, usuario) {
  if (!id) return { data: null, error: { message: "Cliente inválido." } };

  const payload = {
    anonimizado: true,
    // Anonimizar é apagar o dado pessoal, não só escondê-lo: o nome vira
    // um rótulo neutro e o resto sai do banco.
    nome: "Cliente removido",
    telefone: null,
    documento: null,
    documento_tipo: null,
    endereco: null,
    observacoes: null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("clientes")
    .update(payload)
    .eq("id", id)
    .select("id, anonimizado")
    .single();
  if (!error) emitirEvento("cliente.anonimizado", "clientes", { cliente_id: id }, usuario);
  return { data, error };
}

/**
 * Registra no log que alguém ABRIU o documento (CPF) de um cliente na tela.
 *
 * O log de cliente só guardava alteração (criado/atualizado/anonimizado) —
 * ver um dado pessoal não deixava rastro nenhum. Pela LGPD, o acesso a dado
 * sensível também precisa ser auditável: sem isso, não há como responder
 * "quem viu o CPF deste cliente?".
 *
 * Grava apenas o `cliente_id` e quem abriu: o documento em si NUNCA vai para
 * o log. É fire-and-forget como todo evento do Jarvas — se o registro falhar,
 * a tela do operador não pode travar por causa disso.
 *
 * @param {string} clienteId
 * @param {string} [usuario]
 * @returns {void}
 */
export function registrarAcessoDocumento(clienteId, usuario) {
  if (!clienteId) return;
  emitirEvento("cliente.documento_visualizado", "clientes", { cliente_id: clienteId }, usuario);
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
 * Sanitiza um termo de busca removendo caracteres com significado especial
 * no filtro PostgREST (.or, .ilike) para prevenir manipulação de query.
 *
 * Remove: vírgula (,), parênteses ( ), aspas ("), backslash (\),
 * e wildcards de ilike (*, %). Mantém letras, números, espaço e acentos.
 *
 * @param {string} termo
 * @returns {string}
 */
export function sanitizarTermoBusca(termo) {
  if (!termo) return "";
  // Remove caracteres perigosos no PostgREST: , ( ) " \ * %
  return String(termo).replace(/[,()"\\\*%]/g, " ").trim();
}

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
