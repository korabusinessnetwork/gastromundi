import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { MIGRATIONS_DIR } from "@/test/migracoes";
import { produtoPublicavelNoDelivery, sanitizarConfig } from "./deliveryAdmin";

/**
 * Guard de 20261007_delivery_sincroniza_produto_novo.sql.
 *
 * Só existia o caminho manual: cadastra no PDV, vai na aba Delivery,
 * importa. Esquecer o segundo passo é o normal, não a exceção — e o
 * produto fica invisível para quem pede pela internet sem ninguém
 * perceber. A opção nova publica sozinho.
 *
 * Os dois riscos que este arquivo tranca são de sinal oposto:
 *  · ligar por conta própria e passar a publicar na internet tudo o que
 *    for cadastrado, sem ninguém pedir;
 *  · publicar o que NUNCA pode ir para a vitrine — insumo, produto sem
 *    preço, produto que nasceu desativado.
 */
const MIGRACAO = "20261007_delivery_sincroniza_produto_novo.sql";
const sql = readFileSync(join(MIGRATIONS_DIR, MIGRACAO), "utf8");

describe("nasce desligado", () => {
  it("a coluna entra com DEFAULT false", () => {
    expect(sql).toMatch(
      /ADD COLUMN IF NOT EXISTS sincronizar_automatico boolean NOT NULL DEFAULT false/,
    );
  });

  it("o JS concorda: sem config, não sincroniza", () => {
    expect(sanitizarConfig(undefined).sincronizar_automatico).toBe(false);
    expect(sanitizarConfig({}).sincronizar_automatico).toBe(false);
    expect(sanitizarConfig({ sincronizar_automatico: true }).sincronizar_automatico).toBe(true);
  });

  it("desligado, o gatilho sai sem escrever nada", () => {
    expect(sql).toContain("IF NOT COALESCE(v_liga, false) THEN");
  });
});

describe("o que nunca vai para a vitrine, nem com a opção ligada", () => {
  it("insumo e item de produção", () => {
    // Publicar farinha de trigo na vitrine, a R$ 0,00 e com botão de
    // comprar, foi achado crítico de auditoria (20260918).
    expect(sql).toContain("public.categoria_interna(NEW.category)");
  });

  it("produto sem preço", () => {
    expect(sql).toContain("COALESCE(NEW.price, 0) <= 0");
  });

  it("produto que nasce desativado", () => {
    expect(sql).toContain("IF NEW.active IS DISTINCT FROM true THEN");
  });

  it("é o MESMO critério que a tela usa para oferecer a importação", () => {
    // Duas peças, uma regra. Divergindo, a tela ofereceria o que o gatilho
    // recusa (ou pior, o contrário).
    expect(produtoPublicavelNoDelivery({ category: "Lanches", price: 10 })).toBe(true);
    expect(produtoPublicavelNoDelivery({ category: "Insumo", price: 10 })).toBe(false);
    expect(produtoPublicavelNoDelivery({ category: "Produção", price: 10 })).toBe(false);
    expect(produtoPublicavelNoDelivery({ category: "Lanches", price: 0 })).toBe(false);
  });
});

describe("como o gatilho escreve", () => {
  it("dispara no INSERT de produto", () => {
    expect(sql).toContain("CREATE TRIGGER products_publica_no_delivery");
    expect(sql).toMatch(/AFTER INSERT ON public\.products/);
    expect(sql).toContain("DROP TRIGGER IF EXISTS products_publica_no_delivery ON public.products;");
  });

  it("não atropela quem já grava a linha na mesma ação", () => {
    // O "Novo produto" da aba Delivery cria o produto E a linha de
    // delivery. Sem o ON CONFLICT, um dos dois estouraria no UNIQUE.
    expect(sql).toContain("ON CONFLICT (tenant_id, produto_id) DO NOTHING");
  });

  it("entra no fim da lista, não no topo", () => {
    // Publicar no topo empurraria o cardápio que o dono ordenou à mão.
    expect(sql).toContain("SELECT COALESCE(max(ordem), -1) + 1 INTO v_ordem");
  });

  it("não atravessa estabelecimento", () => {
    expect(sql).toContain("WHERE cd.tenant_id = NEW.tenant_id");
    expect(sql).toMatch(/VALUES \(NEW\.tenant_id, NEW\.id/);
  });

  it("a função não fica executável por qualquer um", () => {
    expect(sql).toContain(
      "REVOKE EXECUTE ON FUNCTION public.publicar_produto_novo_no_delivery() FROM PUBLIC;",
    );
  });
});

describe("a migração se confere sozinha", () => {
  it("prova os cinco casos, inclusive o desligado", () => {
    // O caso que protege o padrão é o DESLIGADO: sem ele, uma sincronização
    // ligada por engano passaria despercebida.
    expect(sql).toContain("publicou com a opção desligada");
    expect(sql).toContain("com a opção ligada o produto novo não entrou");
    expect(sql).toContain("publicou um insumo na vitrine");
    expect(sql).toContain("publicou produto sem preço");
    expect(sql).toContain("publicou produto que nasceu desativado");
  });

  it("a conferência não deixa dado para trás", () => {
    expect(sql).toContain("DELETE FROM public.tenants          WHERE id = v_tenant;");
  });
});
