import { supabase } from "./supabase";
import { emailDoLogin } from "./tenantSlug";
import { isErroDeRede } from "./offline/rede";

/**
 * Cadeado da tela do PDV, no lugar do logout por tempo.
 *
 * O contexto que manda aqui: **o PDV não fecha nunca, a aba fica aberta 24
 * horas**. Até agora o teto de sessão e a inatividade chamavam o logout de
 * verdade, e o logout desmonta a árvore do app: o carrinho montado e ainda não
 * lançado, a comanda selecionada e os campos digitados desaparecem sem trilha,
 * porque tudo isso é estado de tela. Numa operação contínua isso acontecia três
 * vezes por dia pelo teto, mais uma vez a cada período parado.
 *
 * O cadeado troca a consequência, não a regra: o prazo continua existindo, mas
 * vencer o prazo passa a pedir a senha em vez de jogar tudo fora. O caixa segue
 * aberto, a comanda segue na tela, e quem volta digita a senha e continua de
 * onde parou. Quem está trocando de turno usa "trocar de operador", que é o
 * logout de verdade.
 *
 * Por que não a RPC `verificar_senha_admin`, que já existe: ela exige papel de
 * admin ou gerente (`20240106_rpc_verificar_senha.sql`, o `role IN ('admin',
 * 'gerente')` dos dois ramos). Quem opera o caixa a noite inteira costuma não
 * ser nenhum dos dois, e um cadeado que o próprio operador não abre é pior do
 * que não ter cadeado. Então a verificação é a do próprio usuário, no Auth.
 */

/**
 * Quanto tempo parado até a tela travar. Decisão do dono em 2026-09-12: duas
 * horas, e não os 30 minutos que a inatividade usava, porque com o cadeado o
 * prazo deixou de custar o trabalho da tela e passou a custar só uma senha. Num
 * balcão de madrugada, 30 minutos significava travar quatro vezes por turno.
 */
export const PRAZO_BLOQUEIO_MS = 2 * 60 * 60 * 1000;

/**
 * Tenta destravar com a senha do operador que está logado.
 *
 * Devolve `{ ok, verificado, erro }`:
 *   - `ok: true,  verificado: true`  → a senha foi conferida no servidor.
 *   - `ok: true,  verificado: false` → não deu para conferir (sem internet), e
 *     a tela foi liberada assim mesmo. O chamador PRECISA registrar isso.
 *   - `ok: false` → a senha foi conferida e não confere; `erro` é o que dizer.
 *
 * O ramo do meio é decisão do dono, tomada com o custo à vista: o PDV opera sem
 * internet por projeto, e um cadeado que só abre online transforma queda de
 * link em caixa parado, que é exatamente o que ele não pode ter. Em troca, todo
 * destrave sem verificação fica no log de atividade, com hora e operador, então
 * existe rastro de quando o cadeado foi aberto sem conferência.
 */
export async function destravarComSenha(username, senha, deps = {}) {
  const {
    autenticar = (email, password) => supabase.auth.signInWithPassword({ email, password }),
    montarEmail = emailDoLogin,
    estaOffline = () => typeof navigator !== "undefined" && navigator.onLine === false,
  } = deps;

  const usuario = String(username ?? "").trim();
  const password = String(senha ?? "");
  if (!usuario) return { ok: false, verificado: false, erro: "Sessão sem operador. Entre de novo." };
  if (!password) return { ok: false, verificado: false, erro: "Digite a senha para continuar." };

  // Sem internet nem tentamos: a chamada demoraria o timeout inteiro para
  // terminar no mesmo lugar, e quem está no balcão com fila na frente não tem
  // esse tempo.
  if (estaOffline()) return { ok: true, verificado: false, erro: null };

  const email = montarEmail(usuario);
  if (!email) return { ok: false, verificado: false, erro: "Endereço de acesso inválido. Confira o link do estabelecimento." };

  try {
    const { error } = await autenticar(email, password);
    if (!error) return { ok: true, verificado: true, erro: null };
    if (isErroDeRede(error)) return { ok: true, verificado: false, erro: null };
    return { ok: false, verificado: false, erro: "Senha incorreta." };
  } catch (e) {
    // Exceção aqui é falha de transporte, não senha errada. Mesmo tratamento do
    // ramo offline: liberar e registrar.
    if (isErroDeRede(e)) return { ok: true, verificado: false, erro: null };
    return { ok: false, verificado: false, erro: "Não deu para conferir a senha agora. Tente de novo." };
  }
}
