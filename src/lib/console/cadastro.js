import {
  MAX_SLUG, SLUGS_RESERVADOS, normalizarSlug, sugerirSlugLivre
} from "../slugEstabelecimento";

// Cadastro de estabelecimento: usuário, endereço, validação do formulário e senha provisória.
/**
 * Normaliza o username do 1º admin do estabelecimento para a convenção
 * de login global do app (email = `${username}@gastromundi.local`):
 * minúsculas, sem espaços, só [a-z0-9._-]. Enquanto o login não é ciente
 * de tenant, o username precisa ser único na plataforma inteira — por
 * isso a normalização é previsível (o mesmo texto vira sempre o mesmo
 * username, evitando duplicatas "invisíveis" por caixa/acentuação).
 *
 * @param {string} raw
 * @returns {string}
 */
export function normalizarUsername(raw) {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // remove acentos
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9._-]/g, "");
}

/** Limite de tamanho do usuário de acesso — o mesmo do campo do formulário. */
export const MAX_USERNAME = 30;

/** Mínimo de caracteres do usuário de acesso, cobrado na validação de envio. */
export const MIN_USERNAME = 3;

/**
 * Usuário de acesso sugerido a partir do nome do responsável (CONSOLE-UX 22):
 * `José Maria` → `josemaria`. É o que o campo mostra enquanto ninguém o editar.
 *
 * Devolve "" quando o nome não produz um usuário aceitável (vazio, só símbolos
 * ou curto demais). Campo vazio é melhor que campo preenchido com algo que a
 * validação vai recusar: quem lê "ze" no lugar não tem como adivinhar que o
 * problema é o tamanho.
 *
 * @param {string} nome nome do responsável, como foi digitado
 * @returns {string} usuário normalizado, ou "" se não der para sugerir
 */
export function usernameSugeridoDoNome(nome) {
  const bruto = normalizarUsername(nome);
  // Corta pelo mesmo teto do campo, e não deixa o corte terminar em separador.
  const cortado =
    bruto.length > MAX_USERNAME ? bruto.slice(0, MAX_USERNAME).replace(/[._-]+$/, "") : bruto;
  return cortado.length >= MIN_USERNAME ? cortado : "";
}

/**
 * Candidato de usuário livre depois de o servidor recusar por "usuário já em
 * uso" (CONSOLE-UX 21). É chute educado, não verificação: `public.users` não é
 * legível pelo Console, então quem confirma continua sendo o envio.
 *
 * A regra segue a mesma ideia do laço de slug: primeiro tenta distinguir pelo
 * estabelecimento (`admin` + `bardoze` → `admin.bardoze`), porque é isso que
 * separa dois clientes cujo responsável se chama igual; só depois recorre ao
 * número (`admin.bardoze2`, `admin.bardoze3`…). Se o usuário digitado já
 * termina no endereço da loja, pula direto para o número — `admin.bardoze` não
 * vira `admin.bardoze.bardoze`.
 *
 * @param {string} usuario usuário que foi recusado
 * @param {{slug?: string, tentativa?: number}} opcoes endereço do
 *   estabelecimento e o número da recusa (1 na primeira)
 * @returns {string} candidato normalizado, ou "" se o usuário for vazio
 */
export function sugerirUsuarioLivre(usuario, { slug = "", tentativa = 1 } = {}) {
  const base = normalizarUsername(usuario);
  if (!base) return "";

  const loja = normalizarUsername(slug);
  const jaTemLoja = Boolean(loja) && base.endsWith(`.${loja}`);
  const raiz = loja && !jaTemLoja ? `${base}.${loja}` : base;

  const montar = (numero) => {
    const sufixo = numero > 1 ? String(numero) : "";
    const limite = MAX_USERNAME - sufixo.length;
    // Corta a base, nunca o número — e não deixa o corte terminar em separador.
    const corpo = raiz.length > limite ? raiz.slice(0, limite).replace(/[._-]+$/, "") : raiz;
    return corpo + sufixo;
  };

  const recusa = Math.max(1, Math.floor(Number(tentativa) || 1));
  // Quando não há nada a acrescentar à base, a primeira sugestão já é numérica.
  let numero = recusa + (raiz === base ? 1 : 0);
  let candidato = montar(numero);
  // Base longa demais pode voltar ao próprio usuário recusado depois do corte.
  for (let i = 0; i < 5 && candidato === base; i += 1) {
    numero = Math.max(2, numero + 1);
    candidato = montar(numero);
  }
  return candidato.length >= 3 ? candidato : base + String(numero);
}

// Endereço (slug) do estabelecimento: as regras moram em
// `@/lib/slugEstabelecimento` porque o site institucional (apex) precisa das
// MESMAS — e não pode arrastar este módulo, que puxa supabase, layouts e
// geocodificação para dentro de uma página pública. Reexportadas aqui para
// quem já as importava do Console.
export { MAX_SLUG, SLUGS_RESERVADOS, normalizarSlug, sugerirSlugLivre };

/**
 * Função pura — valida o formulário de "Criar estabelecimento" ANTES de
 * chamar a Edge Function (prevenção de erro > mensagem de erro,
 * Princípio nº1). Devolve um mapa de erros por campo; `ok` é true só
 * quando o mapa está vazio. Não faz I/O — testável isoladamente
 * (CLAUDE.md: função pura nasce com teste).
 *
 * `slugsEmUso` vazio significa "não sei de nenhum ocupado" (lista ainda
 * carregando): não inventa conflito, e o banco segue sendo a barreira final.
 *
 * @param {{nome?:string, slug?:string, planoCodigo?:string, adminNome?:string, adminUsername?:string, adminPassword?:string}} f
 * @param {string[]} slugsEmUso slugs dos estabelecimentos que já existem
 * @returns {{ok: boolean, erros: Record<string,string>}}
 */
export function validarNovoEstabelecimento(f = {}, slugsEmUso = []) {
  const erros = {};

  const nome = String(f.nome ?? "").trim();
  if (!nome) erros.nome = "Informe o nome do estabelecimento.";

  const slug = normalizarSlug(f.slug);
  if (!slug) {
    erros.slug = "Informe o endereço do cardápio.";
  } else {
    const ocupados = (slugsEmUso ?? []).map((s) => normalizarSlug(s));
    const livre = sugerirSlugLivre(slug, ocupados);
    if (SLUGS_RESERVADOS.includes(slug)) {
      erros.slug = `"${slug}" é um endereço reservado pelo sistema. Use ${livre}, por exemplo.`;
    } else if (ocupados.includes(slug)) {
      erros.slug = `Já existe um estabelecimento neste endereço. Use ${livre}, por exemplo.`;
    }
  }

  if (!String(f.planoCodigo ?? "").trim()) erros.planoCodigo = "Escolha um plano.";

  const adminNome = String(f.adminNome ?? "").trim();
  if (!adminNome) erros.adminNome = "Informe o nome do responsável.";

  const username = normalizarUsername(f.adminUsername);
  if (!username) {
    erros.adminUsername = "Informe o usuário de acesso do responsável.";
  } else if (username.length < MIN_USERNAME) {
    erros.adminUsername = "O usuário precisa ter ao menos 3 caracteres.";
  }

  const senha = String(f.adminPassword ?? "");
  if (!senha) {
    erros.adminPassword = "Defina uma senha para o responsável.";
  } else if (senha.length < 6) {
    erros.adminPassword = "A senha precisa ter ao menos 6 caracteres.";
  }

  return { ok: Object.keys(erros).length === 0, erros };
}

/**
 * O cadastro de estabelecimento tem algo digitado? (CONSOLE-UX 23) É o que
 * decide se fechar o modal pergunta antes de descartar.
 *
 * Só conta campo DIGITÁVEL. O plano fica de fora de propósito: ele já vem
 * escolhido quando o modal abre, então perguntar por causa dele seria perguntar
 * sempre. Espaço em branco também não conta — não é dado que se lamente perder.
 *
 * Os campos derivados (endereço do cardápio, usuário de acesso) entram pelo que
 * o dono digitou neles, não pela derivação: quem os deriva é o nome de origem,
 * que já está na lista.
 *
 * @param {object} f campos do formulário, como estão na tela
 * @returns {boolean} true se há algo a perder ao fechar
 */
export function cadastroTemDados(f = {}) {
  const campos = [f.nome, f.slug, f.endereco, f.mensalidade, f.adminNome, f.adminUsername];
  const digitado = campos.some((c) => String(c ?? "").trim() !== "");
  // A senha vai à parte: nela, espaço é caractere legítimo, e ela é o dado que
  // mais dói perder — sorteada uma vez, não é relida de lugar nenhum.
  return digitado || String(f.adminPassword ?? "") !== "";
}

// ── Senha provisória do responsável (CONSOLE-UX 20) ────────────────
//
// O dono lê essa senha em voz alta para o cliente na hora da venda, então o
// alfabeto não tem nada que se confunda ao ditar: sem 0/O/o, sem 1/l/i, sem
// maiúscula. 10 caracteres em 31 símbolos dão ~49 bits — sobra para uma senha
// provisória, e ainda cabe num bilhete.
const LETRAS_SENHA = "abcdefghjkmnpqrstuvwxyz";
const DIGITOS_SENHA = "23456789";
const ALFABETO_SENHA = LETRAS_SENHA + DIGITOS_SENHA;
const TAMANHO_SENHA = 10;

/**
 * Sorteio uniforme em [0, limite) a partir de `crypto.getRandomValues`.
 * O `% limite` cru enviesaria os primeiros índices, então a cauda que não
 * fecha um ciclo inteiro é descartada. `Math.random` não entra aqui: é
 * previsível e isto é material de senha.
 */
function sortearIndice(limite) {
  const buf = new Uint32Array(1);
  const teto = Math.floor(0x100000000 / limite) * limite;
  let n;
  do {
    globalThis.crypto.getRandomValues(buf);
    n = buf[0];
  } while (n >= teto);
  return n % limite;
}

/**
 * Senha provisória forte para o responsável do estabelecimento novo.
 *
 * Garante ao menos uma letra e ao menos um dígito — não por regra de
 * validação, mas porque uma senha sorteada que saísse só de dígitos
 * pareceria fraca para quem a lê, e o aviso da tela a marcaria como tal.
 *
 * @returns {string} 10 caracteres de `ALFABETO_SENHA`
 */
export function gerarSenhaProvisoria() {
  const chars = [
    LETRAS_SENHA[sortearIndice(LETRAS_SENHA.length)],
    DIGITOS_SENHA[sortearIndice(DIGITOS_SENHA.length)],
  ];
  while (chars.length < TAMANHO_SENHA) {
    chars.push(ALFABETO_SENHA[sortearIndice(ALFABETO_SENHA.length)]);
  }
  // Embaralha (Fisher–Yates) para a letra e o dígito obrigatórios não ficarem
  // sempre nas duas primeiras posições.
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = sortearIndice(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

/** As senhas que qualquer ataque tenta primeiro. Minúsculas, já normalizadas. */
const SENHAS_OBVIAS = [
  "123456", "1234567", "12345678", "123456789", "111111", "000000",
  "senha", "senha123", "admin", "admin123", "mudar123", "qwerty", "abc123",
];

/**
 * Função pura — avalia a senha digitada para AVISAR, nunca para barrar. Quem
 * barra é `validarNovoEstabelecimento` (mínimo de 6, a mesma regra da borda);
 * aqui só dizemos ao dono que ele está prestes a entregar `123456` como senha
 * do administrador de um cliente pagante.
 *
 * @param {string} senha
 * @param {string} usuario usuário de acesso digitado, para pegar senha = login
 * @returns {{nivel: ""|"fraca"|"media"|"forte", motivo: string}}
 */
export function forcaDaSenha(senha, usuario = "") {
  const s = String(senha ?? "");
  if (!s) return { nivel: "", motivo: "" };

  const minusculas = s.toLowerCase();
  const login = normalizarUsername(usuario);

  if (SENHAS_OBVIAS.includes(minusculas)) {
    return { nivel: "fraca", motivo: "é uma das primeiras que qualquer invasor tenta." };
  }
  if (login && minusculas === login) {
    return { nivel: "fraca", motivo: "é igual ao usuário de acesso." };
  }
  if (s.length < 8) {
    return { nivel: "fraca", motivo: "tem menos de 8 caracteres." };
  }
  if (/^\d+$/.test(s)) {
    return { nivel: "fraca", motivo: "só tem números, misture letras." };
  }
  if (/^[a-zA-Z]+$/.test(s)) {
    return { nivel: "fraca", motivo: "só tem letras, misture números." };
  }

  const variedade =
    (/[a-z]/.test(s) ? 1 : 0) +
    (/[A-Z]/.test(s) ? 1 : 0) +
    (/\d/.test(s) ? 1 : 0) +
    (/[^a-zA-Z0-9]/.test(s) ? 1 : 0);

  if (s.length >= 14 || variedade >= 3 || (s.length >= 10 && variedade >= 2)) {
    return { nivel: "forte", motivo: "" };
  }
  return { nivel: "media", motivo: "dá para melhorar: 10 caracteres ou mais." };
}
