import { supabase } from "@/lib/supabase";

// Mensagem de primeiro acesso e a fila de pedidos de conta feitos no site.
/**
 * Função PURA — monta a mensagem de primeiro acesso que o dono entrega ao
 * cliente no minuto seguinte à venda (CONSOLE-UX 11).
 *
 * A senha NÃO entra aqui de propósito: ela foi digitada pelo dono no
 * cadastro e não é relida de lugar nenhum. Área de transferência e
 * histórico de conversa não são lugar de senha — a mensagem pede para
 * mandá-la por outro canal.
 *
 * Nada de marca da plataforma no texto (decisão 017): a mensagem fala do
 * estabelecimento criado, não de quem vende o sistema.
 *
 * Campo ausente some da mensagem em vez de virar "undefined" ou linha
 * vazia — meia informação correta vale mais do que linha quebrada.
 *
 * @param {{estabelecimento?:string, plano?:string, endereco?:string, usuario?:string}} dados
 * @returns {string} mensagem pronta para colar no WhatsApp/e-mail
 */
export function montarMensagemPrimeiroAcesso(dados = {}) {
  const limpo = (v) => (typeof v === "string" ? v.trim() : "");
  const estabelecimento = limpo(dados?.estabelecimento);
  const plano = limpo(dados?.plano);
  const endereco = limpo(dados?.endereco);
  const usuario = limpo(dados?.usuario);

  const cabecalho = [
    estabelecimento ? `Acesso do ${estabelecimento}` : "Acesso ao sistema",
    plano ? `Plano: ${plano}` : null,
  ].filter(Boolean);

  const acesso = [
    endereco ? `Endereço: ${endereco}` : null,
    usuario ? `Usuário: ${usuario}` : null,
  ].filter(Boolean);

  const senha = [
    "Senha: a que foi definida no cadastro.",
    "Por segurança, envie a senha em uma mensagem separada desta.",
  ];

  return [cabecalho, acesso, senha]
    .filter((bloco) => bloco.length > 0)
    .map((bloco) => bloco.join("\n"))
    .join("\n\n");
}

/**
 * Fila de solicitações de conta feitas no site institucional
 * (20260926). Leitura cross-tenant do Console: a policy
 * `solicitacoes_conta_leitura_plataforma` só devolve linhas para
 * `is_super_admin()`, então um token de estabelecimento vê zero.
 * Campos explícitos (nunca `select *` em tabela com dado pessoal).
 *
 * Nunca lança: falha de rede/RLS volta como { data: [], error } para o
 * chamador tratar o estado de erro na UI.
 *
 * @returns {Promise<{data: Array<object>, error: object|null}>}
 */
export async function listarSolicitacoes() {
  try {
    const { data, error } = await supabase
      .from("solicitacoes_conta")
      .select(
        "id, nome, whatsapp, email, estabelecimento, slug_desejado, plano_codigo, plano_nome, plano_itens, plano_total, status, tenant_id, observacao, criado_em, decidido_em"
      )
      .order("criado_em", { ascending: false });
    if (error) return { data: [], error };
    return { data: data ?? [], error: null };
  } catch (err) {
    return { data: [], error: { message: err?.message ?? "Falha ao listar as solicitações." } };
  }
}

/**
 * Aprova (vinculando o estabelecimento criado) ou recusa uma solicitação.
 * A autorização é do BANCO: a RPC `decidir_solicitacao_conta` exige
 * `is_super_admin()` antes de qualquer escrita — o front aqui é só a casca.
 *
 * Aprovar sem `tenantId` é recusado pelo próprio banco: sair de "pendente"
 * sem que nada tenha sido criado seria mentir na fila.
 *
 * @param {string} id id da solicitação
 * @param {"aprovada"|"recusada"} status decisão
 * @param {{tenantId?: string|null, observacao?: string|null}} [opcoes]
 * @returns {Promise<{data: object|null, error: object|null}>}
 */
export async function decidirSolicitacao(id, status, opcoes = {}) {
  try {
    const { data, error } = await supabase.rpc("decidir_solicitacao_conta", {
      p_id: id,
      p_status: status,
      p_tenant_id: opcoes?.tenantId ?? null,
      p_observacao: opcoes?.observacao ?? null,
    });
    if (error) return { data: null, error };
    return { data: data ?? null, error: null };
  } catch (err) {
    return { data: null, error: { message: err?.message ?? "Falha ao registrar a decisão." } };
  }
}

/**
 * Só as solicitações que ainda esperam decisão — é o que a aba do Console
 * mostra por padrão, e o número que vai no selo ao lado do nome da aba.
 * Função pura (a lista já veio do banco): ordena da mais antiga para a mais
 * nova, porque quem pediu primeiro é quem está esperando há mais tempo.
 *
 * @param {Array<{status?: string, criado_em?: string}>} solicitacoes
 * @returns {Array<object>}
 */
export function pendentesPrimeiro(solicitacoes = []) {
  return (solicitacoes ?? [])
    .filter((s) => s?.status === "pendente")
    .slice()
    .sort((a, b) => String(a?.criado_em ?? "").localeCompare(String(b?.criado_em ?? "")));
}

/**
 * Texto do plano que a pessoa montou no site, para o card da fila. O nome do
 * preset quando existe; senão a lista de módulos escolhidos; senão o aviso de
 * que ela não escolheu nada — nunca uma linha vazia que o dono lê como erro.
 *
 * @param {{plano_nome?: string|null, plano_itens?: string[]|null}} s
 * @returns {string}
 */
export function resumirPlanoSolicitado(s = {}) {
  const nome = typeof s?.plano_nome === "string" ? s.plano_nome.trim() : "";
  if (nome) return nome;
  const itens = (s?.plano_itens ?? []).filter((i) => typeof i === "string" && i.trim());
  if (itens.length > 0) return itens.join(", ");
  return "Não escolheu plano no site";
}
