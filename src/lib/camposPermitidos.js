// ──────────────────────────────────────────────────────────────────
// Allowlist de colunas para escrita no Supabase.
//
// O padrão `update({ ...changes })` manda para o banco QUALQUER chave
// que o objeto tiver. Hoje isso não é brecha: os dois chamadores de
// `addUser`/`updateUser` montam objeto literal fechado, e o planejador
// da importação também. O que ele é, é um contrato aberto: basta
// alguém, um dia, espalhar o estado de um formulário ali dentro para a
// tela passar a escrever coluna que ela não devia tocar.
//
// A barreira REAL de quem pode gravar o quê é a RLS no Postgres, e
// continua sendo (`users_update_admin` exige admin e fixa `tenant_id`;
// a policy RESTRICTIVE de isolamento fecha o tenant nas 24 tabelas).
// Esta função não substitui nada disso: ela fecha o CONTRATO do lado
// do cliente, que é o único lugar onde o erro futuro nasce.
//
// Por que devolver os ignorados em vez de só filtrar: allowlist que
// descarta em silêncio troca uma brecha por um bug mudo. Quem chamar
// com uma coluna nova e legítima precisa DESCOBRIR na hora que a
// escrita não foi, em vez de ver a tela "salvar" e o banco não mudar.
// ──────────────────────────────────────────────────────────────────

/**
 * Separa um objeto de escrita entre o que pode ir ao banco e o que não.
 *
 * @param {object} objeto     - o que o chamador quer gravar
 * @param {string[]} permitidos - nomes de coluna que podem ir
 * @returns {{ campos: object, ignorados: string[] }}
 */
export function separarCampos(objeto, permitidos) {
  const permitido = new Set(permitidos ?? []);
  const campos = {};
  const ignorados = [];

  if (!objeto || typeof objeto !== "object" || Array.isArray(objeto)) {
    return { campos, ignorados };
  }

  // `Object.keys` só enxerga chave própria e enumerável, que é
  // exatamente o que o supabase-js serializa. Chave herdada de
  // protótipo não entra no corpo da requisição, então também não
  // precisa entrar na conta dos ignorados.
  for (const chave of Object.keys(objeto)) {
    if (permitido.has(chave)) campos[chave] = objeto[chave];
    else ignorados.push(chave);
  }

  return { campos, ignorados };
}

/** Colunas que a tela pode gravar em `users`. Fora daqui: `id` (o banco
 *  gera) e `tenant_id` (quem define é o DEFAULT da coluna mais a RLS,
 *  nunca o cliente). */
export const COLUNAS_ESCRITA_USERS = ["name", "username", "role", "active", "auth_id", "permissions"];

/** Colunas que a tela pode gravar numa comanda aberta (`pending`).
 *  `updated_at` fica de fora de propósito: quem carimba é a própria
 *  `updatePending`, depois do filtro. */
export const COLUNAS_ESCRITA_PENDING = [
  "items",
  "total",
  "mesa",
  "apelido",
  "cliente_id",
  "cliente_nome",
  "note",
  "status",
];

/** Colunas aceitas no REPLAY da fila offline. É a lista da escrita mais o
 *  `updated_at`, porque a operação foi enfileirada já carimbada: quem drena
 *  reenvia o carimbo do momento em que o garçom agiu, não o da hora em que a
 *  rede voltou. A fila mora no localStorage, que o navegador deixa qualquer
 *  um editar, então o que volta de lá passa pelo mesmo filtro da entrada. */
export const COLUNAS_REPLAY_PENDING = [...COLUNAS_ESCRITA_PENDING, "updated_at"];
