// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/context/AppContext", async () => {
  const { mockUseApp } = await import("@/test/mockApp");
  return { useApp: mockUseApp, AppProvider: ({ children }) => children };
});

const { carregarItensPedido, usePedidosDelivery } = vi.hoisted(() => ({
  carregarItensPedido: vi.fn(),
  usePedidosDelivery: vi.fn(),
}));

vi.mock("@/lib/deliveryPedidos", async (importOriginal) => ({
  ...(await importOriginal()),
  carregarItensPedido,
  atualizarStatusPedido: vi.fn(() => Promise.resolve({ error: null })),
}));

vi.mock("@/utils/hooks", () => ({ usePedidosDelivery }));

import { setAppMock } from "@/test/mockApp";
import DeliveryModulo from "./DeliveryModulo";

const PEDIDO = {
  id: "p1",
  numero: 42,
  status: "recebido",
  cliente_nome: "Ana",
  total: 50,
  created_at: new Date().toISOString(),
};

beforeEach(() => {
  vi.clearAllMocks();
  // clearAllMocks não descarta os `mockResolvedValueOnce` enfileirados: um que
  // sobrasse de um teste responderia pelo teste seguinte.
  carregarItensPedido.mockReset();
  setAppMock();
  usePedidosDelivery.mockReturnValue({
    pedidos: [PEDIDO],
    carregando: false,
    erro: null,
    recarregar: vi.fn(() => Promise.resolve()),
  });
});

describe("DeliveryModulo — itens do pedido", () => {
  it("falha ao carregar os itens avisa em vez de dizer que o pedido não tem itens", async () => {
    const user = userEvent.setup();
    carregarItensPedido.mockResolvedValue({ data: null, error: { message: "permission denied" } });
    render(<DeliveryModulo onVoltar={vi.fn()} />);

    await user.click(screen.getByRole("button", { expanded: false }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/não deu para carregar os itens/i);
    // "Sem itens detalhados." mandaria o entregador embora sem a comida certa.
    expect(screen.queryByText(/sem itens detalhados/i)).not.toBeInTheDocument();
  });

  it("fechar e abrir de novo tenta buscar outra vez", async () => {
    const user = userEvent.setup();
    carregarItensPedido.mockResolvedValueOnce({ data: null, error: { message: "timeout" } });
    render(<DeliveryModulo onVoltar={vi.fn()} />);

    await user.click(screen.getByRole("button", { expanded: false }));
    await screen.findByRole("alert");

    carregarItensPedido.mockResolvedValueOnce({ data: [{ id: "i1", qtd: 2, nome: "X-Burguer" }], error: null });
    await user.click(screen.getByRole("button", { expanded: true }));  // fecha
    await user.click(screen.getByRole("button", { expanded: false })); // abre de novo

    expect(await screen.findByText(/2× X-Burguer/)).toBeInTheDocument();
    expect(carregarItensPedido).toHaveBeenCalledTimes(2);
  });

  it("carga boa não busca de novo ao reabrir", async () => {
    const user = userEvent.setup();
    carregarItensPedido.mockResolvedValue({ data: [{ id: "i1", qtd: 1, nome: "Coca" }], error: null });
    render(<DeliveryModulo onVoltar={vi.fn()} />);

    await user.click(screen.getByRole("button", { expanded: false }));
    await screen.findByText(/1× Coca/);
    await user.click(screen.getByRole("button", { expanded: true }));
    await user.click(screen.getByRole("button", { expanded: false }));

    await waitFor(() => expect(screen.getByText(/1× Coca/)).toBeInTheDocument());
    expect(carregarItensPedido).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("pedido realmente sem itens continua dizendo que não tem itens", async () => {
    const user = userEvent.setup();
    carregarItensPedido.mockResolvedValue({ data: [], error: null });
    render(<DeliveryModulo onVoltar={vi.fn()} />);

    await user.click(screen.getByRole("button", { expanded: false }));

    expect(await screen.findByText(/sem itens detalhados/i)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

// ── Run 6, leva 7 — DL20 no Palm ────────────────────────────────────────
//
// Antes: `erroCarga ?` trocava a lista inteira pela tela de erro. Com pedidos
// em rota na tela, uma piscada de rede fazia o entregador perder de vista
// TODOS eles — inclusive o que ele acabou de marcar como "saiu para entrega",
// porque `avancar` chama recarregar() logo depois de mudar o status.
describe("DeliveryModulo — falha ao atualizar com pedidos na tela (Run 6, leva 7)", () => {
  const comErro = (pedidos) =>
    usePedidosDelivery.mockReturnValue({
      pedidos,
      carregando: false,
      erro: { message: "TypeError: Failed to fetch" },
      recarregar: vi.fn(() => Promise.resolve()),
    });

  it("mantém os pedidos na tela e põe o aviso por cima", () => {
    comErro([PEDIDO]);
    render(<DeliveryModulo onVoltar={vi.fn()} />);

    expect(screen.getByText(/#42 · Ana/)).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(
      /não conseguimos atualizar agora/i,
    );
    // A tela de erro cheia (que substituiria a lista) não pode aparecer.
    expect(screen.queryByText(/não conseguimos carregar os pedidos/i)).not.toBeInTheDocument();
  });

  it("o aviso diz que a lista é da última atualização que deu certo", () => {
    comErro([PEDIDO]);
    render(<DeliveryModulo onVoltar={vi.fn()} />);

    // Prevenção de erro: o entregador precisa saber que aquilo pode estar
    // velho, senão ele confia numa lista parada como se fosse ao vivo.
    expect(screen.getByRole("alert")).toHaveTextContent(
      /última atualização que deu certo/i,
    );
  });

  it("o 'Tentar de novo' do aviso recarrega a lista", async () => {
    const user = userEvent.setup();
    const recarregar = vi.fn(() => Promise.resolve());
    usePedidosDelivery.mockReturnValue({
      pedidos: [PEDIDO],
      carregando: false,
      erro: { message: "offline" },
      recarregar,
    });
    render(<DeliveryModulo onVoltar={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /tentar de novo/i }));

    expect(recarregar).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/#42 · Ana/)).toBeInTheDocument();
  });

  it("sem NENHUM pedido carregado, aí sim mostra a tela de erro cheia", () => {
    comErro([]);
    render(<DeliveryModulo onVoltar={vi.fn()} />);

    // Não há nada a preservar: a tela cheia é a mensagem certa aqui.
    expect(screen.getByRole("alert")).toHaveTextContent(
      /não conseguimos carregar os pedidos/i,
    );
    expect(screen.queryByText(/última atualização que deu certo/i)).not.toBeInTheDocument();
  });

  it("chip legitimamente vazio mostra o vazio daquela etapa, não a tela de erro", async () => {
    const user = userEvent.setup();
    comErro([PEDIDO]); // status "recebido"
    render(<DeliveryModulo onVoltar={vi.fn()} />);

    // "Entregues" não tem nenhum pedido, mas `pedidos` não está vazio: a
    // decisão da tela cheia olha `pedidos`, não `lista`. Trocar por
    // `lista.length` faria um chip vazio virar tela de erro.
    await user.click(screen.getByRole("tab", { name: /Entregues/ }));

    expect(screen.getByText(/nenhuma entrega concluída ainda/i)).toBeInTheDocument();
    expect(screen.queryByText(/não conseguimos carregar os pedidos/i)).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(/não conseguimos atualizar agora/i);
  });

  it("sem erro nenhum, nada de aviso na tela", () => {
    render(<DeliveryModulo onVoltar={vi.fn()} />);

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText(/#42 · Ana/)).toBeInTheDocument();
  });
});
