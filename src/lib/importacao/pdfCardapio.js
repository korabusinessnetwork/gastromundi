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
