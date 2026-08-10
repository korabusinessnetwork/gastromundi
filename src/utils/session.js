const SESSION_KEY  = "kora_session";
const ATTEMPT_KEY  = "kora_attempts";

export const SESSION_MS   = 8 * 60 * 60 * 1000;  // 8 horas
export const IDLE_MS      = 30 * 60 * 1000;       // 30 min inatividade
export const MAX_ATTEMPTS = 5;
export const LOCKOUT_MS   = 2 * 60 * 1000;        // 2 min bloqueio

// Quanto antes do fim da inatividade o aviso aparece. Em hora de pico a sessão
// vencia calada no meio de um atendimento: o operador só descobria ao tocar na
// tela e cair no login. Dois minutos é tempo de voltar do salão e clicar em
// "continuar conectado" — e curto o bastante para não virar mais um aviso que
// mora na tela.
export const AVISO_INATIVIDADE_MS = 2 * 60 * 1000; // 2 min

// ── Sessão ────────────────────────────────────────────────────
// O `at` é o RELÓGIO da sessão: a hora do login. O teto de 8 horas conta dele
// e de mais nada — quem mexe no `at` renova a sessão. Por isso só o login (e a
// criação da sessão local numa aba nova) usa `saveSession`; atualização dos
// dados do usuário logado passa por `atualizarUsuarioSessao`, que preserva o
// relógio. Vive em sessionStorage, então o teto vale por aba: fechar a aba
// encerra a contagem e abrir de novo começa outro turno de 8 horas.
export const saveSession = (user) =>
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({ user, at: Date.now() }));

/**
 * Lê a sessão local SEM apagá-la e diz em que estado ela está.
 *
 * - `ausente`  — não há sessão nesta aba (aba nova, ou logout).
 * - `expirada` — passou do teto de 8h, ou o conteúdo é inválido/ilegível.
 *                Falha FECHADO de propósito: um payload sem `at` numérico dava
 *                `Date.now() - undefined = NaN`, e `NaN > SESSION_MS` é false,
 *                então a sessão nunca vencia.
 * - `ativa`    — dentro do teto; `user` e `at` são confiáveis.
 *
 * @returns {{estado: "ausente"|"expirada"|"ativa", user: object|null, at: number|null}}
 */
export const lerSessao = () => {
  let bruto;
  try {
    bruto = sessionStorage.getItem(SESSION_KEY);
  } catch {
    return { estado: "expirada", user: null, at: null };
  }
  if (!bruto) return { estado: "ausente", user: null, at: null };
  try {
    const s = JSON.parse(bruto);
    if (!s || !s.user || !Number.isFinite(s.at)) return { estado: "expirada", user: null, at: null };
    if (Date.now() - s.at > SESSION_MS) return { estado: "expirada", user: null, at: s.at };
    return { estado: "ativa", user: s.user, at: s.at };
  } catch {
    return { estado: "expirada", user: null, at: null };
  }
};

export const loadSession = () => {
  const { estado, user } = lerSessao();
  if (estado === "expirada") clearSession();
  return user;
};

/**
 * Atualiza os dados do usuário logado (nome, cargo, permissões) MANTENDO o
 * relógio da sessão. É o que o refresh da lista de usuários precisa: antes ele
 * chamava `saveSession`, que reescrevia o `at` — bastava a lista de usuários
 * recarregar (bootstrap, realtime, edição em Configurações) para o teto de 8
 * horas voltar ao zero e a sessão nunca vencer.
 *
 * @returns {boolean} true quando havia sessão ativa e ela foi atualizada.
 */
export const atualizarUsuarioSessao = (user) => {
  const { estado, at } = lerSessao();
  if (estado !== "ativa") return false;
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ user, at }));
    return true;
  } catch {
    return false;
  }
};

/**
 * Quanto falta (ms) para o teto absoluto de 8 horas. `null` quando não há
 * sessão ativa para cobrar — nesse caso quem decide é o `loadSession`.
 */
export const msRestantesDaSessao = () => {
  const { estado, at } = lerSessao();
  if (estado !== "ativa") return null;
  return Math.max(0, at + SESSION_MS - Date.now());
};

// Total de propósito: é chamado nos caminhos de logout e de expiração, onde um
// throw do storage deixaria a pessoa presa num estado logado sem sessão.
export const clearSession = () => {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* storage indisponível — não há o que limpar */
  }
};

// ── Perfil desativado × leitura que falhou ────────────────────
// Desativar alguém em `public.users` NÃO invalida o JWT que já está no
// navegador dele — só o `signOut` faz isso. Quem descobre a desativação é a
// busca do perfil (filtrada por `active = true`): ela volta sem linha. O
// problema é que "sem linha" e "não consegui ler" chegam do supabase-js do
// mesmo jeito (`data: null`), e as duas exigem desfechos OPOSTOS:
//   - sem linha  → a conta foi desativada/apagada: derrubar a sessão.
//   - não li     → oscilação de rede/servidor: MANTER a sessão, senão um
//                  soluço de rede joga o caixa para a tela de login no meio
//                  do turno.
// O PostgREST distingue os dois: `.single()` sem resultado devolve PGRST116
// ("0 rows"). Só esse código (e a ausência total de erro) conta como resposta
// definitiva; qualquer outra falha vale como "não sei" e preserva a sessão.
export const PGRST_SEM_LINHA = "PGRST116";

export const perfilInativoConfirmado = (erro) => {
  if (!erro) return true;
  return erro.code === PGRST_SEM_LINHA;
};

// ── Token do Supabase Auth ────────────────────────────────────
// A sessão acima só serve para a tela abrir já logada. Quem de fato autoriza
// qualquer leitura no banco é o token do Supabase, que o supabase-js guarda no
// localStorage sob chaves do tipo `sb-<ref>-auth-token` (às vezes fatiadas em
// `.0`, `.1`, mais o `-code-verifier` do PKCE).
const ehChaveDoAuth = (k) => typeof k === "string" && k.startsWith("sb-") && k.includes("-auth-token");

/**
 * Apaga o token do Supabase guardado neste navegador.
 *
 * Existe para o logout. Quando `auth.signOut()` falha na rede, o supabase-js
 * devolve `{ error }` e sai ANTES de apagar o token — o próximo carregamento
 * usaria o refresh token para religar a sessão sem pedir senha. Num PDV
 * compartilhado, isso é o próximo turno entrando como o anterior.
 *
 * Varre por padrão em vez de fixar a chave: assim não depende do formato da URL
 * do projeto (`<ref>.supabase.co` ou domínio próprio) e não exige trocar o
 * `storageKey` do client, o que deslogaria de uma vez todo mundo já logado.
 *
 * Não revoga o refresh token no servidor — isso só o `signOut` com rede faz.
 * Aqui o objetivo é que ele deixe de existir NESTE navegador.
 *
 * @returns {number} quantas chaves foram removidas.
 */
export const esquecerTokenAuthLocal = () => {
  let removidas = 0;
  try {
    const chaves = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (ehChaveDoAuth(k)) chaves.push(k);
    }
    for (const k of chaves) {
      localStorage.removeItem(k);
      removidas++;
    }
  } catch {
    /* storage indisponível — não há o que apagar */
  }
  return removidas;
};

// ── Rate limiting ─────────────────────────────────────────────
// A contagem de tentativas mora no localStorage, e não no sessionStorage: por
// aba, o contador zerava ao fechar a aba (e nascia zerado em cada aba nova), de
// modo que o "Bloqueio após 5 tentativas" prometido na tela de login não
// bloqueava nada — bastava fechar e reabrir para seguir tentando, de cinco em
// cinco, o que num terminal de PDV compartilhado é tempo de sobra para chutar a
// senha do gerente.
//
// Isto não é barreira de segurança: o storage é do navegador de quem está lá, e
// quem sabe abrir o console limpa. A barreira de verdade é o rate limit do
// Supabase Auth, no servidor. O objetivo aqui é a promessa da tela ser verdade
// no uso normal, em vez de ser um enfeite.
//
// A janela existe para o contador não virar armadilha: guardado para sempre,
// quatro erros de ontem fariam um único erro de digitação hoje bloquear a conta.
// Erro velho para de contar; bloqueio já ativo continua valendo até a hora
// marcada, por mais antigo que seja o registro.
export const JANELA_TENTATIVAS_MS = 15 * 60 * 1000; // 15 min

export const getAttempts = (username) => {
  let dados;
  try {
    dados = JSON.parse(localStorage.getItem(ATTEMPT_KEY + username) || "{}");
  } catch {
    return {};
  }
  if (!dados || typeof dados !== "object") return {};
  if (Number.isFinite(dados.lockedUntil) && dados.lockedUntil > Date.now()) return dados;
  if (!Number.isFinite(dados.at) || Date.now() - dados.at > JANELA_TENTATIVAS_MS) return {};
  return dados;
};

export const setAttempts = (username, data) => {
  try {
    // O `at` é gravado aqui, e não por quem chama: é a hora do último erro, o
    // que define a janela acima.
    localStorage.setItem(ATTEMPT_KEY + username, JSON.stringify({ ...data, at: Date.now() }));
  } catch {
    /* storage cheio ou bloqueado: fica sem contador, mas o login não quebra */
  }
};

export const clearAttempts = (username) => {
  try {
    localStorage.removeItem(ATTEMPT_KEY + username);
  } catch {
    /* idem: nada a apagar é o mesmo que apagado */
  }
};
