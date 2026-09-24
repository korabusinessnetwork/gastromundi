// @vitest-environment jsdom
//
// Fechamento do delivery — a tela que responde "quanto a entrega vendeu e
// onde esse dinheiro está".
//
// O que este arquivo protege é o aviso do dinheiro em mãos. Ele existe
// porque a venda de delivery entra no fechamento do CAIXA no instante em
// que o pedido é marcado como entregue, com as notas ainda na mão do
// entregador — quem fecha o caixa antes de a equipe voltar vê uma falta
// que não existe. Sem o aviso, essa tela seria só mais um resumo.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const { listarPedidosDelivery } = vi.hoisted(() => ({ listarPedidosDelivery: vi.fn() }));
vi.mock("@/lib/deliveryPedidos", async (importOriginal) => ({
  ...(await importOriginal()),
  listarPedidosDelivery,
}));

import AbaFechamento from "./AbaFechamento";

// O componente recorta por dia LOCAL e abre em "hoje"; os pedidos de teste
// nascem agora para caírem dentro do período padrão.
const agora = () => new Date().toISOString();

const pedido = (over = {}) => ({
  id: Math.random().toString(36).slice(2),
  status: "entregue",
  total: 50,
  taxa_entrega: 5,
  forma_pagamento: "dinheiro",
  created_at: agora(),
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  listarPedidosDelivery.mockResolvedValue({ data: [], error: null });
});

const montar = () => render(<AbaFechamento aviso={vi.fn()} />);

describe("AbaFechamento", () => {
  it("avisa quanto entrou em dinheiro na entrega, e por que isso importa", async () => {
    listarPedidosDelivery.mockResolvedValue({
      data: [pedido({ forma_pagamento: "dinheiro", total: 50 })],
      error: null,
    });

    montar();

    await waitFor(() => expect(screen.getByText(/R\$ 50,00 recebidos em dinheiro/)).toBeInTheDocument());
    expect(screen.getByText(/acusar falta/i)).toBeInTheDocument();
  });

  it("sem venda em dinheiro o aviso não aparece — seria alarme falso", async () => {
    listarPedidosDelivery.mockResolvedValue({
      data: [pedido({ forma_pagamento: "pix" })],
      error: null,
    });

    montar();

    await waitFor(() => expect(screen.getByText(/como o dinheiro entrou/i)).toBeInTheDocument());
    expect(screen.queryByText(/recebidos em dinheiro/)).not.toBeInTheDocument();
  });

  it("pedido na rua é contado à parte, e não como vendido", async () => {
    listarPedidosDelivery.mockResolvedValue({
      data: [
        pedido({ status: "entregue", total: 50, forma_pagamento: "pix" }),
        pedido({ status: "saiu_entrega", total: 90, forma_pagamento: "pix" }),
      ],
      error: null,
    });

    montar();

    await waitFor(() => expect(screen.getByText(/1 pedido ainda na rua/)).toBeInTheDocument());
    // vendido conta só o entregue
    const kpis = [...document.querySelectorAll(".fech-delivery__kpi")];
    const vendido = kpis.find((k) => k.textContent.startsWith("Vendido"));
    expect(vendido.querySelector(".fech-delivery__kpi-valor").textContent).toBe("R$ 50,00");
  });

  it("separa as formas de pagamento com o nome que a vitrine usa", async () => {
    listarPedidosDelivery.mockResolvedValue({
      data: [
        pedido({ forma_pagamento: "cartao", total: 40 }),
        pedido({ forma_pagamento: "pix", total: 30 }),
      ],
      error: null,
    });

    montar();

    await waitFor(() => expect(screen.getByText("Cartão na entrega")).toBeInTheDocument());
    expect(screen.getByText("Pix")).toBeInTheDocument();
    expect(screen.queryByText("cartao")).not.toBeInTheDocument();
  });

  it("manda o pagamento do entregador para o lugar certo", async () => {
    // São contas diferentes: quanto a entrega vendeu e quanto pagar de
    // corrida. Misturar as duas esconde as duas.
    listarPedidosDelivery.mockResolvedValue({ data: [pedido()], error: null });

    montar();

    await waitFor(() => expect(screen.getByText(/Entregadores → Pagamento/)).toBeInTheDocument());
  });

  it("falha ao carregar avisa em vez de mostrar zero como se fosse verdade", async () => {
    listarPedidosDelivery.mockResolvedValue({ data: [], error: { message: "boom" } });

    montar();

    await waitFor(() => expect(screen.getByText(/não foi possível carregar os pedidos/i)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /tentar de novo/i })).toBeInTheDocument();
  });

  it("período sem entrega diz isso, em vez de tabela vazia sem explicação", async () => {
    listarPedidosDelivery.mockResolvedValue({ data: [], error: null });

    montar();

    await waitFor(() => expect(screen.getByText(/nenhuma entrega concluída no período/i)).toBeInTheDocument());
  });
});
