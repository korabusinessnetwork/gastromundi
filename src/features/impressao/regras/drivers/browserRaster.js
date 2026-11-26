import { renderizarRecibo, renderizarViaProducao, renderizarComprovanteCaixa, abrirJanelaImpressao } from "../renderizar";
import { larguraEmPx } from "../largura";
import { resolverCor } from "@/lib/tema";

/**
 * Driver "browser-raster" — F020 (decisão 025). DEFAULT, gratuito:
 * renderiza o mesmo HTML/CSS do F015 e abre a janela nativa de
 * impressão do navegador. A única diferença do F015 é que a largura/
 * margem do papel agora vem do perfil, injetada como CSS custom
 * properties (`--print-*`) — sem perfil, cai nos defaults do próprio
 * `.css` (80mm, idêntico ao comportamento anterior).
 */

function renderizarHtml(documento) {
  if (documento?.tipo === "via_producao") return renderizarViaProducao(documento);
  if (documento?.tipo === "comprovante_caixa") return renderizarComprovanteCaixa(documento);
  return renderizarRecibo(documento);
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
  // A janela de impressão e a prévia são documentos à parte, sem o tema do
  // estabelecimento: as duas cores que o papel usa vão resolvidas. O valor vem
  // do tema gravado no banco e é escrito dentro de um <style>, então só passa o
  // que tem forma de cor; o resto fica de fora e o CSS cai na cor reserva.
  for (const token of ["--gm-accent", "--gm-warn"]) {
    const cor = resolverCor(token);
    if (ehCorSegura(cor)) variaveis[token] = cor;
  }
  if (perfil?.fonteBase) variaveis["--print-font-base"] = `${Number(perfil.fonteBase)}px`;
  return variaveis;
}

// Hexadecimal, rgb/rgba/hsl/hsla só com número, vírgula, ponto, % e barra, ou
// nome de cor. Nada que feche a tag de estilo ou abra outra.
const COR_SEGURA = /^(#[0-9a-f]{3,8}|(rgb|rgba|hsl|hsla)\([0-9.,%\s/]+\)|[a-z]+)$/i;

export function ehCorSegura(valor) {
  return typeof valor === "string" && COR_SEGURA.test(valor.trim());
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
 * @param {object} [perfil] - perfilImpressora (largura/margem/fonte) — ver src/features/impressao/dados/impressao.js
 * @returns {string}
 */
export function gerarHtmlComPerfil(documento, perfil) {
  return injetarVariaveisCss(renderizarHtml(documento), variaveisCss(perfil));
}

/**
 * @param {object} documento - retorno de montarComprovantePagamento/montarCupomPreNota/montarViaProducao
 * @param {object} [perfil] - perfilImpressora (largura/margem/fonte) — ver src/features/impressao/dados/impressao.js
 * @returns {Promise<{error: object|null}>}
 */
export async function imprimir(documento, perfil) {
  return abrirJanelaImpressao(gerarHtmlComPerfil(documento, perfil));
}
