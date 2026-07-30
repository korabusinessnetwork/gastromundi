/**
 * Guardas de entrada das Edge Functions: quem pode chamar e o que o corpo
 * pode conter.
 *
 * Vive aqui, fora dos index.ts, pelo mesmo motivo de
 * `validacaoProvisionamento.ts`: o index.ts chama `Deno.serve` no topo e
 * importa de URL, então nenhum teste consegue carregá-lo. Este módulo não
 * toca em nada do Deno e é exercitado por `src/lib/functionsGuardaEntrada.test.js`.
 *
 * O FURO QUE ISTO FECHA
 * As cinco funções não-fiscais decidiam o acesso olhando só o PAPEL:
 *
 *     if (callerData?.role !== "admin") return 403;
 *
 * `public.users` tem `active boolean NOT NULL DEFAULT true`, e o app inteiro
 * honra essa coluna: o login busca o perfil com `.eq("active", true)` e a
 * lista de usuários também (src/context/AppContext.jsx). Desativar é como o
 * sistema tira alguém de circulação sem apagar o histórico dele.
 *
 * Só que desativar a linha em `users` NÃO invalida o JWT já emitido, e nenhuma
 * Edge Function olhava a coluna. Pelo tempo de vida do token, um admin
 * desativado seguia podendo criar e apagar contas de acesso (`manage-user`),
 * gravar por cima do cardápio (`importar-dados`), ler o resumo do negócio
 * (`jarvas-assistente`) e queimar a cota de IA (`ler-cardapio-ia`) — e um
 * super-admin da plataforma desativado seguia criando estabelecimentos novos
 * (`provisionar-estabelecimento`), o papel mais poderoso do sistema. A tela
 * dizia que ele estava fora; o servidor, que estava dentro.
 */

/** Papéis aceitos por função — o mesmo gate que a tela já aplica. */
export const PAPEIS_ADMIN = ["admin"] as const;
export const PAPEIS_GERENCIA = ["admin", "gerente"] as const;
export const PAPEIS_IMPORTACAO = ["plataforma", "admin"] as const;
/** Só o Console da Plataforma — criar estabelecimento não é ação de cliente. */
export const PAPEIS_PLATAFORMA = ["plataforma"] as const;

export type MotivoRecusa = "sem_perfil" | "inativo" | "papel";

export interface PerfilChamador {
  role?: unknown;
  active?: unknown;
}

export interface DecisaoAcesso {
  ok: boolean;
  motivo: MotivoRecusa | null;
}

/**
 * Decide se o dono do JWT pode agir, a partir da linha de `users` dele.
 *
 * Falha FECHADO em tudo: sem perfil recusa, `active` diferente de `true`
 * recusa, papel fora da lista recusa. `active` é NOT NULL DEFAULT true no
 * banco, então o único jeito de ele chegar aqui indefinido é a consulta ter
 * esquecido de pedir a coluna — e nesse caso recusar é o certo, porque o
 * contrário seria liberar quem foi desativado por causa de um `select`
 * incompleto.
 *
 * O motivo volta separado da mensagem de propósito: cada função fala com um
 * público diferente ("Acesso restrito a administradores." no cadastro de
 * usuários, "Assistente disponível apenas para gerência." no Jarvas) e quem
 * escolhe a frase é a borda.
 */
export function decidirAcesso(
  perfil: PerfilChamador | null | undefined,
  papeisPermitidos: readonly string[],
): DecisaoAcesso {
  if (!perfil || typeof perfil !== "object") return { ok: false, motivo: "sem_perfil" };
  if (perfil.active !== true) return { ok: false, motivo: "inativo" };
  const papel = typeof perfil.role === "string" ? perfil.role : "";
  if (!papeisPermitidos.includes(papel)) return { ok: false, motivo: "papel" };
  return { ok: true, motivo: null };
}

/** Frase para a conta desativada — igual nas quatro funções. */
export const ERRO_INATIVO =
  "Sua conta foi desativada neste estabelecimento. Fale com o administrador.";

/**
 * Mensagem pronta a partir da decisão: `inativo` tem causa própria (a pessoa
 * precisa saber que foi desativada, não que "não é admin"), o resto usa a
 * frase da função.
 */
export function mensagemRecusa(motivo: MotivoRecusa | null, padrao: string): string {
  return motivo === "inativo" ? ERRO_INATIVO : padrao;
}

// ── Histórico do Jarvas ────────────────────────────────────────────

export const MAX_TURNOS_HISTORICO = 6;
export const MAX_TEXTO_HISTORICO = 2000;

export interface TurnoConversa {
  role: "user" | "assistant";
  content: string;
}

/**
 * Converte o histórico que o cliente manda no formato que a API da Anthropic
 * aceita, descartando o que não é turno de verdade.
 *
 * O código anterior fazia `historico.slice(-6).map((m) => ({ role: m.papel === ... }))`
 * direto no que veio do corpo. Dois jeitos de quebrar, ambos sem defesa:
 * um item `null` no array estourava `m.papel` (TypeError → 500 "Erro interno
 * do assistente"), e um `texto` vazio virava um bloco de conteúdo vazio, que a
 * Anthropic recusa com 400 — a borda traduzia em 502 "Falha ao consultar o
 * assistente". Nos dois casos o gerente via defeito nosso por causa de um
 * corpo malformado.
 */
export function sanitizarHistorico(historico: unknown): TurnoConversa[] {
  if (!Array.isArray(historico)) return [];
  const turnos: TurnoConversa[] = [];
  for (const item of historico.slice(-MAX_TURNOS_HISTORICO)) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const { papel, texto } = item as { papel?: unknown; texto?: unknown };
    if (typeof texto !== "string") continue;
    const content = texto.trim().slice(0, MAX_TEXTO_HISTORICO);
    if (!content) continue;
    turnos.push({ role: papel === "jarvas" ? "assistant" : "user", content });
  }
  return turnos;
}
