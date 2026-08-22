/**
 * Quem é a empresa por trás do site — o que precisa aparecer no rodapé e
 * na política de privacidade.
 *
 * Isto NÃO fica escrito no código. Razão social, CNPJ, endereço e
 * e-mail são dado real de uma empresa real: hardcodar significa que o
 * dia em que mudar o endereço vira deploy, e que qualquer fork da
 * plataforma sai publicando o CNPJ de outra pessoa. Tudo vem de
 * `VITE_EMPRESA_*` (mesma regra de `VITE_CONTATO_URL`).
 *
 * O que não estiver configurado volta como `null` — a tela mostra só o
 * que existe, em vez de imprimir "CNPJ:" com nada do lado. É por isso
 * que `dadosDaEmpresa()` devolve campos separados e não um texto
 * pronto: quem desenha a tela decide o que fazer com a ausência.
 *
 * Funções puras (o ambiente entra por parâmetro) para o teste conseguir
 * variar a configuração sem tocar no build.
 */

/** Texto de env: string limpa, ou `null` quando não configurado. */
function texto(valor) {
  const limpo = String(valor ?? "").trim();
  return limpo || null;
}

/**
 * Telefone legível a partir do link de conversa (`VITE_CONTATO_URL`,
 * algo como `https://wa.me/5511999999999`). O rodapé precisa mostrar o
 * NÚMERO, não a URL — ninguém lê "wa.me/55..." como telefone.
 *
 * Devolve `null` quando o link não tem número reconhecível: link de
 * grupo, link encurtado, campo vazio. Melhor não mostrar telefone
 * nenhum do que mostrar um pedaço de URL no lugar dele.
 */
export function telefoneDoLink(contatoUrl) {
  const digitos = String(contatoUrl ?? "").replace(/\D/g, "");
  // Sai o 55 do Brasil quando ele está lá; sobra DDD + número.
  const nacional =
    digitos.length > 11 && digitos.startsWith("55") ? digitos.slice(2) : digitos;
  if (nacional.length < 10 || nacional.length > 11) return null;
  const ddd = nacional.slice(0, 2);
  const resto = nacional.slice(2);
  const meio = resto.length === 9 ? resto.slice(0, 5) : resto.slice(0, 4);
  const fim = resto.length === 9 ? resto.slice(5) : resto.slice(4);
  return `(${ddd}) ${meio}-${fim}`;
}

/**
 * Identificação da empresa para rodapé e política. `env` entra por
 * parâmetro só para o teste; em produção é o `import.meta.env`.
 */
export function dadosDaEmpresa(env = import.meta.env) {
  const contatoUrl = texto(env?.VITE_CONTATO_URL);

  return {
    razaoSocial: texto(env?.VITE_EMPRESA_RAZAO_SOCIAL),
    cnpj: texto(env?.VITE_EMPRESA_CNPJ),
    endereco: texto(env?.VITE_EMPRESA_ENDERECO),
    email: texto(env?.VITE_EMPRESA_EMAIL),
    contatoUrl,
    telefone: telefoneDoLink(contatoUrl),
  };
}

/**
 * Existe algum jeito de a pessoa falar com a gente? É o que decide se a
 * política pode dizer "peça a exclusão por aqui" — sem canal nenhum
 * configurado, a frase seria uma promessa sem endereço.
 */
export function temCanalDeContato(empresa) {
  return !!(empresa?.email || empresa?.contatoUrl);
}
