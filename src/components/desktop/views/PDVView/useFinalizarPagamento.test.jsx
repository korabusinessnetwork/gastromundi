// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

/**
 * REGRESSÃO DO INCIDENTE (TD011): um ReferenceError em
 * handleConfirmPayment (variável `metodo` órfã) quebrou a finalização
 * de pagamento em produção DEPOIS de gravar a venda — nenhum teste
 * exercitava o fluxo. Este teste chama a função de verdade
 * (finalizarPagamento, extraída de PDVView) de ponta a ponta; se
 * alguém reintroduzir uma variável órfã nesse caminho, o teste quebra
 * imediatamente com o mesmo ReferenceError.
 */

vi.mock("@/context/AppContext", async () => {
  const { mockUseApp } = await import("@/test/mockApp");
  return { useApp: mockUseApp, AppProvider: ({ children }) => children };
});

const rpcMock = vi.fn(() => Promise.resolve({ data: null, error: null }));
vi.mock("@/lib/supabase", () => ({
  supabase: { rpc: (...args) => rpcMock(...args) },
}));

const logActionMock = vi.fn();
vi.mock("@/lib/logger", () => ({ logAction: (...args) => logActionMock(...args) }));

const criarLancamentoMock = vi.fn(() => Promise.resolve({ data: { id: "lanc-1" }, error: null }));
vi.mock("@/lib/financeiro", () => ({ criarLancamento: (...args) => criarLancamentoMock(...args) }));

import { setAppMock } from "@/test/mockApp";
import { useFinalizarPagamento } from "./useFinalizarPagamento";

function setup(overrides = {}) {
  const appMock = setAppMock({
    addSale: vi.fn(() => Promise.resolve()),
    removePending: vi.fn(() => Promise.resolve()),
    baixarEstoque: vi.fn(() => Promise.resolve()),
    estoque: { 1: 10, 2: 5 },
    currentUser: { name: "Maria", username: "maria", role: "caixa" },
    ...overrides,
  });
  const { result } = renderHook(() => useFinalizarPagamento());
  return { appMock, finalizarPagamento: result.current.finalizarPagamento };
}

const selectedComanda = {
  id: "pend-1",
  comanda: "5",
  mesa: "5",
  items: [{ id: 1, name: "Hambúrguer", price: 30, qty: 1 }],
};

const payload = {
  pagamentos: [{ metodo: "dinheiro", valor: 30, recebido: 30, troco: 0 }],
  total: 30,
  taxaServico: false,
  valorTaxa: 0,
  ajuste: null,
  valorAjuste: 0,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useFinalizarPagamento (regressão do incidente)", () => {
  it("finaliza o pagamento sem lançar exceção e completa todo o fluxo esperado", async () => {
    const { appMock, finalizarPagamento } = setup();

    // Não deve lançar (essa é a regressão: o bug original quebrava aqui com ReferenceError)
    await expect(finalizarPagamento(selectedComanda, [], payload)).resolves.toBeDefined();

    // grava a venda
    expect(appMock.addSale).toHaveBeenCalledTimes(1);
    const saleGravada = appMock.addSale.mock.calls[0][0];
    expect(saleGravada).toMatchObject({ comanda: "5", total: 30, subtotal: 30, pagamentos: payload.pagamentos });

    // remove a pending
    expect(appMock.removePending).toHaveBeenCalledWith("pend-1");

    // libera a reserva da mesa
    expect(rpcMock).toHaveBeenCalledWith("limpar_reserva_mesa", { mesa_numero: "5" });

    // baixa estoque do item vendido (chave de objeto sempre vira string)
    expect(appMock.baixarEstoque).toHaveBeenCalledWith("1", 1);

    // registra o log com o resumo do método de pagamento (sem ReferenceError)
    expect(logActionMock).toHaveBeenCalledWith(
      "maria",
      "comanda:finalizar",
      expect.objectContaining({ comanda: "5", total: 30, metodo: "dinheiro" }),
    );
  });

  it("inclui itens do carrinho local (ainda não lançados) na venda", async () => {
    const { appMock, finalizarPagamento } = setup();
    const cartItems = [{ _key: "abc", id: 2, name: "Refrigerante", price: 8, qty: 2 }];

    await finalizarPagamento(selectedComanda, cartItems, {
      ...payload,
      total: 46,
      pagamentos: [{ metodo: "pix", valor: 46 }],
    });

    const saleGravada = appMock.addSale.mock.calls[0][0];
    expect(saleGravada.items).toEqual([
      { id: 1, name: "Hambúrguer", price: 30, qty: 1 },
      { id: 2, name: "Refrigerante", price: 8, qty: 2 },
    ]);
    // baixa estoque dos dois produtos vendidos
    expect(appMock.baixarEstoque).toHaveBeenCalledWith("1", 1);
    expect(appMock.baixarEstoque).toHaveBeenCalledWith("2", 2);
  });

  it("não desconta estoque de item cancelado nem de item sem produto vinculado", async () => {
    const { appMock, finalizarPagamento } = setup();
    const comandaComCancelado = {
      ...selectedComanda,
      items: [
        { id: 1, name: "Hambúrguer", price: 30, qty: 1 },
        { id: 3, name: "Item cancelado", price: 20, qty: 1, cancelado: true },
        { name: "Item avulso sem produto", price: 5, qty: 1 },
      ],
    };

    await finalizarPagamento(comandaComCancelado, [], payload);

    expect(appMock.baixarEstoque).toHaveBeenCalledTimes(1);
    expect(appMock.baixarEstoque).toHaveBeenCalledWith("1", 1);
  });

  it("não desconta estoque quando o produto já está zerado", async () => {
    const { appMock, finalizarPagamento } = setup({ estoque: { 1: 0 } });

    await finalizarPagamento(selectedComanda, [], payload);

    expect(appMock.baixarEstoque).not.toHaveBeenCalled();
  });

  it("não chama a RPC de liberar mesa quando a comanda não tem mesa", async () => {
    const { finalizarPagamento } = setup();
    const semMesa = { ...selectedComanda, mesa: "" };

    await finalizarPagamento(semMesa, [], payload);

    expect(rpcMock).not.toHaveBeenCalled();
  });
});

describe("useFinalizarPagamento — receita automática (Financeiro fase 1)", () => {
  it("pagamento normal vira receita 'recebido', categoria vendas, origem venda", async () => {
    const { finalizarPagamento } = setup();

    await finalizarPagamento(selectedComanda, [], payload);

    await waitFor(() => expect(criarLancamentoMock).toHaveBeenCalledTimes(1));
    expect(criarLancamentoMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tipo: "receita",
        categoria: "vendas",
        valor: 30,
        status: "recebido",
        origem: "venda",
      }),
      "maria",
    );
    // receita já recebida não deve levar vencimento
    expect(criarLancamentoMock.mock.calls[0][0].vencimento).toBeUndefined();
  });

  it("pagamento 'fiado' vira conta a receber (previsto) com vencimento em 30 dias", async () => {
    const { finalizarPagamento } = setup();

    await finalizarPagamento(selectedComanda, [], {
      ...payload,
      pagamentos: [{ metodo: "fiado", valor: 30 }],
    });

    await waitFor(() => expect(criarLancamentoMock).toHaveBeenCalledTimes(1));
    const chamada = criarLancamentoMock.mock.calls[0][0];
    expect(chamada).toMatchObject({ tipo: "receita", categoria: "vendas", valor: 30, status: "previsto", origem: "venda" });

    const hoje = new Date();
    const esperado = new Date(hoje.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    expect(chamada.vencimento).toBe(esperado);
  });

  it("split de pagamento gera um lançamento por método (um normal, um fiado)", async () => {
    const { finalizarPagamento } = setup();

    await finalizarPagamento(selectedComanda, [], {
      ...payload,
      pagamentos: [
        { metodo: "dinheiro", valor: 10 },
        { metodo: "fiado", valor: 20 },
      ],
    });

    await waitFor(() => expect(criarLancamentoMock).toHaveBeenCalledTimes(2));
    expect(criarLancamentoMock).toHaveBeenCalledWith(expect.objectContaining({ status: "recebido", valor: 10 }), "maria");
    expect(criarLancamentoMock).toHaveBeenCalledWith(expect.objectContaining({ status: "previsto", valor: 20 }), "maria");
  });

  it("falha ao criar o lançamento nunca quebra a finalização da venda", async () => {
    criarLancamentoMock.mockRejectedValueOnce(new Error("falha de rede"));
    const { finalizarPagamento } = setup();

    await expect(finalizarPagamento(selectedComanda, [], payload)).resolves.toBeDefined();
  });
});
