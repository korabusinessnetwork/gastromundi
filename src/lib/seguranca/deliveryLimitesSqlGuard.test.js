import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

/**
 * Guard de regressão do DL25 + DL26 — o que um anônimo consegue gravar
 * pelo checkout público.
 *
 * `criar_pedido_delivery` é SECURITY DEFINER e chamável por `anon`: é o
 * único ponto do produto onde alguém sem login escreve no banco. Ela
 * confere preço e complemento a fundo e não olhava o TAMANHO de nada.
 *
 * DL25 — a vitrine limita tudo no navegador (maxLength), mas maxLength é
 *   enfeite para quem chama a API direto. Sem CHECK nas colunas e sem
 *   trigger, um pedido com 100 KB de observação gravava — e ia inteiro
 *   para a impressora térmica e para o cartão da Cozinha. Também não
 *   havia teto de linhas por pedido nem de quantidade por linha.
 *
 * DL26 — o rate-limit da 20260814 normalizava o telefone só para decidir
 *   se pulava a checagem, mas CONTAVA comparando a coluna crua. Quatro
 *   formatações do mesmo número = quatro contadores.
 *
 * Não há Postgres no CI, então o que este arquivo garante é o texto da
 * migração corretiva (mesmo instrumento de rlsJwtClaimGuard.test.js e
 * deliveryEspelhoSqlGuard.test.js):
 *   (a) ela existe e roda depois da migração que criou o rate-limit;
 *   (b) o pedido tem teto nos seis campos que o cliente escreve, e o
 *       trigger é BEFORE INSERT — nunca UPDATE, para não passar a
 *       derrubar mudança de status por causa de linha antiga;
 *   (c) o item tem teto de nome, de observação e de quantidade;
 *   (d) o teto de linhas por pedido é statement-level com tabela de
 *       transição (a RPC grava todos os itens num INSERT só);
 *   (e) o rate-limit compara dígitos DOS DOIS LADOS e nenhuma linha ativa
 *       ficou com a comparação crua;
 *   (f) toda função nova é SECURITY DEFINER com search_path fixo;
 *   (g) o teto do servidor é sempre >= o maxLength da tela — senão a
 *       vitrine deixaria digitar algo que o banco recusa na hora de
 *       enviar, que é exatamente o erro que o Princípio nº 1 manda
 *       prevenir.
 *
 * A garantia de que a PRODUÇÃO ficou correta é o bloco DO $$ ... $$ no fim
 * da migração, que consulta pg_trigger ao vivo e aborta se algum trigger
 * não existir — isso este teste não substitui.
 */
const RAIZ = join(__dirname, "../../..");
const MIGRATIONS_DIR = join(RAIZ, "supabase/migrations");
const CORRETIVA = "20260905_delivery_limites_texto_publico.sql";
const RATE_LIMIT_ORIGINAL = "20260814_delivery_hardening.sql";

function ler(arquivo) {
  return readFileSync(join(MIGRATIONS_DIR, arquivo), "utf8");
}

/** Linhas de SQL ativo — comentário `--` explicando o bug é permitido. */
function linhasAtivas(conteudo) {
  return conteudo.split("\n").filter((linha) => !linha.trim().startsWith("--"));
}

function semComentarios(conteudo) {
  return linhasAtivas(conteudo).join("\n");
}

const arquivos = readdirSync(MIGRATIONS_DIR).filter((n) => n.endsWith(".sql"));

/** Teto que a migração impõe no servidor para um campo. */
function tetoDoServidor(coluna) {
  const sql = semComentarios(ler(CORRETIVA));
  const achado = new RegExp(
    `char_length\\(COALESCE\\(NEW\\.${coluna}, ''\\)\\) > (\\d+)`
  ).exec(sql);
  return achado ? Number(achado[1]) : null;
}

/** maxLength que a vitrine aplica no input de um dado id. */
function maxLengthDaTela(arquivo, id) {
  const jsx = readFileSync(join(RAIZ, arquivo), "utf8");
  const posicao = jsx.indexOf(`id="${id}"`);
  expect(posicao, `input id="${id}" não existe em ${arquivo}`).toBeGreaterThan(-1);
  const bloco = jsx.slice(posicao, posicao + 400);
  const achado = /maxLength=\{(\d+)\}/.exec(bloco);
  return achado ? Number(achado[1]) : null;
}

describe("Delivery público — guard dos limites de entrada (DL25)", () => {
  it("a migração corretiva existe e roda depois da que criou o rate-limit", () => {
    expect(arquivos).toContain(CORRETIVA);
    expect(arquivos).toContain(RATE_LIMIT_ORIGINAL);
    expect(CORRETIVA > RATE_LIMIT_ORIGINAL).toBe(true);

    // E depois de toda versão da RPC pública que já existia. Uma correção
    // futura pode refazer o corpo dela sem afrouxar nada: o teto está em
    // CHECK de coluna e em trigger de tabela, que valem para qualquer
    // INSERT, venha de onde vier — inclusive de uma RPC reescrita depois.
    const versoesRpc = arquivos.filter((n) =>
      /CREATE OR REPLACE FUNCTION public\.criar_pedido_delivery/.test(
        semComentarios(ler(n))
      )
    );
    const anteriores = versoesRpc.filter((arquivo) => arquivo < CORRETIVA);
    expect(anteriores.length).toBeGreaterThanOrEqual(6);
  });

  it("os seis campos que o cliente escreve no pedido têm teto", () => {
    // Se um campo sair desta lista, volta a ser possível gravar 100 KB
    // nele — e a Cozinha e a impressora comem o texto inteiro.
    const esperado = {
      cliente_nome: 120,
      cliente_telefone: 30,
      cep: 20,
      bairro: 120,
      endereco: 300,
      complemento_endereco: 200,
    };

    for (const [coluna, teto] of Object.entries(esperado)) {
      expect(tetoDoServidor(coluna), `sem teto em ${coluna}`).toBe(teto);
    }
  });

  it("o trigger do pedido é BEFORE INSERT — e não pega UPDATE", () => {
    const sql = semComentarios(ler(CORRETIVA));

    expect(sql).toMatch(
      /DROP TRIGGER IF EXISTS delivery_pedidos_limites ON public\.delivery_pedidos;/
    );
    expect(sql).toMatch(
      /CREATE TRIGGER delivery_pedidos_limites\s+BEFORE INSERT ON public\.delivery_pedidos\s+FOR EACH ROW\s+EXECUTE FUNCTION public\.delivery_pedido_limites\(\);/
    );

    // Incluir UPDATE faria uma linha antiga fora do limite travar a
    // mudança de status — o caminho mais quente do painel.
    expect(sql).not.toMatch(/CREATE TRIGGER delivery_pedidos_limites[^;]*UPDATE/);
  });

  it("o item tem teto de nome, de observação e de quantidade", () => {
    const sql = semComentarios(ler(CORRETIVA));

    // O ` THEN` no fim não é enfeite: sem ele, `> 200` casaria dentro de
    // `> 2000` e afrouxar o teto passaria batido.
    expect(sql).toMatch(/char_length\(COALESCE\(NEW\.nome, ''\)\) > 200 THEN/);
    // A observação é a que vai inteira para a impressora térmica.
    expect(sql).toMatch(/char_length\(COALESCE\(NEW\.obs, ''\)\) > 400 THEN/);
    // Sem teto, `GREATEST(1, ...)` da RPC aceitava qtd 2000000000.
    expect(sql).toMatch(/COALESCE\(NEW\.qtd, 1\) > 500 THEN/);

    expect(sql).toMatch(
      /CREATE TRIGGER delivery_pedido_itens_limites\s+BEFORE INSERT ON public\.delivery_pedido_itens\s+FOR EACH ROW\s+EXECUTE FUNCTION public\.delivery_item_limites\(\);/
    );
  });

  it("o teto de linhas por pedido é statement-level com tabela de transição", () => {
    const sql = semComentarios(ler(CORRETIVA));

    // A RPC grava TODOS os itens num único INSERT ... SELECT: um trigger
    // de linha não enxerga o tamanho da leva.
    expect(sql).toMatch(
      /CREATE TRIGGER delivery_pedido_itens_limite_linhas\s+AFTER INSERT ON public\.delivery_pedido_itens\s+REFERENCING NEW TABLE AS novos\s+FOR EACH STATEMENT\s+EXECUTE FUNCTION public\.delivery_itens_limite_linhas\(\);/
    );
    expect(sql).toMatch(/FROM \(SELECT count\(\*\) AS c FROM novos GROUP BY pedido_id\) s/);
    expect(sql).toMatch(/COALESCE\(v_max, 0\) > 100 THEN/);
  });

  it("toda função nova é SECURITY DEFINER com search_path fixo", () => {
    const sql = semComentarios(ler(CORRETIVA));
    const funcoes = [
      "delivery_pedido_limites",
      "delivery_item_limites",
      "delivery_itens_limite_linhas",
      "delivery_rate_limit_check",
    ];

    for (const nome of funcoes) {
      expect(
        sql,
        `${nome} sem SECURITY DEFINER / search_path`
      ).toMatch(
        new RegExp(
          `CREATE OR REPLACE FUNCTION public\\.${nome}\\(\\)\\s+RETURNS trigger\\s+LANGUAGE plpgsql\\s+SECURITY DEFINER\\s+SET search_path = public`
        )
      );
    }
  });

  it("as mensagens de recusa são em português, sem jargão técnico", () => {
    const sql = semComentarios(ler(CORRETIVA));
    const mensagens = [...sql.matchAll(/RAISE EXCEPTION '([^']+)'/g)].map((m) => m[1]);

    // O bloco DO $$ de conferência tem uma mensagem de operador; o resto
    // é o que o cliente pode ver na tela.
    const doCliente = mensagens.filter((m) => !m.startsWith("Triggers não criados"));
    expect(doCliente.length).toBeGreaterThanOrEqual(9);

    for (const mensagem of doCliente) {
      expect(mensagem).toMatch(/^[A-ZÀ-Ú]/);
      expect(mensagem).toMatch(/[.!]$/);
      expect(mensagem).not.toMatch(/char_length|NULL|trigger|constraint|column/i);
    }
  });
});

describe("Delivery público — o teto do servidor cobre o que a tela deixa digitar", () => {
  // Se o teto do servidor ficar ABAIXO do maxLength da vitrine, o cliente
  // digita à vontade e só descobre no "Confirmar pedido" que não podia.
  // Princípio nº 1: prevenir o erro, não avisar depois.
  const CAMPOS = [
    { tela: "src/pages/delivery/etapas/CheckoutEntrega.jsx", id: "ent-nome", coluna: "cliente_nome" },
    { tela: "src/pages/delivery/etapas/CheckoutEntrega.jsx", id: "ent-tel", coluna: "cliente_telefone" },
    { tela: "src/pages/delivery/etapas/CheckoutEntrega.jsx", id: "ent-bairro", coluna: "bairro" },
    { tela: "src/pages/delivery/etapas/CheckoutEntrega.jsx", id: "ent-end", coluna: "endereco" },
    { tela: "src/pages/delivery/etapas/CheckoutEntrega.jsx", id: "ent-compl", coluna: "complemento_endereco" },
  ];

  it.each(CAMPOS)("$coluna: o teto do banco é maior que o maxLength da tela", ({ tela, id, coluna }) => {
    const daTela = maxLengthDaTela(tela, id);
    const doBanco = tetoDoServidor(coluna);

    expect(daTela, `${id} sem maxLength na tela`).toBeGreaterThan(0);
    expect(doBanco, `${coluna} sem teto no banco`).toBeGreaterThan(0);
    expect(doBanco).toBeGreaterThanOrEqual(daTela);
  });

  it("a observação do item também cabe: 200 na tela, 400 no banco", () => {
    const daTela = maxLengthDaTela("src/pages/delivery/modais/ProdutoModal.jsx", "obs-produto");
    const sql = semComentarios(ler(CORRETIVA));
    const doBanco = Number(/char_length\(COALESCE\(NEW\.obs, ''\)\) > (\d+)/.exec(sql)[1]);

    expect(daTela).toBe(200);
    expect(doBanco).toBeGreaterThanOrEqual(daTela);
  });
});

describe("Delivery público — guard do rate-limit por telefone (DL26)", () => {
  it("a contagem compara dígitos dos DOIS lados", () => {
    const sql = semComentarios(ler(CORRETIVA));

    // Lado direito: o telefone que está chegando.
    expect(sql).toMatch(
      /v_tel\s+text := NULLIF\(regexp_replace\(COALESCE\(NEW\.cliente_telefone, ''\), '\\D', '', 'g'\), ''\)/
    );
    // Lado esquerdo: a coluna, no mesmo formato. Era aqui que estava o furo.
    expect(sql).toMatch(
      /AND regexp_replace\(COALESCE\(cliente_telefone, ''\), '\\D', '', 'g'\) = v_tel/
    );
  });

  it("nenhuma linha ativa ficou com a comparação crua de telefone", () => {
    const ativas = linhasAtivas(ler(CORRETIVA));
    const cruas = ativas.filter((l) =>
      /cliente_telefone\s*=\s*NEW\.cliente_telefone/.test(l)
    );
    expect(cruas).toEqual([]);
  });

  it("a janela e o teto de pedidos continuam os mesmos da 20260814", () => {
    // O conserto é de comparação, não de política: mexer no número aqui
    // seria mudar regra de negócio de contrabando.
    const sql = semComentarios(ler(CORRETIVA));
    expect(sql).toMatch(/created_at > now\(\) - interval '2 minutes'/);
    expect(sql).toMatch(/IF v_count >= 3 THEN/);

    const original = semComentarios(ler(RATE_LIMIT_ORIGINAL));
    expect(original).toMatch(/created_at > now\(\) - interval '2 minutes'/);
    expect(original).toMatch(/IF v_count >= 3 THEN/);
  });

  it("o trigger do rate-limit é recriado apontando para a função nova", () => {
    const sql = semComentarios(ler(CORRETIVA));
    expect(sql).toMatch(
      /DROP TRIGGER IF EXISTS delivery_pedidos_rate_limit ON public\.delivery_pedidos;/
    );
    expect(sql).toMatch(
      /CREATE TRIGGER delivery_pedidos_rate_limit\s+BEFORE INSERT ON public\.delivery_pedidos\s+FOR EACH ROW\s+EXECUTE FUNCTION public\.delivery_rate_limit_check\(\);/
    );
  });

  it("a busca do rate-limit tem índice que a sustente", () => {
    // regexp_replace não usa índice: o filtro por tenant + janela precisa
    // chegar pequeno nele. Só havia índice em (tenant_id).
    const sql = semComentarios(ler(CORRETIVA));
    expect(sql).toMatch(
      /CREATE INDEX IF NOT EXISTS delivery_pedidos_tenant_created_idx\s+ON public\.delivery_pedidos \(tenant_id, created_at DESC\);/
    );
  });
});
