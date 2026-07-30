// @vitest-environment jsdom
//
// Run 6, leva 7 — DL20 no painel de desktop (aba Pedidos do DeliveryView).
//
// Antes: `erro ?` trocava o kanban INTEIRO pela tela "📡 Não conseguimos
// carregar os pedidos". Como `avancar` e `cancelar` chamam recarregar() logo
// depois de mudar o status com sucesso, uma piscada de rede nesse recarregar
// varria da tela todos os pedidos em andamento — inclusive o que o operador
// acabou de aceitar. Agora o erro é uma faixa por cima de uma lista intacta, e
// a tela cheia só aparece quando não há nada para preservar.
//
// AbaPedidos não é exportada: o teste monta o DeliveryView de verdade e vive
// com a aba "pedidos", que é a inicial.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/context/AppContext", async () => {
  const { mockUseApp } = await import("@/test/mockApp");
  return { useApp: mockUseApp, AppProvider: ({ children }) => children };
});

vi.mock("@/lib/supabase", async () => {
  const { createMockSupabase } = await import("@/test/mockSupabase");
  return { supabase: createMockSupabase() };
});

const { usePedidosDelivery, listarProdutosDelivery, carregarConfigDelivery } = vi.hoisted(() => ({
  usePedidosDelivery: vi.fn(),
  listarProdutosDelivery: vi.fn(),
  carregarConfigDelivery: vi.fn(),
}));

// useResponsive fica real: é ele que define `sz`, e sem ele o layout não monta.
vi.mock("@/utils/hooks", async (importOriginal) => ({
  ...(await importOriginal()),
  usePedidosDelivery,
}));

vi.mock("@/lib/deliveryAdmin", async (importOriginal) => ({
  ...(await importOriginal()),
  listarProdutosDelivery,
  carregarConfigDelivery,
}));

// O mapa arrasta Leaflet inteiro para o jsdom e não tem nada a ver com pedidos.
vi.mock("./delivery/MapaRaioEntrega", () => ({ default: () => null }));

import { setAppMock } from "@/test/mockApp";
import DeliveryView from "./DeliveryView";

const PEDIDO = {
  id: "p1",
  numero: 42,
  status: "recebido",
  cliente_nome: "Ana",
  cliente_telefone: "11999998888",
  total: 50,
  created_at: new Date().toISOString(),
};

const FALHA = { message: "TypeError: Failed to fetch" };

const semErro = (pedidos = [PEDIDO]) => {
  const recarregar = vi.fn(() => Promise.resolve());
  usePedidosDelivery.mockReturnValue({ pedidos, carregando: false, erro: null, recarregar });
  return recarregar;
};

const comErro = (pedidos) => {
  const recarregar = vi.fn(() => Promise.resolve());
  usePedidosDelivery.mockReturnValue({ pedidos, carregando: false, erro: FALHA, recarregar });
  return recarregar;
};

const cartaoDoPedido = () => screen.queryByText("Ana");
const telaCheiaDeErro = () => screen.queryByText(/não conseguimos carregar os pedidos/i);
const faixaDeErro = () => screen.queryByText(/não conseguimos atualizar agora/i);

async function montar() {
  render(<DeliveryView notify={vi.fn()} />);
  // A view carrega cardápio e config no mount; sem esperar, o React reclama.
  await screen.findByText(/pedido em andamento|nenhum pedido em andamento/i);
}

beforeEach(() => {
  vi.clearAllMocks();
  setAppMock();
  listarProdutosDelivery.mockResolvedValue({ data: [], error: null });
  carregarConfigDelivery.mockResolvedValue({
    data: { aberto: true, pedido_minimo: 0, tempo_preparo_min: 30, horario: {}, faixas_taxa: [] },
    error: null,
  });
  semErro();
});

describe("DeliveryView — falha ao atualizar não derruba o kanban (Run 6, leva 7)", () => {
  it("com pedidos na tela, a falha vira faixa e o kanban continua", async () => {
    comErro([PEDIDO]);
    await montar();

    expect(cartaoDoPedido()).toBeInTheDocument();
    expect(faixaDeErro()).toBeInTheDocument();
    expect(telaCheiaDeErro()).not.toBeInTheDocument();
  });

  it("a faixa é anunciada como alerta e explica que a lista pode estar velha", async () => {
    comErro([PEDIDO]);
    await montar();

    const alerta = screen.getByRole("alert");
    expect(alerta).toHaveTextContent(/não conseguimos atualizar agora/i);
    expect(alerta).toHaveTextContent(/última atualização que deu certo/i);
  });

  it("o 'Tentar de novo' da faixa recarrega sem apagar o kanban", async () => {
    const user = userEvent.setup();
    const recarregar = comErro([PEDIDO]);
    await montar();

    await user.click(screen.getByRole("button", { name: /tentar de novo/i }));

    expect(recarregar).toHaveBeenCalledTimes(1);
    expect(cartaoDoPedido()).toBeInTheDocument();
  });

  it("sem nenhum pedido, a falha mostra a tela cheia (não há o que preservar)", async () => {
    comErro([]);
    await montar();

    expect(telaCheiaDeErro()).toBeInTheDocument();
    expect(faixaDeErro()).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /tentar de novo/i })).not.toBeInTheDocument();
  });

  it("lista vazia SEM erro mostra o vazio convidativo, não o erro", async () => {
    semErro([]);
    await montar();

    expect(screen.getByText(/nenhum pedido por aqui ainda/i)).toBeInTheDocument();
    expect(telaCheiaDeErro()).not.toBeInTheDocument();
    expect(faixaDeErro()).not.toBeInTheDocument();
  });

  it("tudo funcionando: kanban sem faixa nenhuma", async () => {
    semErro([PEDIDO]);
    await montar();

    expect(cartaoDoPedido()).toBeInTheDocument();
    expect(faixaDeErro()).not.toBeInTheDocument();
    expect(telaCheiaDeErro()).not.toBeInTheDocument();
  });
});
