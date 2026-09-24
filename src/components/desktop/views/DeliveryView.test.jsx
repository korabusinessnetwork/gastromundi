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

const {
  usePedidosDelivery, listarProdutosDelivery, carregarConfigDelivery, salvarProdutoDelivery,
  listarBibliotecaGrupos, vincularGrupoProduto, desvincularGrupoProduto,
} = vi.hoisted(() => ({
  usePedidosDelivery: vi.fn(),
  listarProdutosDelivery: vi.fn(),
  carregarConfigDelivery: vi.fn(),
  salvarProdutoDelivery: vi.fn(),
  listarBibliotecaGrupos: vi.fn(),
  vincularGrupoProduto: vi.fn(),
  desvincularGrupoProduto: vi.fn(),
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
  salvarProdutoDelivery,
  listarBibliotecaGrupos,
  vincularGrupoProduto,
  desvincularGrupoProduto,
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
  salvarProdutoDelivery.mockResolvedValue({ data: null, error: null });
  listarBibliotecaGrupos.mockResolvedValue({ data: [], error: null });
  vincularGrupoProduto.mockResolvedValue({ error: null });
  desvincularGrupoProduto.mockResolvedValue({ error: null });
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

describe("DeliveryView, tirar um item do ar é um clique na grade", () => {
  // Tirar do ar é a coisa mais frequente do dia (acabou o ingrediente).
  // Ficava dentro do "Editar": abrir modal, achar a chave, salvar, fechar.
  // Pior, lá dentro era rascunho — só valia depois do "Salvar".
  const ITEM = {
    id: "pd1",
    produto_id: 7,
    disponivel: true,
    ordem: 0,
    descricao: "Pão, hambúrguer e queijo",
    foto_url: null,
    produto: { id: 7, name: "X-Burguer", price: 30, emoji: "🍔" },
  };

  // O nome e o preço do card vêm do catálogo do PDV (AppContext), não da
  // linha de produto_delivery — ela só guarda a camada de delivery.
  const irParaCardapio = async (user, item = ITEM) => {
    setAppMock({ products: [{ id: 7, name: "X-Burguer", price: 30, emoji: "🍔", category: "Lanches" }] });
    listarProdutosDelivery.mockResolvedValue({ data: [item], error: null });
    await montar();
    await user.click(screen.getByRole("button", { name: /^Cardápio/ }));
    return screen.findByText("X-Burguer");
  };

  const chave = () => screen.getByRole("switch", { name: /Oferecer X-Burguer no cardápio online/ });

  it("o botão está na grade, sem abrir nada", async () => {
    const user = userEvent.setup();
    await irParaCardapio(user);
    expect(chave()).toHaveAttribute("aria-checked", "true");
    // No card a chave é só trilho e bolinha (o nome do produto precisa da
    // largura), então o estado por extenso vive no title — é o que o dono
    // lê ao passar o mouse e o que o leitor de tela anuncia.
    expect(chave()).toHaveAttribute("title", expect.stringMatching(/Está no cardápio online/));
  });

  it("um clique grava a virada na hora, sem passar pelo Salvar", async () => {
    const user = userEvent.setup();
    await irParaCardapio(user);
    await user.click(chave());

    expect(salvarProdutoDelivery).toHaveBeenCalledTimes(1);
    expect(salvarProdutoDelivery.mock.calls[0][0]).toMatchObject({
      id: "pd1", produto_id: 7, disponivel: false,
    });
  });

  it("item fora do ar aparece com a chave desligada", async () => {
    const user = userEvent.setup();
    await irParaCardapio(user, { ...ITEM, disponivel: false });
    expect(chave()).toHaveAttribute("aria-checked", "false");
    expect(chave()).toHaveAttribute("title", expect.stringMatching(/Fora do cardápio online/));
  });

  it("a chave não existe mais dentro do Editar", async () => {
    const user = userEvent.setup();
    await irParaCardapio(user);
    await user.click(screen.getByRole("button", { name: /Editar/ }));
    await screen.findByText("Editar produto do delivery");
    expect(screen.queryByText("Disponível no cardápio")).toBeNull();
  });

  it("salvar o Editar preserva o indisponível marcado na grade", async () => {
    // O payload de salvarProdutoDelivery é a linha INTEIRA. Se o modal
    // deixasse de mandar `disponivel`, ou mandasse um padrão, editar a
    // descrição devolveria ao ar um item que o dono acabou de tirar.
    const user = userEvent.setup();
    await irParaCardapio(user, { ...ITEM, disponivel: false });
    await user.click(screen.getByRole("button", { name: /Editar/ }));
    await screen.findByText("Editar produto do delivery");
    await user.click(screen.getByRole("button", { name: /^Salvar/ }));

    expect(salvarProdutoDelivery.mock.calls.at(-1)[0]).toMatchObject({ disponivel: false });
  });
});

describe("DeliveryView, extras na própria tela do produto", () => {
  // Criar o produto e dar extras a ele eram duas viagens: salvava, ia na
  // aba Complementos, abria cada grupo e marcava o produto na lista
  // "aparece nestes produtos".
  const PRODUTO = { id: 7, name: "X-Burguer", price: 30, emoji: "🍔", category: "Lanches" };
  const ITEM = {
    id: "pd1", produto_id: 7, disponivel: true, ordem: 0,
    descricao: "", foto_url: null,
    produto: PRODUTO,
  };
  const GRUPOS = [
    { id: "g1", nome: "Adicionais", min_escolhas: 0, max_escolhas: 3, itens: [{}, {}], produtoIds: [7] },
    { id: "g2", nome: "Ponto da carne", min_escolhas: 1, max_escolhas: 1, itens: [{}], produtoIds: [] },
  ];

  const abrirEdicao = async (user, grupos = GRUPOS) => {
    setAppMock({ products: [PRODUTO] });
    listarProdutosDelivery.mockResolvedValue({ data: [ITEM], error: null });
    listarBibliotecaGrupos.mockResolvedValue({ data: grupos, error: null });
    await montar();
    await user.click(screen.getByRole("button", { name: /^Cardápio/ }));
    await user.click(await screen.findByRole("button", { name: /Editar/ }));
    await screen.findByText("Extras deste produto");
  };

  const marcar = (nome) => screen.getByRole("checkbox", { name: new RegExp(nome) });

  it("mostra a biblioteca com o que já está ligado neste produto marcado", async () => {
    const user = userEvent.setup();
    await abrirEdicao(user);
    expect(marcar("Adicionais")).toBeChecked();
    expect(marcar("Ponto da carne")).not.toBeChecked();
  });

  it("salvar aplica só a DIFERENÇA, não regrava tudo", async () => {
    // Apagar e regravar mexeria em vínculos que esta tela nem mostrou, e
    // cada escrita a mais é uma chance de falhar no meio.
    const user = userEvent.setup();
    await abrirEdicao(user);

    await user.click(marcar("Ponto da carne")); // liga
    await user.click(marcar("Adicionais"));     // desliga
    await user.click(screen.getByRole("button", { name: /^Salvar/ }));

    expect(vincularGrupoProduto.mock.calls).toEqual([["g2", 7]]);
    expect(desvincularGrupoProduto.mock.calls).toEqual([["g1", 7]]);
  });

  it("sem mexer nos extras, nenhuma escrita de vínculo acontece", async () => {
    const user = userEvent.setup();
    await abrirEdicao(user);
    await user.click(screen.getByRole("button", { name: /^Salvar/ }));

    expect(vincularGrupoProduto).not.toHaveBeenCalled();
    expect(desvincularGrupoProduto).not.toHaveBeenCalled();
  });

  it("falha ao ligar o extra não engole o produto que já foi salvo", async () => {
    const user = userEvent.setup();
    vincularGrupoProduto.mockResolvedValue({ error: { message: "RLS" } });
    await abrirEdicao(user);

    await user.click(marcar("Ponto da carne"));
    await user.click(screen.getByRole("button", { name: /^Salvar/ }));

    expect(salvarProdutoDelivery).toHaveBeenCalled();
    expect(await screen.findByText(/O produto foi salvo, mas não deu para ajustar os extras/))
      .toBeInTheDocument();
  });

  it("biblioteca vazia mostra a seção mesmo assim, com o caminho para criar", async () => {
    // Antes a seção sumia por inteiro quando não havia grupo nenhum — e
    // quem cadastra o PRIMEIRO produto do delivery é exatamente quem está
    // nessa situação. Ele não via nem que extras existiam, e tinha de
    // descobrir sozinho a aba Complementos, criar lá e voltar.
    const user = userEvent.setup();
    setAppMock({ products: [PRODUTO] });
    listarProdutosDelivery.mockResolvedValue({ data: [ITEM], error: null });
    listarBibliotecaGrupos.mockResolvedValue({ data: [], error: null });
    await montar();
    await user.click(screen.getByRole("button", { name: /^Cardápio/ }));
    await user.click(await screen.findByRole("button", { name: /Editar/ }));
    await screen.findByText("Editar produto do delivery");

    expect(screen.getByText("Extras deste produto")).toBeInTheDocument();
    expect(screen.getByText(/Nenhum grupo de extras ainda/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Criar grupo de extras/ })).toBeInTheDocument();
  });

  it("dá para criar o grupo sem sair da tela de produto", async () => {
    const user = userEvent.setup();
    setAppMock({ products: [PRODUTO] });
    listarProdutosDelivery.mockResolvedValue({ data: [ITEM], error: null });
    listarBibliotecaGrupos.mockResolvedValue({ data: [], error: null });
    await montar();
    await user.click(screen.getByRole("button", { name: /^Cardápio/ }));
    await user.click(await screen.findByRole("button", { name: /Editar/ }));
    await screen.findByText("Editar produto do delivery");

    await user.click(screen.getByRole("button", { name: /Criar grupo de extras/ }));

    expect(screen.getByText("Novo grupo de extras")).toBeInTheDocument();
    // Botão desabilitado até haver nome e ao menos uma opção: prevenir o
    // erro em vez de avisar depois (princípio nº 1).
    expect(screen.getByRole("button", { name: /^Criar grupo$/ })).toBeDisabled();
  });

  it("falha ao carregar a biblioteca não trava o cadastro do produto", async () => {
    // Aqui a seção segue escondida de propósito, e a diferença importa:
    // biblioteca VAZIA é "ainda não existe grupo" (dá para criar um);
    // biblioteca que FALHOU é "não sei o que existe", e oferecer criar
    // levaria o dono a duplicar um grupo que ele já tem.
    const user = userEvent.setup();
    setAppMock({ products: [PRODUTO] });
    listarProdutosDelivery.mockResolvedValue({ data: [ITEM], error: null });
    listarBibliotecaGrupos.mockResolvedValue({ data: null, error: { message: "sem rede" } });
    await montar();
    await user.click(screen.getByRole("button", { name: /^Cardápio/ }));
    await user.click(await screen.findByRole("button", { name: /Editar/ }));

    await screen.findByText("Editar produto do delivery");
    expect(screen.queryByText("Extras deste produto")).toBeNull();
    expect(screen.getByRole("button", { name: /^Salvar/ })).toBeEnabled();
  });
});
