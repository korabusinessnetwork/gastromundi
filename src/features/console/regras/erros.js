
// Mensagens de erro do Console em português, para falha de rede, de servidor e de provisionamento.
// ── Erro de rede e de servidor, em português (CONSOLE-UX 26) ───────

// Assinatura de mensagem que ninguém escreveu para ser lida: metade é o
// navegador quando a rede cai ("Failed to fetch"), metade é o Postgres cru
// quando a policy ou a constraint barra sem RAISE ("new row violates
// row-level security policy"). As duas chegam em inglês e falam de coisas que
// não existem para quem está cobrando um cliente na rua.
//
// O código do erro NÃO serve de critério aqui: as RPCs do Console levantam
// recusas deliberadas em português reusando ERRCODE existente — `42501` em
// "Somente a plataforma pode confirmar renovação", `23505` em "A competência
// 08/2026 já foi confirmada" —, então uma lista de códigos permitidos ou
// engoliria essas frases ou deixaria passar o texto cru do mesmo código.
const MARCA_TECNICA =
  /failed to fetch|networkerror|network request failed|load failed|typeerror|fetch failed|err_[a-z_]+|econnrefused|<!doctype|violates |duplicate key|permission denied|could not find|schema cache|invalid input syntax|does not exist|null value in column/i;

const SEM_INTERNET =
  "Sem conexão com a internet. Reconecte para salvar, o que já está na tela continua aqui.";

const FALHA_GENERICA =
  "Não foi possível falar com o servidor agora. Tente de novo em alguns segundos.";

const estaOffline = () =>
  typeof navigator !== "undefined" && navigator.onLine === false;

/**
 * Traduz o erro de uma operação do Console para uma frase que o dono entende
 * (Princípio nº1: nada de jargão técnico na tela). Sem I/O — só lê o
 * `navigator.onLine` que o navegador já mantém.
 *
 * O Console é a tela que o dono abre na rua para cobrar, e ela mostrava o
 * `error.message` cru: o `??` de antes só cobria mensagem vazia, então uma
 * queda de sinal virava "TypeError: Failed to fetch" logo depois de tentar
 * registrar um pagamento.
 *
 * A regra é uma só: quem escreveu a frase. Recusa escrita de propósito — pela
 * RPC, pela Edge Function ou pelo próprio front — chega inteira, porque é ela
 * que diz o que corrigir ("A competência 08/2026 já foi confirmada", "Sessão
 * expirada. Entre novamente."). O que tem marca de máquina em inglês vira a
 * frase do chamador. O código do erro não entra na conta: a mesma `42501`
 * carrega tanto a recusa em português da RPC quanto o texto cru da policy.
 *
 * @param {{code?: string, message?: string}|string|null|undefined} error
 * @param {string} [fallback] frase do chamador ("Não foi possível alterar o
 *   plano."), usada no lugar da genérica
 * @returns {string} sempre uma frase em português, nunca vazia
 */
export function mensagemDeErroDoConsole(error, fallback = "") {
  const bruto = typeof error === "string" ? error : error?.message;
  const texto = typeof bruto === "string" ? bruto.trim() : "";
  const generica = String(fallback ?? "").trim() || FALHA_GENERICA;

  // Offline vem antes de tudo: sem rede a chamada nem chegou ao servidor, e
  // dizer "tente de novo" a quem está sem sinal é mandar bater na mesma porta.
  if (estaOffline()) return SEM_INTERNET;
  if (!texto) return generica;

  return MARCA_TECNICA.test(texto) ? generica : texto;
}

// Colisão de credencial no Auth. Enquanto `TENANT_ROOT_DOMAIN` está
// desligado, a Edge Function usa o namespace de e-mail 'gastromundi' para
// TODO estabelecimento — então o username precisa ser único na plataforma
// inteira, e o segundo estabelecimento que reusar "admin" bate aqui. O
// próprio index.ts chama esse caminho de "esperado"; é o modo de falha mais
// provável ao pôr um cliente novo no ar.
const ERRO_USUARIO_EM_USO =
  /already[ _]been[ _]registered|already registered|email[_ ]?exists|user_already_exists|duplicate key[\s\S]*username/i;

/**
 * Traduz o erro cru do provisionamento para uma frase que o dono entende e
 * diz QUAL campo do formulário corrigir (Princípio nº1: nada de jargão
 * técnico na tela). Função pura — sem I/O.
 *
 * O Supabase Auth responde a colisão em inglês e falando de um "email
 * address" que ninguém digitou (o e-mail é montado pelo servidor a partir do
 * usuário). Cru, a mensagem não diz o que fazer; traduzida, ela aponta o
 * campo "Usuário de acesso" e o caminho é óbvio: escolher outro.
 *
 * O `aviso` de compensação (o " ATENÇÃO: ... " que a Edge Function acrescenta
 * quando NÃO conseguiu apagar o estabelecimento órfão) volta separado e
 * NUNCA é descartado: ele exige ação manual do dono e não cabe colado num
 * campo de formulário.
 *
 * @param {string} bruto mensagem devolvida por `provisionarEstabelecimento`
 * @returns {{campo: string|null, mensagem: string, aviso: string}}
 */
export function traduzirErroProvisionamento(bruto) {
  const texto = String(bruto ?? "").trim();
  const corte = texto.indexOf("ATENÇÃO:");
  const principal = (corte >= 0 ? texto.slice(0, corte) : texto).trim();
  const aviso = corte >= 0 ? texto.slice(corte).trim() : "";

  if (ERRO_USUARIO_EM_USO.test(principal)) {
    return {
      campo: "adminUsername",
      // Sem exemplo escrito: o botão de sugestão ao lado (CONSOLE-UX 21) já
      // mostra um usuário livre pronto, e citar "o nome do responsável" aqui
      // ficou redundante depois que o campo passou a nascer dele (CONSOLE-UX 22).
      mensagem: "Este usuário de acesso já existe na plataforma. Escolha outro.",
      aviso,
    };
  }

  return {
    campo: null,
    // A Edge Function devolve texto, não código: o que ela escreve de
    // propósito ("Sessão expirada. Entre novamente.") passa inteiro, e o que
    // o navegador escreveu quando a rede caiu vira frase (CONSOLE-UX 26).
    mensagem: mensagemDeErroDoConsole(principal, "Falha ao criar o estabelecimento."),
    aviso,
  };
}
