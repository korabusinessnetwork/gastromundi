// ──────────────────────────────────────────────────────────────────
// Migração de dados — núcleo de PLANILHA (funções puras, sem Supabase)
//
// Contratos de CSV (docs/03_REGRAS_DE_NEGOCIO/MIGRACAO_DADOS.md):
//   produtos: nome;preco;categoria;emoji;ativo;unidade
//   clientes: nome;telefone;endereco;observacoes        (Fase 2)
//   estoque:  produto;quantidade;minimo                 (Fase 2)
// Tolerante ao mundo real do Excel brasileiro: encoding Windows-1252,
// separador ";", dinheiro "R$ 1.234,56", cabeçalho com acento/caixa
// variada (e apelidos comuns de exports de outros PDVs), booleanos
// "sim/não". Toda regra aqui tem teste co-localizado.
// ──────────────────────────────────────────────────────────────────

/** Colunas do modelo de produtos. Só `nome`, `preco` e `categoria` são obrigatórias. */
export const COLUNAS_MODELO = ["nome", "preco", "categoria", "emoji", "ativo", "unidade"];
export const COLUNAS_OBRIGATORIAS = ["nome", "preco", "categoria"];

export const COLUNAS_MODELO_CLIENTES = ["nome", "telefone", "endereco", "observacoes"];
export const COLUNAS_OBRIGATORIAS_CLIENTES = ["nome", "telefone"];

export const COLUNAS_MODELO_ESTOQUE = ["produto", "quantidade", "minimo"];
export const COLUNAS_OBRIGATORIAS_ESTOQUE = ["produto", "quantidade"];

export const LIMITE_LINHAS = 5000;
export const LIMITE_NOME = 80;
export const LIMITE_CATEGORIA = 40;
export const LIMITE_ENDERECO = 160;
export const LIMITE_OBSERVACOES = 240;

// Teto de magnitude pra preço/quantidade/mínimo. Não existe prato, insumo
// ou estoque de restaurante que legitimamente passe de 1 milhão (preço em
// R$ ou unidades) — valor acima disso é quase sempre erro de digitação ou
// planilha corrompida (célula deslocada, export de outro sistema em
// centavos, etc.) e entraria sem limite nos cálculos/estoque/preços. Em
// vez de clampar em silêncio, rejeitamos a linha com mensagem clara —
// mesmo padrão dos outros erros de validação deste arquivo.
export const LIMITE_VALOR_NUMERICO = 1_000_000;

// Apelidos de cabeçalho (já normalizados) → coluna do nosso modelo.
// É o que faz o export "cru" de outros PDVs entrar sem o cliente
// renomear coluna — o degrau genérico do de-para de concorrentes.
const ALIASES_PRODUTOS = {
  produto: "nome", descricao: "nome", item: "nome",
  valor: "preco", precovenda: "preco", precodevenda: "preco", precounitario: "preco",
  grupo: "categoria", secao: "categoria",
  status: "ativo",
  unidademedida: "unidade", un: "unidade",
};
const ALIASES_CLIENTES = {
  cliente: "nome",
  celular: "telefone", fone: "telefone", whatsapp: "telefone", telefone1: "telefone",
  obs: "observacoes", observacao: "observacoes",
};
const ALIASES_ESTOQUE = {
  nome: "produto", item: "produto", descricao: "produto",
  qtd: "quantidade", saldo: "quantidade", estoque: "quantidade", quantidadeatual: "quantidade",
  estoqueminimo: "minimo", qtdminima: "minimo", minima: "minimo",
};

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
  if (typeof valor === "number") {
    return Number.isFinite(valor) && Math.abs(valor) <= LIMITE_VALOR_NUMERICO ? valor : null;
  }
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
  return Number.isFinite(n) && n <= LIMITE_VALOR_NUMERICO ? n : null;
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

/** Só dígitos — como o telefone é comparado/deduplicado em todo o app. */
export function normalizarTelefone(valor) {
  return String(valor ?? "").replace(/\D/g, "");
}

/**
 * Preâmbulo comum dos validadores: parseia, checa vazio/limite e monta
 * o índice de colunas com cabeçalho tolerante (nome normalizado, em
 * qualquer ordem, aceitando apelidos de outros PDVs).
 * @returns {{erro: object}|{linhas: string[][], indice: object}}
 */
function prepararPlanilha(texto, colunasModelo, colunasObrigatorias, aliases = {}) {
  const linhas = parsearCSV(texto);

  if (linhas.length === 0) {
    return { erro: { linha: 0, mensagem: "O arquivo está vazio." } };
  }
  if (linhas.length - 1 > LIMITE_LINHAS) {
    return { erro: { linha: 0, mensagem: `O arquivo tem mais de ${LIMITE_LINHAS} linhas — divida em partes menores.` } };
  }

  const indice = {};
  for (const coluna of colunasModelo) indice[coluna] = -1;
  linhas[0].forEach((celula, i) => {
    const chave = normalizarCabecalho(celula);
    const coluna = colunasModelo.includes(chave) ? chave : aliases[chave];
    if (coluna && indice[coluna] === -1) indice[coluna] = i;
  });

  const faltando = colunasObrigatorias.filter((c) => indice[c] === -1);
  if (faltando.length) {
    return {
      erro: {
        linha: 1,
        mensagem: `Faltam colunas obrigatórias no cabeçalho: ${faltando.join(", ")}. Baixe a planilha modelo e confira.`,
      },
    };
  }
  return { linhas, indice };
}

const pegarCelula = (linhas, indice, i) => (coluna) =>
  (indice[coluna] === -1 ? "" : (linhas[i][indice[coluna]] ?? "").trim());

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
  const prep = prepararPlanilha(texto, COLUNAS_MODELO, COLUNAS_OBRIGATORIAS, ALIASES_PRODUTOS);
  if (prep.erro) return { produtos: [], erros: [prep.erro], avisos };
  const { linhas, indice } = prep;

  const porNome = new Map(); // dedupe dentro do arquivo (vale a última)

  for (let i = 1; i < linhas.length; i++) {
    const numeroLinha = i + 1; // 1-based, como o usuário vê no Excel
    const pegar = pegarCelula(linhas, indice, i);

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

// Caracteres que o Excel/LibreOffice/Google Sheets interpretam como início
// de FÓRMULA numa célula de CSV: "=", "+", "-", "@" abrem fórmula; TAB e CR
// também disparam em alguns parsers. Um nome de produto tipo "=cmd|..."
// viraria fórmula executável na planilha de quem importa o export — vetor
// clássico de CSV injection (OWASP).
const CARACTERES_PERIGOSOS_CSV = ["=", "+", "-", "@", "\t", "\r"];

/**
 * Escapa uma célula pro CSV: neutraliza fórmula (prefixo aspa simples se a
 * célula começa com caractere perigoso — padrão OWASP contra CSV
 * injection) e só depois aplica o escaping normal de aspas/separador/quebra.
 */
function celulaCSV(valor, separador) {
  let s = String(valor ?? "");
  if (CARACTERES_PERIGOSOS_CSV.includes(s[0])) s = "'" + s;
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

// ── Clientes (Fase 2) ───────────────────────────────────────────────

/**
 * Valida o CSV de clientes: nome e telefone obrigatórios (telefone é o
 * contato mínimo pra fiado/delivery — mesma regra do cadastro na tela)
 * e a chave de dedupe, normalizado pra só dígitos.
 * @param {string} texto
 * @returns {{clientes: Array, erros: Array, avisos: Array}}
 */
export function validarPlanilhaClientes(texto) {
  const erros = [];
  const avisos = [];
  const prep = prepararPlanilha(texto, COLUNAS_MODELO_CLIENTES, COLUNAS_OBRIGATORIAS_CLIENTES, ALIASES_CLIENTES);
  if (prep.erro) return { clientes: [], erros: [prep.erro], avisos };
  const { linhas, indice } = prep;

  const porTelefone = new Map(); // dedupe dentro do arquivo (vale a última)

  for (let i = 1; i < linhas.length; i++) {
    const numeroLinha = i + 1;
    const pegar = pegarCelula(linhas, indice, i);

    const nome = pegar("nome").slice(0, LIMITE_NOME);
    const telefoneBruto = pegar("telefone");
    const telefone = normalizarTelefone(telefoneBruto);

    if (!nome) { erros.push({ linha: numeroLinha, mensagem: "Nome do cliente vazio." }); continue; }
    if (!telefone) { erros.push({ linha: numeroLinha, mensagem: "Telefone vazio — é o contato mínimo pra fiado e delivery." }); continue; }
    if (telefone.length < 8 || telefone.length > 13) {
      erros.push({ linha: numeroLinha, mensagem: `Telefone "${telefoneBruto}" não parece válido (use DDD + número).` });
      continue;
    }

    if (porTelefone.has(telefone)) {
      avisos.push({ linha: numeroLinha, mensagem: `O telefone ${telefoneBruto} aparece mais de uma vez no arquivo — vale esta linha.` });
    }
    porTelefone.set(telefone, {
      linha: numeroLinha,
      nome,
      telefone,
      endereco: pegar("endereco").slice(0, LIMITE_ENDERECO) || null,
      observacoes: pegar("observacoes").slice(0, LIMITE_OBSERVACOES) || null,
    });
  }

  return { clientes: [...porTelefone.values()], erros, avisos };
}

/**
 * CSV de clientes no MESMO layout do modelo de import (portabilidade).
 * @param {Array<{nome:string, telefone?:string, endereco?:string, observacoes?:string}>} clientes
 */
export function montarCSVClientes(clientes) {
  const sep = ";";
  const cabecalho = COLUNAS_MODELO_CLIENTES.join(sep);
  const linhas = (clientes || []).map((c) =>
    [
      celulaCSV(c.nome, sep),
      celulaCSV(c.telefone || "", sep),
      celulaCSV(c.endereco || "", sep),
      celulaCSV(c.observacoes || "", sep),
    ].join(sep)
  );
  return "﻿" + [cabecalho, ...linhas].join("\r\n");
}

/** Modelo de clientes com 2 linhas de exemplo. */
export function gerarModeloClientesCSV() {
  return montarCSVClientes([
    { nome: "Ana Souza", telefone: "51 99999-0001", endereco: "Rua das Flores, 123", observacoes: "Prefere retirar no balcão" },
    { nome: "Carlos Lima", telefone: "51 98888-0002", endereco: "", observacoes: "" },
  ]);
}

// ── Estoque inicial (Fase 2) ────────────────────────────────────────

/**
 * Valida o CSV de estoque inicial: produto (nome, casado depois com o
 * cardápio) e quantidade obrigatórios; mínimo opcional (vazio mantém o
 * mínimo atual ou o padrão do sistema).
 * @param {string} texto
 * @returns {{itens: Array, erros: Array, avisos: Array}}
 */
export function validarPlanilhaEstoque(texto) {
  const erros = [];
  const avisos = [];
  const prep = prepararPlanilha(texto, COLUNAS_MODELO_ESTOQUE, COLUNAS_OBRIGATORIAS_ESTOQUE, ALIASES_ESTOQUE);
  if (prep.erro) return { itens: [], erros: [prep.erro], avisos };
  const { linhas, indice } = prep;

  const porProduto = new Map(); // dedupe dentro do arquivo (vale a última)

  for (let i = 1; i < linhas.length; i++) {
    const numeroLinha = i + 1;
    const pegar = pegarCelula(linhas, indice, i);

    const produto = pegar("produto").slice(0, LIMITE_NOME);
    const quantidade = parsearPrecoBR(pegar("quantidade"));
    const minimoBruto = pegar("minimo");
    const minimo = minimoBruto === "" ? null : parsearPrecoBR(minimoBruto);

    if (!produto) { erros.push({ linha: numeroLinha, mensagem: "Nome do produto vazio." }); continue; }
    if (quantidade === null) { erros.push({ linha: numeroLinha, mensagem: `Quantidade "${pegar("quantidade")}" não é um número válido (use 10 ou 2,5).` }); continue; }
    if (quantidade < 0) { erros.push({ linha: numeroLinha, mensagem: "Quantidade não pode ser negativa." }); continue; }
    if (minimoBruto !== "" && minimo === null) { erros.push({ linha: numeroLinha, mensagem: `Mínimo "${minimoBruto}" não é um número válido — deixe vazio pra manter o atual.` }); continue; }
    if (minimo !== null && minimo < 0) { erros.push({ linha: numeroLinha, mensagem: "Mínimo não pode ser negativo." }); continue; }

    const chave = normalizarTexto(produto);
    if (porProduto.has(chave)) {
      avisos.push({ linha: numeroLinha, mensagem: `"${produto}" aparece mais de uma vez no arquivo — vale esta linha.` });
    }
    porProduto.set(chave, { linha: numeroLinha, produto, quantidade, minimo });
  }

  return { itens: [...porProduto.values()], erros, avisos };
}

/**
 * CSV de estoque no MESMO layout do modelo de import (portabilidade).
 * @param {Array<{produto:string, quantidade:number, minimo?:number}>} itens
 */
export function montarCSVEstoque(itens) {
  const sep = ";";
  const cabecalho = COLUNAS_MODELO_ESTOQUE.join(sep);
  const linhas = (itens || []).map((e) =>
    [
      celulaCSV(e.produto, sep),
      String(e.quantidade ?? 0).replace(".", ","),
      e.minimo == null ? "" : String(e.minimo).replace(".", ","),
    ].join(sep)
  );
  return "﻿" + [cabecalho, ...linhas].join("\r\n");
}

/** Modelo de estoque com 2 linhas de exemplo. */
export function gerarModeloEstoqueCSV() {
  return montarCSVEstoque([
    { produto: "X-Salada", quantidade: 30, minimo: 10 },
    { produto: "Suco de Laranja 300ml", quantidade: 24, minimo: null },
  ]);
}
