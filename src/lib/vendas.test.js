import { describe, it, expect, vi } from "vitest";
import { mapearVendaParaLinhas, montarVendaLegada, persistirVendaNormalizada } from "./vendas";

describe("mapearVendaParaLinhas", () => {
  it("mapeia uma venda completa (itens + split de pagamento)", () => {
    const sale = {
      id: "v1",
      comanda: "12",
      subtotal: 50,
      taxaServico: true,
      valorTaxa: 5,
      valorAjuste: -2,
      total: 53,
      cashier: "Maria",
      at: "2026-07-04T12:00:00.000Z",
      items: [
        { id: 1, name: "Hambúrguer", price: 30, qty: 1 },
        { id: 2, name: "Refrigerante", price: 20, qty: 1 },
      ],
      pagamentos: [
        { metodo: "dinheiro", valor: 30, recebido: 30, troco: 0 },
        { metodo: "pix", valor: 23, recebido: 23, troco: 0 },
      ],
    };

    const { venda, itens, pagamentos } = mapearVendaParaLinhas(sale);

    expect(venda).toEqual({
      id: "v1",
      comanda: "12",
      mesa: null,
      subtotal: 50,
      taxa_servico: true,
      valor_taxa: 5,
      valor_ajuste: -2,
      total: 53,
      cashier: "Maria",
      cliente_id: null,
      at: "2026-07-04T12:00:00.000Z",
    });

    expect(itens).toEqual([
      { venda_id: "v1", product_id: 1, nome: "Hambúrguer", preco: 30, qtd: 1, cancelado: false, motivo_cancelamento: null, cancelado_por: null },
      { venda_id: "v1", product_id: 2, nome: "Refrigerante", preco: 20, qtd: 1, cancelado: false, motivo_cancelamento: null, cancelado_por: null },
    ]);

    expect(pagamentos).toEqual([
      { venda_id: "v1", metodo: "dinheiro", valor: 30 },
      { venda_id: "v1", metodo: "pix", valor: 23 },
    ]);
  });

  it("venda sem pagamentos (array vazio) não gera linhas de pagamento", () => {
    const sale = { id: "v2", total: 10, items: [{ id: 1, name: "Água", price: 5, qty: 2 }], pagamentos: [] };
    const { pagamentos } = mapearVendaParaLinhas(sale);

    expect(pagamentos).toEqual([]);
  });

  it("item sem qty assume 1", () => {
    const sale = { id: "v3", total: 15, items: [{ id: 3, name: "Suco", price: 15 }], pagamentos: [{ metodo: "pix", valor: 15 }] };
    const { itens } = mapearVendaParaLinhas(sale);

    expect(itens[0].qtd).toBe(1);
  });

  it("item cancelado com motivo e responsável é preservado (não é ignorado)", () => {
    const sale = {
      id: "v4",
      total: 0,
      items: [{ id: 4, name: "Pizza", price: 40, qty: 1, cancelado: true, motivoCancelamento: "Pedido errado", canceladoPor: "joao" }],
      pagamentos: [],
    };
    const { itens } = mapearVendaParaLinhas(sale);

    expect(itens).toEqual([
      { venda_id: "v4", product_id: 4, nome: "Pizza", preco: 40, qtd: 1, cancelado: true, motivo_cancelamento: "Pedido errado", cancelado_por: "joao" },
    ]);
  });

  it("preserva valores decimais em preço, quantidade e pagamento", () => {
    const sale = {
      id: "v5",
      total: 26.25,
      items: [{ id: 5, name: "Carne (kg)", price: 45.9, qty: 0.5 }],
      pagamentos: [{ metodo: "credito", valor: 22.95 }],
    };
    const { itens, pagamentos } = mapearVendaParaLinhas(sale);

    expect(itens[0].preco).toBeCloseTo(45.9, 5);
    expect(itens[0].qtd).toBeCloseTo(0.5, 5);
    expect(pagamentos[0].valor).toBeCloseTo(22.95, 5);
  });
});

describe("montarVendaLegada (ida e volta com mapearVendaParaLinhas)", () => {
  // Nota: `ajuste` (descritor bruto do checkout) e `recebido`/`troco`
  // por pagamento não sobrevivem ao schema novo — nenhum consumidor
  // de `sales` os lê depois de finalizada a venda, então os objetos
  // originais aqui só incluem os campos que de fato persistem.

  it("venda completa (itens + split de pagamento) volta equivalente ao original", () => {
    const original = {
      id: "vr1",
      comanda: "12",
      mesa: null,
      subtotal: 50,
      taxaServico: true,
      valorTaxa: 5,
      valorAjuste: -2,
      total: 53,
      cashier: "Maria",
      clienteId: null,
      at: "2026-07-04T12:00:00.000Z",
      items: [
        { id: 1, name: "Hambúrguer", price: 30, qty: 1, cancelado: false, motivoCancelamento: null, canceladoPor: null },
        { id: 2, name: "Refrigerante", price: 20, qty: 1, cancelado: false, motivoCancelamento: null, canceladoPor: null },
      ],
      pagamentos: [
        { metodo: "dinheiro", valor: 30 },
        { metodo: "pix", valor: 23 },
      ],
    };

    const reconstruida = montarVendaLegada(mapearVendaParaLinhas(original));

    expect(reconstruida).toEqual(original);
  });

  it("venda sem pagamentos volta com pagamentos: [] (equivalente ao original)", () => {
    const original = {
      id: "vr2",
      comanda: null,
      mesa: null,
      subtotal: 10,
      taxaServico: false,
      valorTaxa: 0,
      valorAjuste: 0,
      total: 10,
      cashier: null,
      clienteId: null,
      at: "2026-07-04T12:00:00.000Z",
      items: [
        { id: 1, name: "Água", price: 5, qty: 2, cancelado: false, motivoCancelamento: null, canceladoPor: null },
      ],
      pagamentos: [],
    };

    const reconstruida = montarVendaLegada(mapearVendaParaLinhas(original));

    expect(reconstruida).toEqual(original);
  });

  it("item cancelado com motivo e responsável volta equivalente ao original", () => {
    const original = {
      id: "vr3",
      comanda: "8",
      mesa: null,
      subtotal: 0,
      taxaServico: false,
      valorTaxa: 0,
      valorAjuste: 0,
      total: 0,
      cashier: "joao",
      clienteId: null,
      at: "2026-07-04T12:00:00.000Z",
      items: [
        { id: 4, name: "Pizza", price: 40, qty: 1, cancelado: true, motivoCancelamento: "Pedido errado", canceladoPor: "joao" },
      ],
      pagamentos: [],
    };

    const reconstruida = montarVendaLegada(mapearVendaParaLinhas(original));

    expect(reconstruida).toEqual(original);
  });

  it("preserva o vínculo com o cliente (F010) na ida e volta", () => {
    const original = {
      id: "vr4",
      comanda: "9",
      mesa: null,
      subtotal: 30,
      taxaServico: false,
      valorTaxa: 0,
      valorAjuste: 0,
      total: 30,
      cashier: "joao",
      clienteId: "cli-123",
      at: "2026-07-04T12:00:00.000Z",
      items: [
        { id: 1, name: "Suco", price: 30, qty: 1, cancelado: false, motivoCancelamento: null, canceladoPor: null },
      ],
      pagamentos: [{ metodo: "fiado", valor: 30 }],
    };

    const reconstruida = montarVendaLegada(mapearVendaParaLinhas(original));

    expect(reconstruida).toEqual(original);
  });
});

describe("persistirVendaNormalizada (dual-write — detecção de falha)", () => {
  // Fake client: registra cada insert e devolve o `{ error }` configurado
  // por tabela (ou null). Espelha o supabase-js: NÃO lança em erro de
  // RLS/constraint — resolve com { error }. Um valor-função permite
  // simular o client lançando de fato (rede caindo).
  const fakeClient = (byTable = {}) => {
    const calls = [];
    return {
      calls,
      from(table) {
        return {
          insert(rows) {
            calls.push({ table, rows });
            const resp = byTable[table];
            if (typeof resp === "function") return resp(rows);
            return Promise.resolve(resp ?? { error: null });
          },
        };
      },
    };
  };

  const saleBase = {
    id: "vp1",
    comanda: "5",
    total: 30,
    items: [{ id: 1, name: "Café", price: 15, qty: 2 }],
    pagamentos: [{ metodo: "pix", valor: 30 }],
  };

  it("sucesso: grava as 3 tabelas, ok=true e não aciona onFalha", async () => {
    const client = fakeClient();
    const onFalha = vi.fn();

    const res = await persistirVendaNormalizada(client, saleBase, { onFalha });

    expect(res).toEqual({ ok: true, falhas: [] });
    expect(onFalha).not.toHaveBeenCalled();
    expect(client.calls.map((c) => c.table)).toEqual(["vendas", "venda_itens", "venda_pagamentos"]);
  });

  it("erro de RLS no header: registra a falha, NÃO insere as filhas e NÃO lança", async () => {
    const erro = { code: "42501", message: "RLS: new row violates policy" };
    const client = fakeClient({ vendas: { error: erro } });
    const onFalha = vi.fn();

    const res = await persistirVendaNormalizada(client, saleBase, { onFalha });

    // (a) o erro é detectado/registrado — fim do furo silencioso
    expect(res.ok).toBe(false);
    expect(res.falhas).toEqual([{ etapa: "vendas", error: erro }]);
    expect(onFalha).toHaveBeenCalledWith({ etapa: "vendas", error: erro, venda_id: "vp1" });
    // filhas não são tentadas quando o header falha
    expect(client.calls.map((c) => c.table)).toEqual(["vendas"]);
  });

  it("violação de unicidade no header é idempotente: ok=true, sem alarme, sem reinserir filhas", async () => {
    // dual-write repetido (StrictMode/resync/clique duplo): venda já existe.
    const client = fakeClient({ vendas: { error: { code: "23505", message: "duplicate key" } } });
    const onFalha = vi.fn();

    const res = await persistirVendaNormalizada(client, saleBase, { onFalha });

    expect(res).toEqual({ ok: true, falhas: [] });
    expect(onFalha).not.toHaveBeenCalled();
    // não reinsere itens/pagamentos (evita duplicar linhas sem chave natural)
    expect(client.calls.map((c) => c.table)).toEqual(["vendas"]);
  });

  it("erro só nos itens: registra a etapa certa e segue tentando pagamentos", async () => {
    const erro = { code: "42501", message: "RLS itens" };
    const client = fakeClient({ venda_itens: { error: erro } });
    const onFalha = vi.fn();

    const res = await persistirVendaNormalizada(client, saleBase, { onFalha });

    expect(res.ok).toBe(false);
    expect(res.falhas).toEqual([{ etapa: "venda_itens", error: erro }]);
    expect(client.calls.map((c) => c.table)).toEqual(["vendas", "venda_itens", "venda_pagamentos"]);
  });

  it("client lançando de fato (rede) vira falha 'excecao' e NUNCA propaga", async () => {
    const client = fakeClient({ vendas: () => Promise.reject(new Error("network down")) });
    const onFalha = vi.fn();

    let lancou = false;
    let res;
    try {
      res = await persistirVendaNormalizada(client, saleBase, { onFalha });
    } catch {
      lancou = true;
    }

    // (b) addSale nunca lança: a finalização (sales, já gravada) segue normal
    expect(lancou).toBe(false);
    expect(res.ok).toBe(false);
    expect(res.falhas[0].etapa).toBe("excecao");
    expect(onFalha).toHaveBeenCalled();
  });

  it("onFalha que lança não quebra a persistência (trilha é isolada)", async () => {
    const client = fakeClient({ vendas: { error: { code: "42501" } } });

    const res = await persistirVendaNormalizada(client, saleBase, {
      onFalha: () => { throw new Error("trilha quebrou"); },
    });

    expect(res.ok).toBe(false);
    expect(res.falhas).toHaveLength(1);
  });

  it("sem onFalha e sem opts: ainda detecta e não lança", async () => {
    const client = fakeClient({ vendas: { error: { code: "42501" } } });

    const res = await persistirVendaNormalizada(client, saleBase);

    expect(res.ok).toBe(false);
    expect(res.falhas[0].etapa).toBe("vendas");
  });

  it("venda sem itens nem pagamentos só grava o header", async () => {
    const client = fakeClient();

    const res = await persistirVendaNormalizada(client, { id: "vp9", total: 0, items: [], pagamentos: [] });

    expect(res.ok).toBe(true);
    expect(client.calls.map((c) => c.table)).toEqual(["vendas"]);
  });
});
