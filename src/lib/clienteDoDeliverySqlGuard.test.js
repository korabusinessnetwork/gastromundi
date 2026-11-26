import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { MIGRATIONS_DIR, ultimaDefinicaoDe } from "@/test/migracoes";
import { dataNascimentoUtil, montarPayloadPedido } from "./delivery";

/**
 * Guard de 20261006_cliente_do_delivery.sql.
 *
 * O delivery sabia o nome e o telefone de quem pede e jogava fora: cada
 * pedido era uma ilha, e a mesma pessoa na décima compra continuava
 * desconhecida. Agora o primeiro pedido de um telefone cria o cadastro em
 * `clientes`, com a data de nascimento (opcional) junto.
 *
 * Dois riscos, e é o que este arquivo tranca:
 *  · o cadastro nascer ÓRFÃO — a vitrine é anônima, então `tenant_atual_id()`
 *    é NULL e o DEFAULT do tenant_id não serve;
 *  · um pedido novo PASSAR POR CIMA do cadastro que o dono ajustou no PDV.
 */
const MIGRACAO = "20261006_cliente_do_delivery.sql";
const sql = readFileSync(join(MIGRATIONS_DIR, MIGRACAO), "utf8");
const rpc = ultimaDefinicaoDe("criar_pedido_delivery");

describe("a coluna", () => {
  it("entra sem quebrar quem já é cliente", () => {
    // Sem DEFAULT e sem NOT NULL: quem já está cadastrado simplesmente
    // fica com a data em branco até informar.
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS data_nascimento date;/);
  });

  it("o índice de aniversário só cobre quem tem data", () => {
    // Índice parcial: o cadastro que nunca informou não paga por ele.
    expect(sql).toContain("WHERE data_nascimento IS NOT NULL");
  });

  it("casar o cliente pelo telefone tem índice", () => {
    // A RPC faz essa busca a CADA pedido; sem índice é varredura por venda.
    expect(sql).toContain("clientes_tenant_telefone_idx");
  });
});

describe("o cadastro não nasce órfão", () => {
  it("o tenant vai explícito no INSERT", () => {
    // `tenant_atual_id()` é NULL para o anon da vitrine: confiar no DEFAULT
    // faria o INSERT estourar no NOT NULL, derrubando o pedido inteiro.
    expect(rpc).toContain("INSERT INTO public.clientes (tenant_id");
    expect(rpc).toMatch(/INSERT INTO public\.clientes[\s\S]{0,400}VALUES \(\s*\n\s*v_tenant,/);
  });

  it("e a busca do cliente é escopada ao tenant", () => {
    expect(rpc).toMatch(/FROM public\.clientes\s*\n\s*WHERE tenant_id = v_tenant AND telefone = v_telefone/);
  });
});

describe("o que o pedido novo NÃO pode fazer", () => {
  it("sobrescrever a data que já existe", () => {
    // O `AND data_nascimento IS NULL` é o "pergunta uma vez" garantido no
    // servidor, não só na tela.
    expect(rpc).toContain("AND data_nascimento IS NULL");
  });

  it("sobrescrever nome e endereço", () => {
    // O UPDATE toca UMA coluna. O que o dono corrigiu no PDV vale mais do
    // que o digitado às pressas num pedido.
    const upd = rpc.slice(rpc.indexOf("UPDATE public.clientes"));
    const ateWhere = upd.slice(0, upd.indexOf("WHERE"));
    expect(ateWhere).toContain("data_nascimento");
    expect(ateWhere).not.toContain("nome =");
    expect(ateWhere).not.toContain("endereco =");
  });

  it("duplicar o cliente", () => {
    expect(rpc).toContain("IF NOT EXISTS (");
  });
});

describe("a data nunca derruba o pedido", () => {
  it("o servidor engole o que não der para converter", () => {
    // Sem o EXCEPTION, um texto que não é data estoura o cast e o cliente
    // perde a janta por causa de um campo OPCIONAL.
    expect(sql).toContain("EXCEPTION WHEN others THEN");
    expect(sql).toMatch(/v_nascimento := NULL;/);
  });

  it("data no futuro e idade impossível viram vazio, não erro", () => {
    expect(sql).toContain("v_nascimento > CURRENT_DATE");
    expect(sql).toContain("CURRENT_DATE - INTERVAL '120 years'");
  });

  it("o navegador recusa o mesmo que o servidor recusa", () => {
    // Duas peças, uma regra: se divergirem, a tela promete algo que o
    // servidor descarta em silêncio.
    expect(dataNascimentoUtil("1990-05-10")).toBe("1990-05-10");
    expect(dataNascimentoUtil("1800-01-01")).toBeNull();
    expect(dataNascimentoUtil("31/02/2025")).toBeNull();
    const amanha = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
    expect(dataNascimentoUtil(amanha)).toBeNull();
  });

  it("o payload manda null quando não dá para aproveitar", () => {
    const p = montarPayloadPedido({
      cliente: { nome: "Ana", telefone: "11999998888", dataNascimento: "não sei" },
      entrega: { tipo: "retirada" },
      pagamento: { forma: "pix" },
      itens: [{ produto_id: 1, qtd: 1 }],
    });
    expect(p.cliente.data_nascimento).toBeNull();
  });
});

describe("as guardas conquistadas antes sobrevivem à cópia", () => {
  it.each([
    ["launched_at", "a via de produção sai sozinha"],
    ["telefone_br_valido", "o telefone é obrigatório"],
    ["v_retirada", "a retirada no local"],
    ["dispositivo_id", "o histórico sem conta"],
    ["v_grp.max_escolhas > 0", "o grupo sem limite"],
  ])("%s — %s", (guarda) => {
    // Migração é histórico imutável e a ÚLTIMA definição vence: uma cópia
    // que esqueça uma guarda a apaga do banco em silêncio.
    expect(rpc).toContain(guarda);
  });
});
