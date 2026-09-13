// F020 — tamanho da letra na impressora TÉRMICA (ESC/POS).
//
// O controle "Tamanho da letra" do perfil grava PIXELS (`fonteBase`),
// que é a única medida que o preview HTML entende. A térmica não tem
// CSS: ela muda de tamanho por COMANDO — fonte A/B (`ESC M`) e
// multiplicador de largura/altura (`GS !`). Este módulo é a tradução
// entre os dois mundos.
//
// Ele existe FORA dos drivers porque a conta de COLUNAS depende dele:
// letra com o dobro da largura cabe metade dos caracteres na linha, e
// formatar em 48 colunas o que a impressora vai imprimir em 24 é
// exatamente a comanda embaralhada que o driver ESC/POS já viu antes
// (por isso o driver tinha passado a ignorar a fonte por completo —
// ignorar consertava a comanda torta, mas deixava o controle sem efeito
// nenhum na térmica, que é o bug que este módulo fecha).
//
// Os quatro tamanhos são o que a impressora sabe fazer de verdade —
// não uma escala contínua de px, que ela não tem:
//   pequena → Fonte B (letra miúda, cabe MAIS texto na linha)
//   normal  → Fonte A, 1x (o padrão de fábrica)
//   alta    → Fonte A com o dobro da ALTURA (mesma largura, mesmas
//             colunas: cresce a letra sem mexer no layout — é o degrau
//             que resolve "a térmica está saindo com letra pequena")
//   grande  → Fonte A com o dobro da altura E da largura (metade das
//             colunas; o formatador reflui o texto pra caber)

export const TAMANHO_TERMICA_PADRAO = "normal";

export const TAMANHOS_TERMICA = ["pequena", "normal", "alta", "grande"];

// Faixas do slider (11–22px, default 13) → degraus reais da impressora.
// Ordem importa: vale a primeira faixa em que o valor cabe.
const FAIXAS = [
  { atePx: 12, tamanho: "pequena" },
  { atePx: 16, tamanho: "normal" },
  { atePx: 19, tamanho: "alta" },
];

/**
 * Traduz o tamanho de fonte do perfil (px, do preview) para o degrau
 * que a térmica entende. Sem fonte definida (`null` = "padrão do
 * modelo") o resultado é o padrão da impressora.
 *
 * @param {number|null|undefined} fonteBase
 * @returns {"pequena"|"normal"|"alta"|"grande"}
 */
export function tamanhoTermicaDeFonteBase(fonteBase) {
  const px = Number(fonteBase);
  if (!Number.isFinite(px) || px <= 0) return TAMANHO_TERMICA_PADRAO;
  return FAIXAS.find((faixa) => px <= faixa.atePx)?.tamanho ?? "grande";
}

/**
 * Normaliza o que chegou de fora (config antiga, valor digitado errado)
 * para um tamanho válido — mesma regra que a Ponte aplica do lado dela.
 *
 * @param {string} tamanho
 * @returns {"pequena"|"normal"|"alta"|"grande"}
 */
export function normalizarTamanhoTermica(tamanho) {
  return TAMANHOS_TERMICA.includes(tamanho) ? tamanho : TAMANHO_TERMICA_PADRAO;
}

// Multiplicador de LARGURA do caractere — é o que muda quantas colunas
// cabem na linha. Altura não entra: letra mais alta ocupa as mesmas
// colunas.
const FATOR_LARGURA = { pequena: 1, normal: 1, alta: 1, grande: 2 };

/** @param {string} tamanho @returns {number} */
export function fatorLarguraTermica(tamanho) {
  return FATOR_LARGURA[normalizarTamanhoTermica(tamanho)];
}

/** Fonte B (a miúda) é a única que troca a fonte da impressora. */
export function usaFonteMiuda(tamanho) {
  return normalizarTamanhoTermica(tamanho) === "pequena";
}

// Frase que o dono lê embaixo do controle, na tela de Impressão. Fala do
// papel, não do protocolo: ninguém precisa saber o que é "Fonte B".
export const EXPLICACAO_TAMANHO_TERMICA = {
  pequena: "Letra miúda — cabe mais texto por linha.",
  normal: "Letra padrão da impressora.",
  alta: "Letra alta — o dobro da altura, sem mudar o texto que cabe na linha.",
  grande: "Letra grande — o dobro da altura e da largura; cabe metade do texto por linha.",
};

// Os degraus como o dono escolhe na tela de Impressão, com o valor em px
// que cada um grava no perfil (`fonteBase`) — o modelo continua sendo
// pixels, porque é o que o preview HTML usa. "Padrão" grava `null`, que
// é o "padrão do modelo" de cada template (comprovante 13px, via de
// produção 15px). Os px escolhidos têm que voltar pro mesmo degrau em
// `tamanhoTermicaDeFonteBase` — tem teste garantindo isso.
export const OPCOES_TAMANHO_TERMICA = [
  { tamanho: "pequena", rotulo: "Miúda", px: 11 },
  { tamanho: "normal", rotulo: "Padrão", px: null },
  { tamanho: "alta", rotulo: "Alta", px: 18 },
  { tamanho: "grande", rotulo: "Grande", px: 22 },
];

// ── Ponte antiga ────────────────────────────────────────────────────
// O tamanho da letra é a primeira coisa que o app pede à Ponte e que
// uma Ponte antiga não sabe fazer. E não dá pra ignorar a diferença: as
// colunas do texto já são calculadas com o tamanho novo, então uma Ponte
// que não muda a letra imprimiria a comanda com a largura errada (miúda
// estoura o papel, grande sai pela metade). Por isso a tela pergunta a
// versão (GET /impressoras devolve `versao`) e avisa quem precisa
// atualizar o programa antes de escolher.
export const VERSAO_PONTE_COM_TAMANHO = "1.1.0";

/**
 * Esta Ponte entende o tamanho da letra? Versão ausente = Ponte anterior
 * a esta funcionalidade (ela nem devolvia a versão nessa chamada).
 *
 * @param {string|null|undefined} versao
 * @returns {boolean}
 */
export function ponteEntendeTamanho(versao) {
  const atual = String(versao ?? "").split(".").map(Number);
  if (atual.length < 2 || atual.some((n) => !Number.isInteger(n) || n < 0)) return false;
  const minima = VERSAO_PONTE_COM_TAMANHO.split(".").map(Number);
  for (let i = 0; i < minima.length; i += 1) {
    const parte = atual[i] ?? 0;
    if (parte !== minima[i]) return parte > minima[i];
  }
  return true;
}
