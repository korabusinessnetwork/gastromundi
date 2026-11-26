// TD008 — o contador de tentativas de login que vive no servidor.
//
// Até aqui quem contava as cinco tentativas era o `localStorage`
// (`src/utils/session.js`), o que significa que quem estava tentando entrar era
// o dono do contador: limpar o storage devolvia as cinco. Este módulo fala com
// as funções `login_tentativas_*` (migration 20260927), que contam no banco.
//
// Três funções e não uma: a que ZERA o contador não pode ser alcançável por
// quem ainda não entrou, senão bastaria chamá-la entre as tentativas para
// desfazer o bloqueio. Por isso `registrarSucesso` não recebe chave nenhuma, a
// função no banco tira a identidade do próprio token da sessão recém-criada.
//
// Tudo aqui falha ABERTO: se a RPC não responde (rede caída, migration ainda
// não aplicada), devolvemos `disponivel: false` e quem chama volta para o
// contador local. Um problema no banco não pode impedir o caixa de abrir, e o
// rate limit do próprio Supabase Auth continua no caminho de qualquer jeito.
import { supabase } from "@/lib/supabase";

/** Resposta usada quando o servidor não respondeu: ninguém bloqueado. */
const INDISPONIVEL = Object.freeze({ disponivel: false, bloqueado: false, restantes: null, segundos: 0 });

/** Traduz o jsonb das RPCs para a forma que o app usa, sem confiar no formato. */
function normalizar(bruto) {
  if (!bruto || typeof bruto !== "object") return INDISPONIVEL;
  const restantes = Number(bruto.restantes);
  const segundos  = Number(bruto.segundos);
  return {
    disponivel: true,
    bloqueado:  bruto.bloqueado === true,
    restantes:  Number.isFinite(restantes) ? Math.max(restantes, 0) : null,
    segundos:   Number.isFinite(segundos) ? Math.max(Math.ceil(segundos), 0) : 0,
  };
}

/**
 * O login está bloqueado neste momento? Só consulta, não conta.
 * @param {string} chave identidade do login (`usuario@slug.local`)
 */
export async function consultarBloqueio(chave) {
  if (!chave) return INDISPONIVEL;
  try {
    const { data, error } = await supabase.rpc("login_tentativas_estado", { p_chave: chave });
    if (error) return INDISPONIVEL;
    return normalizar(data);
  } catch {
    return INDISPONIVEL;
  }
}

/**
 * Soma uma falha e devolve o estado resultante. Só soma: não existe caminho
 * por aqui que diminua o contador.
 * @param {string} chave identidade do login (`usuario@slug.local`)
 */
export async function registrarFalha(chave) {
  if (!chave) return INDISPONIVEL;
  try {
    const { data, error } = await supabase.rpc("login_tentativas_falha", { p_chave: chave });
    if (error) return INDISPONIVEL;
    return normalizar(data);
  } catch {
    return INDISPONIVEL;
  }
}

/**
 * Zera o contador de quem acabou de entrar. Chamar só DEPOIS de a sessão
 * existir: a identidade sai do token, não daqui. Melhor-esforço, o pior caso é
 * o contador expirar sozinho na janela.
 */
export async function registrarSucesso() {
  try {
    await supabase.rpc("login_tentativas_sucesso");
  } catch {
    /* silencioso de propósito: não é problema de quem está entrando */
  }
}
