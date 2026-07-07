import { renderizarRecibo, renderizarViaProducao, abrirJanelaImpressao } from "../renderizar";
import { larguraEmPx } from "../largura";

/**
 * Driver "browser-raster" — F020 (decisão 025). DEFAULT, gratuito:
 * renderiza o mesmo HTML/CSS do F015 e abre a janela nativa de
 * impressão do navegador. A única diferença do F015 é que a largura/
 * margem do papel agora vem do perfil, injetada como CSS custom
 * properties (`--print-*`) — sem perfil, cai nos defaults do próprio
 * `.css` (80mm, idêntico ao comportamento anterior).
 */

function renderizarHtml(documento) {
  return documento?.tipo === "via_producao"
    ? renderizarViaProducao(documento)
    : renderizarRecibo(documento);
}

// Só declara a custom property se o perfil pedir algo diferente do
// default do template — não força fonte pequena/grande sem motivo.
function variaveisCss(perfil) {
  const larguraMm = Number(perfil?.larguraMm) || 80;
  const margemMm = perfil?.margemMm ?? 2;
  const variaveis = {
    "--print-width": `${larguraEmPx(larguraMm)}px`,
    "--print-padding-h": `${larguraEmPx(margemMm)}px`,
  };
  if (perfil?.fonteBase) variaveis["--print-font-base"] = `${Number(perfil.fonteBase)}px`;
  return variaveis;
}

function injetarVariaveisCss(html, variaveis) {
  const declaracoes = Object.entries(variaveis).map(([token, valor]) => `${token}: ${valor};`).join(" ");
  return html.replace("<head>", `<head><style>:root { ${declaracoes} }</style>`);
}

/**
 * Monta o HTML final (documento + CSS do perfil) — pura, sem abrir
 * janela nenhuma. Reaproveitada pelo preview de `PerfilImpressora.jsx`
 * (mesma renderização exata que sai na impressão de verdade).
 *
 * @param {object} documento - retorno de montarComprovantePagamento/montarCupomPreNota/montarViaProducao
 * @param {object} [perfil] - perfilImpressora (largura/margem/fonte) — ver src/lib/impressao.js
 * @returns {string}
 */
export function gerarHtmlComPerfil(documento, perfil) {
  return injetarVariaveisCss(renderizarHtml(documento), variaveisCss(perfil));
}

/**
 * @param {object} documento - retorno de montarComprovantePagamento/montarCupomPreNota/montarViaProducao
 * @param {object} [perfil] - perfilImpressora (largura/margem/fonte) — ver src/lib/impressao.js
 * @returns {Promise<{error: object|null}>}
 */
export async function imprimir(documento, perfil) {
  return abrirJanelaImpressao(gerarHtmlComPerfil(documento, perfil));
}
