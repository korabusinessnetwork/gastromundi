import estilosComprovante from "./comprovante.css?raw";
import estilosProducao from "./producao.css?raw";
import { rotuloMetodo } from "@/utils/pagamentos";

/**
 * Renderização/impressão — F015. Constrói o HTML da janela de
 * impressão a partir dos dados já montados por `src/lib/impressao.js`
 * (comprovante/cupom/via de produção) e abre a janela nativa do
 * navegador para imprimir (`window.print()`) — mesmo mecanismo que já
 * existia em `CheckoutView.jsx`, generalizado para os 3 templates.
 * Sem serviço/SDK de impressão pago (Restrições de Custo) — impressão
 * térmica "de verdade" continua disponível via QZ Tray
 * (`src/lib/qztray.js`, `ImpressorasConfig.jsx`), não substituída aqui.
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

/**
 * X2 — o logo vem do CADASTRO DO TENANT (white-label, decisão 017): sem
 * validar o esquema, um `javascript:`/`data:text/html` salvo ali vira
 * XSS na janela de impressão. Allowlist: só `http:`, `https:` (logo
 * hospedado) ou `data:image/…` (logo embutido em base64) passam — o
 * resto é descartado e o cabeçalho cai pro nome em texto.
 *
 * @param {any} url
 * @returns {boolean}
 */
export function logoUrlSegura(url) {
  const s = String(url ?? "").trim();
  if (!s) return false;
  return /^https?:/i.test(s) || /^data:image\//i.test(s);
}

function fmtR(v) {
  return "R$ " + Number(v ?? 0).toFixed(2);
}

function fmtComanda(nome) {
  return /^\d+$/.test(String(nome ?? "").trim()) ? `Comanda ${nome}` : (nome ?? "—");
}

function linhasItensRecibo(itens) {
  return itens
    .map((it) => `
      <tr>
        <td>${it.emoji ? `${esc(it.emoji)} ` : ""}${esc(it.nome)}</td>
        <td style="text-align:center;">${esc(it.qty)}</td>
        <td style="text-align:right;">${fmtR(it.preco)}</td>
        <td style="text-align:right;font-weight:bold;">${fmtR(it.preco * it.qty)}</td>
      </tr>
      ${it.obs.map((o) => `<tr><td colspan="4" class="obs">📝 ${esc(o)}</td></tr>`).join("")}
    `)
    .join("");
}

function blocoCabecalhoIdentidade(identidade) {
  const logoValido = logoUrlSegura(identidade.logoUrl);
  return `
    <div class="cabecalho">
      ${logoValido ? `<img class="cabecalho__logo" src="${esc(identidade.logoUrl)}" alt="${esc(identidade.nome)}" />` : `<div class="cabecalho__nome">${esc(identidade.nome)}</div>`}
      <div class="cabecalho__linha">${new Date().toLocaleString("pt-BR")}</div>
    </div>
    ${(identidade.endereco || identidade.cnpj) ? `
      <div class="identidade-fiscal">
        ${identidade.endereco ? `${esc(identidade.endereco)}<br/>` : ""}
        ${identidade.cnpj ? `CNPJ: ${esc(identidade.cnpj)}` : ""}
      </div>
    ` : ""}
  `;
}

/**
 * Monta o HTML do comprovante de pagamento OU do cupom/pré-nota — os
 * dois compartilham o mesmo template; o cupom só acrescenta o aviso
 * de "sem valor fiscal" (`dados.naoFiscal`).
 *
 * @param {object} dados - retorno de montarComprovantePagamento/montarCupomPreNota
 * @returns {string} HTML completo do documento
 */
export function renderizarRecibo(dados) {
  const { identidade, comanda, itens, subtotal, valorTaxa, ajuste, valorAjuste, total, pagamentos, trocoTotal, naoFiscal, avisoNaoFiscal } = dados;

  const linhasPagamento = (pagamentos ?? [])
    .filter((p) => p?.metodo)
    .map((p) => `<div class="metodo">${pagamentos.length > 1 ? `${fmtR(p.valor)} · ` : ""}Pagamento: ${esc(rotuloMetodo(p.metodo))}</div>`)
    .join("");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>${naoFiscal ? "Cupom" : "Comprovante"} · ${esc(fmtComanda(comanda))}</title>
  <style>${estilosComprovante}</style>
</head>
<body>
  ${blocoCabecalhoIdentidade(identidade)}
  <div class="cabecalho__linha" style="text-align:center;">${esc(fmtComanda(comanda))}</div>
  <hr/>
  <table>
    <thead>
      <tr><th>Item</th><th>Qtd</th><th>Unit.</th><th>Total</th></tr>
    </thead>
    <tbody>${linhasItensRecibo(itens)}</tbody>
    <tfoot>
      ${(valorTaxa > 0 || valorAjuste !== 0) ? `
        <tr><td colspan="3" style="padding:6px 4px 2px;font-size:12px;color:#555;">Subtotal</td><td style="text-align:right;padding:6px 4px 2px;font-size:12px;color:#555;">${fmtR(subtotal)}</td></tr>
        ${valorTaxa > 0 ? `<tr><td colspan="3" style="padding:2px 4px;font-size:12px;color:#555;">Taxa de Serviço</td><td style="text-align:right;padding:2px 4px;font-size:12px;color:#555;">${fmtR(valorTaxa)}</td></tr>` : ""}
        ${valorAjuste !== 0 ? `<tr><td colspan="3" style="padding:2px 4px;font-size:12px;color:#555;">${ajuste?.tipo === "desconto" ? "Desconto" : "Acréscimo"}</td><td style="text-align:right;padding:2px 4px;font-size:12px;color:#555;">${valorAjuste < 0 ? "-" : "+"}${fmtR(Math.abs(valorAjuste))}</td></tr>` : ""}
      ` : ""}
      <tr class="total-row"><td colspan="3">TOTAL</td><td style="text-align:right;" class="valor">${fmtR(total)}</td></tr>
      ${trocoTotal > 0 ? `<tr><td colspan="3" style="padding:4px;font-size:12px;color:#555;">Troco</td><td style="text-align:right;padding:4px;font-size:12px;color:#555;">${fmtR(trocoTotal)}</td></tr>` : ""}
    </tfoot>
  </table>
  ${linhasPagamento}
  ${naoFiscal ? `<div class="aviso-nao-fiscal">${esc(avisoNaoFiscal)}</div>` : ""}
  <hr/>
  <div class="rodape">${esc(identidade.rodape)}</div>
</body>
</html>`;
}

/**
 * Monta o HTML da via de produção (ticket de cozinha) — enxuto, sem
 * preço, sem forma de pagamento.
 *
 * @param {object} dados - retorno de montarViaProducao
 * @returns {string} HTML completo do documento
 */
export function renderizarViaProducao(dados) {
  const { comanda, mesa, garcom, horario, itens } = dados;

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
    <div class="cabecalho__titulo">${esc(fmtComanda(comanda))}</div>
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
