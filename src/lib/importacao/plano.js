// ──────────────────────────────────────────────────────────────────
// Migração de dados — PLANEJADORES (100% puros, sem Supabase).
//
// Separados dos módulos de aplicação (produtos.js/clientes.js/
// estoque.js, que importam o client do app) para que a Edge Function
// `importar-dados` (Deno) reutilize EXATAMENTE a mesma lógica de
// plano/idempotência do front — um pipeline só, dois transportes.
// ──────────────────────────────────────────────────────────────────

// Extensão explícita: este módulo também roda em Deno (Edge Function
// importar-dados), que não resolve import sem extensão.
import { normalizarTexto, normalizarTelefone } from "./planilha.js";

export const TAMANHO_LOTE = 200;

// ── Produtos ────────────────────────────────────────────────────────

/**
 * Monta o plano de importação de produtos (é o que o preview mostra).
 * `products` não tem unique em name (nome só é único DENTRO do tenant),
 * então idempotência é por casamento de nome normalizado no código:
 * existe → UPDATE por id; não existe → INSERT.
 * @param {Array} produtosPlanilha - saída de validarPlanilhaProdutos().produtos
 * @param {Array<{id:number|string, name:string, price:number, category:string, emoji?:string, active?:boolean, unidade_estoque?:string}>} produtosExistentes
 * @returns {{criar:Array, atualizar:Array<{id, nome, changes}>, iguais:Array, categoriasNovas:string[]}}
 */
export function planejarImportacaoProdutos(produtosPlanilha, produtosExistentes) {
  const existentesPorNome = new Map(
    (produtosExistentes || []).map((p) => [normalizarTexto(p.name), p])
  );
  const categoriasExistentes = new Set(
    (produtosExistentes || []).map((p) => normalizarTexto(p.category))
  );

  const criar = [];
  const atualizar = [];
  const iguais = [];
  const categoriasNovas = new Map();

  for (const item of produtosPlanilha || []) {
    if (!categoriasExistentes.has(normalizarTexto(item.categoria)) &&
        !categoriasNovas.has(normalizarTexto(item.categoria))) {
      categoriasNovas.set(normalizarTexto(item.categoria), item.categoria);
    }

    const existente = existentesPorNome.get(normalizarTexto(item.nome));
    if (!existente) {
      criar.push(item);
      continue;
    }

    const changes = {};
    if (Number(existente.price) !== item.preco) changes.price = item.preco;
    if ((existente.category || "") !== item.categoria) changes.category = item.categoria;
    if (item.emoji && (existente.emoji || null) !== item.emoji) changes.emoji = item.emoji;
    if (Boolean(existente.active) !== item.ativo) changes.active = item.ativo;

    if (Object.keys(changes).length === 0) iguais.push(item);
    else atualizar.push({ id: existente.id, nome: item.nome, changes });
  }

  return { criar, atualizar, iguais, categoriasNovas: [...categoriasNovas.values()] };
}

/** Converte um item da planilha no payload da tabela `products`. */
export function paraPayloadProduto(item) {
  return {
    name: item.nome,
    price: item.preco,
    category: item.categoria,
    emoji: item.emoji,
    active: item.ativo,
    unidade_estoque: item.unidade || "un",
  };
}

// ── Clientes ────────────────────────────────────────────────────────

/**
 * Monta o plano de importação de clientes. Idempotência por telefone
 * normalizado (só dígitos); campo vazio na planilha nunca apaga o que
 * já existe.
 * @param {Array} clientesPlanilha - saída de validarPlanilhaClientes().clientes
 * @param {Array<{id:string, nome:string, telefone?:string, endereco?:string, observacoes?:string}>} clientesExistentes
 * @returns {{criar:Array, atualizar:Array<{id, nome, changes}>, iguais:Array}}
 */
export function planejarImportacaoClientes(clientesPlanilha, clientesExistentes) {
  const existentesPorTelefone = new Map();
  for (const c of clientesExistentes || []) {
    const tel = normalizarTelefone(c.telefone);
    if (tel && !existentesPorTelefone.has(tel)) existentesPorTelefone.set(tel, c);
  }

  const criar = [];
  const atualizar = [];
  const iguais = [];

  for (const item of clientesPlanilha || []) {
    const existente = existentesPorTelefone.get(item.telefone);
    if (!existente) {
      criar.push(item);
      continue;
    }

    const changes = {};
    if (item.nome !== existente.nome) changes.nome = item.nome;
    if (item.endereco && (existente.endereco || null) !== item.endereco) changes.endereco = item.endereco;
    if (item.observacoes && (existente.observacoes || null) !== item.observacoes) changes.observacoes = item.observacoes;

    if (Object.keys(changes).length === 0) iguais.push(item);
    else atualizar.push({ id: existente.id, nome: item.nome, changes });
  }

  return { criar, atualizar, iguais };
}

/** Converte um item da planilha no payload da tabela `clientes`. */
export function paraPayloadCliente(item, usuario) {
  return {
    nome: item.nome,
    telefone: item.telefone,
    endereco: item.endereco,
    observacoes: item.observacoes,
    criado_por: usuario ?? null,
  };
}

// ── Estoque inicial ─────────────────────────────────────────────────

/** Mínimo padrão quando o produto ainda não tem linha em `estoque` (DEFAULT do schema). */
export const MINIMO_PADRAO = 10;

/**
 * Monta o plano de importação de estoque. A planilha traz o NOME do
 * produto; o plano casa com o cardápio (nome normalizado) e vira
 * upsert por produto_id (define, não incrementa). Produto fora do
 * cardápio vira erro apontado por linha.
 * @param {Array} itensPlanilha - saída de validarPlanilhaEstoque().itens
 * @param {Array<{id:number|string, name:string}>} produtosExistentes
 * @param {Array<{produto_id:number|string, quantidade:number, minimo:number}>} estoqueAtual
 * @returns {{definir:Array<{produto_id, nome, quantidade, minimo}>, iguais:Array, naoEncontrados:Array<{linha, mensagem}>}}
 */
export function planejarImportacaoEstoque(itensPlanilha, produtosExistentes, estoqueAtual) {
  const produtosPorNome = new Map(
    (produtosExistentes || []).map((p) => [normalizarTexto(p.name), p])
  );
  const estoquePorProduto = new Map(
    (estoqueAtual || []).map((e) => [String(e.produto_id), e])
  );

  const definir = [];
  const iguais = [];
  const naoEncontrados = [];

  for (const item of itensPlanilha || []) {
    const produto = produtosPorNome.get(normalizarTexto(item.produto));
    if (!produto) {
      naoEncontrados.push({
        linha: item.linha,
        mensagem: `"${item.produto}" não está no cardápio — importe/cadastre os produtos antes do estoque.`,
      });
      continue;
    }

    const atual = estoquePorProduto.get(String(produto.id));
    // Mínimo vazio na planilha mantém o atual (ou o padrão do sistema)
    const minimo = item.minimo ?? (atual ? Number(atual.minimo) : MINIMO_PADRAO);

    if (atual && Number(atual.quantidade) === item.quantidade && Number(atual.minimo) === minimo) {
      iguais.push(item);
    } else {
      definir.push({ produto_id: produto.id, nome: produto.name, quantidade: item.quantidade, minimo });
    }
  }

  return { definir, iguais, naoEncontrados };
}

/** Achata o resultado do join estoque→products no shape do CSV de export. */
export function paraLinhasExportEstoque(linhas) {
  return (linhas || [])
    .filter((e) => e.products?.name)
    .map((e) => ({ produto: e.products.name, quantidade: Number(e.quantidade), minimo: Number(e.minimo) }));
}
