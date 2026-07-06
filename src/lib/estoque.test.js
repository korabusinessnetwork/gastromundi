import { describe, it, expect, vi, beforeEach } from "vitest";

const { registrarInsight, buscarInsights } = vi.hoisted(() => ({
  registrarInsight: vi.fn(),
  buscarInsights: vi.fn(),
}));

vi.mock("./jarvas", () => ({ registrarInsight, buscarInsights }));

import { verificarEstoqueMinimo, gerarAlertaEstoque, processarBaixaEstoque } from "./estoque";

describe("verificarEstoqueMinimo", () => {
  it("detecta quando a baixa cruza o mínimo (estava acima, ficou em/abaixo)", () => {
    expect(verificarEstoqueMinimo(11, 10, 10)).toBe(true); // cruzou exatamente no limite
    expect(verificarEstoqueMinimo(12, 5, 10)).toBe(true);
    expect(verificarEstoqueMinimo(11, 0, 10)).toBe(true); // ruptura
  });

  it("não dispara quando o saldo continua acima do mínimo", () => {
    expect(verificarEstoqueMinimo(15, 12, 10)).toBe(false);
  });

  it("não dispara quando já estava abaixo do mínimo antes da baixa", () => {
    expect(verificarEstoqueMinimo(8, 5, 10)).toBe(false);
  });

  it("não dispara quando o saldo estava exatamente no mínimo antes (já era 'baixo')", () => {
    expect(verificarEstoqueMinimo(10, 9, 10)).toBe(false);
  });

  it("lida com mínimo ausente/inválido como zero", () => {
    expect(verificarEstoqueMinimo(5, 0, null)).toBe(true);
    expect(verificarEstoqueMinimo(0, 0, undefined)).toBe(false);
  });
});

describe("gerarAlertaEstoque", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("registra alerta 'warning' para estoque baixo (não zerado)", async () => {
    buscarInsights.mockResolvedValue({ data: [], error: null });

    await gerarAlertaEstoque({ produtoId: 1, nome: "Suco", quantidade: 5, minimo: 10 }, "maria");

    expect(registrarInsight).toHaveBeenCalledTimes(1);
    expect(registrarInsight).toHaveBeenCalledWith(
      expect.objectContaining({
        tipo: "alerta",
        severidade: "warning",
        modulo: "estoque",
        origem: expect.objectContaining({ chave: "estoque:minimo:produto:1" }),
      }),
    );
  });

  it("registra alerta 'danger' quando o estoque zerou", async () => {
    buscarInsights.mockResolvedValue({ data: [], error: null });

    await gerarAlertaEstoque({ produtoId: 2, nome: "Água", quantidade: 0, minimo: 10 }, "maria");

    expect(registrarInsight).toHaveBeenCalledWith(expect.objectContaining({ severidade: "danger" }));
  });

  it("dedupe: não registra se já existe alerta aberto (novo/lido) para o mesmo produto", async () => {
    buscarInsights.mockResolvedValue({
      data: [{ id: "x", status: "novo", origem: { chave: "estoque:minimo:produto:1" } }],
      error: null,
    });

    await gerarAlertaEstoque({ produtoId: 1, nome: "Suco", quantidade: 5, minimo: 10 }, "maria");

    expect(registrarInsight).not.toHaveBeenCalled();
  });

  it("registra normalmente quando o alerta aberto é de outro produto", async () => {
    buscarInsights.mockResolvedValue({
      data: [{ id: "x", status: "novo", origem: { chave: "estoque:minimo:produto:999" } }],
      error: null,
    });

    await gerarAlertaEstoque({ produtoId: 1, nome: "Suco", quantidade: 5, minimo: 10 }, "maria");

    expect(registrarInsight).toHaveBeenCalledTimes(1);
  });

  it("nunca lança mesmo se buscarInsights ou registrarInsight falharem", async () => {
    buscarInsights.mockRejectedValue(new Error("falha de rede"));

    await expect(gerarAlertaEstoque({ produtoId: 1, nome: "Suco", quantidade: 5, minimo: 10 }, "maria")).resolves.toBeUndefined();
    expect(registrarInsight).not.toHaveBeenCalled();
  });
});

describe("processarBaixaEstoque", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("baixa que cruza o mínimo dispara o alerta do Jarvas (teste de integração da venda)", async () => {
    buscarInsights.mockResolvedValue({ data: [], error: null });
    const chamarRpc = vi.fn(() => Promise.resolve({ data: [{ quantidade: 5, minimo: 10 }], error: null }));

    const { quantidade, error } = await processarBaixaEstoque({
      produtoId: 1, qty: 6, quantidadeAnterior: 11, nomeProduto: "Suco",
      usuario: "maria", chamarRpc,
    });

    expect(error).toBeNull();
    expect(quantidade).toBe(5);
    expect(chamarRpc).toHaveBeenCalledWith(1, 6);
    await vi.waitFor(() => expect(registrarInsight).toHaveBeenCalledTimes(1));
    expect(registrarInsight.mock.calls[0][0].origem.chave).toBe("estoque:minimo:produto:1");
  });

  it("baixa que continua acima do mínimo NÃO dispara alerta", async () => {
    const chamarRpc = vi.fn(() => Promise.resolve({ data: [{ quantidade: 12, minimo: 10 }], error: null }));

    await processarBaixaEstoque({
      produtoId: 2, qty: 3, quantidadeAnterior: 15, nomeProduto: "Água",
      usuario: "maria", chamarRpc,
    });

    await new Promise((r) => setTimeout(r, 0)); // dá chance a um fire-and-forget indevido aparecer
    expect(registrarInsight).not.toHaveBeenCalled();
  });

  it("erro na RPC não dispara alerta e devolve o erro (não quebra a venda)", async () => {
    const chamarRpc = vi.fn(() => Promise.resolve({ data: null, error: { message: "falha" } }));

    const { error, quantidade } = await processarBaixaEstoque({
      produtoId: 3, qty: 2, quantidadeAnterior: 5, nomeProduto: "Pizza",
      usuario: "maria", chamarRpc,
    });

    expect(error).toEqual({ message: "falha" });
    expect(quantidade).toBe(3); // fallback calculado localmente
    expect(registrarInsight).not.toHaveBeenCalled();
  });

  it("usa minimoFallback quando a RPC não devolve minimo", async () => {
    buscarInsights.mockResolvedValue({ data: [], error: null });
    const chamarRpc = vi.fn(() => Promise.resolve({ data: [{ quantidade: 4 }], error: null }));

    await processarBaixaEstoque({
      produtoId: 4, qty: 6, quantidadeAnterior: 10, nomeProduto: "Bolo",
      minimoFallback: 5, usuario: "maria", chamarRpc,
    });

    await vi.waitFor(() => expect(registrarInsight).toHaveBeenCalledTimes(1));
    expect(registrarInsight.mock.calls[0][0].origem.dados.minimo).toBe(5);
  });
});
