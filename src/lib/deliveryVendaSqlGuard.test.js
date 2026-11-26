import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { MIGRATIONS_DIR } from "@/test/migracoes";

/**
 * Guard de 20261002_venda_do_delivery.sql.
 *
 * Antes, quem registrava a venda do delivery era o PDV: o espelho em
 * `pending` aparecia na lista de comandas e o caixa o fechava como se
 * fosse uma mesa (está escrito na 20260904: "'entregue' mantém a comanda
 * de propósito: é ela que o PDV fecha para registrar a venda").
 *
 * Isso poluía a tela de quem atende no salão — ninguém vai servir aquela
 * comanda — e fazia a venda de delivery nascer indistinguível de uma
 * venda de balcão, sem como separar quanto o delivery vendeu.
 *
 * Aqui é DINHEIRO, então o que se prova é o que protege o dinheiro:
 * atomicidade, idempotência e a impossibilidade de um pedido cancelado
 * virar receita.
 */
const MIGRACAO = "20261002_venda_do_delivery.sql";
const sql = readFileSync(join(MIGRATIONS_DIR, MIGRACAO), "utf8");

describe("a venda do delivery tem registro próprio", () => {
  it("a venda sabe de onde veio, e o padrão é o PDV", () => {
    // Toda venda que já existe é do balcão: era o único caminho que havia.
    // Sem o DEFAULT, a migração falharia no NOT NULL do histórico.
    expect(sql).toMatch(
      /ADD COLUMN IF NOT EXISTS origem text NOT NULL DEFAULT 'pdv'/,
    );
    expect(sql).toContain("CHECK (origem IN ('pdv', 'delivery'))");
  });

  it("a venda aponta para o pedido que a originou", () => {
    expect(sql).toMatch(
      /ADD COLUMN IF NOT EXISTS delivery_pedido_id uuid\s+REFERENCES public\.delivery_pedidos\(id\)/,
    );
  });
});

describe("o que protege o dinheiro", () => {
  it("um pedido rende UMA venda: o UNIQUE é a trava", () => {
    // Sem ele, dois cliques em "Confirmar entrega" (ou o eco do realtime)
    // gravariam a mesma venda duas vezes e o faturamento do dia mentiria.
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS vendas_delivery_pedido_id_key\s+ON public\.vendas \(delivery_pedido_id\)/,
    );
  });

  it("a RPC devolve a venda existente em vez de criar outra", () => {
    expect(sql).toContain("'ja_existia', true");
  });

  it("dois operadores ao mesmo tempo esperam um pelo outro", () => {
    // O UNIQUE barraria a segunda gravação com erro; o FOR UPDATE faz a
    // segunda chamada simplesmente devolver a venda da primeira.
    expect(sql).toContain("FOR UPDATE");
  });

  it("pedido cancelado não vira receita", () => {
    expect(sql).toContain("Pedido cancelado não vira venda.");
  });

  it("venda, itens e pagamento entram na MESMA transação", () => {
    // É por isso que é uma RPC e não três gravações do navegador: a aba
    // fechando no meio deixaria uma venda sem itens no relatório.
    const corpo = sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION public.registrar_venda_delivery"));
    expect(corpo).toContain("INSERT INTO public.vendas");
    expect(corpo).toContain("INSERT INTO public.venda_itens");
    expect(corpo).toContain("INSERT INTO public.venda_pagamentos");
  });

  it("o pagamento entra com a forma que o cliente escolheu", () => {
    // Sem esta linha o fechamento de caixa não sabe em qual meio o
    // dinheiro entrou, e a conferência da gaveta nunca bate.
    expect(sql).toContain("v_pedido.forma_pagamento");
  });

  it("a taxa de entrega não some dentro do subtotal", () => {
    // Somá-la ao subtotal esconderia quanto foi comida e quanto foi frete.
    expect(sql).toContain("COALESCE(v_pedido.taxa_entrega, 0)");
  });
});

describe("quem pode fechar venda", () => {
  it("o anon da vitrine não fecha venda nenhuma", () => {
    expect(sql).toContain(
      "REVOKE EXECUTE ON FUNCTION public.registrar_venda_delivery(uuid) FROM PUBLIC;",
    );
    expect(sql).toContain(
      "GRANT EXECUTE ON FUNCTION public.registrar_venda_delivery(uuid) TO authenticated;",
    );
  });

  it("a função confere o tenant de quem chama", () => {
    // SECURITY DEFINER sem esta conferência fecharia venda de outro
    // estabelecimento com um id adivinhado.
    expect(sql).toContain("v_tenant  uuid := public.tenant_atual_id()");
    expect(sql).toContain("WHERE id = p_pedido_id AND tenant_id = v_tenant");
  });
});

describe("o espelho deixa de ser peça financeira", () => {
  it("fechar a venda apaga a comanda espelho", () => {
    // Deixá-la aberta faria o pedido entregue ser contado como comanda em
    // aberto para sempre, num painel onde ele nem aparece mais.
    expect(sql).toContain("DELETE FROM public.pending");
  });
});
