import estilosComprovante from "./comprovante.css?raw";
import estilosProducao from "./producao.css?raw";
import { resolverBlocosComanda, fmtComanda, fmtR, logoUrlSegura } from "./layoutComanda";

// Reexportada: a allowlist de esquema do logo mora com o resolvedor de
// blocos (é ele quem decide se o logo sai), mas quem já importava daqui
// continua funcionando.
export { logoUrlSegura };

/**
 * Renderização/impressão — F015. Constrói o HTML da janela de
 * impressão a partir dos dados já montados por `src/lib/impressao.js`
 * (comprovante/cupom/via de produção) e abre a janela nativa do
 * navegador para imprimir (`window.print()`) — mesmo mecanismo que já
 * existia em `CheckoutView.jsx`, generalizado para os 3 templates.
 * Sem serviço/SDK de impressão pago (Restrições de Custo) — impressão
 * térmica "de verdade" continua disponível pelo driver da Ponte KORA
 * (`drivers/escposPonte.js`), não substituída aqui.
 */

/**
 * Escapa texto para interpolação segura no HTML da impressão. Nome de
 * produto, observação, comanda, garçom etc. são digitados por usuários
 * — sem escape, um `<img onerror=…>` num desses campos executaria
 * same-origin ao imprimir (stored XSS). Função pura, testada.
 *
 * @param {any} v
 * @returns {string}
 */
export function esc(v) {
  return String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

// --- Blocos do layout → HTML ------------------------------------------
// O QUE sai e em que ordem é decidido em `layoutComanda.js`, junto com o
// formatador da térmica. Aqui só se veste o resultado com tags: assim o
// preview da tela e o papel da impressora nunca discordam.

function classesEstilo(estilo, extra = "") {
  const classes = [extra];
  classes.push(`b-${{ esquerda: "esq", centro: "centro", direita: "dir" }[estilo?.alinhamento] ?? "esq"}`);
  if (estilo?.tamanho === "pequeno") classes.push("b-peq");
  if (estilo?.tamanho === "grande") classes.push("b-gr");
  if (estilo?.negrito) classes.push("b-negrito");
  return classes.filter(Boolean).join(" ");
}

function htmlItens(bloco) {
  const colunas = bloco.unitario ? 4 : 3;
  const linhas = bloco.itens
    .map((it) => `
      <tr>
        <td>${esc(it.nome)}</td>
        <td style="text-align:center;">${esc(it.qty)}</td>
        ${bloco.unitario ? `<td style="text-align:right;">${esc(it.unitario)}</td>` : ""}
        <td style="text-align:right;font-weight:bold;">${esc(it.total)}</td>
      </tr>
      ${it.obs.map((o) => `<tr><td colspan="${colunas}" class="obs">📝 ${esc(o)}</td></tr>`).join("")}
    `)
    .join("");

  // As larguras vêm do layout (o dono arrasta a divisória no editor) e
  // chegam aqui já somando 100%. Vão num `<colgroup>` porque é o único
  // lugar em que a largura vale para a coluna inteira; com
  // `table-layout: fixed` no CSS, é ele que manda.
  const colunasLargura = ["nome", "qtd", bloco.unitario ? "unitario" : null, "total"]
    .filter(Boolean)
    .map((c) => `<col style="width:${Number(bloco.larguras?.[c]) || 0}%" />`)
    .join("");

  // A classe distingue esta tabela da `.caixa-tabela` dos comprovantes de
  // caixa: só a lista de itens tem largura de coluna fixada (é ela que
  // precisa caber num papel de 58mm sem jogar o valor para fora).
  return `
    <table class="itens">
      <colgroup>${colunasLargura}</colgroup>
      <thead>
        <tr><th>Item</th><th>Qtd</th>${bloco.unitario ? "<th>Unit.</th>" : ""}<th>Total</th></tr>
      </thead>
      <tbody>${linhas}</tbody>
    </table>`;
}

/**
 * Cabeçalho de identidade dos COMPROVANTES DE CAIXA (F005: sangria,
 * suprimento, fechamento) e das reimpressões. Esses papéis não são a
 * comanda do cliente e por isso não passam pelo editor de blocos — o
 * dono não escolhe o layout de um comprovante de conferência de caixa.
 */
function blocoCabecalhoIdentidade(identidade, quando) {
  const logoValido = logoUrlSegura(identidade.logoUrl);
  // `quando` permite carimbar a data de emissão do documento (ex.: o
  // fechamento registrado às 23h reimpresso no dia seguinte). Sem ele,
  // ou com data inválida, cai na hora atual — comportamento de antes.
  const data = quando != null ? new Date(quando) : new Date();
  const dataValida = !Number.isNaN(data.getTime()) ? data : new Date();
  return `
    <div class="caixa-cabecalho">
      ${logoValido ? `<img class="caixa-cabecalho__logo" src="${esc(identidade.logoUrl)}" alt="${esc(identidade.nome)}" />` : `<div class="caixa-cabecalho__nome">${esc(identidade.nome)}</div>`}
      <div class="caixa-cabecalho__linha">${dataValida.toLocaleString("pt-BR")}</div>
    </div>
    ${(identidade.endereco || identidade.cnpj) ? `
      <div class="caixa-identidade">
        ${identidade.endereco ? `${esc(identidade.endereco)}<br/>` : ""}
        ${identidade.cnpj ? `CNPJ: ${esc(identidade.cnpj)}` : ""}
      </div>
    ` : ""}
  `;
}

/** Um bloco do layout da comanda (impressao/layoutComanda.js) vira HTML. */
function htmlBloco(bloco) {
  switch (bloco.tipo) {
    case "logo":
      return `<div class="${classesEstilo(bloco.estilo)}"><img class="cabecalho__logo" src="${esc(bloco.url)}" alt="${esc(bloco.alt)}" /></div>`;
    case "texto":
      return `<div class="${classesEstilo(bloco.estilo, bloco.classe)}">${bloco.linhas.map(esc).join("<br/>")}</div>`;
    case "valor":
      return `<div class="${classesEstilo(bloco.estilo, "linha-valor")}"><span>${esc(bloco.rotulo)}</span><span${bloco.destaque ? ' class="valor"' : ""}>${esc(bloco.valor)}</span></div>`;
    case "itens":
      return htmlItens(bloco);
    case "aviso":
      return `<div class="${classesEstilo(bloco.estilo, "aviso-nao-fiscal")}">${bloco.linhas.map(esc).join("<br/>")}</div>`;
    case "separador":
      return "<hr/>";
    case "espaco":
      return `<div class="espaco espaco--${Math.min(3, Math.max(1, bloco.linhas))}"></div>`;
    default:
      return "";
  }
}

/**
 * Monta o HTML do comprovante de pagamento OU do cupom/pré-nota — os
 * dois compartilham o mesmo template; o cupom só acrescenta o aviso
 * de "sem valor fiscal" (`dados.naoFiscal`).
 *
 * A ordem e a aparência de cada pedaço vêm de `dados.layout` (o layout
 * montado pelo dono em Configurações → Impressão → Layout da comanda).
 * Sem layout gravado, cai no padrão de fábrica — o papel de sempre.
 *
 * @param {object} dados - retorno de montarComprovantePagamento/montarCupomPreNota
 * @returns {string} HTML completo do documento
 */
export function renderizarRecibo(dados) {
  const { comanda, naoFiscal } = dados ?? {};
  const corpo = resolverBlocosComanda(dados?.layout, dados).map(htmlBloco).join("\n  ");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>${naoFiscal ? "Cupom" : "Comprovante"} · ${esc(fmtComanda(comanda))}</title>
  <style>${estilosComprovante}</style>
</head>
<body>
  ${corpo}
</body>
</html>`;
}

/**
 * Monta o HTML da via de produção (ticket de cozinha) — enxuto, sem
 * preço, sem forma de pagamento.
 *
 * `pontoNome` (opcional) é o nome do ponto de impressão dono desta via
 * — com vários pontos configurados, o mesmo pedido sai fatiado em mais
 * de um papel e quem está na bancada precisa ver de quem é o ticket na
 * primeira olhada. O template é burro de propósito: quem decide se
 * manda o nome (e qual) é `despacho.js`; com um ponto só, nada é
 * passado e o cabeçalho fica idêntico ao de hoje.
 *
 * @param {object} dados - retorno de montarViaProducao
 * @returns {string} HTML completo do documento
 */
export function renderizarViaProducao(dados) {
  const { comanda, apelido, mesa, garcom, horario, itens, pontoNome } = dados;

  const linhasItens = itens
    .map((it) => `
      <div class="item">
        <div class="item__linha">${esc(it.qty)}x ${it.emoji ? `${esc(it.emoji)} ` : ""}${esc(it.nome)}</div>
        ${it.obs.map((o) => `<div class="item__obs">📝 ${esc(o)}</div>`).join("")}
      </div>
    `)
    .join("");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Via de Produção · ${esc(fmtComanda(comanda))}</title>
  <style>${estilosProducao}</style>
</head>
<body>
  <div class="cabecalho">
    ${pontoNome ? `<div class="cabecalho__ponto">${esc(pontoNome)}</div>` : ""}
    <div class="cabecalho__titulo">${esc(fmtComanda(comanda))}</div>
    ${apelido ? `<div class="cabecalho__apelido">${esc(apelido)}</div>` : ""}
    <div class="cabecalho__linha">
      ${mesa ? `Mesa ${esc(mesa)} · ` : ""}${garcom ? `${esc(garcom)} · ` : ""}${new Date(horario).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
    </div>
  </div>
  <hr/>
  ${itens.length === 0 ? `<div class="rodape">Nenhum item produzível nesta comanda.</div>` : linhasItens}
</body>
</html>`;
}

/**
 * Monta o HTML de um comprovante de caixa (sangria/suprimento ou
 * fechamento) — F005. Template genérico e burro de propósito: percorre
 * destaque/tabela/linhas/notas na ordem, sem saber qual subtipo é. Quem
 * decide o que preencher são os montadores em `impressao.js`.
 *
 * @param {object} dados - retorno de montarComprovanteMovimento/montarComprovanteFechamento
 * @returns {string} HTML completo do documento
 */
export function renderizarComprovanteCaixa(dados) {
  const { identidade, titulo, emitidoEm, destaque, tabela, linhas, notas } = dados;

  const blocoDestaque = destaque ? `
    <div class="caixa-destaque">
      <div class="caixa-destaque__rotulo">${esc(destaque.rotulo)}</div>
      <div class="caixa-destaque__valor">${fmtR(destaque.valor)}</div>
    </div>` : "";

  const blocoTabela = (tabela && (tabela.linhas ?? []).length > 0) ? `
    <table class="caixa-tabela">
      <thead>
        <tr>${(tabela.cabecalho ?? []).map((c, i) => `<th${i === 0 ? "" : ' style="text-align:right;"'}>${esc(c)}</th>`).join("")}</tr>
      </thead>
      <tbody>
        ${tabela.linhas.map((l) => `
          <tr>
            <td>${esc(l.rotulo)}</td>
            ${(l.valores ?? []).map((v) => `<td style="text-align:right;">${fmtR(v)}</td>`).join("")}
          </tr>`).join("")}
      </tbody>
    </table>` : "";

  const blocoLinhas = (linhas ?? []).length > 0 ? `
    <div class="caixa-linhas">
      ${linhas.map((l) => `
        <div class="caixa-linha${l.forte ? " caixa-linha--forte" : ""}">
          <span>${esc(l.rotulo)}</span>
          <span class="caixa-linha__valor">${l.sinal && l.valor > 0 ? "+" : ""}${fmtR(l.valor)}</span>
        </div>`).join("")}
    </div>` : "";

  const blocoNotas = (notas ?? []).length > 0 ? `
    <div class="caixa-notas">
      ${notas.map((n) => `<div class="caixa-nota"><span class="caixa-nota__rotulo">${esc(n.rotulo)}:</span> ${esc(n.texto)}</div>`).join("")}
    </div>` : "";

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>${esc(titulo)}</title>
  <style>${estilosComprovante}</style>
</head>
<body>
  ${blocoCabecalhoIdentidade(identidade, emitidoEm)}
  <div class="caixa-cabecalho__titulo">${esc(titulo)}</div>
  <hr/>
  ${blocoDestaque}
  ${blocoTabela}
  ${blocoLinhas}
  ${blocoNotas ? `<hr/>${blocoNotas}` : ""}
  ${identidade.rodape ? `<hr/><div class="caixa-rodape">${esc(identidade.rodape)}</div>` : ""}
</body>
</html>`;
}

/**
 * Abre a janela nativa de impressão do navegador com o HTML pronto —
 * mesmo mecanismo usado hoje em `CheckoutView.jsx`. Nunca lança:
 * pop-up bloqueado vira um erro tratável pelo chamador, não uma
 * exceção que quebra o fluxo de pagamento/cozinha.
 *
 * @param {string} html
 * @returns {{error: object|null}}
 */
export function abrirJanelaImpressao(html) {
  try {
    const win = window.open("", "_blank", "width=360,height=600");
    if (!win) {
      return { error: { message: "Não foi possível abrir a janela de impressão. Verifique se o navegador bloqueou o pop-up." } };
    }
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 400);
    return { error: null };
  } catch (err) {
    return { error: { message: err?.message ?? "Falha ao abrir a janela de impressão." } };
  }
}
