// ──────────────────────────────────────────────────────────────────
// Importador Inteligente — NÚCLEO do cardápio em PDF (funções puras)
//
// Recebe as LINHAS DE TEXTO já extraídas de um PDF (o extrator de
// browser vive em pdfExtrator.js) e ORGANIZA em produtos do nosso
// modelo: { name, price, category }. O objetivo é o "trabalho pesado"
// que o dono pediu — ler um cardápio cru e cuspir algo importável.
//
// Heurística (cardápio de TEXTO, não escaneado/imagem):
//   - Linha que TERMINA em preço  → produto (nome = o resto da linha).
//   - Linha em CAIXA ALTA curta   → cabeçalho de SEÇÃO (vira categoria).
//   - Demais linhas               → ruído (endereço, telefone, descrição).
// Nada aqui grava: o resultado vira CSV e passa pelo MESMO validador de
// produtos (validarPlanilhaProdutos), então dedupe, limites e proteção
// contra CSV injection continuam valendo. Toda regra tem teste.
// ──────────────────────────────────────────────────────────────────

import { parsearPrecoBR, LIMITE_LINHAS } from "./planilha";

export const CATEGORIA_PADRAO = "Sem categoria";

// A IA (visão) às vezes devolve o JSON embrulhado numa cerca de código
// markdown ("```json ... ```"). Tiramos a cerca antes de dar JSON.parse.
const RE_CERCA_JSON = /^```(?:json)?\s*|\s*```$/g;

// Preço no FIM da linha. Aceita: "24,90", "R$ 24,90", "1.234,56",
// "24.90" (decimal com ponto) e "R$ 15" (inteiro só COM R$). Um inteiro
// solto sem R$ ("Pizza 4") NÃO conta como preço — evita falso positivo
// com quantidade/gramatura no nome. O `$` fixa no fim; leaders de pontos
// ("X-Salada ...... 24,90") são removidos ao limpar o nome.
const RE_PRECO_DECIMAL = /(?:r\$\s*)?(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2}|\d+\.\d{2})\s*$/i;
const RE_PRECO_RS_INTEIRO = /r\$\s*(\d{1,3}(?:\.\d{3})*|\d+)\s*$/i;

// Sobras de "leader" no fim do nome depois de tirar o preço: pontos de
// preenchimento, traços, bullets e espaços. Ex.: "X-Salada · · · ".
const RE_LIXO_FIM_NOME = /[\s.·•–—:-]+$/;

/**
 * Separa uma linha em { nome, preco } quando ela termina em preço.
 * @param {string} linha
 * @returns {{ nome: string, preco: number }|null}
 */
export function separarNomePreco(linha) {
  const texto = String(linha ?? "").trim();
  if (!texto) return null;

  const m = texto.match(RE_PRECO_DECIMAL) || texto.match(RE_PRECO_RS_INTEIRO);
  if (!m) return null;

  const preco = parsearPrecoBR(m[1]);
  if (preco === null || preco <= 0) return null;

  const nome = texto.slice(0, m.index).replace(RE_LIXO_FIM_NOME, "").trim();
  if (!nome) return null;

  return { nome, preco };
}

/**
 * Uma linha "parece" cabeçalho de seção? Regra conservadora (alta
 * precisão, para não rotular descrição como categoria): CAIXA ALTA,
 * curta, com letras e sem preço no fim. Menus quase sempre usam títulos
 * em maiúsculas ("LANCHES", "BEBIDAS", "PORÇÕES").
 * @param {string} linha
 * @returns {boolean}
 */
export function pareceCategoria(linha) {
  const texto = String(linha ?? "").trim();
  if (texto.length < 2 || texto.length > 40) return false;
  if (separarNomePreco(texto)) return false;

  const letras = texto.replace(/[^a-zà-ÿ]/gi, "");
  if (letras.length < 2) return false; // precisa ter letra de verdade

  // Sem minúsculas = CAIXA ALTA (ignorando dígitos/símbolos/acentos base).
  const temMinuscula = /[a-zà-ÿ]/.test(texto) && texto !== texto.toUpperCase();
  return !temMinuscula;
}

/** Categoria em Título ("PORÇÕES" → "Porções") — mais humano no PDV. */
export function limparCategoria(linha) {
  return String(linha ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .replace(/(^|\s)([a-zà-ÿ])/g, (_, sep, ch) => sep + ch.toUpperCase());
}

/**
 * Organiza as linhas de texto de um PDF de cardápio em produtos.
 * PURO: recebe as linhas (o extrator de browser as monta por posição),
 * devolve { produtos, avisos }. Produtos no formato do export
 * (name/price/category) para reusar montarCSVProdutos.
 * @param {string[]} linhas
 * @returns {{ produtos: Array<{name:string, price:number, category:string}>, avisos: Array<{linha:number, mensagem:string}> }}
 */
export function extrairProdutosDoTextoPdf(linhas) {
  const produtos = [];
  const avisos = [];
  let categoriaAtual = null;
  let semCategoria = 0;

  const lista = Array.isArray(linhas) ? linhas : [];
  for (let i = 0; i < lista.length; i++) {
    if (produtos.length >= LIMITE_LINHAS) {
      avisos.push({ linha: 0, mensagem: `PDF muito grande — li os primeiros ${LIMITE_LINHAS} itens. Divida em partes.` });
      break;
    }

    const np = separarNomePreco(lista[i]);
    if (np) {
      const category = categoriaAtual || CATEGORIA_PADRAO;
      if (!categoriaAtual) semCategoria += 1;
      produtos.push({ name: np.nome, price: np.preco, category });
      continue;
    }
    if (pareceCategoria(lista[i])) {
      categoriaAtual = limparCategoria(lista[i]);
    }
    // senão: ruído — ignora em silêncio (endereço, telefone, descrição).
  }

  if (produtos.length === 0) {
    avisos.push({
      linha: 0,
      mensagem: "Não encontrei itens com preço nesse PDF. Ele é um cardápio em texto? (PDF escaneado/foto ainda não é lido — em breve, com IA.)",
    });
  } else if (semCategoria > 0) {
    avisos.push({
      linha: 0,
      mensagem: `${semCategoria} item(ns) sem seção no PDF entraram em "${CATEGORIA_PADRAO}" — ajuste a categoria na tela de Produtos depois.`,
    });
  }

  return { produtos, avisos };
}

/**
 * Normaliza a resposta da IA (leitura de cardápio por visão) para o MESMO
 * formato de produtos do resto do pipeline: { name, price, category }.
 *
 * PURO e defensivo: a IA é uma fonte externa não confiável, então aqui
 * NÃO confiamos em nada — validamos cada item, convertemos o preço com o
 * mesmo parser BR do CSV, descartamos o que não tem nome ou preço > 0 e
 * jamais inventamos valores (regra do Jarvas vale para extração também).
 *
 * Aceita string (com ou sem cerca ```json), objeto já parseado, ou um
 * objeto { itens: [...] } / { produtos: [...] }. Preço pode vir número ou
 * texto ("R$ 24,90"). Categoria ausente cai em CATEGORIA_PADRAO.
 *
 * @param {string|object} entrada resposta crua da IA
 * @returns {{ produtos: Array<{name:string, price:number, category:string}>, avisos: Array<{linha:number, mensagem:string}> }}
 */
export function normalizarItensIA(entrada) {
  const avisos = [];

  let dados = entrada;
  if (typeof entrada === "string") {
    const limpo = entrada.trim().replace(RE_CERCA_JSON, "").trim();
    try {
      dados = JSON.parse(limpo);
    } catch {
      return {
        produtos: [],
        avisos: [{ linha: 0, mensagem: "A IA não devolveu um cardápio legível. Tente de novo ou importe por planilha." }],
      };
    }
  }

  // A IA pode devolver a lista direto ou dentro de uma chave.
  const lista = Array.isArray(dados)
    ? dados
    : Array.isArray(dados?.itens)
      ? dados.itens
      : Array.isArray(dados?.produtos)
        ? dados.produtos
        : [];

  const produtos = [];
  let semCategoria = 0;
  let descartados = 0;

  for (const item of lista) {
    if (produtos.length >= LIMITE_LINHAS) {
      avisos.push({ linha: 0, mensagem: `Cardápio muito grande — li os primeiros ${LIMITE_LINHAS} itens. Divida em partes.` });
      break;
    }
    if (!item || typeof item !== "object") {
      descartados += 1;
      continue;
    }

    const name = String(item.name ?? item.nome ?? "").replace(/\s+/g, " ").trim();
    const preco = parsearPrecoBR(item.price ?? item.preco);
    if (!name || preco === null || preco <= 0) {
      descartados += 1;
      continue;
    }

    const categoriaCrua = String(item.category ?? item.categoria ?? "").trim();
    const category = categoriaCrua || CATEGORIA_PADRAO;
    if (!categoriaCrua) semCategoria += 1;

    produtos.push({ name, price: preco, category });
  }

  if (produtos.length === 0) {
    avisos.push({
      linha: 0,
      mensagem: "A IA não encontrou itens com preço nesse cardápio. Confira a foto/página ou importe por planilha.",
    });
  } else {
    if (semCategoria > 0) {
      avisos.push({
        linha: 0,
        mensagem: `${semCategoria} item(ns) sem seção entraram em "${CATEGORIA_PADRAO}" — ajuste a categoria na tela de Produtos depois.`,
      });
    }
    if (descartados > 0) {
      avisos.push({
        linha: 0,
        mensagem: `${descartados} item(ns) vieram sem nome ou preço válido e foram ignorados — confira o cardápio na prévia.`,
      });
    }
  }

  return { produtos, avisos };
}
