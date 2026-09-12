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
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
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

const { usePedidosDelivery, listarProdutosDelivery, carregarConfigDelivery, salvarConfigDelivery } = vi.hoisted(() => ({
  usePedidosDelivery: vi.fn(),
  listarProdutosDelivery: vi.fn(),
  carregarConfigDelivery: vi.fn(),
  salvarConfigDelivery: vi.fn(),
}));

// Só o hook de pedidos é falso. O resto de @/utils/hooks passa real pelo
// importOriginal() — a tela usa vários e nenhum precisa ser dublê aqui.
vi.mock("@/utils/hooks", async (importOriginal) => ({
  ...(await importOriginal()),
  usePedidosDelivery,
}));

vi.mock("@/lib/deliveryAdmin", async (importOriginal) => ({
  ...(await importOriginal()),
  listarProdutosDelivery,
  carregarConfigDelivery,
  salvarConfigDelivery,
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

afterEach(() => {
  vi.restoreAllMocks(); // desfaz o espião de window.open
});

describe("DeliveryView, falha ao atualizar não derruba o kanban (Run 6, leva 7)", () => {
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

// Rodada 4 — o botão existia desde f9fc34f abrindo "/cardapio" seco. Sem
// subdomínio no ar, a vitrine resolve o slug pelo fallback: o dono da Casa
// Coffee clicava e via a loja, a marca e os preços da GastroMundi (decisão 017).
describe("DeliveryView, a prévia abre a loja DESTE estabelecimento", () => {
  const tenantCom = (slug) => ({
    id: "t9",
    nome: "Casa Coffee",
    slug,
    tema: {},
    planoCodigo: "avancado",
    modulosDisponiveis: null,
    addonsAtivos: [],
  });

  /** window.open não navega no jsdom; o que interessa é a URL pedida. */
  const espiarOpen = () => vi.spyOn(window, "open").mockImplementation(() => null);

  const clicarNaPrevia = (user) =>
    user.click(screen.getByRole("button", { name: /ver cardápio do cliente/i }));

  it("leva o slug do tenant logado na URL da prévia", async () => {
    setAppMock({ tenant: tenantCom("casacoffee") });
    const abrir = espiarOpen();
    const user = userEvent.setup();
    await montar();

    await clicarNaPrevia(user);

    expect(abrir).toHaveBeenCalledWith("/cardapio?loja=casacoffee", "_blank", "noopener,noreferrer");
  });

  it("tenant sem slug continua abrindo a vitrine, o botão nunca deixa de funcionar", async () => {
    setAppMock({ tenant: tenantCom(null) });
    const abrir = espiarOpen();
    const user = userEvent.setup();
    await montar();

    await clicarNaPrevia(user);

    expect(abrir).toHaveBeenCalledWith("/cardapio", "_blank", "noopener,noreferrer");
  });

  it("slug fora do padrão vindo do banco sai codificado, sem quebrar a URL", async () => {
    setAppMock({ tenant: tenantCom("casa coffee&x=1") });
    const abrir = espiarOpen();
    const user = userEvent.setup();
    await montar();

    await clicarNaPrevia(user);

    expect(abrir).toHaveBeenCalledWith(
      "/cardapio?loja=casa%20coffee%26x%3D1",
      "_blank",
      "noopener,noreferrer",
    );
  });
});

/**
 * Apagar faixa de taxa: a lixeira gravava no banco no primeiro toque.
 *
 * Sem confirmação, sem desfazer e sem aviso. Um toque errado apaga a faixa do
 * bairro e, daquele segundo em diante, todo cliente daquele bairro lê "fora da
 * nossa área de entrega" na vitrine pública, sem ninguém no balcão perceber. A
 * mesma tela já confirmava em duas etapas no cartão de produto e num modal para
 * remover grupo de complementos; a faixa ficou de fora.
 */
describe("DeliveryView, apagar faixa de taxa pede confirmação", () => {
  const FAIXA = { uid: "f1", tipo: "bairro", bairro: "Centro", taxa: 5 };

  async function irParaEntregaComUmaFaixa() {
    carregarConfigDelivery.mockResolvedValue({
      data: { aberto: true, pedido_minimo: 0, tempo_preparo_min: 30, horario: {}, faixas_taxa: [FAIXA] },
      error: null,
    });
    setAppMock({ currentUser: { role: "admin", name: "Dona Ana", username: "ana" }, tenant: { id: "t1" } });
    await montar();
    await userEvent.click(screen.getByRole("button", { name: "Entrega e taxas" }));
    return screen.findByText("Centro, R$ 5,00");
  }

  it("o primeiro toque na lixeira pergunta, e não grava nada", async () => {
    await irParaEntregaComUmaFaixa();

    await userEvent.click(screen.getByRole("button", { name: /Apagar a faixa Centro/ }));

    expect(screen.getByText("Apagar esta faixa?")).toBeInTheDocument();
    expect(salvarConfigDelivery).not.toHaveBeenCalled();
    expect(screen.getByText("Centro, R$ 5,00")).toBeInTheDocument();
  });

  it("desistir mantém a faixa e continua sem gravar", async () => {
    await irParaEntregaComUmaFaixa();

    await userEvent.click(screen.getByRole("button", { name: /Apagar a faixa Centro/ }));
    await userEvent.click(screen.getByRole("button", { name: /Manter a faixa Centro/ }));

    expect(screen.queryByText("Apagar esta faixa?")).not.toBeInTheDocument();
    expect(salvarConfigDelivery).not.toHaveBeenCalled();
  });

  it("confirmar grava a configuração sem aquela faixa", async () => {
    salvarConfigDelivery.mockResolvedValue({
      data: { aberto: true, pedido_minimo: 0, tempo_preparo_min: 30, horario: {}, faixas_taxa: [] },
      error: null,
    });
    await irParaEntregaComUmaFaixa();

    await userEvent.click(screen.getByRole("button", { name: /Apagar a faixa Centro/ }));
    await userEvent.click(screen.getByRole("button", { name: "Sim, apagar" }));

    expect(salvarConfigDelivery).toHaveBeenCalledTimes(1);
    const [, proximo] = salvarConfigDelivery.mock.calls[0];
    expect(proximo.faixas_taxa).toEqual([]);
  });
});
