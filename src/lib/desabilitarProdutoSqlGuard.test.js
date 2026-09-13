import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { MIGRATIONS_DIR } from "@/test/migracoes";
import { sanitizarConfig } from "./deliveryAdmin";

/**
 * Guard de 20261005_desabilitar_produto_espelho.sql.
 *
 * São duas chaves diferentes, em duas tabelas diferentes: `products.active`
 * (vende no PDV) e `produto_delivery.disponivel` (está no cardápio online).
 * Por padrão têm de continuar independentes — "acabou para entrega mas tem
 * no balcão" é situação de todo dia. Só que o dono pode querer que uma puxe
 * a outra, e para isso existe `config_delivery.espelhar_desabilitado`.
 *
 * O risco que este arquivo cobre é o de sempre neste projeto: a regra
 * existir na tela e não no servidor. `products.active` é escrito de mais de
 * um lugar (aba Produtos do desktop, módulo Cardápio do Palm), então o
 * espelho tem de morar num gatilho — senão o Palm pausa o produto e o
 * cardápio online continua vendendo.
 */
const MIGRACAO = "20261005_desabilitar_produto_espelho.sql";
const sql = readFileSync(join(MIGRATIONS_DIR, MIGRACAO), "utf8");

describe("a opção nasce desligada", () => {
  it("a coluna entra com DEFAULT false", () => {
    // Ligar por padrão tiraria produto do ar em quem já usa as duas chaves
    // de propósito, sem ninguém ter pedido.
    expect(sql).toMatch(
      /ADD COLUMN IF NOT EXISTS espelhar_desabilitado boolean NOT NULL DEFAULT false/,
    );
  });

  it("o JS concorda com o banco: sem config, o espelho é falso", () => {
    expect(sanitizarConfig(undefined).espelhar_desabilitado).toBe(false);
    expect(sanitizarConfig({}).espelhar_desabilitado).toBe(false);
  });

  it("e liga quando o dono liga", () => {
    expect(sanitizarConfig({ espelhar_desabilitado: true }).espelhar_desabilitado).toBe(true);
  });
});

describe("o espelho vale para toda escrita, não só para a tela que o originou", () => {
  it("é um gatilho no banco", () => {
    expect(sql).toContain("CREATE TRIGGER products_espelha_delivery");
    expect(sql).toMatch(/AFTER UPDATE OF active ON public\.products/);
  });

  it("recriar é no-op: DROP IF EXISTS antes do CREATE", () => {
    expect(sql).toContain("DROP TRIGGER IF EXISTS products_espelha_delivery ON public.products;");
  });

  it("só reage à virada de `active`", () => {
    // Sem esta saída antecipada, corrigir um preço religaria um item que o
    // dono tirou do cardápio online à mão.
    expect(sql).toContain("IF NEW.active IS NOT DISTINCT FROM OLD.active THEN");
  });

  it("a opção é lida do tenant do PRODUTO, não de quem executa", () => {
    // Importação em lote rodando por outro caminho continua respeitando a
    // escolha do dono daquele estabelecimento.
    expect(sql).toContain("WHERE cd.tenant_id = NEW.tenant_id");
  });

  it("nada acontece com a opção desligada", () => {
    expect(sql).toContain("IF NOT COALESCE(v_espelhar, false) THEN");
  });
});

describe("o que o espelho não faz", () => {
  it("não atravessa estabelecimento", () => {
    // SECURITY DEFINER sem este filtro escreveria na linha de outro tenant.
    expect(sql).toMatch(/UPDATE public\.produto_delivery[\s\S]*?AND tenant_id\s+= NEW\.tenant_id/);
  });

  it("não publica no delivery um produto que nunca esteve lá", () => {
    // É UPDATE, nunca INSERT: reabilitar no PDV devolve ao cardápio online
    // só o que o dono já tinha publicado.
    const corpo = sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION public.espelhar_produto_no_delivery"));
    const funcao = corpo.slice(0, corpo.indexOf("$$;"));
    expect(funcao).toContain("UPDATE public.produto_delivery");
    expect(funcao).not.toContain("INSERT INTO public.produto_delivery");
  });

  it("o caminho inverso não existe: o gatilho é só em products", () => {
    // Parar de ENTREGAR uma cerveja não pode parar de VENDÊ-LA no balcão.
    expect(sql).not.toMatch(/CREATE TRIGGER \w+[\s\S]{0,80}ON public\.produto_delivery/);
  });

  it("a função não fica executável por qualquer um", () => {
    expect(sql).toContain(
      "REVOKE EXECUTE ON FUNCTION public.espelhar_produto_no_delivery() FROM PUBLIC;",
    );
  });
});

describe("a migração se confere sozinha", () => {
  it("prova os dois estados da opção, não só o ligado", () => {
    // O caso que protege o padrão é o DESLIGADO: sem ele, um espelho ligado
    // por engano passaria despercebido.
    expect(sql).toContain("com a opção desligada o delivery foi alterado mesmo assim");
    expect(sql).toContain("com a opção ligada o produto continuou no cardápio online");
    expect(sql).toContain("reabilitar no PDV não devolveu o produto ao cardápio online");
    expect(sql).toContain("mexer no preço religou o produto no cardápio online");
  });

  it("a conferência não deixa dado para trás", () => {
    expect(sql).toContain("DELETE FROM public.tenants         WHERE id = v_tenant;");
  });
});
