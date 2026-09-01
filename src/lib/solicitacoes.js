import { supabase } from "./supabase";
import { normalizarSlug, SLUGS_RESERVADOS } from "./slugEstabelecimento";

/**
 * Solicitações de conta do site institucional (apex kora.codes).
 *
 * Quem preenche "Criar minha conta" ainda NÃO é um estabelecimento — está
 * pedindo um (decisão 017). Criar tenant é ato da plataforma (decisão 027,
 * Edge Function `provisionar-estabelecimento`), então o visitante entra na
 * FILA: a única porta é a RPC `registrar_solicitacao_conta`, que roda como
 * SECURITY DEFINER, valida de novo no banco, recusa endereço já ocupado e
 * tem freio de abuso (mesmo desenho de `leads.js`).
 *
 * Nenhuma senha viaja nem é guardada: a credencial nasce no provisionamento
 * e chega ao cliente pelo cartão de primeiro acesso que o Console já emite.
 *
 * Requer a migração supabase/migrations/20260926_solicitacoes_conta.sql
 * aplicada — sem ela a RPC não existe e o envio falha na tela.
 */

// Mesma divisão do domínio em pedaços entre pontos usada em `leads.js`: a
// forma `[^\s@]+\.[^\s@]+` dá ao motor vários jeitos de dividir o mesmo
// texto e trava o campo em e-mail longo e ainda incompleto.
const EMAIL_REGEX = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

/** Mínimo de caracteres do endereço — o mesmo cobrado pela RPC. */
export const MIN_ENDERECO = 2;

/**
 * Valida o cadastro. Pura e síncrona de propósito: a tela usa a mesma função
 * para mostrar o erro embaixo do campo, sem ida ao banco.
 *
 * Devolve erro POR CAMPO — quem preencheu cinco campos e errou dois precisa
 * ver os dois de uma vez, não descobrir um por vez.
 *
 * @param {{ nome?: string, whatsapp?: string, email?: string,
 *           estabelecimento?: string, endereco?: string }} dados
 * @returns {{ valido: boolean, erros: Record<string, string> }}
 */
export function validarSolicitacao(dados) {
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

  const negocio = String(dados?.estabelecimento ?? "").trim();
  if (negocio.length < 2) erros.estabelecimento = "Diga o nome do seu negócio.";
  else if (negocio.length > 120) erros.estabelecimento = "Nome muito longo.";

  // O endereço nasce do nome do negócio, então só é vazio quando o nome
  // também não serve — nesse caso o erro já está no campo de cima, e
  // repetir a bronca aqui embaixo confunde mais do que ajuda.
  const endereco = normalizarSlug(dados?.endereco ?? "");
  if (negocio.length >= 2) {
    if (endereco.length < MIN_ENDERECO)
      erros.endereco = "Escolha um endereço com pelo menos 2 letras ou números.";
    else if (SLUGS_RESERVADOS.includes(endereco))
      erros.endereco = "Este endereço é reservado do sistema. Escolha outro.";
  }

  return { valido: Object.keys(erros).length === 0, erros };
}

// Mensagens por código devolvido pela RPC. Quem está criando a conta não lê
// "erro 23514": precisa saber o que fazer agora.
const MENSAGENS = {
  nome_invalido: "Confira o nome digitado.",
  whatsapp_invalido: "Confira o WhatsApp digitado.",
  email_invalido: "Confira o e-mail digitado.",
  estabelecimento_invalido: "Confira o nome do estabelecimento.",
  endereco_invalido: "Escolha um endereço com pelo menos 2 letras ou números.",
  muitas_tentativas:
    "Recebemos seu pedido há pouco. Aguarde alguns minutos para enviar de novo.",
};

const ERRO_GENERICO =
  "Não conseguimos enviar agora. Tente de novo em alguns instantes.";

/**
 * Registra a solicitação. Nunca lança: devolve `{ ok, erro, campo, sugestao,
 * endereco }` para a tela decidir o que mostrar.
 *
 * `campo` diz ONDE colar a mensagem (hoje só o endereço tem erro próprio do
 * servidor); `sugestao` é o próximo endereço livre que o banco calculou, para
 * a tela oferecer um clique em vez de mandar a pessoa inventar outro.
 *
 * @param {{ nome: string, whatsapp: string, email: string,
 *           estabelecimento: string, endereco: string,
 *           plano?: { codigo?: string|null, nome?: string|null,
 *                     total?: number|null, itens?: string[]|null } }} dados
 * @returns {Promise<{ ok: boolean, erro: string|null, campo?: string,
 *                     sugestao?: string, endereco?: string }>}
 */
export async function registrarSolicitacaoConta(dados) {
  const { valido, erros } = validarSolicitacao(dados);
  if (!valido) return { ok: false, erro: Object.values(erros)[0] };

  const plano = dados?.plano ?? {};

  try {
    const { data, error } = await supabase.rpc("registrar_solicitacao_conta", {
      p_nome: String(dados.nome).trim(),
      p_whatsapp: String(dados.whatsapp).replace(/\D/g, ""),
      p_email: String(dados.email).trim().toLowerCase(),
      p_estabelecimento: String(dados.estabelecimento).trim(),
      p_slug: normalizarSlug(dados.endereco),
      p_plano_codigo: plano.codigo ?? null,
      p_plano_nome: plano.nome ?? null,
      p_total: Number.isFinite(plano.total) ? plano.total : null,
      p_itens: Array.isArray(plano.itens) ? plano.itens : null,
    });

    if (error) return { ok: false, erro: ERRO_GENERICO };
    if (data?.ok) return { ok: true, erro: null, endereco: data.endereco ?? null };

    // Endereço ocupado é o único erro que o visitante consegue resolver
    // sozinho — e vem com o próximo livre calculado pelo banco.
    if (data?.erro === "endereco_em_uso") {
      return {
        ok: false,
        campo: "endereco",
        sugestao: data.sugestao ?? "",
        erro: data.sugestao
          ? `Este endereço já está em uso. Que tal ${data.sugestao}?`
          : "Este endereço já está em uso. Escolha outro.",
      };
    }

    return { ok: false, erro: MENSAGENS[data?.erro] || ERRO_GENERICO };
  } catch {
    // Rede caiu, timeout, CORS: o visitante não tem o que fazer com o
    // detalhe técnico, e o detalhe não vai para o console (pode conter
    // o que ele digitou).
    return { ok: false, erro: ERRO_GENERICO };
  }
}
