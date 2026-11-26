import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { MIGRATIONS_DIR, ultimaDefinicaoDe } from "@/test/migracoes";
import { telefoneValido } from "./telefone";

vi.mock("./supabase", async () => {
  const { createMockSupabase } = await import("@/test/mockSupabase");
  return { supabase: createMockSupabase() };
});

const { montarPayloadPedido } = await import("./delivery");

/**
 * Guard de 20260930_delivery_telefone_obrigatorio.sql.
 *
 * O telefone era opcional na vitrine e é o ÚNICO caminho do
 * estabelecimento até o cliente depois que o pedido entra. Regra que só
 * existe na tela não é regra: o payload é do cliente, e quem monta a
 * chamada na mão passaria sem telefone como sempre passou. Por isso a
 * guarda entra na RPC, antes de qualquer INSERT.
 *
 * A prova é feita em duas metades que se completam:
 *
 *   (1) A migração termina num bloco DO que EXECUTA `telefone_br_valido`
 *       contra casos conhecidos e aborta se algum divergir — no banco de
 *       verdade, na hora de aplicar.
 *
 *   (2) Este teste lê AQUELES MESMOS casos do arquivo e confere cada um
 *       contra `telefoneValido`, a régua em JS que a tela usa. Assim o
 *       servidor não pode ficar mais frouxo (nem mais rígido) que o
 *       formulário sem alguém perceber — duas contas para a mesma coisa é
 *       como o front e o banco passam a discordar em silêncio.
 */
const MIGRACAO = "20260930_delivery_telefone_obrigatorio.sql";

const sql = readFileSync(join(MIGRATIONS_DIR, MIGRACAO), "utf8");

/** Os números que o autoteste da migração dá como VÁLIDOS. */
function casosDoAutoteste(bloco) {
  return [...bloco.matchAll(/public\.telefone_br_valido\('([^']*)'\)/g)].map((m) => m[1]);
}

const blocoValidos = sql.slice(
  sql.indexOf("IF NOT (public.telefone_br_valido"),
  sql.indexOf("a régua está recusando número válido"),
);
const blocoInvalidos = sql.slice(
  sql.indexOf("IF public.telefone_br_valido('')"),
  sql.indexOf("a régua está aceitando número quebrado"),
);

describe("a regra continua no ar depois das migrações seguintes", () => {
  it("a última definição da RPC ainda exige o telefone", () => {
    // Migrations são histórico imutável e vale a ÚLTIMA definição. Uma
    // corretiva posterior que copie a RPC sem esta guarda a apaga do banco
    // sem erro nenhum — e o telefone volta a ser opcional em silêncio.
    expect(ultimaDefinicaoDe("criar_pedido_delivery")).toContain("telefone_br_valido");
  });
});

describe("a régua do servidor é a mesma da tela", () => {
  it("todo número que o autoteste dá como válido, o front também aceita", () => {
    const casos = casosDoAutoteste(blocoValidos);

    // Se o SQL afrouxar e passar a aceitar algo que a tela recusa, o
    // cliente é barrado no formulário por um número que o banco aprovaria.
    expect(casos.length).toBeGreaterThanOrEqual(3);
    for (const numero of casos) expect(telefoneValido(numero)).toBe(true);
  });

  it("todo número que o autoteste recusa, o front também recusa", () => {
    const casos = casosDoAutoteste(blocoInvalidos);

    // E o contrário é pior: o SQL apertando mais que a tela faz o pedido
    // ser recusado no último clique, depois de tudo preenchido.
    expect(casos.length).toBeGreaterThanOrEqual(4);
    for (const numero of casos) expect(telefoneValido(numero)).toBe(false);
  });

  it("os casos cobrem o que costuma passar batido", () => {
    const invalidos = casosDoAutoteste(blocoInvalidos);

    expect(invalidos).toContain("");             // vazio
    expect(invalidos).toContain("11812345678");  // celular sem o 9
    expect(invalidos).toContain("0912345678");   // DDD que não existe
  });
});

describe("a guarda está no lugar certo", () => {
  it("a RPC recusa o pedido sem telefone, com recado em português", () => {
    expect(sql).toContain("IF NOT public.telefone_br_valido(v_telefone) THEN");
    expect(sql).toContain(
      "Informe um telefone válido com DDD para o estabelecimento falar com você.",
    );
  });

  it("a guarda vem ANTES do INSERT — pedido recusado não queima número do dia", () => {
    expect(sql.indexOf("telefone_br_valido(v_telefone)")).toBeLessThan(
      sql.indexOf("INSERT INTO public.delivery_pedidos"),
    );
  });

  it("a régua é interna: o anon não a executa solta", () => {
    expect(sql).toContain(
      "REVOKE EXECUTE ON FUNCTION public.telefone_br_valido(text) FROM PUBLIC;",
    );
  });

  it("a coluna NÃO vira NOT NULL — pedido antigo é de quando o campo era opcional", () => {
    // Uma migração que falha por causa do passado não entra no ar, e o
    // histórico ficaria sem a regra nova de qualquer jeito.
    expect(sql).not.toMatch(/ALTER TABLE public\.delivery_pedidos[\s\S]{0,120}SET NOT NULL/);
  });
});

describe("o front manda o telefone do jeito que o servidor grava", () => {
  it("só os dígitos, sem a máscara que a tela mostra", () => {
    const payload = montarPayloadPedido({
      cliente: { nome: "Ana", telefone: "(11) 91234-5678" },
      entrega: { endereco: "Rua X, 10" },
      pagamento: { forma: "pix" },
      itens: [{ produto_id: 7, qtd: 1 }],
    });

    // Guardar "(11) 91234-5678" faria a mesma pessoa virar dois contatos
    // diferentes conforme quem digitou a máscara — e o link de WhatsApp
    // do painel precisa do número limpo.
    expect(payload.cliente.telefone).toBe("11912345678");
    expect(sql).toContain("v_telefone := regexp_replace(");
  });

  it("campo em branco vira null, não string vazia", () => {
    const payload = montarPayloadPedido({
      cliente: { nome: "Ana", telefone: "   " },
      entrega: { endereco: "Rua X, 10" },
      pagamento: { forma: "pix" },
      itens: [{ produto_id: 7, qtd: 1 }],
    });

    expect(payload.cliente.telefone).toBeNull();
  });
});
