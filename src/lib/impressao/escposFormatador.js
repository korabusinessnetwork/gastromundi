import { quebrarLinha } from "./largura";

/**
 * F020 — formata os dados já montados por `src/lib/impressao.js`
 * (montarComprovantePagamento/montarCupomPreNota/montarViaProducao)
 * como texto puro em colunas, pro driver ESC/POS/QZ Tray. Pura: não
 * imprime nada, só devolve `string[]` (uma por linha) — quem imprime
 * é `drivers/escposQzTray.js`.
 */

const METODOS_LABEL = { dinheiro: "Dinheiro", credito: "Crédito", debito: "Débito", pix: "Pix", fiado: "Fiado" };

function fmtR(v) {
  return "R$ " + Number(v ?? 0).toFixed(2);
}

function fmtComanda(nome) {
  return /^\d+$/.test(String(nome ?? "").trim()) ? `Comanda ${nome}` : (nome ?? "—");
}

function centralizar(texto, colunas) {
  const t = String(texto ?? "");
  if (t.length >= colunas) return t.slice(0, colunas);
  const espacos = colunas - t.length;
  const esquerda = Math.floor(espacos / 2);
  return " ".repeat(esquerda) + t;
}

function linhaSeparadora(colunas, char = "-") {
  return char.repeat(colunas);
}

// Alinha um rótulo à esquerda e um valor à direita, na mesma linha.
function linhaValor(rotulo, valor, colunas) {
  const r = String(rotulo ?? "");
  const v = String(valor ?? "");
  const espacos = Math.max(1, colunas - r.length - v.length);
  return r + " ".repeat(espacos) + v;
}

/**
 * @param {object} dados - retorno de montarComprovantePagamento/montarCupomPreNota
 * @param {number} colunas
 * @returns {string[]}
 */
export function formatarComprovanteEscpos(dados, colunas) {
  const { identidade, comanda, itens, subtotal, valorTaxa, ajuste, valorAjuste, total, pagamentos, trocoTotal, naoFiscal, avisoNaoFiscal } = dados;
  const linhas = [];

  linhas.push(centralizar(identidade?.nome ?? "", colunas));
  linhas.push(centralizar(new Date().toLocaleString("pt-BR"), colunas));
  if (identidade?.endereco) linhas.push(centralizar(identidade.endereco, colunas));
  if (identidade?.cnpj) linhas.push(centralizar(`CNPJ: ${identidade.cnpj}`, colunas));
  linhas.push(centralizar(fmtComanda(comanda), colunas));
  linhas.push(linhaSeparadora(colunas));

  for (const it of (itens ?? [])) {
    const nome = `${it.qty}x ${it.emoji ? `${it.emoji} ` : ""}${it.nome}`;
    quebrarLinha(nome, colunas).forEach(l => linhas.push(l));
    linhas.push(linhaValor("", fmtR(it.preco * it.qty), colunas));
    for (const obs of (it.obs ?? [])) {
      quebrarLinha(`  📝 ${obs}`, colunas).forEach(l => linhas.push(l));
    }
  }
  linhas.push(linhaSeparadora(colunas));

  if (valorTaxa > 0 || valorAjuste !== 0) {
    linhas.push(linhaValor("Subtotal", fmtR(subtotal), colunas));
    if (valorTaxa > 0) linhas.push(linhaValor("Taxa de Serviço", fmtR(valorTaxa), colunas));
    if (valorAjuste !== 0) {
      const rotuloAjuste = ajuste?.tipo === "desconto" ? "Desconto" : "Acréscimo";
      const sinal = valorAjuste < 0 ? "-" : "+";
      linhas.push(linhaValor(rotuloAjuste, `${sinal}${fmtR(Math.abs(valorAjuste))}`, colunas));
    }
  }
  linhas.push(linhaValor("TOTAL", fmtR(total), colunas));
  if (trocoTotal > 0) linhas.push(linhaValor("Troco", fmtR(trocoTotal), colunas));

  const pagamentosComMetodo = (pagamentos ?? []).filter(p => p?.metodo);
  if (pagamentosComMetodo.length > 0) {
    linhas.push(linhaSeparadora(colunas));
    for (const p of pagamentosComMetodo) {
      const prefixo = pagamentosComMetodo.length > 1 ? `${fmtR(p.valor)} · ` : "";
      linhas.push(`${prefixo}Pagamento: ${METODOS_LABEL[p.metodo] ?? p.metodo}`);
    }
  }

  if (naoFiscal) {
    linhas.push(linhaSeparadora(colunas));
    quebrarLinha(avisoNaoFiscal ?? "", colunas).forEach(l => linhas.push(centralizar(l, colunas)));
  }

  if (identidade?.rodape) {
    linhas.push(linhaSeparadora(colunas));
    quebrarLinha(identidade.rodape, colunas).forEach(l => linhas.push(centralizar(l, colunas)));
  }

  return linhas;
}

/**
 * @param {object} dados - retorno de montarViaProducao
 * @param {number} colunas
 * @returns {string[]}
 */
export function formatarViaProducaoEscpos(dados, colunas) {
  const { comanda, mesa, garcom, horario, itens } = dados;
  const linhas = [];

  linhas.push(centralizar(fmtComanda(comanda), colunas));
  const horarioFmt = new Date(horario).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const detalhe = [mesa ? `Mesa ${mesa}` : null, garcom, horarioFmt].filter(Boolean).join(" · ");
  linhas.push(centralizar(detalhe, colunas));
  linhas.push(linhaSeparadora(colunas));

  if ((itens ?? []).length === 0) {
    linhas.push("Nenhum item produzível nesta comanda.");
    return linhas;
  }

  for (const it of itens) {
    const nome = `${it.qty}x ${it.emoji ? `${it.emoji} ` : ""}${it.nome}`;
    quebrarLinha(nome, colunas).forEach(l => linhas.push(l));
    for (const obs of (it.obs ?? [])) {
      quebrarLinha(`  📝 ${obs}`, colunas).forEach(l => linhas.push(l));
    }
  }

  return linhas;
}
