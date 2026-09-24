// Guarda: o aceite automático é do SERVIDOR, e nasce desligado.
//
// A tentação aqui seria implementar o aceite na tela — carregar o pedido,
// ver que a chave está ligada, e mandar um UPDATE para 'em_preparo'. Isso
// quebra de três jeitos que o banco não quebra:
//
//   • só funciona com o painel aberto — e a chave existe justamente para
//     quem NÃO está olhando a tela;
//   • abre uma janela em que o pedido está 'recebido' sem ninguém ter
//     aceitado, e o cliente vê "aguardando" num pedido já aceito;
//   • dois painéis abertos disparam dois UPDATEs no mesmo pedido.
//
// Por isso o pedido NASCE aceito, dentro da mesma transação que o cria.
// Este arquivo prende essa decisão ao texto da migração.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MIGRATIONS_DIR } from "@/test/migracoes";

const MIGRACAO = "20261012_delivery_aceite_automatico.sql";
const sql = readFileSync(join(MIGRATIONS_DIR, MIGRACAO), "utf8");

/** Sem os comentários de linha, para não casar com a prosa que os explica. */
const corpo = sql.replace(/--.*$/gm, "");

describe("aceite automático — a coluna", () => {
  it("existe e nasce DESLIGADA", () => {
    // Ligar sozinho tiraria de quem confere pedido a pedido a única chance
    // de recusar — e ninguém pediu isso.
    expect(corpo).toMatch(
      /ADD COLUMN IF NOT EXISTS aceite_automatico boolean NOT NULL DEFAULT false/
    );
  });

  it("entra com IF NOT EXISTS — a migração pode rodar de novo", () => {
    expect(corpo).toMatch(/ALTER TABLE public\.config_delivery\s+ADD COLUMN IF NOT EXISTS/);
  });
});

describe("aceite automático — quem aplica é o servidor", () => {
  it("o pedido NASCE com o status que a chave decide", () => {
    // Um CASE no INSERT, não um UPDATE depois: uma transação só.
    expect(corpo).toMatch(
      /CASE WHEN COALESCE\(v_cfg\.aceite_automatico, false\)\s+THEN 'em_preparo' ELSE 'recebido' END/
    );
  });

  it("não há UPDATE de status dentro da criação do pedido", () => {
    // Se algum dia aparecer um "UPDATE ... SET status" aqui, voltamos ao
    // mundo das duas etapas e da janela entre elas.
    const rpc = /CREATE OR REPLACE FUNCTION public\.criar_pedido_delivery[\s\S]*?\n\$\$;/
      .exec(corpo)?.[0];
    expect(rpc).toBeTruthy();
    expect(rpc).not.toMatch(/UPDATE\s+public\.delivery_pedidos\s+SET\s+status/i);
  });

  it("a função continua SECURITY DEFINER com search_path fixo", () => {
    // A vitrine é anônima: sem isto, ou o pedido não entra, ou entra por um
    // caminho que o anon não deveria ter.
    const rpc = /CREATE OR REPLACE FUNCTION public\.criar_pedido_delivery[\s\S]*?\n\$\$;/
      .exec(corpo)?.[0];
    expect(rpc).toMatch(/SECURITY DEFINER/);
    expect(rpc).toMatch(/SET search_path = public/);
  });
});

describe("aceite automático — o que ele NÃO pode pular", () => {
  const rpc = /CREATE OR REPLACE FUNCTION public\.criar_pedido_delivery[\s\S]*?\n\$\$;/
    .exec(corpo)?.[0];

  it("a loja fechada continua recusando", () => {
    // Aceitar sozinho é pular o CLIQUE de quem ia aceitar mesmo, não pular
    // a regra. Pedido fora do horário não vira pedido aceito.
    expect(rpc).toMatch(/delivery_aberto_agora/);
    expect(rpc).toMatch(/fechado/i);
  });

  it("o pedido mínimo continua valendo", () => {
    expect(rpc).toMatch(/pedido_minimo/);
  });

  it("o endereço fora de área continua recusando", () => {
    expect(rpc).toMatch(/fora da área de entrega/i);
  });

  it("o telefone continua obrigatório", () => {
    expect(rpc).toMatch(/telefone_br_valido/);
  });
});

describe("aceite automático — a migração se confere sozinha", () => {
  it("tem bloco DO que EXECUTA o que criou", () => {
    expect(sql).toMatch(/DO \$conf\$/);
    expect(sql).toMatch(/criar_pedido_delivery\('conf-20261012'/);
  });

  it("confere os dois sentidos da chave, não só o ligado", () => {
    // Um teste que só prova o caso novo deixaria passar o dia em que a
    // chave desligada também começasse a aceitar sozinha.
    expect(sql).toMatch(/esperava recebido/);
    expect(sql).toMatch(/esperava em_preparo/);
  });

  it("confere que a chave nasce desligada e que a loja fechada recusa", () => {
    expect(sql).toMatch(/tinha de nascer desligada/);
    expect(sql).toMatch(/loja fechada tinha de recusar/);
  });

  it("limpa o que criou, inclusive a cópia arquivada da comanda", () => {
    // Apagar de `pending` deixa cópia em comandas_arquivadas (20261009), e
    // sem tirá-la o DELETE do tenant bate na chave estrangeira.
    expect(sql).toMatch(/DELETE FROM public\.comandas_arquivadas WHERE tenant_id = v_tenant/);
    expect(sql).toMatch(/DELETE FROM public\.tenants WHERE id = v_tenant/);
  });
});
