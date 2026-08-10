/**
 * Identificação da empresa e versão dos documentos legais.
 *
 * A versão é o que fica gravado no `tenants.termos_versao` quando um
 * estabelecimento é provisionado: sem ela, "o cliente aceitou os termos" não
 * diz NADA — os termos mudam, e o que vale é qual texto ele leu. Mexeu no
 * conteúdo de `termosDeUso.js` ou de `politicaPrivacidade.js` de um jeito que
 * muda direito ou obrigação? Sobe a versão aqui.
 *
 * A identificação da empresa vem de ambiente, não do código: quem opera a
 * plataforma pode não ser quem escreveu isto (revenda, mudança de razão
 * social, CNPJ que ainda vai ser aberto). Faltando, a página diz que falta —
 * um Termo de Uso sem quem se obriga por ele não obriga ninguém, e é melhor
 * o dono ver o aviso na própria tela do que descobrir na primeira disputa.
 */

/** Muda quando o texto muda direito/obrigação. Formato: "1", "2", "3"… */
export const VERSAO_LEGAL = "1";

/** Data em que ESTA versão passou a valer (ISO, exibida em pt-BR). */
export const VIGENTE_DESDE = "2026-08-10";

const texto = (v) => (typeof v === "string" ? v.trim() : "");

const razaoSocial = texto(import.meta.env.VITE_EMPRESA_RAZAO_SOCIAL);
const cnpj = texto(import.meta.env.VITE_EMPRESA_CNPJ);
const email = texto(import.meta.env.VITE_EMPRESA_EMAIL);

export const EMPRESA = Object.freeze({
  /** Nome comercial da plataforma. O produto é white-label para o
   *  estabelecimento, mas o CONTRATO é com quem vende o software. */
  nome: texto(import.meta.env.VITE_EMPRESA_NOME) || "KORA",
  razaoSocial,
  cnpj,
  endereco: texto(import.meta.env.VITE_EMPRESA_ENDERECO),
  email,
  /** Encarregado de dados (LGPD art. 41). Sem canal próprio, cai no contato. */
  emailEncarregado: texto(import.meta.env.VITE_EMPRESA_EMAIL_DPO) || email,
  foro: texto(import.meta.env.VITE_EMPRESA_FORO),
});

/**
 * O mínimo para o documento se sustentar: quem se obriga (razão social +
 * CNPJ) e por onde falar com ele. Sem os três, a página mostra o aviso.
 */
export const IDENTIFICACAO_COMPLETA = Boolean(razaoSocial && cnpj && email);

/** "10 de agosto de 2026" — data por extenso, sem depender de locale do SO. */
export function dataPorExtenso(iso) {
  const [ano, mes, dia] = String(iso).split("-").map(Number);
  const meses = [
    "janeiro", "fevereiro", "março", "abril", "maio", "junho",
    "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
  ];
  if (!ano || !mes || !dia || !meses[mes - 1]) return String(iso);
  return `${dia} de ${meses[mes - 1]} de ${ano}`;
}
