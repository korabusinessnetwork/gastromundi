// ──────────────────────────────────────────────────────────────────
// Migração de dados — núcleo de PLANILHA (funções puras, sem Supabase)
//
// Contrato do CSV de produtos (docs/03_REGRAS_DE_NEGOCIO/MIGRACAO_DADOS.md):
//   nome;preco;categoria;emoji;ativo;unidade
// Tolerante ao mundo real do Excel brasileiro: encoding Windows-1252,
// separador ";", dinheiro "R$ 1.234,56", cabeçalho com acento/caixa
// variada, booleanos "sim/não". Toda regra aqui tem teste co-localizado.
// ──────────────────────────────────────────────────────────────────

/** Colunas do modelo. Só `nome`, `preco` e `categoria` são obrigatórias. */
export const COLUNAS_MODELO = ["nome", "preco", "categoria", "emoji", "ativo", "unidade"];
export const COLUNAS_OBRIGATORIAS = ["nome", "preco", "categoria"];

export const LIMITE_LINHAS = 5000;
export const LIMITE_NOME = 80;
export const LIMITE_CATEGORIA = 40;

/**
 * Decodifica o arquivo detectando o encoding: tenta UTF-8 estrito e,
 * se houver byte inválido (Excel BR salva Windows-1252), refaz como
 * windows-1252 — o bug nº 1 de import no Brasil é acento quebrado.
 * @param {ArrayBuffer|Uint8Array} buffer
 * @returns {string}
 */
export function decodificarArquivo(buffer) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder("windows-1252").decode(buffer);
  }
}

/**
 * Detecta o separador olhando a linha do cabeçalho: `;` (Excel pt-BR)
 * ganha se aparecer; senão `,`; senão tab.
 * @param {string} texto
 * @returns {";" | "," | "\t"}
 */
export function detectarSeparador(texto) {
  const primeiraLinha = String(texto).split(/\r?\n/, 1)[0] || "";
  if (primeiraLinha.includes(";")) return ";";
  if (primeiraLinha.includes(",")) return ",";
  return "\t";
}

/**
 * Parser de CSV com suporte a aspas ("a;b" numa célula, "" escapado),
 * suficiente pro contrato do modelo — sem dependência nova.
 * @param {string} texto
 * @param {string} [separador] - default: detectado
 * @returns {string[][]} linhas (inclui o cabeçalho), sem linhas vazias
 */
export function parsearCSV(texto, separador = detectarSeparador(texto)) {
  const linhas = [];
  let linha = [];
  let celula = "";
  let entreAspas = false;
  const t = String(texto).replace(/^﻿/, ""); // BOM do Excel

  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (entreAspas) {
      if (c === '"') {
        if (t[i + 1] === '"') { celula += '"'; i++; }
        else entreAspas = false;
      } else celula += c;
    } else if (c === '"') {
      entreAspas = true;
    } else if (c === separador) {
      linha.push(celula); celula = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && t[i + 1] === "\n") i++;
      linha.push(celula); celula = "";
      if (linha.some((v) => v.trim() !== "")) linhas.push(linha);
      linha = [];
    } else {
      celula += c;
    }
  }
  linha.push(celula);
  if (linha.some((v) => v.trim() !== "")) linhas.push(linha);
  return linhas;
}

/** Normaliza texto pra comparação: trim, minúsculas, sem acento, espaços únicos. */
export function normalizarTexto(str) {
  return String(str ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

/** Casa um nome de coluna do arquivo com o modelo ("Preço" → "preco"). */
export function normalizarCabecalho(str) {
  return normalizarTexto(str).replace(/[^a-z0-9]/g, "");
}

/**
 * Converte dinheiro pt-BR em número: "24,90", "R$ 1.234,56", "24.90",
 * "1.234" (milhar). Retorna null quando não dá pra entender.
 * @param {string|number} valor
 * @returns {number|null}
 */
export function parsearPrecoBR(valor) {
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : null;
  let s = String(valor ?? "").trim().replace(/^r\$\s*/i, "").replace(/\s/g, "");
  if (!s) return null;
  const temVirgula = s.includes(",");
  const temPonto = s.includes(".");
  if (temVirgula && temPonto) {
    // "1.234,56" — ponto é milhar, vírgula é decimal
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (temVirgula) {
    s = s.replace(",", ".");
  } else if (temPonto) {
    // Só ponto: "24.90" é decimal; "1.234" (grupos de 3) é milhar
    if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  }
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Booleano pt-BR: sim/não, s/n, 1/0, true/false, verdadeiro/falso.
 * Vazio → valorPadrao. Não reconhecido → null (pra virar aviso).
 */
export function parsearBooleanoBR(valor, valorPadrao = true) {
  const v = normalizarTexto(valor);
  if (v === "") return valorPadrao;
  if (["sim", "s", "1", "true", "verdadeiro", "ativo"].includes(v)) return true;
  if (["nao", "n", "0", "false", "falso", "inativo"].includes(v)) return false;
  return null;
}

/**
 * Valida as linhas do CSV de produtos e monta a lista limpa.
 * Puro: recebe o texto, devolve { produtos, erros, avisos }.
 * - erros BLOQUEIAM a linha (não a importação inteira);
 * - duplicado no arquivo: vale a última linha (com aviso);
 * - mensagens em português de balcão, sempre com o número da linha.
 * @param {string} texto - conteúdo do arquivo já decodificado
 */
export function validarPlanilhaProdutos(texto) {
  const erros = [];
  const avisos = [];
  const linhas = parsearCSV(texto);

  if (linhas.length === 0) {
    return { produtos: [], erros: [{ linha: 0, mensagem: "O arquivo está vazio." }], avisos };
  }
  if (linhas.length - 1 > LIMITE_LINHAS) {
    return {
      produtos: [],
      erros: [{ linha: 0, mensagem: `O arquivo tem mais de ${LIMITE_LINHAS} linhas — divida em partes menores.` }],
      avisos,
    };
  }

  // Cabeçalho tolerante: casa por nome normalizado, em qualquer ordem
  const cabecalho = linhas[0].map(normalizarCabecalho);
  const indice = {};
  for (const coluna of COLUNAS_MODELO) {
    indice[coluna] = cabecalho.indexOf(coluna);
  }
  const faltando = COLUNAS_OBRIGATORIAS.filter((c) => indice[c] === -1);
  if (faltando.length) {
    return {
      produtos: [],
      erros: [{
        linha: 1,
        mensagem: `Faltam colunas obrigatórias no cabeçalho: ${faltando.join(", ")}. Baixe a planilha modelo e confira.`,
      }],
      avisos,
    };
  }

  const porNome = new Map(); // dedupe dentro do arquivo (vale a última)

  for (let i = 1; i < linhas.length; i++) {
    const numeroLinha = i + 1; // 1-based, como o usuário vê no Excel
    const pegar = (coluna) => (indice[coluna] === -1 ? "" : (linhas[i][indice[coluna]] ?? "").trim());

    const nome = pegar("nome").slice(0, LIMITE_NOME);
    const categoria = pegar("categoria").slice(0, LIMITE_CATEGORIA);
    const preco = parsearPrecoBR(pegar("preco"));
    const ativo = parsearBooleanoBR(pegar("ativo"), true);

    if (!nome) { erros.push({ linha: numeroLinha, mensagem: "Nome do produto vazio." }); continue; }
    if (preco === null) { erros.push({ linha: numeroLinha, mensagem: `Preço "${pegar("preco")}" não é um valor válido (use 24,90).` }); continue; }
    if (preco <= 0) { erros.push({ linha: numeroLinha, mensagem: "Preço precisa ser maior que zero." }); continue; }
    if (!categoria) { erros.push({ linha: numeroLinha, mensagem: "Categoria vazia." }); continue; }

    let ativoFinal = ativo;
    if (ativo === null) {
      avisos.push({ linha: numeroLinha, mensagem: `Não entendi "${pegar("ativo")}" na coluna ativo — considerei "sim".` });
      ativoFinal = true;
    }

    const chave = normalizarTexto(nome);
    if (porNome.has(chave)) {
      avisos.push({ linha: numeroLinha, mensagem: `"${nome}" aparece mais de uma vez no arquivo — vale esta linha.` });
    }
    porNome.set(chave, {
      linha: numeroLinha,
      nome,
      preco,
      categoria,
      emoji: pegar("emoji").slice(0, 8) || null,
      ativo: ativoFinal,
      unidade: pegar("unidade").slice(0, 10) || "un",
    });
  }

  return { produtos: [...porNome.values()], erros, avisos };
}

/** Escapa uma célula pro CSV (aspas quando tem separador/aspas/quebra). */
function celulaCSV(valor, separador) {
  const s = String(valor ?? "");
  return s.includes(separador) || s.includes('"') || s.includes("\n")
    ? `"${s.replace(/"/g, '""')}"`
    : s;
}

/**
 * Gera o CSV de produtos no MESMO layout do modelo de import — export
 * de um tenant importa em outro sem editar nada (portabilidade real).
 * Com BOM + ";" pra abrir certo no Excel BR.
 * @param {Array<{name:string, price:number, category:string, emoji?:string, active?:boolean, unidade_estoque?:string}>} produtos
 */
export function montarCSVProdutos(produtos) {
  const sep = ";";
  const cabecalho = COLUNAS_MODELO.join(sep);
  const linhas = (produtos || []).map((p) =>
    [
      celulaCSV(p.name, sep),
      String(p.price ?? 0).replace(".", ","),
      celulaCSV(p.category, sep),
      p.emoji || "",
      p.active === false ? "não" : "sim",
      p.unidade_estoque || "un",
    ].join(sep)
  );
  return "﻿" + [cabecalho, ...linhas].join("\r\n");
}

/** Planilha modelo (o contrato) com 2 linhas de exemplo. */
export function gerarModeloCSV() {
  return montarCSVProdutos([
    { name: "X-Salada", price: 24.9, category: "Lanches", emoji: "🍔", active: true, unidade_estoque: "un" },
    { name: "Suco de Laranja 300ml", price: 9, category: "Bebidas", emoji: "🍊", active: true, unidade_estoque: "un" },
  ]);
}
