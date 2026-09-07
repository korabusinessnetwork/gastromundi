import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { montarPayloadPedido } from "./delivery";

/**
 * Guard da retirada no local (20260928_delivery_retirada_no_local.sql).
 *
 * Duas correções na mesma migração, e as duas só existem de verdade no
 * banco:
 *
 *   1. RETIRADA. A vitrine tinha um caminho só — CEP, taxa, pagamento.
 *      Quem queria buscar no balcão inventava um endereço para conseguir
 *      avançar e ainda pagava uma corrida que ninguém ia fazer. Agora a
 *      config tem `permite_retirada`, o pedido tem `tipo_entrega`, e o
 *      servidor recusa pedido de retirada de quem não habilitou (o
 *      payload é do cliente: interruptor que só existe na tela não é
 *      interruptor).
 *
 *   2. O "CEP QUEBRADO". `calcular_taxa_entrega` devolvia 'fora_area'
 *      tanto para endereço realmente fora quanto para loja SEM NENHUMA
 *      faixa cadastrada. No segundo caso, todo CEP do Brasil era
 *      recusado com "confira o CEP" — e o dono, cujo CEP estava certo,
 *      concluía que o campo estava quebrado. O motivo novo 'sem_area'
 *      separa os dois, e a tela passa a dizer a verdade.
 *
 * Não existe Postgres neste ambiente, então a prova é feita em duas
 * metades que se completam:
 *
 *   (1) A migração termina num bloco DO $$ ... $$ que confere as colunas,
 *       a trava de valor e o corpo das três funções contra o banco de
 *       verdade, e ABORTA se faltar ponta. Isso prova no momento de
 *       aplicar.
 *
 *   (2) Este teste lê o arquivo e confere que as guardas estão escritas
 *       ali — e que o front fala a MESMA língua que o servidor espera
 *       (`entrega.tipo`), porque um payload com outro nome de campo
 *       passaria calado como pedido de entrega comum.
 */
const MIGRATIONS_DIR = join(__dirname, "../../supabase/migrations");
const MIGRACAO = "20260928_delivery_retirada_no_local.sql";

const sql = readFileSync(join(MIGRATIONS_DIR, MIGRACAO), "utf8");

describe("retirada no local — a migração existe e roda por último", () => {
  it("é a última a redefinir criar_pedido_delivery e cardapio_publico", () => {
    // Migrations são histórico imutável: as anteriores continuam no disco
    // com a versão antiga das funções. Se alguém adicionar uma corretiva
    // dessas RPCs com nome posterior, ela apaga a retirada sem avisar.
    const posteriores = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith(".sql") && f > MIGRACAO)
      .filter((f) => {
        const texto = readFileSync(join(MIGRATIONS_DIR, f), "utf8");
        return (
          /CREATE OR REPLACE FUNCTION public\.criar_pedido_delivery/.test(texto) ||
          /CREATE OR REPLACE FUNCTION public\.cardapio_publico/.test(texto)
        );
      });

    expect(posteriores).toEqual([]);
  });

  it("cria as duas colunas de forma idempotente (a migração pode ser reaplicada)", () => {
    expect(sql).toMatch(
      /ALTER TABLE public\.config_delivery\s+ADD COLUMN IF NOT EXISTS permite_retirada boolean NOT NULL DEFAULT false/
    );
    expect(sql).toMatch(
      /ALTER TABLE public\.delivery_pedidos\s+ADD COLUMN IF NOT EXISTS tipo_entrega text NOT NULL DEFAULT 'entrega'/
    );
  });

  it("trava os valores de tipo_entrega no banco, não só na tela", () => {
    expect(sql).toMatch(/CHECK \(tipo_entrega IN \('entrega', 'retirada'\)\)/);
  });
});

describe("retirada no local — as guardas que o payload do cliente não fura", () => {
  it("pedido de retirada em loja que não habilitou é recusado no servidor", () => {
    expect(sql).toContain("IF NOT COALESCE(v_cfg.permite_retirada, false) THEN");
    expect(sql).toContain("Este estabelecimento não aceita retirada no local.");
  });

  it("retirada não passa pelo cálculo de taxa", () => {
    // Sem este ramo, quem mora fora da área e está indo BUSCAR teria o
    // pedido recusado por causa de uma entrega que não vai acontecer.
    expect(sql).toContain("IF NOT v_retirada THEN");
    expect(sql).toMatch(/v_taxa\s*:=\s*0;/);
  });

  it("a vitrine só oferece retirada quando há endereço para ir buscar", () => {
    // Ligado sem endereço, a tela mandaria o cliente "retirar no local"
    // sem dizer onde é o local.
    expect(sql).toMatch(
      /'permite_retirada',\s*COALESCE\(v_cfg\.permite_retirada, false\)\s*\n\s*AND NULLIF\(btrim\(COALESCE\(v_cfg\.endereco_origem, ''\)\), ''\) IS NOT NULL/
    );
  });

  it("a comanda da cozinha diz RETIRADA na primeira palavra", () => {
    // É o que a bancada lê com pressa. Sem isso, o pedido sai na mochila
    // de um entregador com o cliente vindo buscar.
    expect(sql).toContain("'RETIRADA NO LOCAL'");
  });
});

describe("o CEP não estava quebrado — faltava faixa cadastrada", () => {
  it("loja sem nenhuma faixa devolve sem_area, e não fora_area", () => {
    expect(sql).toMatch(
      /jsonb_array_length\(v_faixas\) = 0 THEN\s*\n\s*RETURN jsonb_build_object\('ok', false, 'motivo', 'sem_area'\)/
    );
  });

  it("e o envio do pedido explica isso em vez de culpar o endereço do cliente", () => {
    expect(sql).toContain("IF v_motivo = 'sem_area' THEN");
    expect(sql).toContain("Este estabelecimento ainda não configurou as áreas de entrega.");
  });
});

describe("front e servidor falam a mesma língua", () => {
  it("o payload da retirada usa o campo que a RPC lê (entrega.tipo)", () => {
    const payload = montarPayloadPedido({
      cliente: { nome: "Ana" },
      entrega: { tipo: "retirada", cep: "90000000", endereco: "Rua X, 10" },
      pagamento: { forma: "pix" },
      itens: [{ produto_id: 7, qtd: 1 }],
    });

    // Se o front renomear este campo, o servidor lê 'entrega' no COALESCE
    // e grava o pedido como entrega comum — sem erro nenhum, com o cliente
    // esperando em casa uma comida que está no balcão.
    expect(sql).toContain("p_payload -> 'entrega' ->> 'tipo'");
    expect(payload.entrega.tipo).toBe("retirada");
  });

  it("o padrão dos dois lados é entrega — era o único caminho que existia", () => {
    const payload = montarPayloadPedido({
      cliente: { nome: "Ana" },
      entrega: { cep: "90000000", endereco: "Rua X, 10" },
      pagamento: { forma: "pix" },
      itens: [{ produto_id: 7, qtd: 1 }],
    });

    expect(payload.entrega.tipo).toBe("entrega");
    expect(sql).toContain("COALESCE(p_payload -> 'entrega' ->> 'tipo', 'entrega') = 'retirada'");
  });
});
