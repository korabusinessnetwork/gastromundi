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

const emitirDocumentoFiscalMock = vi.fn(() => Promise.resolve({ status: "stub", vendaId: "v1" }));
vi.mock("@/lib/fiscal", () => ({ emitirDocumentoFiscal: (...args) => emitirDocumentoFiscalMock(...args) }));

const processarPagamentoTefMock = vi.fn(() => Promise.resolve({ status: "stub", metodo: "credito" }));
vi.mock("@/lib/tef", async () => {
  const actual = await vi.importActual("@/lib/tef");
  return { ...actual, processarPagamentoTef: (...args) => processarPagamentoTefMock(...args) };
});

import { setAppMock } from "@/test/mockApp";
import { useFinalizarPagamento } from "./useFinalizarPagamento";

function setup(overrides = {}) {
  const appMock = setAppMock({
    addSale: vi.fn(() => Promise.resolve()),
    removePending: vi.fn(() => Promise.resolve({ error: null })),
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

  it("produto zerado AINDA passa pela baixa (a RPC clampa em zero e o Jarvas sinaliza a venda sem estoque)", async () => {
    const { appMock, finalizarPagamento } = setup({ estoque: { 1: 0 } });

    await finalizarPagamento(selectedComanda, [], payload);

    expect(appMock.baixarEstoque).toHaveBeenCalledWith("1", 1);
  });

  it("não desconta estoque de produto sem controle de estoque (sem entrada no mapa)", async () => {
    const { appMock, finalizarPagamento } = setup({ estoque: { 2: 5 } }); // produto 1 fora do mapa

    await finalizarPagamento(selectedComanda, [], payload);

    expect(appMock.baixarEstoque).not.toHaveBeenCalled();
  });

  it("crítico 7: converte a quantidade vendida para unidade de estoque via fator_consumo_estoque", async () => {
    const { appMock, finalizarPagamento } = setup({
      products: [{ id: 1, name: "Chopp", fator_consumo_estoque: 0.5 }],
    });

    await finalizarPagamento(selectedComanda, [], payload);

    // 1 unidade de consumo × fator 0,5 = 0,5 em unidade de estoque
    expect(appMock.baixarEstoque).toHaveBeenCalledWith("1", 0.5);
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

  it("F010: propaga o clienteId selecionado para a venda e para o lançamento de fiado", async () => {
    const { appMock, finalizarPagamento } = setup();

    await finalizarPagamento(selectedComanda, [], {
      ...payload,
      clienteId: "cli-42",
      pagamentos: [{ metodo: "fiado", valor: 30 }],
    });

    const saleGravada = appMock.addSale.mock.calls[0][0];
    expect(saleGravada.clienteId).toBe("cli-42");

    await waitFor(() => expect(criarLancamentoMock).toHaveBeenCalledTimes(1));
    expect(criarLancamentoMock.mock.calls[0][0].cliente_id).toBe("cli-42");
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

describe("useFinalizarPagamento — add-ons pagos (Fase 3, decisão 019)", () => {
  it("SEM add-on habilitado (padrão hoje): não dispara nem NF-e nem TEF, pagamento segue idêntico", async () => {
    const { finalizarPagamento } = setup({ addonHabilitado: () => false });

    await finalizarPagamento(selectedComanda, [], { ...payload, pagamentos: [{ metodo: "credito", valor: 30 }] });

    // dá tempo pra qualquer fire-and-forget rodar, se fosse rodar
    await waitFor(() => expect(criarLancamentoMock).toHaveBeenCalled());
    expect(emitirDocumentoFiscalMock).not.toHaveBeenCalled();
    expect(processarPagamentoTefMock).not.toHaveBeenCalled();
  });

  it("com o add-on 'nfe' habilitado, emite o documento fiscal (stub) para a venda", async () => {
    const { finalizarPagamento } = setup({ addonHabilitado: (a) => a === "nfe" });

    await finalizarPagamento(selectedComanda, [], payload);

    await waitFor(() => expect(emitirDocumentoFiscalMock).toHaveBeenCalledTimes(1));
    expect(emitirDocumentoFiscalMock).toHaveBeenCalledWith(
      expect.objectContaining({ comanda: "5", total: 30 }),
      { usuario: "maria" },
    );
  });

  it("com o add-on 'tef' habilitado, processa pagamentos em cartão (crédito/débito)", async () => {
    const { finalizarPagamento } = setup({ addonHabilitado: (a) => a === "tef" });

    await finalizarPagamento(selectedComanda, [], {
      ...payload,
      pagamentos: [
        { metodo: "credito", valor: 20 },
        { metodo: "debito", valor: 10 },
      ],
    });

    await waitFor(() => expect(processarPagamentoTefMock).toHaveBeenCalledTimes(2));
    expect(processarPagamentoTefMock).toHaveBeenCalledWith(
      { metodo: "credito", valor: 20 },
      { usuario: "maria", comanda: "5" },
    );
    expect(processarPagamentoTefMock).toHaveBeenCalledWith(
      { metodo: "debito", valor: 10 },
      { usuario: "maria", comanda: "5" },
    );
  });

  it("com 'tef' habilitado, NÃO processa pagamentos em dinheiro/pix/fiado (só cartão)", async () => {
    const { finalizarPagamento } = setup({ addonHabilitado: (a) => a === "tef" });

    await finalizarPagamento(selectedComanda, [], {
      ...payload,
      pagamentos: [{ metodo: "dinheiro", valor: 15 }, { metodo: "pix", valor: 15 }],
    });

    await waitFor(() => expect(criarLancamentoMock).toHaveBeenCalledTimes(2));
    expect(processarPagamentoTefMock).not.toHaveBeenCalled();
  });

  it("Leva 7: chama onNfce com 'emitindo' na hora e depois 'concluido' com o resultado, sem bloquear a venda", async () => {
    emitirDocumentoFiscalMock.mockResolvedValueOnce({ status: "autorizada", vendaId: "v1", chave: "CHAVE44" });
    const { appMock, finalizarPagamento } = setup({ addonHabilitado: (a) => a === "nfe" });
    const onNfce = vi.fn();

    // A venda conclui e retorna na hora — NÃO espera a emissão (não-bloqueio).
    await expect(finalizarPagamento(selectedComanda, [], payload, { onNfce })).resolves.toBeDefined();
    expect(appMock.addSale).toHaveBeenCalledTimes(1);

    // Já foi chamado com 'emitindo' (antes do round-trip resolver).
    expect(onNfce).toHaveBeenCalledWith(expect.objectContaining({ estado: "emitindo", resultado: null }));

    // E depois com 'concluido' + o resultado autorizado.
    await waitFor(() =>
      expect(onNfce).toHaveBeenCalledWith(
        expect.objectContaining({ estado: "concluido", resultado: expect.objectContaining({ status: "autorizada" }) }),
      ),
    );
  });

  it("Leva 7: SEM o add-on nfe, onNfce nunca é chamado (comportamento idêntico a hoje)", async () => {
    const { finalizarPagamento } = setup({ addonHabilitado: () => false });
    const onNfce = vi.fn();

    await finalizarPagamento(selectedComanda, [], payload, { onNfce });

    await waitFor(() => expect(criarLancamentoMock).toHaveBeenCalled());
    expect(onNfce).not.toHaveBeenCalled();
  });

  it("falha do add-on (fiscal ou TEF) nunca quebra a finalização da venda", async () => {
    emitirDocumentoFiscalMock.mockRejectedValueOnce(new Error("falha simulada"));
    const { finalizarPagamento } = setup({ addonHabilitado: (a) => a === "nfe" });

    await expect(finalizarPagamento(selectedComanda, [], payload)).resolves.toBeDefined();
  });
});

describe("useFinalizarPagamento — Leva 12 (offline-first no checkout)", () => {
  const pagamentoCredito = { ...payload, pagamentos: [{ metodo: "credito", valor: 30 }] };

  it("sem internet, pagamento TEF é BLOQUEADO antes de gravar qualquer coisa", async () => {
    const { appMock, finalizarPagamento } = setup({
      redeOnline: false,
      addonHabilitado: (a) => a === "tef",
    });

    await expect(finalizarPagamento(selectedComanda, [], pagamentoCredito)).rejects.toThrow(/maquininha/i);
    expect(appMock.addSale).not.toHaveBeenCalled();
    expect(appMock.removePending).not.toHaveBeenCalled();
  });

  it("sem internet, método que NÃO usa TEF (dinheiro) fecha normalmente", async () => {
    const { appMock, finalizarPagamento } = setup({
      redeOnline: false,
      addonHabilitado: (a) => a === "tef",
    });

    await expect(finalizarPagamento(selectedComanda, [], payload)).resolves.toBeDefined();
    expect(appMock.addSale).toHaveBeenCalledTimes(1);
  });

  it("sem internet, crédito passa quando o estabelecimento tirou o cartão da maquininha (metodosTef: [])", async () => {
    const { appMock, finalizarPagamento } = setup({
      redeOnline: false,
      addonHabilitado: (a) => a === "tef",
      metodosTef: [],
    });

    await expect(finalizarPagamento(selectedComanda, [], pagamentoCredito)).resolves.toBeDefined();
    expect(appMock.addSale).toHaveBeenCalledTimes(1);
  });

  it("sem o add-on TEF, nada é bloqueado offline (não há maquininha)", async () => {
    const { appMock, finalizarPagamento } = setup({
      redeOnline: false,
      addonHabilitado: () => false,
    });

    await expect(finalizarPagamento(selectedComanda, [], pagamentoCredito)).resolves.toBeDefined();
    expect(appMock.addSale).toHaveBeenCalledTimes(1);
  });

  it("processamento TEF respeita a lista configurada (pix na maquininha, crédito fora)", async () => {
    const { finalizarPagamento } = setup({
      addonHabilitado: (a) => a === "tef",
      metodosTef: ["pix"],
    });

    await finalizarPagamento(selectedComanda, [], {
      ...payload,
      pagamentos: [
        { metodo: "pix", valor: 20 },
        { metodo: "credito", valor: 10 },
      ],
    });

    await waitFor(() => expect(processarPagamentoTefMock).toHaveBeenCalledTimes(1));
    expect(processarPagamentoTefMock).toHaveBeenCalledWith(
      { metodo: "pix", valor: 20 },
      { usuario: "maria", comanda: "5" },
    );
  });

  it("falha de REDE ao criar o lançamento enfileira a receita para reenvio (insert_lancamento)", async () => {
    criarLancamentoMock.mockResolvedValueOnce({ data: null, error: { message: "TypeError: Failed to fetch" } });
    const { appMock, finalizarPagamento } = setup();

    await finalizarPagamento(selectedComanda, [], payload);

    await waitFor(() => expect(appMock.enfileirarOffline).toHaveBeenCalledTimes(1));
    expect(appMock.enfileirarOffline).toHaveBeenCalledWith({
      tipo: "insert_lancamento",
      dados: expect.objectContaining({ tipo: "receita", categoria: "vendas", valor: 30, status: "recebido" }),
      usuario: "maria",
    });
  });

  it("erro DEFINITIVO do lançamento (não-rede) segue fire-and-forget, sem enfileirar", async () => {
    criarLancamentoMock.mockResolvedValueOnce({ data: null, error: { message: "violates row-level security policy" } });
    const { appMock, finalizarPagamento } = setup();

    await expect(finalizarPagamento(selectedComanda, [], payload)).resolves.toBeDefined();
    await waitFor(() => expect(criarLancamentoMock).toHaveBeenCalledTimes(1));
    expect(appMock.enfileirarOffline).not.toHaveBeenCalled();
  });
});

describe("useFinalizarPagamento — Fase 4 (billing) NÃO bloqueia nenhuma escrita", () => {
  it("finaliza a venda normalmente mesmo com a assinatura 'bloqueada' (enforcement é só na Fase 5)", async () => {
    const { appMock, finalizarPagamento } = setup({
      assinatura: { status: "bloqueado", diasParaVencer: -10, carenciaDias: 3 },
    });

    await expect(finalizarPagamento(selectedComanda, [], payload)).resolves.toBeDefined();
    expect(appMock.addSale).toHaveBeenCalledTimes(1);
    expect(appMock.removePending).toHaveBeenCalledWith("pend-1");
  });
});
