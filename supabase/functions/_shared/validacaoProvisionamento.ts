/**
 * Validação da entrada de `provisionar-estabelecimento`.
 *
 * POR QUE ESTE ARQUIVO EXISTE (e por que fora do index.ts)
 * O index.ts chama `Deno.serve` no escopo do módulo e importa de uma URL —
 * importá-lo num teste sobe um servidor. Aqui não há global de Deno nem
 * import por URL, então `src/lib/provisionamentoValidacao.test.js` importa
 * este módulo direto e testa o COMPORTAMENTO, não o texto do arquivo.
 *
 * O QUE ESTAVA FURADO
 * A borda confiava na validação do cliente. Ela só fazia:
 *
 *     const username = (admin.username ?? "").trim().toLowerCase();
 *     if (!username || !password) return 400;
 *
 * enquanto o Console (src/lib/console.js) normaliza o username para
 * `[a-z0-9._-]` sem acento, exige 3 caracteres e senha de 6. A borda é a
 * fronteira de verdade: qualquer corpo montado à mão — ou um cliente futuro —
 * passava por ela.
 *
 * O dano é SILENCIOSO, e é o pior tipo: a tela de login monta o e-mail com
 * `sanitizeInput` (src/utils/crypto.js), que remove `< > " ' \`` e corta em 60
 * caracteres. Um username gravado com um desses cinco caracteres, ou com mais
 * de 60, NUNCA pode ser redigitado na tela de login — o e-mail que ela monta
 * não é o que está no Auth. O provisionamento respondia SUCESSO e o
 * estabelecimento nascia com um admin que não consegue entrar, sem nenhuma
 * mensagem em lugar nenhum.
 *
 * Daí a invariante que este módulo garante e o teste verifica como
 * propriedade: para todo username que passa daqui,
 * `sanitizeInput(username) === username`. `sanitizeInput` nunca remove
 * `[a-z0-9._-]` e o limite aqui (30) é menor que o corte dele (60), então a
 * tela de login sempre reproduz o que foi gravado.
 *
 * A regra é a MESMA de `normalizarUsername` em src/lib/console.js. Não há como
 * importar de `src/` aqui (o deploy da função só empacota a pasta dela e
 * `_shared/`), então a duplicação é inevitável — e o teste compara as duas
 * implementações input por input para que não divirjam com o tempo.
 */

/** Limites — os mesmos `maxLength` do NovoEstabelecimentoModal. */
export const MAX_NOME = 80;
export const MAX_ADMIN_NOME = 80;
export const MAX_USERNAME = 30;
export const MIN_USERNAME = 3;
export const MIN_SENHA = 6;
export const MAX_SENHA = 100;

/**
 * Rótulo de subdomínio tem no máximo 63 caracteres (RFC 1035) e o slug ainda
 * pode receber um sufixo numérico no laço de unicidade da RPC. 40 deixa
 * folga. Sem este teto, um nome comprido gera um slug comprido, o subdomínio
 * do estabelecimento fica inalcançável quando o domínio for ligado, e o
 * e-mail `${username}@${slug}.local` deixa de ser válido — de novo em
 * silêncio, no dia em que TENANT_ROOT_DOMAIN entrar.
 */
export const MAX_SLUG = 40;

/**
 * Idêntica a `normalizarUsername` de src/lib/console.js. NÃO corta o tamanho
 * de propósito: cortar gravaria um username diferente do pedido e o chamador
 * acharia que deu certo. Quem valida recusa alto (ver `validarEntradaProvisionamento`).
 */
export function normalizarUsername(raw: unknown): string {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // remove acentos
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9._-]/g, "");
}

/**
 * Mesma regra de `public.slugify_tenant` (20260741): sem acento, minúsculo,
 * só `[a-z0-9]`. Aqui, diferente do username, CORTAR é o certo — o slug é
 * derivado, não digitado por ninguém, e o laço de unicidade da RPC continua
 * garantindo que não colida.
 */
export function normalizarSlug(raw: unknown): string {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "")
    .slice(0, MAX_SLUG);
}

/**
 * Lê uma coordenada do corpo. `Number(null)`, `Number("")`, `Number([])` e
 * `Number(false)` todos valem 0 — e 0 passa em qualquer teste de faixa. Sem
 * esta função, mandar `origem_lat: null` com endereço preenchido semeava a
 * origem do delivery em (0, 0), no golfo da Guiné, e toda taxa por
 * quilômetro daquele estabelecimento saía errada sem ninguém ver.
 *
 * @returns o número, ou null quando não veio coordenada de verdade.
 */
export function coordenada(raw: unknown, limite: number): number | null {
  if (typeof raw === "number") {
    return Number.isFinite(raw) && raw >= -limite && raw <= limite ? raw : null;
  }
  if (typeof raw === "string") {
    const texto = raw.trim();
    if (!texto) return null;
    const n = Number(texto);
    return Number.isFinite(n) && n >= -limite && n <= limite ? n : null;
  }
  return null;
}

export interface EntradaProvisionamento {
  nome: string;
  slug: string | null;
  planoCodigo: string;
  tema: unknown;
  username: string;
  password: string;
  adminName: string;
}

export interface ResultadoValidacao {
  erro: string | null;
  dados: EntradaProvisionamento | null;
}

function erro(mensagem: string): ResultadoValidacao {
  return { erro: mensagem, dados: null };
}

/**
 * O corpo vem de JSON de terceiro: um campo pode chegar como `false`, `0`,
 * `[]` ou objeto. `String(false)` é `"false"` e `String(0)` é `"0"` — passar
 * isso pelo normalizador GRAVA lixo como se fosse informação (um admin com
 * username "false"). Aqui, o que não é texto é tratado como ausente e cai na
 * mesma recusa de campo obrigatório.
 */
function comoTexto(valor: unknown): string {
  return typeof valor === "string" ? valor : "";
}

/**
 * Valida e normaliza o corpo do provisionamento. Devolve `{ erro }` com uma
 * frase em português para o Console, ou `{ dados }` já normalizado.
 */
export function validarEntradaProvisionamento(body: unknown): ResultadoValidacao {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return erro("Corpo inválido.");
  }
  const corpo = body as Record<string, unknown>;
  const adminBruto = corpo.admin;
  const admin = (adminBruto && typeof adminBruto === "object" && !Array.isArray(adminBruto)
    ? adminBruto
    : {}) as Record<string, unknown>;

  const nome = comoTexto(corpo.nome).trim();
  if (!nome) return erro("O nome do estabelecimento é obrigatório.");
  if (nome.length > MAX_NOME) {
    return erro(`O nome do estabelecimento pode ter no máximo ${MAX_NOME} caracteres.`);
  }

  const planoCodigo = comoTexto(corpo.plano_codigo).trim() || "avancado";

  // Slug: sempre mandamos um derivado e cortado, para que o slug que a RPC
  // grava seja limitado mesmo quando o corpo não pede nenhum. Vazio vira null
  // e a RPC cai no fallback dela ('tenant').
  const slug = normalizarSlug(comoTexto(corpo.slug)) || normalizarSlug(nome) || null;

  const adminName = comoTexto(admin.name).trim();
  if (!adminName) return erro("O nome do admin é obrigatório.");
  if (adminName.length > MAX_ADMIN_NOME) {
    return erro(`O nome do admin pode ter no máximo ${MAX_ADMIN_NOME} caracteres.`);
  }

  const username = normalizarUsername(comoTexto(admin.username));
  if (!username) {
    return erro("O usuário de acesso do admin é obrigatório (letras, números, ponto, hífen ou sublinhado).");
  }
  if (username.length < MIN_USERNAME) {
    return erro(`O usuário de acesso precisa ter ao menos ${MIN_USERNAME} caracteres.`);
  }
  if (username.length > MAX_USERNAME) {
    return erro(`O usuário de acesso pode ter no máximo ${MAX_USERNAME} caracteres.`);
  }

  // A senha NÃO passa por trim: cortar espaço aqui gravaria no Auth uma senha
  // diferente da que a pessoa recebeu para digitar.
  const password = comoTexto(admin.password);
  if (!password) return erro("A senha do admin é obrigatória.");
  if (password.length < MIN_SENHA) {
    return erro(`A senha do admin precisa ter ao menos ${MIN_SENHA} caracteres.`);
  }
  if (password.length > MAX_SENHA) {
    return erro(`A senha do admin pode ter no máximo ${MAX_SENHA} caracteres.`);
  }

  return {
    erro: null,
    dados: {
      nome,
      slug,
      planoCodigo,
      tema: corpo.tema ?? {},
      username,
      password,
      adminName,
    },
  };
}
