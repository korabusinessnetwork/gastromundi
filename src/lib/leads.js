import { supabase } from "./supabase";

/**
 * Leads do site institucional (apex kora.codes).
 *
 * Quem preenche o formulário de "Agendar demonstração" ainda NÃO é um
 * estabelecimento — é a plataforma vendendo (decisão 017). Por isso o
 * lead não tem tenant_id e a escrita não passa por nenhuma tabela do
 * app: a única porta é a RPC `registrar_lead_apex`, que roda como
 * SECURITY DEFINER, valida de novo no banco e tem freio de abuso
 * (mesmo desenho do delivery público).
 *
 * Requer a migração supabase/migrations/20260925_leads_apex.sql
 * aplicada — sem ela a RPC não existe e o envio falha na tela.
 */

// Mesma divisão do domínio em pedaços entre pontos usada no formulário:
// a forma `[^\s@]+\.[^\s@]+` dá ao motor vários jeitos de dividir o mesmo
// texto e trava o campo em e-mail longo e ainda incompleto.
const EMAIL_REGEX = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

/**
 * Valida os dados do lead. Pura e síncrona de propósito: a tela usa a
 * mesma função para mostrar o erro embaixo do campo, sem ida ao banco.
 *
 * Devolve erro POR CAMPO — quem preencheu três campos e errou dois
 * precisa ver os dois de uma vez, não descobrir um por vez.
 *
 * @param {{ nome?: string, whatsapp?: string, email?: string }} dados
 * @returns {{ valido: boolean, erros: Record<string, string> }}
 */
export function validarLead(dados) {
  const erros = {};

  const nome = String(dados?.nome ?? "").trim();
  if (nome.length < 2) erros.nome = "Diga como podemos te chamar.";
  else if (nome.length > 120) erros.nome = "Nome muito longo.";

  const digitos = String(dados?.whatsapp ?? "").replace(/\D/g, "");
  if (digitos.length < 10 || digitos.length > 11)
    erros.whatsapp = "Informe um WhatsApp com DDD.";

  const email = String(dados?.email ?? "").trim();
  if (!EMAIL_REGEX.test(email) || email.length > 160)
    erros.email = "Confira o e-mail digitado.";

  return { valido: Object.keys(erros).length === 0, erros };
}

// Mensagens por código devolvido pela RPC. O visitante não lê "erro
// 23514": ele precisa saber o que fazer agora.
const MENSAGENS = {
  nome_invalido: "Confira o nome digitado.",
  whatsapp_invalido: "Confira o WhatsApp digitado.",
  email_invalido: "Confira o e-mail digitado.",
  muitas_tentativas:
    "Recebemos seu contato há pouco. Aguarde alguns minutos para enviar de novo.",
};

const ERRO_GENERICO =
  "Não conseguimos enviar agora. Tente de novo em alguns instantes.";

/**
 * Registra o lead. Nunca lança: devolve `{ ok, erro }` para a tela
 * decidir o que mostrar.
 *
 * @param {{ nome: string, whatsapp: string, email: string,
 *           total?: number|null, itens?: string[] }} dados
 * @returns {Promise<{ ok: boolean, erro: string|null }>}
 */
export async function registrarLeadApex(dados) {
  const { valido, erros } = validarLead(dados);
  if (!valido) return { ok: false, erro: Object.values(erros)[0] };

  try {
    const { data, error } = await supabase.rpc("registrar_lead_apex", {
      p_nome: String(dados.nome).trim(),
      p_whatsapp: String(dados.whatsapp).replace(/\D/g, ""),
      p_email: String(dados.email).trim().toLowerCase(),
      p_total: Number.isFinite(dados?.total) ? dados.total : null,
      p_itens: Array.isArray(dados?.itens) ? dados.itens : null,
    });

    if (error) return { ok: false, erro: ERRO_GENERICO };
    if (data?.ok) return { ok: true, erro: null };
    return { ok: false, erro: MENSAGENS[data?.erro] || ERRO_GENERICO };
  } catch {
    // Rede caiu, timeout, CORS: o visitante não tem o que fazer com o
    // detalhe técnico, e o detalhe não vai para o console (pode conter
    // o que ele digitou).
    return { ok: false, erro: ERRO_GENERICO };
  }
}
