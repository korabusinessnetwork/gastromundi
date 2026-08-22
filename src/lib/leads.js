import { supabase } from "./supabase";

/**
 * Leads da landing (apex) — captura pública e leitura pelo Console.
 *
 * A landing coleta nome, WhatsApp e e-mail de quem pede demonstração.
 * Isso é DADO PESSOAL de terceiro, então o caminho é estreito de
 * propósito (migração 20260920_leads.sql):
 *
 *   - quem grava é a RPC `registrar_lead` (SECURITY DEFINER, GRANT a
 *     anon) — a chave pública não tem permissão na tabela;
 *   - quem lê é só o Console (`is_super_admin()` na policy de SELECT);
 *   - sem aceite marcado no formulário o banco RECUSA a gravação.
 *
 * Nada aqui lança: erro de rede ou de validação volta como `{ error }`
 * para a tela decidir o que dizer — mesmo contrato do resto de `lib/`.
 */

// Rótulo interno de onde o lead entrou. Existe porque o segundo
// formulário sempre chega (hoje só o construtor de plano do apex).
export const ORIGEM_PADRAO = "apex_planos";

export function somenteDigitos(valor) {
  return String(valor ?? "").replace(/\D/g, "");
}

// Máscara de telefone BR: (##) #####-#### — só formata, sem validar.
export function mascararWhatsapp(valor) {
  const d = somenteDigitos(valor).slice(0, 11);
  // Sem dígito nenhum o campo volta a ficar VAZIO. Se devolvesse "(", o
  // parêntese ficava preso na tela: apagar tudo não apagava, e o
  // placeholder nunca voltava.
  if (!d) return "";
  if (d.length <= 2) return d.replace(/^(\d{0,2})/, "($1");
  if (d.length <= 6) return d.replace(/^(\d{2})(\d{0,4})/, "($1) $2");
  if (d.length <= 10) return d.replace(/^(\d{2})(\d{4})(\d{0,4})/, "($1) $2-$3");
  return d.replace(/^(\d{2})(\d{5})(\d{0,4})/, "($1) $2-$3");
}

// O domínio é lido em pedaços separados por ponto (`[^\s@.]+` entre
// pontos), e não como `[^\s@]+\.[^\s@]+`: naquela forma o ponto cabia
// dentro das duas partes e o motor tinha vários jeitos de dividir o
// mesmo texto, tentando todos antes de desistir — digitar um e-mail
// longo e ainda incompleto travava o campo. Aqui a divisão é única e o
// teste é linear. A MESMA forma está no CHECK da tabela.
const EMAIL_REGEX = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

/**
 * Valida o que o formulário coletou. Função pura: devolve os erros por
 * campo, na linguagem que aparece na tela (Princípio nº1 — a mensagem
 * diz o que corrigir, não o que falhou).
 *
 * Espelha o que a RPC valida no servidor. Os dois existem: aqui é para
 * a pessoa não errar; lá é porque o front nunca é a fronteira.
 */
export function validarLead({ nome, whatsapp, email, consentimento } = {}) {
  const erros = {};

  if (String(nome ?? "").trim().length < 2)
    erros.nome = "Diga como podemos te chamar.";

  const digitos = somenteDigitos(whatsapp);
  if (digitos.length < 10 || digitos.length > 11)
    erros.whatsapp = "Informe um WhatsApp com DDD.";

  if (!EMAIL_REGEX.test(String(email ?? "").trim()))
    erros.email = "Confira o e-mail digitado.";

  if (consentimento !== true)
    erros.consentimento = "Precisamos do seu aceite para guardar o contato.";

  return { ok: Object.keys(erros).length === 0, erros };
}

/**
 * Texto pronto para o WhatsApp, com o plano que a pessoa montou.
 *
 * É a ponte gratuita enquanto não existe e-mail transacional: se a
 * gravação falhar (ou se a pessoa preferir falar agora), ela sai daqui
 * com a conversa já escrita, em vez de sair sem nada.
 */
export function mensagemDeContatoDoLead({ nome, plano } = {}) {
  const primeiro = String(nome ?? "").trim().split(/\s+/)[0] || "";
  const partes = [
    primeiro
      ? `Oi! Aqui é ${primeiro}, quero agendar a demonstração do KORA.`
      : "Oi! Quero agendar a demonstração do KORA.",
  ];

  const modulos = (plano?.modulos ?? []).map((m) => m.nome).filter(Boolean);
  const addons = (plano?.addons ?? []).map((a) => a.nome).filter(Boolean);

  if (modulos.length) partes.push(`Módulos: ${modulos.join(", ")}.`);
  if (addons.length) partes.push(`Adicionais: ${addons.join(", ")}.`);
  if (Number.isFinite(plano?.total))
    partes.push(`Plano montado no site: R$ ${plano.total.toLocaleString("pt-BR")}/mês.`);

  return partes.join(" ");
}

/**
 * Monta o link de conversa já com o texto. Devolve `null` quando não há
 * número comercial configurado (`VITE_CONTATO_URL` vazio) — a tela usa
 * isso para simplesmente não oferecer um botão que não leva a lugar
 * nenhum, em vez de mostrar um link quebrado.
 */
export function montarLinkWhatsapp(contatoUrl, texto) {
  const base = String(contatoUrl ?? "").trim();
  if (!base) return null;
  const mensagem = String(texto ?? "").trim();
  if (!mensagem) return base;
  const separador = base.includes("?") ? "&" : "?";
  return `${base}${separador}text=${encodeURIComponent(mensagem)}`;
}

/**
 * Grava o lead. `plano` vem do construtor da landing no formato
 * `{ total, modulos: [{ codigo, nome }], addons: [{ codigo, nome }] }` —
 * os códigos são o que fica no banco (dizem de que a pessoa precisa),
 * os nomes servem ao texto do WhatsApp.
 */
export async function registrarLead({
  nome,
  whatsapp,
  email,
  consentimento,
  origem = ORIGEM_PADRAO,
  plano,
} = {}) {
  const { ok, erros } = validarLead({ nome, whatsapp, email, consentimento });
  if (!ok) {
    return {
      data: null,
      error: { message: Object.values(erros)[0], campos: erros },
    };
  }

  try {
    const { data, error } = await supabase.rpc("registrar_lead", {
      p_nome: String(nome).trim(),
      p_whatsapp: somenteDigitos(whatsapp),
      p_email: String(email).trim().toLowerCase(),
      p_consentimento: true,
      p_origem: origem,
      p_plano_total_centavos: Number.isFinite(plano?.total)
        ? Math.round(plano.total * 100)
        : null,
      p_plano_modulos: (plano?.modulos ?? []).map((m) => m.codigo).filter(Boolean),
      p_plano_addons: (plano?.addons ?? []).map((a) => a.codigo).filter(Boolean),
    });
    if (error) return { data: null, error };
    return { data: data ?? null, error: null };
  } catch (err) {
    return {
      data: null,
      error: { message: err?.message ?? "Falha ao registrar o contato." },
    };
  }
}

/**
 * Colunas que a aba do Console lê. Fica em constante nomeada porque um
 * nome errado aqui não é erro de digitação: o PostgREST recusa a
 * consulta inteira (42703) e a aba mostra "não foi possível ler" com o
 * banco perfeitamente saudável. O guard de SQL confere esta lista
 * contra o CREATE TABLE da 20260920.
 *
 * `consentimento` não está aqui de propósito: a tela não precisa dele
 * (sem aceite o lead nem existe — o CHECK recusa), e dado pessoal que
 * não vai à tela não deve trafegar.
 */
export const COLUNAS_LEAD =
  "id, nome, whatsapp, email, origem, plano_total_centavos, plano_modulos, plano_addons, atendido_em, atendido_por, created_at";

/**
 * Lista os leads para o Console, mais novo primeiro. Colunas
 * explícitas: dado pessoal não sai em `select *`.
 *
 * Quem não for `plataforma` recebe lista vazia pela RLS — não é erro,
 * é a policy fazendo o trabalho dela.
 */
export async function listarLeads({ limite = 200 } = {}) {
  try {
    const { data, error } = await supabase
      .from("leads")
      .select(COLUNAS_LEAD)
      .order("created_at", { ascending: false })
      .limit(limite);
    if (error) return { data: [], error };
    return { data: data ?? [], error: null };
  } catch (err) {
    return {
      data: [],
      error: { message: err?.message ?? "Falha ao carregar os leads." },
    };
  }
}

/** Marca (ou desmarca) "já falei com essa pessoa". */
export async function marcarLeadAtendido(leadId, atendido, por = null) {
  if (!leadId) {
    return { data: null, error: { message: "Lead não informado." } };
  }
  try {
    const { error } = await supabase.rpc("marcar_lead_atendido", {
      p_lead_id: leadId,
      p_atendido: !!atendido,
      p_por: por,
    });
    if (error) return { data: null, error };
    return { data: true, error: null };
  } catch (err) {
    return {
      data: null,
      error: { message: err?.message ?? "Falha ao atualizar o lead." },
    };
  }
}

/**
 * Números da aba: quantos entraram, quantos ainda não foram atendidos e
 * quantos chegaram nos últimos 7 dias. Função pura — a tela não conta
 * nada sozinha, e o teste cobre a contagem sem banco.
 */
export function resumirLeads(leads = [], agora = new Date()) {
  const limite = new Date(agora).getTime() - 7 * 24 * 60 * 60 * 1000;
  let pendentes = 0;
  let recentes = 0;

  for (const lead of leads) {
    if (!lead?.atendido_em) pendentes += 1;
    const criado = lead?.created_at ? new Date(lead.created_at).getTime() : NaN;
    if (Number.isFinite(criado) && criado >= limite) recentes += 1;
  }

  return { total: leads.length, pendentes, recentes };
}

/** Link direto de conversa com o lead (o número que ELE deixou). */
export function linkDoLead(lead) {
  const digitos = somenteDigitos(lead?.whatsapp);
  if (digitos.length < 10) return null;
  const primeiro = String(lead?.nome ?? "").trim().split(/\s+/)[0] || "";
  const texto = primeiro
    ? `Oi, ${primeiro}! Aqui é da KORA, sobre a demonstração que você pediu no site.`
    : "Oi! Aqui é da KORA, sobre a demonstração que você pediu no site.";
  return `https://wa.me/55${digitos}?text=${encodeURIComponent(texto)}`;
}

/**
 * Códigos do plano → nome que o dono lê no Console.
 *
 * O lead guarda o CÓDIGO do módulo, não o nome: nome de módulo muda com
 * o tempo e um lead de meses atrás continuaria mostrando o rótulo
 * antigo. A tradução mora aqui, e o que não estiver no mapa aparece do
 * jeito que veio — item novo no catálogo não quebra a tela, só fica com
 * cara de código até alguém acrescentar a linha.
 */
const ROTULOS_PLANO = {
  delivery: "Delivery",
  estoque: "Estoque",
  fidelidade: "Fidelidade",
  financeiro: "Financeiro",
  jarvas: "JARVAS (IA)",
  mesas: "Mesas e comandas",
  nfe: "Nota fiscal",
  tef: "Maquininha (TEF)",
};

/** Rótulo de um item do plano montado, com o código como reserva. */
export function rotularItemDoPlano(codigo) {
  const chave = String(codigo ?? "").trim();
  return ROTULOS_PLANO[chave] ?? chave;
}
