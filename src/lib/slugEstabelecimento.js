/**
 * Endereço (slug) do estabelecimento — regras compartilhadas.
 *
 * O slug é o rótulo do subdomínio (`bardoze.kora.codes`) E o namespace de
 * e-mail do Auth (`usuario@bardoze.local`, ADR-009). Duas telas muito
 * diferentes precisam das MESMAS regras: o Console, quando a plataforma
 * cria um estabelecimento, e o site institucional, quando o próprio dono
 * pede a conta dele. Duas cópias da lista de rótulos reservados iam
 * divergir no primeiro rótulo novo — por isso elas moram aqui.
 *
 * Este módulo é de propósito SEM dependências (nada de supabase, layouts
 * ou geocodificação): ele entra no bundle da página pública do apex, que
 * é a primeira coisa que um visitante baixa.
 *
 * A autoridade continua sendo o banco (`slugify_tenant`, `slug_reservado`,
 * CHECK em `tenants`); o que está aqui existe para AVISAR antes do envio.
 */

/** Limite de tamanho do slug — mesmo `MAX_SLUG` da borda (Edge Function). */
export const MAX_SLUG = 40;

/**
 * Rótulos que nenhum estabelecimento pode ocupar. Espelho da função
 * `public.slug_reservado` (migration 20260803): o slug é o subdomínio E o
 * namespace de e-mail do Auth, então 'console' na mão de um tenant colidiria
 * com o próprio Console. O banco continua sendo a autoridade (CHECK
 * constraint + laço da RPC); a lista aqui existe para AVISAR antes do envio,
 * em vez de deixar o dono descobrir depois que virou 'console2'.
 */
export const SLUGS_RESERVADOS = [
  "console",
  "www", "app", "api",
  "admin", "painel", "plataforma", "sistema", "kora",
  "auth", "login", "static", "assets", "cdn", "mail", "smtp",
  "ftp", "ns", "ns1", "ns2", "root", "suporte", "status",
];

/**
 * Normaliza o endereço (slug) do estabelecimento exatamente como o servidor
 * fará: espelho de `public.slugify_tenant` (20260741) e de `normalizarSlug`
 * em `supabase/functions/_shared/validacaoProvisionamento.ts`.
 *
 * Repare que TUDO que não é letra ou número some — inclusive hífen e ponto.
 * "Bar do Zé" vira "bardoze", não "bar-do-ze". A regra é do banco; o campo
 * do formulário só precisa mostrar a verdade enquanto o dono digita.
 *
 * @param {string} raw
 * @returns {string}
 */
export function normalizarSlug(raw) {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // remove acentos
    .replace(/[^a-z0-9]/g, "")
    .slice(0, MAX_SLUG);
}

/**
 * Primeiro endereço livre a partir de uma base, pela MESMA regra do laço de
 * `provisionar_tenant` (20260803): base, base2, base3… pulando os que já
 * estão em uso e os reservados. Serve para sugerir na tela o que o banco
 * faria calado.
 *
 * @param {string} base slug pretendido (já normalizado ou não)
 * @param {string[]} emUso slugs dos estabelecimentos existentes
 * @returns {string} slug livre, ou "" se a base for vazia
 */
export function sugerirSlugLivre(base, emUso = []) {
  const raiz = normalizarSlug(base);
  if (!raiz) return "";
  const ocupados = new Set((emUso ?? []).map((s) => normalizarSlug(s)).filter(Boolean));
  const indisponivel = (s) => ocupados.has(s) || SLUGS_RESERVADOS.includes(s);

  let candidato = raiz;
  let n = 1;
  while (indisponivel(candidato)) {
    n += 1;
    candidato = raiz + String(n);
  }
  return candidato;
}
