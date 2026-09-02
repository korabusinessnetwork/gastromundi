import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * Guard da precisão das colunas de dinheiro (A8).
 *
 * `numeric` sem precisão aceita qualquer número de casas decimais, então um
 * cálculo que devolva 10.004999 é gravado inteiro e o relatório soma o número
 * comprido enquanto a tela mostra R$ 10,00. A migration 20260923 declara
 * `numeric(12,2)` nas colunas de valor — e é justamente por ser uma mudança
 * de TIPO que ela precisa de guard: aplicá-la na coluna errada não dá erro,
 * apenas arredonda em silêncio. Meio quilo de queijo vira zero e uma
 * coordenada de entrega vira outro bairro.
 *
 * Não há Postgres no CI, então o que se garante aqui é o texto: a lista da
 * migration, o que ela deliberadamente deixou de fora, e o encaixe com
 * `supabase/schema.sql` — que é o documento que o próximo dev vai ler.
 */

const RAIZ = join(import.meta.dirname, "..", "..");
const MIGRATION = readFileSync(
  join(RAIZ, "supabase", "migrations", "20260923_dinheiro_precisao.sql"),
  "utf8",
);
const SCHEMA = readFileSync(join(RAIZ, "supabase", "schema.sql"), "utf8");
const CHECKOUT = readFileSync(
  join(RAIZ, "src", "components", "desktop", "views", "PDVView", "CheckoutView.jsx"),
  "utf8",
);

/** Só o SQL que roda — o cabeçalho cita nomes de coluna em prosa. */
const semComentarios = (conteudo) =>
  conteudo
    .split("\n")
    .map((linha) => linha.replace(/\r$/, ""))
    .filter((linha) => !linha.trim().startsWith("--"))
    .join("\n");

const SQL = semComentarios(MIGRATION);
const SCHEMA_SQL = semComentarios(SCHEMA);

/** [{ tabela, coluna, precisao, escala }] extraídos do VALUES da migration. */
const ALVOS = [...SQL.matchAll(/\('([a-z_]+)',\s*'([a-z_]+)',\s*(\d+),\s*(\d+)\)/g)].map(
  ([, tabela, coluna, precisao, escala]) => ({
    tabela,
    coluna,
    precisao: Number(precisao),
    escala: Number(escala),
  }),
);

/** Corpo entre parênteses do `CREATE TABLE` da tabela pedida, casando os parênteses. */
function blocoDaTabela(nome) {
  const abre = SCHEMA_SQL.search(new RegExp(`CREATE TABLE (?:public\\.)?${nome}\\s*\\(`));
  if (abre < 0) return null;
  let i = SCHEMA_SQL.indexOf("(", abre) + 1;
  let profundidade = 1;
  while (i < SCHEMA_SQL.length && profundidade > 0) {
    if (SCHEMA_SQL[i] === "(") profundidade++;
    else if (SCHEMA_SQL[i] === ")") profundidade--;
    i++;
  }
  return SCHEMA_SQL.slice(abre, i);
}

describe("migration 20260923 — dinheiro com precisão declarada", () => {
  it("cobre todas as colunas de valor do sistema", () => {
    const emReais = ALVOS.filter((a) => a.precisao === 12 && a.escala === 2).map(
      (a) => `${a.tabela}.${a.coluna}`,
    );
    expect(new Set(emReais)).toEqual(
      new Set([
        "assinaturas.valor_mensal",
        "assinaturas_pagamentos.valor",
        "products.price",
        "pending.total",
        "vendas.subtotal",
        "vendas.valor_taxa",
        "vendas.valor_ajuste",
        "vendas.total",
        "venda_itens.preco",
        "venda_pagamentos.valor",
        "lancamentos.valor",
        "caixa_movimentos.valor",
        "notas_fiscais.valor_total",
        "notas_fiscais_itens.preco_total",
        "subprodutos.preco",
        "combos.preco_total",
        "combo_subprodutos.preco_customizado",
        "config_delivery.pedido_minimo",
        "delivery_entregadores.valor_por_entrega",
        "delivery_pedidos.subtotal",
        "delivery_pedidos.taxa_entrega",
        "delivery_pedidos.total",
        "delivery_pedidos.troco_para",
        "delivery_pedidos.valor_entregador",
        "delivery_pedido_itens.preco_unit",
        "complementos.preco",
      ]),
    );
  });

  it("deixa custo por unidade com casas de sobra — fração de centavo ali é real", () => {
    // vUnCom da NF-e tem até 10 casas, e a entrada de estoque divide o preço
    // pelo fator de conversão: 1 kg a R$ 25,00 vira R$ 0,025 por grama.
    const custo = ALVOS.filter((a) => a.coluna === "preco_unitario");
    expect(custo.map((a) => a.tabela).sort()).toEqual(["estoque_entradas", "notas_fiscais_itens"]);
    for (const c of custo) {
      expect({ precisao: c.precisao, escala: c.escala }).toEqual({ precisao: 18, escala: 10 });
    }
  });

  it("não encosta em quantidade, alíquota nem coordenada", () => {
    // Duas casas em quantidade zeraria meio grama; em alíquota transformaria
    // 1,65% em 2%; em latitude erraria a posição em mais de um quilômetro.
    const proibidas = [
      "quantidade",
      "quantidade_estoque",
      "qtd",
      "minimo",
      "fator_conversao",
      "fator_consumo_estoque",
      "reducao_base_icms",
      "origem_lat",
      "origem_lng",
      "entrega_lat",
      "entrega_lng",
    ];
    const tocadas = ALVOS.map((a) => a.coluna);
    for (const coluna of proibidas) expect(tocadas).not.toContain(coluna);
    expect(tocadas.filter((c) => c.startsWith("aliquota"))).toEqual([]);
  });

  it("confere os dados ANTES de alterar, porque ALTER TYPE arredonda calado", () => {
    // Valor grande demais aborta com "numeric field overflow" sem dizer qual
    // coluna; valor pequeno que vira zero some — e em lancamentos.valor e
    // caixa_movimentos.valor ainda esbarra no CHECK (valor > 0).
    expect(SQL).toMatch(/não cabem em numeric/);
    expect(SQL).toMatch(/virariam zero ao arredondar/);
    const conferencia = SQL.search(/virariam zero ao arredondar/);
    const alteracao = SQL.search(/ALTER TABLE public\.%I ALTER COLUMN/);
    expect(alteracao).toBeGreaterThan(conferencia);
  });

  it("só altera a coluna que ainda não está no tipo alvo (rodar de novo não reescreve tabela)", () => {
    expect(SQL).toMatch(/IF v_prec IS DISTINCT FROM v_alvo\.precisao OR v_esc IS DISTINCT FROM v_alvo\.escala THEN/);
  });

  it("para com mensagem legível se o banco estiver atrás das migrations", () => {
    expect(SQL).toMatch(/FALHA: a tabela public\.% não existe neste banco/);
    expect(SQL).toMatch(/FALHA: a coluna public\.%\.% não existe neste banco/);
  });

  it("tem autoteste que procura o defeito, não a própria lista", () => {
    expect(SQL).toMatch(/DO \$conf\$/);
    // Varre o banco atrás de QUALQUER coluna com cara de dinheiro ainda sem
    // precisão — pega também a que alguém criar amanhã e esquecer.
    expect(SQL).toMatch(/coluna\(s\) de dinheiro ainda sem precisão declarada/);
    expect(SQL).toMatch(/c\.numeric_scale IS NULL/);
    // E confere que o que era para ficar de fora ficou.
    expect(SQL).toMatch(/coordenada de entrega ganhou precisão fixa/);
    expect(SQL).toMatch(/quantidade ou alíquota ficou com precisão de dinheiro/);
  });

  // O que se procura numa coluna de quantidade é PRECISÃO DE DINHEIRO, não
  // "qualquer escala": as colunas de nota fiscal são numeric(12,4) desde a
  // 20240101, e 4 casas é exatamente o que uma quantidade precisa. Enquanto
  // a conferência reprovava qualquer escala, ela reprovava o certo — a
  // migration não passava em banco nenhum que tivesse rodado a 20240101.
  it("na quantidade, só reprova escala menor que a de uma quantidade de verdade", () => {
    expect(SQL).toMatch(/c\.numeric_scale < 4/);
    expect(SQL).not.toMatch(/numeric_scale IS NOT NULL\s*\n\s*AND \(c\.column_name LIKE 'aliquota%'/);
  });

  it("não deixa a temporária da lista virar tabela de verdade", () => {
    expect(SQL).toMatch(/CREATE TEMP TABLE _alvo_dinheiro/);
    expect(SQL).toMatch(/DROP TABLE _alvo_dinheiro;/);
  });
});

describe("supabase/schema.sql descreve os tipos que a migration aplica", () => {
  it("mostra a precisão em cada coluna alterada", () => {
    const divergentes = [];
    for (const { tabela, coluna, precisao, escala } of ALVOS) {
      const bloco = blocoDaTabela(tabela);
      if (!bloco) {
        divergentes.push(`${tabela} não está descrita no schema.sql`);
        continue;
      }
      const linha = bloco
        .split("\n")
        .find((l) => new RegExp(`^\\s+${coluna}\\s`).test(l));
      if (!linha) {
        divergentes.push(`${tabela}.${coluna} não está no bloco do schema.sql`);
        continue;
      }
      if (!linha.includes(`numeric(${precisao},${escala})`)) {
        divergentes.push(`${tabela}.${coluna} →${linha.replace(/\s+/g, " ")}`);
      }
    }
    expect(
      divergentes,
      `Coluna alterada pela migration e descrita com outro tipo no supabase/schema.sql:\n  ${divergentes.join("\n  ")}\n` +
        "O schema é o que o próximo dev lê antes de escrever query — tipo errado ali é bug combinado.",
    ).toEqual([]);
  });

  it("não deixa nenhuma coluna de dinheiro sem precisão no documento", () => {
    // Mesma varredura do autoteste da migration, só que no texto: coluna com
    // nome de dinheiro que continue `numeric` puro é a próxima a acumular
    // casa fantasma.
    const soltas = [];
    for (const linha of SCHEMA_SQL.split("\n")) {
      const m = linha.match(/^\s+([a-z_]+)\s+numeric(?![(\w])/);
      if (!m) continue;
      if (/^(price|preco|valor|subtotal|total|taxa_entrega|troco_para|pedido_minimo)/.test(m[1])) {
        soltas.push(linha.trim());
      }
    }
    expect(soltas).toEqual([]);
  });
});

describe("front-end usa um arredondamento de dinheiro só", () => {
  it("o checkout importa o round2 de @/lib/vendas em vez de declarar o próprio", () => {
    // Dois arredondamentos parecidos na mesma tela é como nasce a diferença
    // de um centavo entre o que o cliente paga e o que o fechamento espera.
    expect(CHECKOUT).toMatch(/import \{[^}]*\bround2\b[^}]*\} from "@\/lib\/vendas"/);
    expect(CHECKOUT).not.toMatch(/const round2 =/);
  });
});
