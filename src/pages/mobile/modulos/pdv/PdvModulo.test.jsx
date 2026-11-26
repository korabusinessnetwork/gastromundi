// @vitest-environment jsdom
//
// Refatoração 3: a venda de balcão do celular foi para o gancho `usePdvCelular`.
// O módulo não tinha teste nenhum e registra venda; estes prendem o caminho do
// balcão: itens, cobrar em dinheiro com troco, e a trava de valor insuficiente.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

vi.mock("@/context/AppContext", async () => {
  const { ganchosDoMock } = await import("@/test/mockApp");
  return { ...ganchosDoMock, AppProvider: ({ children }) => children };
});
vi.mock("@/lib/supabase", async () => {
  const { createMockSupabase } = await import("@/test/mockSupabase");
  return { supabase: createMockSupabase() };
});
const finalizarPagamento = vi.hoisted(() => vi.fn(() => Promise.resolve()));
vi.mock("@/features/pdv/hooks/useFinalizarPagamento", () => ({
  useFinalizarPagamento: () => ({ finalizarPagamento }),
}));
vi.mock("@/features/impressao/regras/drivers", () => ({ imprimirDocumento: vi.fn(() => Promise.resolve({ ok: true })) }));

import { setAppMock } from "@/test/mockApp";
import PdvModulo from "./PdvModulo";

const CAFE = { id: 1, name: "Café", price: 6, category: "Bebidas" };

beforeEach(() => {
  vi.clearAllMocks();
  setAppMock({
    caixaAberto: true, products: [CAFE], estoque: [],
    currentUser: { id: 1, username: "caixa1", name: "Caixa", role: "caixa", permissions: { pdv: true } },
    redeOnline: true,
  });
});

const clicar = async (alvo) => { await act(async () => { fireEvent.click(alvo); }); };

async function cobrarDoisCafes() {
  render(<PdvModulo onVoltar={vi.fn()} />);
  // O cartão do produto; depois do primeiro toque o carrinho também mostra "Mais Café".
  const cartao = () => document.querySelector(".pdv-modulo__produto");
  await clicar(cartao());
  await clicar(cartao());
  await clicar(screen.getByRole("button", { name: /^Cobrar/ }));
  await clicar(screen.getByRole("button", { name: /Dinheiro/ }));
}

describe("PDV do celular, busca de produto", () => {
  it("ignora acento, como a busca do resto do sistema: \"cafe\" acha \"Café\"", () => {
    render(<PdvModulo onVoltar={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Buscar produto"), { target: { value: "cafe" } });
    expect(document.querySelectorAll(".pdv-modulo__produto")).toHaveLength(1);
  });
});

describe("PDV do celular, venda de balcão", () => {
  it("dois cafés em dinheiro, R$ 20 recebidos: registra R$ 12 e mostra R$ 8 de troco", async () => {
    await cobrarDoisCafes();
    fireEvent.change(screen.getByLabelText("Valor recebido em dinheiro"), { target: { value: "20" } });
    await clicar(screen.getByRole("button", { name: "Confirmar pagamento" }));

    expect(finalizarPagamento).toHaveBeenCalledTimes(1);
    const [balcao, itens, dados, opcoes] = finalizarPagamento.mock.calls[0];
    expect(balcao.comanda).toBe("Balcão");
    expect(itens).toEqual([expect.objectContaining({ id: 1, qty: 2 })]);
    expect(dados.total).toBe(12);
    expect(opcoes).toEqual({ semComanda: true });

    expect(screen.getByText("Pagamento registrado")).toBeInTheDocument();
    expect(screen.getByText("Devolver de troco").parentElement.textContent).toMatch(/8[,.]00/);
  });

  it("dinheiro abaixo do total não deixa confirmar", async () => {
    await cobrarDoisCafes();
    fireEvent.change(screen.getByLabelText("Valor recebido em dinheiro"), { target: { value: "10" } });

    expect(screen.getByRole("button", { name: "Confirmar pagamento" })).toBeDisabled();
    expect(finalizarPagamento).not.toHaveBeenCalled();
  });
});
