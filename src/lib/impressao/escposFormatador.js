import { quebrarLinha } from "./largura";
import { resolverBlocosComanda, fmtComanda, fmtR, largurasEmCaracteres } from "./layoutComanda";

/**
 * F020 — formata os dados já montados por `src/lib/impressao.js`
 * (montarComprovantePagamento/montarCupomPreNota/montarViaProducao)
 * como texto puro em colunas, pro driver ESC/POS/QZ Tray. Pura: não
 * imprime nada, só devolve `string[]` (uma por linha) — quem imprime
 * é `drivers/escposQzTray.js`.
 */

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

function alinhar(texto, colunas, alinhamento) {
  const t = String(texto ?? "");
  if (t.length >= colunas) return t.slice(0, colunas);
  if (alinhamento === "centro") return centralizar(t, colunas);
  if (alinhamento === "direita") return " ".repeat(colunas - t.length) + t;
  return t;
}

// Texto que pode não caber na coluna: quebra primeiro, alinha cada
// pedaço depois — quebrar depois de alinhar deixaria o espaço no meio.
function linhasAlinhadas(textos, colunas, alinhamento) {
  const saida = [];
  for (const texto of textos ?? []) {
    for (const parte of quebrarLinha(texto, colunas)) saida.push(alinhar(parte, colunas, alinhamento));
  }
  return saida;
}

// Formato empilhado — o de sempre: nome numa linha, valor à direita na
// seguinte. É a saída quando não há papel suficiente para as colunas
// caberem sem picotar valor (ver `largurasEmCaracteres`).
function linhasDoItem(item, colunas) {
  const linhas = [];
  linhas.push(...quebrarLinha(`${item.qty}x ${item.nome}`, colunas));
  linhas.push(linhaValor("", item.total, colunas));
  for (const obs of item.obs ?? []) {
    linhas.push(...quebrarLinha(`  📝 ${obs}`, colunas));
  }
  return linhas;
}

// Preenche até a largura da coluna. Nunca corta: quem chama já garantiu
// que o conteúdo cabe (cortar "R$ 32.50" imprimiria um valor errado).
function celula(texto, largura, alinhamento = "esquerda") {
  const t = String(texto ?? "");
  const sobra = Math.max(0, largura - t.length);
  if (alinhamento === "direita") return " ".repeat(sobra) + t;
  return t + " ".repeat(sobra);
}

// Item em COLUNAS, na mesma proporção que o dono arrastou no editor: o
// nome ocupa a sua coluna (quebrando em mais linhas quando preciso) e os
// números ficam alinhados um embaixo do outro, como no papel do
// navegador. `larg` vem em caracteres, já conferido contra o conteúdo.
function linhasDoItemEmColunas(item, larg, mostrarUnitario) {
  const partes = quebrarLinha(item.nome, larg.nome);
  const numeros =
    celula(`${item.qty}x`, larg.qtd, "direita") +
    (mostrarUnitario ? celula(item.unitario, larg.unitario, "direita") : "") +
    celula(item.total, larg.total, "direita");

  const linhas = [celula(partes[0] ?? "", larg.nome) + numeros];
  // Resto do nome desce sozinho: repetir o número em cada linha faria o
  // papel parecer ter mais itens do que tem.
  for (const parte of partes.slice(1)) linhas.push(celula(parte, larg.nome));
  for (const obs of item.obs ?? []) linhas.push(...quebrarLinha(`  📝 ${obs}`, larg.nome + larg.qtd));
  return linhas;
}

/**
 * Formata o comprovante/cupom como texto puro em colunas, a partir do
 * MESMO layout de blocos que o HTML do navegador usa
 * (`layoutComanda.js`). É isso que faz a pré-visualização da tela valer
 * também para quem imprime na térmica: os dois leem a mesma lista
 * resolvida e só mudam a forma de vestir.
 *
 * O que o papel térmico não sabe fazer, e por isso é ignorado aqui: o
 * logo (é imagem) e o tamanho/negrito de cada bloco — a Ponte manda
 * texto puro, a letra é a da própria impressora.
 *
 * @param {object} dados - retorno de montarComprovantePagamento/montarCupomPreNota
 * @param {number} colunas
 * @returns {string[]}
 */
export function formatarComprovanteEscpos(dados, colunas) {
  const linhas = [];

  for (const bloco of resolverBlocosComanda(dados?.layout, dados)) {
    const alinhamento = bloco.estilo?.alinhamento ?? "esquerda";

    switch (bloco.tipo) {
      case "logo":
        break; // imagem não existe em texto puro
      case "texto":
      case "aviso":
        linhas.push(...linhasAlinhadas(bloco.linhas, colunas, alinhamento));
        break;
      case "valor":
        linhas.push(linhaValor(bloco.rotulo, bloco.valor, colunas));
        break;
      case "itens": {
        // Mesma proporção do papel do navegador, convertida em
        // caracteres. Vem `null` quando não cabe sem picotar valor — aí
        // o item volta ao formato empilhado, que é feio mas está certo.
        const larg = largurasEmCaracteres(bloco.itens, colunas, bloco.larguras, bloco.unitario);
        for (const item of bloco.itens) {
          linhas.push(...(larg ? linhasDoItemEmColunas(item, larg, bloco.unitario) : linhasDoItem(item, colunas)));
        }
        break;
      }
      case "separador":
        linhas.push(linhaSeparadora(colunas));
        break;
      case "espaco":
        for (let i = 0; i < bloco.linhas; i += 1) linhas.push("");
        break;
      default:
        break;
    }
  }

  return linhas;
}

/**
 * F005 — formata um comprovante de caixa (sangria/suprimento ou
 * fechamento) como texto em colunas pro driver ESC/POS. Genérico: lê o
 * mesmo documento `comprovante_caixa` que o renderizador HTML.
 *
 * @param {object} dados - retorno de montarComprovanteMovimento/montarComprovanteFechamento
 * @param {number} colunas
 * @returns {string[]}
 */
export function formatarComprovanteCaixaEscpos(dados, colunas) {
  const { identidade, titulo, emitidoEm, destaque, tabela, linhas, notas } = dados;
  const out = [];

  const quando = emitidoEm != null ? new Date(emitidoEm) : new Date();
  const dataFmt = (Number.isNaN(quando.getTime()) ? new Date() : quando).toLocaleString("pt-BR");

  out.push(centralizar(identidade?.nome ?? "", colunas));
  out.push(centralizar(dataFmt, colunas));
  if (identidade?.endereco) out.push(centralizar(identidade.endereco, colunas));
  if (identidade?.cnpj) out.push(centralizar(`CNPJ: ${identidade.cnpj}`, colunas));
  out.push(centralizar(titulo ?? "", colunas));
  out.push(linhaSeparadora(colunas));

  if (destaque) {
    out.push(centralizar(destaque.rotulo ?? "", colunas));
    out.push(centralizar(fmtR(destaque.valor), colunas));
    out.push(linhaSeparadora(colunas));
  }

  if (tabela && (tabela.linhas ?? []).length > 0) {
    for (const l of tabela.linhas) {
      quebrarLinha(l.rotulo ?? "", colunas).forEach(x => out.push(x));
      const [sistema, conferido] = l.valores ?? [];
      out.push(linhaValor(`  Sistema ${fmtR(sistema)}`, `Conf ${fmtR(conferido)}`, colunas));
    }
    out.push(linhaSeparadora(colunas));
  }

  for (const l of (linhas ?? [])) {
    const sinal = l.sinal && l.valor > 0 ? "+" : "";
    out.push(linhaValor(l.rotulo ?? "", `${sinal}${fmtR(l.valor)}`, colunas));
  }

  if ((notas ?? []).length > 0) {
    out.push(linhaSeparadora(colunas));
    for (const n of notas) {
      quebrarLinha(`${n.rotulo}: ${n.texto}`, colunas).forEach(x => out.push(x));
    }
  }

  if (identidade?.rodape) {
    out.push(linhaSeparadora(colunas));
    quebrarLinha(identidade.rodape, colunas).forEach(l => out.push(centralizar(l, colunas)));
  }

  return out;
}

/**
 * @param {object} dados - retorno de montarViaProducao
 * @param {number} colunas
 * @returns {string[]}
 */
export function formatarViaProducaoEscpos(dados, colunas) {
  const { comanda, apelido, mesa, garcom, horario, itens, pontoNome } = dados;
  const linhas = [];

  // Nome do ponto de impressão (Cozinha, Bar…), quando há mais de um
  // configurado — é a via térmica, a que realmente sai na bancada. Vem
  // ANTES da comanda e em CAIXA ALTA: quem pega o papel precisa saber
  // primeiro se aquilo é dele. Quem decide se manda é o despacho.
  if (pontoNome) {
    quebrarLinha(String(pontoNome).toUpperCase(), colunas).forEach(l => linhas.push(centralizar(l, colunas)));
  }
  linhas.push(centralizar(fmtComanda(comanda), colunas));
  // Complemento opcional (o "nome" digitado no /palm) — linha própria,
  // logo abaixo do número da comanda, sem se misturar com ele.
  if (apelido) quebrarLinha(apelido, colunas).forEach(l => linhas.push(centralizar(l, colunas)));
  const horarioFmt = new Date(horario).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const detalhe = [mesa ? `Mesa ${mesa}` : null, garcom, horarioFmt].filter(Boolean).join(" · ");
  linhas.push(centralizar(detalhe, colunas));
  linhas.push(linhaSeparadora(colunas));

  if ((itens ?? []).length === 0) {
    linhas.push("Nenhum item produzível nesta comanda.");
    return linhas;
  }

  for (const it of itens) {
    // Sem o emoji: a Ponte manda texto puro na fonte da própria impressora,
    // que não tem esse caractere — saía símbolo estranho no meio do nome do
    // prato, justamente no papel que o cozinheiro lê com pressa.
    const nome = `${it.qty}x ${it.nome}`;
    quebrarLinha(nome, colunas).forEach(l => linhas.push(l));
    for (const obs of (it.obs ?? [])) {
      quebrarLinha(`  📝 ${obs}`, colunas).forEach(l => linhas.push(l));
    }
  }

  return linhas;
}
