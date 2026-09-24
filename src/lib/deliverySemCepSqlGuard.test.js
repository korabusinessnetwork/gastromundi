import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { MIGRATIONS_DIR, ultimaDefinicaoDe } from "@/test/migracoes";
import { montarPayloadPedido } from "./delivery";

/**
 * Guard de 20260929_delivery_sem_cep_e_meus_pedidos.sql.
 *
 * Duas coisas que só existem de verdade no banco:
 *
 *   1. CEP OPCIONAL. A faixa por bairro nunca precisou de CEP —
 *      `calcular_taxa_entrega` já casava pelo nome do bairro. Quem não
 *      sabe o próprio CEP não conseguia pedir mesmo com o bairro
 *      atendido, porque a TELA exigia os 8 dígitos e o pedido gravava o
 *      CEP como veio. A cidade entra como campo do pedido: sem ela,
 *      "Centro" na comanda não diz de qual cidade é.
 *
 *   2. HISTÓRICO SEM CONTA. O navegador guarda um UUID e o pedido nasce
 *      carimbado com ele; `meus_pedidos_delivery` devolve os pedidos
 *      daquele aparelho. É um PORTADOR DE SEGREDO — quem tem o UUID vê
 *      aqueles pedidos —, então o que a RPC devolve importa tanto quanto
 *      o que ela filtra.
 *
 * Não existe Postgres neste ambiente. A migração termina num bloco DO que
 * confere as pontas contra o banco de verdade e aborta se faltar alguma;
 * aqui se confere que essas guardas estão escritas, e que o front fala a
 * mesma língua que o servidor lê.
 */
const MIGRACAO = "20260929_delivery_sem_cep_e_meus_pedidos.sql";

const sql = readFileSync(join(MIGRATIONS_DIR, MIGRACAO), "utf8");

describe("a regra continua no ar depois das migrações seguintes", () => {
  it("a última definição da RPC ainda grava cidade e aparelho", () => {
    // Migrations são histórico imutável e vale a ÚLTIMA definição. Uma
    // corretiva posterior que copie a RPC sem estes campos os apaga do
    // banco sem erro nenhum — o histórico voltaria a nascer vazio e a
    // cidade sumiria do pedido, os dois em silêncio.
    const rpc = ultimaDefinicaoDe("criar_pedido_delivery");

    expect(rpc).toContain("p_payload -> 'entrega' ->> 'cidade'");
    expect(rpc).toContain("v_dispositivo");
  });
});

describe("pedir sem saber o CEP", () => {
  it("cidade e dispositivo entram de forma idempotente", () => {
    expect(sql).toMatch(
      /ALTER TABLE public\.delivery_pedidos\s+ADD COLUMN IF NOT EXISTS cidade text/
    );
    expect(sql).toMatch(
      /ALTER TABLE public\.delivery_pedidos\s+ADD COLUMN IF NOT EXISTS dispositivo_id uuid/
    );
  });

  it("CEP em branco é gravado como NULL, não como string vazia", () => {
    // String vazia no lugar de NULL faz o painel imprimir "CEP: " numa
    // etiqueta de entrega e as consultas por CEP acharem que ele existe.
    expect(sql).toContain(
      "NULLIF(btrim(COALESCE(p_payload -> 'entrega' ->> 'cep', '')), '')"
    );
  });

  it("o front manda cidade e CEP possivelmente vazio — e o servidor lê os dois", () => {
    const payload = montarPayloadPedido({
      cliente: { nome: "Ana" },
      entrega: { cidade: "Porto Alegre/RS", bairro: "Centro", endereco: "Rua X, 10" },
      pagamento: { forma: "pix" },
      itens: [{ produto_id: 7, qtd: 1 }],
    });

    expect(payload.entrega.cep).toBe("");
    expect(payload.entrega.cidade).toBe("Porto Alegre/RS");
    expect(sql).toContain("p_payload -> 'entrega' ->> 'cidade'");
  });
});

describe("histórico sem conta — o que a RPC devolve e o que ela guarda", () => {
  it("a RPC existe e o anon pode executá-la (a vitrine não tem login)", () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.meus_pedidos_delivery/);
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.meus_pedidos_delivery\(text, uuid\) TO anon, authenticated;/
    );
  });

  it("filtra por tenant E por aparelho — nunca só por um dos dois", () => {
    // Só por tenant, qualquer pessoa leria os pedidos de todo mundo da loja.
    expect(sql).toMatch(/WHERE d\.tenant_id = v_tenant\s*\n\s*AND d\.dispositivo_id = p_dispositivo/);
  });

  it("não devolve telefone nem complemento — o UUID mora num navegador", () => {
    // A partir do CREATE (e não da primeira menção ao nome, que está no
    // cabeçalho): antes dele vem criar_pedido_delivery, que legitimamente
    // grava o telefone no pedido.
    const inicio = sql.indexOf("CREATE OR REPLACE FUNCTION public.meus_pedidos_delivery");
    const ateOFim = sql.slice(inicio, sql.indexOf("COMMENT ON FUNCTION", inicio));
    expect(ateOFim).not.toContain("cliente_telefone");
    expect(ateOFim).not.toContain("complemento_endereco");
  });

  it("tem teto de 20 pedidos e índice para não varrer a tabela", () => {
    expect(sql).toContain("LIMIT 20");
    expect(sql).toMatch(
      /CREATE INDEX IF NOT EXISTS delivery_pedidos_dispositivo_idx[\s\S]*?\(tenant_id, dispositivo_id, created_at DESC\)/
    );
  });

  it("sem identidade devolve lista vazia — quem chega agora não é erro", () => {
    expect(sql).toMatch(
      /IF v_tenant IS NULL OR p_dispositivo IS NULL THEN\s*\n\s*RETURN '\[\]'::jsonb;/
    );
  });

  it("dispositivo inválido não derruba o pedido inteiro", () => {
    // O id é uma comodidade. Um valor estragado no navegador de alguém não
    // pode custar a venda — por isso o cast fica dentro de um EXCEPTION.
    expect(sql).toContain("EXCEPTION WHEN invalid_text_representation THEN");
    expect(sql).toMatch(/v_dispositivo := NULL;/);
  });

  it("o payload só carrega o id quando ele é um UUID de verdade", () => {
    const bom = montarPayloadPedido({
      cliente: { nome: "Ana" },
      entrega: { endereco: "Rua X, 10" },
      pagamento: { forma: "pix" },
      itens: [{ produto_id: 7, qtd: 1 }],
      dispositivo: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
    });
    expect(bom.dispositivo_id).toBe("3f2504e0-4f89-41d3-9a0c-0305e82c3301");

    const ruim = montarPayloadPedido({
      cliente: { nome: "Ana" },
      entrega: { endereco: "Rua X, 10" },
      pagamento: { forma: "pix" },
      itens: [{ produto_id: 7, qtd: 1 }],
      dispositivo: "não-é-uuid",
    });
    expect(ruim).not.toHaveProperty("dispositivo_id");

    // E o nome do campo é o mesmo dos dois lados: se divergir, o pedido
    // grava sem aparelho e o histórico nasce vazio para sempre, sem erro.
    expect(sql).toContain("p_payload ->> 'dispositivo_id'");
  });
});
