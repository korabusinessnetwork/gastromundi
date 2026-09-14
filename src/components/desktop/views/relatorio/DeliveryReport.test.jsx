// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

// Só a leitura do Supabase é trocada; o resto do módulo (os rótulos do
// delivery) segue real, que é justamente o que a tela precisa mostrar.
const { listarPedidosDelivery } = vi.hoisted(() => ({ listarPedidosDelivery: vi.fn() }));
vi.mock("@/lib/deliveryPedidos", async (importOriginal) => ({
  ...(await importOriginal()),
  listarPedidosDelivery,
}));

import DeliveryReport from "./DeliveryReport";

beforeEach(() => {
  vi.clearAllMocks();
  listarPedidosDelivery.mockResolvedValue({ data: [], error: null });
});

// "Tudo" no período: nenhum recorte por data, para os testes não
// dependerem do relógio de quem roda a suíte.
const PROPS = { periodo: "tudo", customInicio: "", customFim: "" };

const VENDAS = [
  { id: "1", total: 100, at: "2026-09-01T12:00:00Z" },
  { id: "2", total: 100, at: "2026-09-01T13:00:00Z", origem: "pdv" },
  { id: "3", total: 400, at: "2026-09-01T14:00:00Z", origem: "delivery" },
];

const PEDIDOS = [
  {
    id: "p1", numero: "1001", status: "entregue", total: 250, taxa_entrega: 8,
    bairro: "Centro", forma_pagamento: "pix",
    created_at: "2026-09-01T12:00:00Z", updated_at: "2026-09-01T12:40:00Z",
  },
  {
    id: "p2", numero: "1002", status: "em_preparo", total: 150, taxa_entrega: 8,
    bairro: "Jardim", forma_pagamento: "dinheiro",
    created_at: "2026-09-01T13:00:00Z", updated_at: "2026-09-01T13:05:00Z",
  },
  {
    id: "p3", numero: "1003", status: "cancelado", total: 999, taxa_entrega: 9,
    bairro: "Centro", forma_pagamento: "pix",
    created_at: "2026-09-01T14:00:00Z", updated_at: "2026-09-01T14:10:00Z",
  },
];

describe("DeliveryReport", () => {
  it("compara os dois lados do balcão com os números certos", async () => {
    listarPedidosDelivery.mockResolvedValue({ data: PEDIDOS, error: null });

    render(<DeliveryReport vendas={VENDAS} {...PROPS} />);

    await waitFor(() => expect(screen.getByText(/delivery x frente de caixa/i)).toBeInTheDocument());

    // 200 de balcão (uma venda sem origem conta como balcão) e 400 de delivery
    const lados = [...document.querySelectorAll(".delivery-report__lado-valor")].map((n) => n.textContent);
    expect(lados).toEqual(["R$ 200,00", "R$ 400,00"]);
    expect(screen.getByText(/R\$ 600,00 no total/)).toBeInTheDocument();

    // e a fatia de cada um, sem obrigar ninguém a dividir de cabeça
    expect(screen.getByText(/frente de caixa 33%/i)).toBeInTheDocument();
    expect(screen.getByText(/delivery 67%/i)).toBeInTheDocument();
  });

  it("pedido cancelado conta como cancelado e fica fora do dinheiro", async () => {
    listarPedidosDelivery.mockResolvedValue({ data: PEDIDOS, error: null });

    render(<DeliveryReport vendas={VENDAS} {...PROPS} />);
    await waitFor(() => expect(screen.getByText(/operação do delivery/i)).toBeInTheDocument());

    const kpi = (rotulo) => [...document.querySelectorAll(".delivery-report__kpi")]
      .find((n) => n.textContent.toLowerCase().startsWith(rotulo.toLowerCase()))
      ?.querySelector(".delivery-report__kpi-valor")?.textContent;

    expect(kpi("Cancelados")).toBe("1");
    expect(kpi("Pedidos")).toBe("3");
    // 250 + 150 entram; os 999 do cancelado, não
    expect(kpi("Faturamento")).toBe("R$ 400,00");
    // taxas: 8 + 8 (a do cancelado fica de fora)
    expect(kpi("Taxas de entrega")).toBe("R$ 16,00");
  });

  it("mostra o tempo médio até entregar", async () => {
    listarPedidosDelivery.mockResolvedValue({ data: PEDIDOS, error: null });

    render(<DeliveryReport vendas={VENDAS} {...PROPS} />);
    await waitFor(() => expect(screen.getByText(/tempo até entregar/i)).toBeInTheDocument());

    // só o p1 foi entregue: 12:00 → 12:40
    expect(screen.getByText("40 min")).toBeInTheDocument();
  });

  it("a forma de pagamento sai no vocabulário do delivery, não no código cru", async () => {
    listarPedidosDelivery.mockResolvedValue({
      data: [{ id: "p9", status: "entregue", total: 60, taxa_entrega: 0, bairro: "Centro", forma_pagamento: "cartao", created_at: "2026-09-01T12:00:00Z", updated_at: "2026-09-01T12:20:00Z" }],
      error: null,
    });

    render(<DeliveryReport vendas={VENDAS} {...PROPS} />);
    await waitFor(() => expect(screen.getByText(/como o delivery paga/i)).toBeInTheDocument());

    expect(screen.getByText("Cartão na entrega")).toBeInTheDocument();
    expect(screen.queryByText("cartao")).not.toBeInTheDocument();
  });

  it("bairro que mais fatura aparece primeiro", async () => {
    listarPedidosDelivery.mockResolvedValue({ data: PEDIDOS, error: null });

    render(<DeliveryReport vendas={VENDAS} {...PROPS} />);
    await waitFor(() => expect(screen.getByText(/bairros que mais pedem/i)).toBeInTheDocument());

    const nomes = [...document.querySelectorAll(".delivery-report__ranking-nome")].map((n) => n.textContent);
    // Centro 250 (o cancelado não conta) vem antes de Jardim 150
    expect(nomes.slice(0, 2)).toEqual(["Centro", "Jardim"]);
  });

  it("período sem movimento diz que é o período, e não que o delivery não existe", async () => {
    render(<DeliveryReport vendas={[]} {...PROPS} />);

    await waitFor(() => expect(screen.getByText(/nenhum movimento no período/i)).toBeInTheDocument());
    expect(screen.getByText(/troque o período no topo/i)).toBeInTheDocument();
  });

  it("falha ao carregar os pedidos avisa em vez de mostrar zero como se fosse verdade", async () => {
    listarPedidosDelivery.mockResolvedValue({ data: [], error: { message: "boom" } });

    render(<DeliveryReport vendas={VENDAS} {...PROPS} />);

    await waitFor(() => expect(screen.getByText(/não foi possível carregar os pedidos/i)).toBeInTheDocument());
  });

  it("entrega os números prontos para a exportação de quem chamou", async () => {
    listarPedidosDelivery.mockResolvedValue({ data: PEDIDOS, error: null });
    const onExportar = vi.fn();

    render(<DeliveryReport vendas={VENDAS} {...PROPS} onExportar={onExportar} />);
    // o primeiro aviso sai antes dos pedidos chegarem; o que importa é o último
    await waitFor(() => expect(onExportar.mock.calls.at(-1)[0].resumo.pedidos).toBe(3));

    const dados = onExportar.mock.calls.at(-1)[0];
    expect(dados.comparacao.delivery.total).toBe(400);
    expect(dados.resumo.cancelados).toBe(1);
    expect(dados.bairros[0].nome).toBe("Centro");
    expect(dados.tempoMedio).toBe(40);
  });

  it("o recorte por período vale para as vendas e para os pedidos", async () => {
    listarPedidosDelivery.mockResolvedValue({ data: PEDIDOS, error: null });
    const onExportar = vi.fn();

    render(
      <DeliveryReport
        vendas={VENDAS}
        periodo="custom"
        customInicio="2026-09-01"
        customFim="2026-09-01"
        onExportar={onExportar}
      />,
    );
    await waitFor(() => expect(onExportar.mock.calls.at(-1)[0].resumo.pedidos).toBe(3));

    onExportar.mockClear();
    render(
      <DeliveryReport
        vendas={VENDAS}
        periodo="custom"
        customInicio="2026-10-01"
        customFim="2026-10-31"
        onExportar={onExportar}
      />,
    );
    await waitFor(() => expect(onExportar).toHaveBeenCalled());
    const fora = onExportar.mock.calls.at(-1)[0];
    expect(fora.resumo.pedidos).toBe(0);
    expect(fora.comparacao.total).toBe(0);
    expect(fora.bairros).toEqual([]);
  });
});
