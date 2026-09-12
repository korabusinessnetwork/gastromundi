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

const { usePedidosDelivery, listarProdutosDelivery, carregarConfigDelivery, salvarConfigDelivery, carregarItensPedido, atualizarStatusPedido } = vi.hoisted(() => ({
  usePedidosDelivery: vi.fn(),
  listarProdutosDelivery: vi.fn(),
  carregarConfigDelivery: vi.fn(),
  salvarConfigDelivery: vi.fn(),
  carregarItensPedido: vi.fn(),
  atualizarStatusPedido: vi.fn(),
}));

// `carregarItensPedido` mora na lib de pedidos, não na de administração.
vi.mock("@/lib/deliveryPedidos", async (importOriginal) => ({
  ...(await importOriginal()),
  carregarItensPedido,
  atualizarStatusPedido,
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
  atualizarStatusPedido.mockResolvedValue({ data: { id: "p1" }, error: null });
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

/**
 * "Ver itens" do pedido: falha de leitura aparecia como pedido vazio.
 *
 * `carregarItensPedido` devolve `{ data: [], error }` em qualquer falha, e o
 * desktop descartava o erro: a tela escrevia "Sem itens detalhados." e, como
 * `itens` deixava de ser nulo, fechar e abrir o cartão não tentava de novo. A
 * mentira ficava colada até recarregar a página. O módulo do celular já havia
 * corrigido isso, e o comentário de lá diz o prejuízo: o entregador saía sem a
 * comida certa.
 */
describe("DeliveryView, falha ao carregar os itens do pedido", () => {
  beforeEach(() => {
    setAppMock({ currentUser: { role: "admin", name: "Dona Ana", username: "ana" }, tenant: { id: "t1" } });
  });

  // O rótulo alterna entre "Ver itens" e "Ocultar itens".
  const alternarItens = () =>
    userEvent.click(screen.getByRole("button", { name: /(ver|ocultar) itens/i }));

  it("diz que não deu para carregar, em vez de afirmar que o pedido está vazio", async () => {
    carregarItensPedido.mockResolvedValue({ data: [], error: FALHA });
    await montar();

    await alternarItens();

    expect(await screen.findByRole("alert")).toHaveTextContent(/não deu para carregar os itens/i);
    expect(screen.queryByText("Sem itens detalhados.")).not.toBeInTheDocument();
  });

  it("fechar e abrir tenta de novo, e o pedido mostra os itens", async () => {
    carregarItensPedido.mockResolvedValueOnce({ data: [], error: FALHA });
    await montar();
    await alternarItens();
    await screen.findByRole("alert");

    carregarItensPedido.mockResolvedValueOnce({
      data: [{ id: "i1", qtd: 2, nome: "Pastel de queijo", obs: "" }],
      error: null,
    });
    await alternarItens(); // fecha
    await alternarItens(); // abre de novo

    expect(carregarItensPedido).toHaveBeenCalledTimes(2);
    expect(await screen.findByText(/Pastel de queijo/)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("pedido de fato sem itens continua dizendo que não há itens detalhados", async () => {
    carregarItensPedido.mockResolvedValue({ data: [], error: null });
    await montar();

    await alternarItens();

    expect(await screen.findByText("Sem itens detalhados.")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

/**
 * D03, avançar e cancelar não tinham estado de "em andamento".
 *
 * Entre o clique em "Aceitar e preparar" e o fim do recarregar(), o botão
 * seguia clicável e com o mesmo rótulo: nada dizia que o toque pegou, o que
 * convida ao clique duplo e a uma segunda gravação. O módulo do celular já
 * controlava isso por pedido (DeliveryModulo.jsx, `processando`).
 */
describe("DeliveryView, avançar e cancelar mostram que estão em andamento (D03)", () => {
  beforeEach(() => {
    setAppMock({ currentUser: { role: "admin", name: "Dona Ana", username: "ana" }, tenant: { id: "t1" } });
  });

  /** Deixa a gravação pendurada até o teste soltar. */
  function gravacaoPendurada() {
    let soltar;
    atualizarStatusPedido.mockImplementation(
      () => new Promise((resolve) => { soltar = () => resolve({ data: { id: "p1" }, error: null }); }),
    );
    return () => soltar();
  }

  it("durante a gravação o botão fica desabilitado e diz que está salvando", async () => {
    const soltar = gravacaoPendurada();
    const user = userEvent.setup();
    await montar();

    await user.click(screen.getByRole("button", { name: "Aceitar e preparar" }));

    const emAndamento = await screen.findByRole("button", { name: "Salvando…" });
    expect(emAndamento).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Aceitar e preparar" })).not.toBeInTheDocument();

    soltar();
    await screen.findByRole("button", { name: "Aceitar e preparar" });
  });

  it("o segundo clique não dispara segunda gravação", async () => {
    const soltar = gravacaoPendurada();
    const user = userEvent.setup();
    await montar();

    const botao = screen.getByRole("button", { name: "Aceitar e preparar" });
    await user.click(botao);
    await user.click(botao);

    expect(atualizarStatusPedido).toHaveBeenCalledTimes(1);

    soltar();
    await screen.findByRole("button", { name: "Aceitar e preparar" });
  });

  it("cancelar também mostra em andamento e não grava duas vezes", async () => {
    const soltar = gravacaoPendurada();
    const user = userEvent.setup();
    await montar();

    await user.click(screen.getByRole("button", { name: "Cancelar este pedido" }));
    const confirmar = screen.getByRole("button", { name: "Cancelar mesmo" });
    await user.click(confirmar);
    await user.click(confirmar);

    expect(atualizarStatusPedido).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole("button", { name: "Cancelando…" })).toBeDisabled();

    soltar();
    await screen.findByRole("button", { name: "Aceitar e preparar" });
  });

  it("em andamento é por pedido, não trava a tela inteira", async () => {
    const soltar = gravacaoPendurada();
    semErro([
      PEDIDO,
      { ...PEDIDO, id: "p2", numero: 43, cliente_nome: "Bruno" },
    ]);
    const user = userEvent.setup();
    // `montar()` espera o resumo no singular, que não bate com dois pedidos.
    render(<DeliveryView notify={vi.fn()} />);
    const botoes = await screen.findAllByRole("button", { name: "Aceitar e preparar" });
    await user.click(botoes[0]);

    expect(await screen.findByRole("button", { name: "Salvando…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Aceitar e preparar" })).toBeEnabled();

    soltar();
    await screen.findAllByRole("button", { name: "Aceitar e preparar" });
  });
});

/**
 * D04, onBlur gravava mesmo sem alteração nenhuma.
 *
 * "Pedido mínimo" e "Tempo de preparo" salvam no onBlur sem comparar com o
 * valor anterior: passar o foco pelo campo e sair, sem digitar nada, fazia
 * upsert em config_delivery, escrevia "Configurações de entrega atualizadas"
 * no activity_log e mostrava "Configurações salvas." ao operador. A trilha de
 * auditoria ganhava alterações que não existiram.
 */
describe("DeliveryView, sair do campo sem mudar nada não grava (D04)", () => {
  const campo = (rotulo) => screen.getByText(rotulo).parentElement.querySelector("input");

  async function irParaEntrega() {
    setAppMock({ currentUser: { role: "admin", name: "Dona Ana", username: "ana" }, tenant: { id: "t1" } });
    await montar();
    await userEvent.click(screen.getByRole("button", { name: "Entrega e taxas" }));
    return screen.findByText("Pedido mínimo (R$)");
  }

  it("foco e saída, sem digitar, não chama o banco nem diz que salvou", async () => {
    const user = userEvent.setup();
    await irParaEntrega();

    await user.click(campo("Pedido mínimo (R$)"));
    await user.tab();

    expect(salvarConfigDelivery).not.toHaveBeenCalled();
    expect(screen.queryByText("Configurações salvas.")).not.toBeInTheDocument();
  });

  it("o mesmo vale para o tempo de preparo", async () => {
    const user = userEvent.setup();
    await irParaEntrega();

    await user.click(campo("Tempo de preparo (min)"));
    await user.tab();

    expect(salvarConfigDelivery).not.toHaveBeenCalled();
  });

  it("mudar o valor e sair continua gravando", async () => {
    salvarConfigDelivery.mockResolvedValue({
      data: { aberto: true, pedido_minimo: 25, tempo_preparo_min: 30, horario: {}, faixas_taxa: [] },
      error: null,
    });
    const user = userEvent.setup();
    await irParaEntrega();

    const input = campo("Pedido mínimo (R$)");
    await user.clear(input);
    await user.type(input, "25");
    await user.tab();

    expect(salvarConfigDelivery).toHaveBeenCalledTimes(1);
    const [, alvo] = salvarConfigDelivery.mock.calls[0];
    expect(Number(alvo.pedido_minimo)).toBe(25);
  });

  it("gravou uma vez, sair do campo de novo sem mudar nada não grava outra", async () => {
    salvarConfigDelivery.mockResolvedValue({
      data: { aberto: true, pedido_minimo: 25, tempo_preparo_min: 30, horario: {}, faixas_taxa: [] },
      error: null,
    });
    const user = userEvent.setup();
    await irParaEntrega();

    const input = campo("Pedido mínimo (R$)");
    await user.clear(input);
    await user.type(input, "25");
    await user.tab();
    expect(salvarConfigDelivery).toHaveBeenCalledTimes(1);

    await user.click(campo("Pedido mínimo (R$)"));
    await user.tab();

    expect(salvarConfigDelivery).toHaveBeenCalledTimes(1);
  });
});

/**
 * D05, a grade do Cardápio não tinha busca nem filtro.
 *
 * `itens.map(...)` direto: para trocar a foto de um item o dono rolava a grade
 * inteira, e não havia como saber quantos produtos estavam fora do ar no
 * cardápio online. O helper `filtrarItensDelivery` já existia e já era usado
 * nesta mesma tela, no seletor de produtos do editor de grupo.
 */
describe("DeliveryView, busca e atalho de indisponíveis no Cardápio (D05)", () => {
  const PRODUTOS = [
    { id: "pr1", name: "Pastel de queijo", price: 10, emoji: "🥟", category: "Salgados" },
    { id: "pr2", name: "Açaí 500ml", price: 20, emoji: "🍧", category: "Doces" },
    { id: "pr3", name: "Coxinha", price: 8, emoji: "🍗", category: "Salgados" },
  ];
  const LINHAS = [
    { id: "l1", produto_id: "pr1", foto_url: null, descricao: null, disponivel: true, ordem: 0 },
    { id: "l2", produto_id: "pr2", foto_url: null, descricao: null, disponivel: false, ordem: 1 },
    { id: "l3", produto_id: "pr3", foto_url: null, descricao: null, disponivel: false, ordem: 2 },
  ];

  async function irParaCardapio() {
    setAppMock({
      currentUser: { role: "admin", name: "Dona Ana", username: "ana" },
      tenant: { id: "t1" },
      products: PRODUTOS,
    });
    listarProdutosDelivery.mockResolvedValue({ data: LINHAS, error: null });
    await montar();
    await userEvent.click(screen.getByRole("button", { name: "Cardápio" }));
    return screen.findByText("Pastel de queijo");
  }

  it("a busca deixa na grade só o produto procurado", async () => {
    const user = userEvent.setup();
    await irParaCardapio();

    await user.type(screen.getByRole("searchbox", { name: /buscar produto pelo nome/i }), "acai");

    expect(await screen.findByText("Açaí 500ml")).toBeInTheDocument();
    expect(screen.queryByText("Pastel de queijo")).not.toBeInTheDocument();
    expect(screen.queryByText("Coxinha")).not.toBeInTheDocument();
  });

  it("o atalho mostra a contagem de indisponíveis e filtra por ela", async () => {
    const user = userEvent.setup();
    await irParaCardapio();

    const atalho = screen.getByRole("button", { name: "Só indisponíveis (2)" });
    await user.click(atalho);

    expect(atalho).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Açaí 500ml")).toBeInTheDocument();
    expect(screen.getByText("Coxinha")).toBeInTheDocument();
    expect(screen.queryByText("Pastel de queijo")).not.toBeInTheDocument();
  });

  it("busca sem resultado explica o que fazer e limpa os filtros", async () => {
    const user = userEvent.setup();
    await irParaCardapio();

    await user.type(screen.getByRole("searchbox", { name: /buscar produto pelo nome/i }), "lasanha");

    expect(await screen.findByText("Nenhum produto com esse filtro")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Limpar filtros" }));

    expect(await screen.findByText("Pastel de queijo")).toBeInTheDocument();
    expect(screen.getByText("Açaí 500ml")).toBeInTheDocument();
  });
});

// D06 — a aba fica aberta 24 horas e atravessa a meia-noite. O recorte das
// colunas terminais tem de ser o TURNO (abertura do caixa), então a tela
// precisa entregar `sessaoAbertaEm` ao hook. Sem isso o pedido entregue às
// 23h50 saía da coluna "Entregue" sozinho, na primeira atualização depois da
// meia-noite, com o contador caindo a zero no meio do movimento.
describe("DeliveryView entrega a abertura do caixa ao hook de pedidos (D06)", () => {
  it("com caixa aberto, o hook recebe sessaoAbertaEm", async () => {
    const abertura = "2026-09-11T21:00:00.000Z";
    setAppMock({ sessaoAbertaEm: abertura });
    semErro();
    await montar();

    expect(usePedidosDelivery).toHaveBeenCalledWith(
      expect.objectContaining({ sessaoAbertaEm: abertura }),
    );
  });

  it("sem caixa aberto, o hook recebe sessão nula e o recorte cai no dia", async () => {
    setAppMock({ sessaoAbertaEm: null });
    semErro();
    await montar();

    expect(usePedidosDelivery).toHaveBeenCalledWith(
      expect.objectContaining({ sessaoAbertaEm: null }),
    );
  });
});
