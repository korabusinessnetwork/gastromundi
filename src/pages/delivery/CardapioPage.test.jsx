// @vitest-environment jsdom
//
// Run 6, leva 1 — o caminho inteiro do pedido na vitrine pública, do
// cardápio até o "Confirmar pedido".
//
// Aqui o que se prova é a COMPOSIÇÃO (por isso as funções puras da camada
// de delivery ficam reais e só as RPCs viram dublê):
//
//  · quando o servidor recusa o pedido, o cliente VÊ o motivo — antes a
//    mensagem era desenhada atrás da folha de pagamento e o clique em
//    "Confirmar pedido" não produzia nenhum sinal na tela;
//  · a tentativa nova começa limpa — a mensagem da tentativa anterior
//    não fica na tela acusando um problema já resolvido;
//  · a taxa resolvida por bairro/CEP grava lat/lng nulos na tela, e o
//    payload não pode transformar esse nulo em 0,0 (meio do Atlântico);
//  · o troco digitado com vírgula chega ao servidor como número.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const SLUG = "resto";

const {
  mockCarregarCardapio,
  mockCalcularTaxa,
  mockViaCep,
  mockGeocodificar,
  mockEnviarPedido,
} = vi.hoisted(() => ({
  mockCarregarCardapio: vi.fn(),
  mockCalcularTaxa: vi.fn(),
  mockViaCep: vi.fn(),
  mockGeocodificar: vi.fn(),
  mockEnviarPedido: vi.fn(),
}));

vi.mock("@/lib/supabase", async () => {
  const { createMockSupabase } = await import("@/test/mockSupabase");
  return { supabase: createMockSupabase() };
});

// Só as idas ao servidor viram dublê. montarPayloadPedido, calcularTroco,
// valorDigitado, formatarPreco e o carrinho continuam REAIS — são eles que
// esta prova mede.
vi.mock("@/lib/delivery/delivery", async () => {
  const real = await vi.importActual("@/lib/delivery/delivery");
  return {
    ...real,
    carregarCardapio: mockCarregarCardapio,
    calcularTaxaEntrega: mockCalcularTaxa,
    buscarEnderecoViaCep: mockViaCep,
    geocodificarEndereco: mockGeocodificar,
    enviarPedido: mockEnviarPedido,
  };
});

vi.mock("@/lib/tenant/tenant", () => ({
  buscarBrandingPorSlug: vi.fn(() => Promise.resolve({ data: null, error: null })),
}));

vi.mock("@/lib/host/tenantSlug", () => ({
  slugDoSubdominio: () => SLUG,
  resolverSlugTenant: () => SLUG,
  // Vitrine no endereço da própria loja: o slug vem do subdomínio, não da query.
  slugDaVitrine: () => ({ slug: SLUG, origem: "subdominio" }),
}));

import CardapioPage from "./CardapioPage";

const CARDAPIO = {
  aberto: true,
  pedido_minimo: 0,
  tempo_preparo_min: 40,
  produtos: [
    { produto_id: 7, nome: "Pizza Calabresa", preco: 25, categoria: "Pizzas", grupos: [] },
  ],
  combos: [],
};

/** Uma linha na sacola, no formato que o useCarrinho persiste. */
const ITEM_NA_SACOLA = {
  _linha: "linha-1",
  produto_id: 7,
  nome: "Pizza Calabresa",
  preco: 25,
  qtd: 1,
  complementosEscolhidos: [],
  obs: "",
};

/** Deixa os timers correrem e as promessas assentarem. */
async function assentar(ms = 1500) {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
  await act(async () => {});
}

/**
 * Percorre sacola → entrega → pagamento como o cliente faz, com a taxa
 * resolvida por bairro/CEP (modo por área: sem geocodificação).
 */
async function irAtePagamento(user) {
  await user.click(screen.getByRole("button", { name: "Ver a sacola" }));
  await user.click(screen.getByRole("button", { name: /Ir para a entrega/ }));

  await user.type(screen.getByLabelText("Seu nome"), "Ana");
  await user.type(screen.getByLabelText("Endereço (rua, número)"), "Rua X, 10");
  await user.type(screen.getByLabelText("CEP"), "90000000");
  await assentar();

  await user.click(screen.getByRole("button", { name: "Ir para o pagamento" }));
}

const botaoConfirmar = () =>
  screen.getByRole("button", { name: /Confirmar pedido|Enviando pedido/ });

beforeEach(async () => {
  vi.clearAllMocks();
  sessionStorage.clear();
  sessionStorage.setItem(
    `kora.delivery.sacola.${SLUG}`,
    JSON.stringify([ITEM_NA_SACOLA])
  );
  mockCarregarCardapio.mockResolvedValue({ data: CARDAPIO, error: null });
  mockViaCep.mockResolvedValue({ data: null, error: null });
  mockGeocodificar.mockResolvedValue({ data: null, error: null });
  mockCalcularTaxa.mockResolvedValue({ data: { ok: true, taxa: 7.5 }, error: null });
  mockEnviarPedido.mockResolvedValue({ data: { ok: true, numero: "260730-001" }, error: null });
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
  sessionStorage.clear();
});

async function abrirVitrine() {
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  await act(async () => {
    render(<CardapioPage />);
  });
  return user;
}

describe("CardapioPage — recusa do servidor chega ao cliente (Run 6, leva 1)", () => {
  it("mostra o motivo da recusa dentro da folha de pagamento", async () => {
    // `code: "P0001"` é o SQLSTATE de todo `RAISE EXCEPTION` do plpgsql — é
    // assim que a recusa de propósito chega de verdade (ver leva 9, DL28).
    mockEnviarPedido.mockResolvedValue({
      data: null,
      error: { code: "P0001", message: "Endereço fora da área de entrega." },
    });

    const user = await abrirVitrine();
    await irAtePagamento(user);

    await user.click(screen.getByText("Pix na entrega"));
    await act(async () => {
      botaoConfirmar().click();
    });

    const aviso = screen.getByRole("alert");
    expect(aviso).toHaveTextContent("Endereço fora da área de entrega.");
    // Se estiver fora do painel, fica atrás do modal (position: fixed).
    expect(document.querySelector(".modal-painel").contains(aviso)).toBe(true);
    // E continua na tela de pagamento, pronta pra nova tentativa.
    expect(screen.getByText("Pagamento")).toBeInTheDocument();
    expect(botaoConfirmar()).toBeEnabled();
  });

  it("recusa sem mensagem ainda diz alguma coisa ao cliente", async () => {
    mockEnviarPedido.mockResolvedValue({ data: { ok: false }, error: null });

    const user = await abrirVitrine();
    await irAtePagamento(user);

    await user.click(screen.getByText("Pix na entrega"));
    await act(async () => {
      botaoConfirmar().click();
    });

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Não foi possível enviar o pedido. Tente novamente."
    );
  });

  it("a tentativa seguinte começa sem a mensagem da anterior", async () => {
    mockEnviarPedido.mockResolvedValue({
      data: null,
      error: { message: "Estabelecimento fechado para pedidos no momento." },
    });

    const user = await abrirVitrine();
    await irAtePagamento(user);

    await user.click(screen.getByText("Pix na entrega"));
    await act(async () => {
      botaoConfirmar().click();
    });
    expect(screen.getByRole("alert")).toBeInTheDocument();

    // Segunda tentativa: enquanto o servidor não responde, a tela não pode
    // seguir acusando o erro velho junto com o "Enviando pedido…".
    mockEnviarPedido.mockReturnValue(new Promise(() => {}));
    await act(async () => {
      botaoConfirmar().click();
    });

    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText("Enviando pedido…")).toBeInTheDocument();
  });

  it("pedido aceito leva o cliente para a confirmação, sem aviso de erro", async () => {
    const user = await abrirVitrine();
    await irAtePagamento(user);

    await user.click(screen.getByText("Pix na entrega"));
    await act(async () => {
      botaoConfirmar().click();
    });

    expect(screen.getByText(/260730-001/)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("CardapioPage — o que sai da tela para o servidor (Run 6, leva 1)", () => {
  it("taxa por bairro/CEP não inventa coordenada 0,0", async () => {
    const user = await abrirVitrine();
    await irAtePagamento(user);

    await user.click(screen.getByText("Pix na entrega"));
    await act(async () => {
      botaoConfirmar().click();
    });

    const [slug, payload] = mockEnviarPedido.mock.calls[0];
    expect(slug).toBe(SLUG);
    expect(payload.entrega).not.toHaveProperty("lat");
    expect(payload.entrega).not.toHaveProperty("lng");
    expect(payload.entrega.endereco).toBe("Rua X, 10");
    expect(payload.cliente.nome).toBe("Ana");
    expect(payload.itens).toEqual([
      { produto_id: 7, combo_id: null, qtd: 1, complementos: [], obs: null },
    ]);
  });

  it("no modo por distância a coordenada geocodificada vai junto", async () => {
    // 1ª chamada sem coordenada: o servidor pede a coordenada.
    mockCalcularTaxa
      .mockResolvedValueOnce({ data: { ok: false, motivo: "sem_coordenada" }, error: null })
      .mockResolvedValue({ data: { ok: true, taxa: 12, km: 3.4 }, error: null });
    mockGeocodificar.mockResolvedValue({
      data: { lat: -30.0346, lng: -51.2177 },
      error: null,
    });

    const user = await abrirVitrine();
    await irAtePagamento(user);

    await user.click(screen.getByText("Pix na entrega"));
    await act(async () => {
      botaoConfirmar().click();
    });

    const payload = mockEnviarPedido.mock.calls[0][1];
    expect(payload.entrega.lat).toBe(-30.0346);
    expect(payload.entrega.lng).toBe(-51.2177);
  });

  it("troco digitado com vírgula chega ao servidor como número", async () => {
    const user = await abrirVitrine();
    await irAtePagamento(user);

    await user.click(screen.getByText("Dinheiro"));
    await user.type(screen.getByLabelText(/Precisa de troco/), "50,00");

    // O total é 25,00 + 7,50 = 32,50 — a tela mostra o troco a levar.
    expect(screen.getByText("R$ 17,50")).toBeInTheDocument();

    await act(async () => {
      botaoConfirmar().click();
    });

    expect(mockEnviarPedido.mock.calls[0][1].pagamento).toEqual({
      forma: "dinheiro",
      troco_para: 50,
      levar_maquininha: false,
    });
  });
});

// Run 6, leva 3 — a sacola vive em sessionStorage, e o pedido aceito
// precisa levá-la embora NA HORA do aceite.
//
// Antes ela só era limpa no "Voltar ao cardápio". Quem fechava a aba (ou
// recarregava, ou o celular descartava a aba em segundo plano) na tela de
// sucesso reencontrava os mesmos itens na barra da sacola: a tela dizia
// "Ver sacola · 1" como se nada tivesse sido enviado. O cliente concluía
// que o pedido não tinha ido e mandava tudo de novo — pedido duplicado,
// entrega duplicada, cobrança duplicada, e o estabelecimento sem saber
// qual dos dois vale.
const chaveSacola = () => `kora.delivery.sacola.${SLUG}`;
const barraSacola = () => screen.queryByRole("button", { name: "Ver a sacola" });

async function pedirComSucesso(user) {
  await irAtePagamento(user);
  await user.click(screen.getByText("Pix na entrega"));
  await act(async () => {
    botaoConfirmar().click();
  });
}

describe("CardapioPage — a sacola morre no aceite do pedido (Run 6, leva 3)", () => {
  it("esvazia o armazenamento já com a confirmação aberta na tela", async () => {
    const user = await abrirVitrine();
    await pedirComSucesso(user);

    // A confirmação está na tela AGORA — e a sacola já foi embora.
    expect(screen.getByText(/260730-001/)).toBeInTheDocument();
    expect(JSON.parse(sessionStorage.getItem(chaveSacola()))).toEqual([]);
  });

  it("recarregar na tela de sucesso não ressuscita o pedido já enviado", async () => {
    const user = await abrirVitrine();
    await pedirComSucesso(user);

    // O cliente fecha a aba (ou recarrega) ainda olhando o "pedido
    // confirmado": o sessionStorage sobrevive, o estado do React não.
    cleanup();
    await abrirVitrine();

    expect(barraSacola()).toBeNull();
    expect(screen.getByText("Pizza Calabresa")).toBeInTheDocument();
  });

  it("o pedido recusado guarda a sacola inteira para a nova tentativa", async () => {
    mockEnviarPedido.mockResolvedValue({
      data: null,
      error: { message: "Endereço fora da área de entrega." },
    });

    const user = await abrirVitrine();
    await pedirComSucesso(user);

    expect(JSON.parse(sessionStorage.getItem(chaveSacola()))).toHaveLength(1);

    // E sobrevive ao recarregamento: o cliente corrige o endereço e reenvia
    // o mesmo pedido, sem remontar a sacola item por item.
    cleanup();
    await abrirVitrine();

    expect(barraSacola()).toBeInTheDocument();
    expect(barraSacola()).toHaveTextContent("R$ 25,00");
  });

  it("o 'Voltar ao cardápio' devolve o cardápio limpo, sem barra de sacola", async () => {
    const user = await abrirVitrine();
    await pedirComSucesso(user);

    await user.click(screen.getByRole("button", { name: "Voltar ao cardápio" }));

    expect(screen.queryByText(/260730-001/)).toBeNull();
    expect(barraSacola()).toBeNull();
    expect(screen.getByText("Pizza Calabresa")).toBeInTheDocument();
  });
});

// Run 6, leva 3 — a página é quem sabe se a loja está aberta, e precisa
// contar isso ao produto. Sem essa ligação, o modal se acha aberto: o item
// entra numa sacola que a tela nem desenha (a barra depende de `aberto`).
describe("CardapioPage — produto com a loja fechada (Run 6, leva 3)", () => {
  beforeEach(() => {
    sessionStorage.clear();
    mockCarregarCardapio.mockResolvedValue({
      data: { ...CARDAPIO, aberto: false },
      error: null,
    });
    Element.prototype.scrollIntoView = vi.fn();
  });

  it("o produto aberto fora do horário não deixa adicionar", async () => {
    const user = await abrirVitrine();

    expect(screen.getByText("Fechado no momento")).toBeInTheDocument();
    await user.click(screen.getByText("Pizza Calabresa"));

    const cta = document.querySelector(".modal-rodape .btn--primario");
    expect(cta).toHaveTextContent("Fechado no momento");
    expect(cta).toHaveAttribute("aria-disabled", "true");

    await user.click(cta);

    // Nada entrou: nem na sacola desenhada, nem na invisível.
    expect(barraSacola()).toBeNull();
    expect(JSON.parse(sessionStorage.getItem(chaveSacola()))).toEqual([]);
  });

  it("com a loja aberta o mesmo toque coloca o produto na sacola", async () => {
    mockCarregarCardapio.mockResolvedValue({ data: CARDAPIO, error: null });

    const user = await abrirVitrine();
    await user.click(screen.getByText("Pizza Calabresa"));

    const cta = document.querySelector(".modal-rodape .btn--primario");
    expect(cta).toHaveTextContent("Adicionar");

    await user.click(cta);

    expect(barraSacola()).toHaveTextContent("R$ 25,00");
  });
});

// ── Run 6, leva 4 ──────────────────────────────────────────────────
// A sacola guardada contra o cardápio de agora. A prova aqui é de
// FIAÇÃO: a página tem que conferir a sacola e contar o resultado ao
// SacolaModal. Sem isso, a função pura existe e não serve para nada — o
// cliente continua descobrindo tudo pela recusa seca do servidor.
describe("CardapioPage — sacola velha contra cardápio novo (Run 6, leva 4)", () => {
  it("produto que saiu do cardápio se identifica na sacola e trava o avanço", async () => {
    mockCarregarCardapio.mockResolvedValue({
      data: { ...CARDAPIO, produtos: [] },
      error: null,
    });

    const user = await abrirVitrine();
    await user.click(barraSacola());

    expect(screen.getByText(/Saiu do cardápio/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Ir para a entrega/ })).toBeDisabled();
  });

  it("com o item morto na sacola o pedido não chega nem a ser montado", async () => {
    mockCarregarCardapio.mockResolvedValue({
      data: { ...CARDAPIO, produtos: [] },
      error: null,
    });

    const user = await abrirVitrine();
    await user.click(barraSacola());
    await user.click(screen.getByRole("button", { name: /Ir para a entrega/ }));

    // Continua na sacola: a tela de entrega nunca abriu.
    expect(screen.getByText("Sua sacola")).toBeInTheDocument();
    expect(screen.queryByLabelText("Seu nome")).toBeNull();
    expect(mockEnviarPedido).not.toHaveBeenCalled();
  });

  it("remover o item morto libera o caminho — a saída é de verdade", async () => {
    sessionStorage.setItem(
      chaveSacola(),
      JSON.stringify([
        ITEM_NA_SACOLA,
        { ...ITEM_NA_SACOLA, _linha: "linha-2", produto_id: 99, nome: "Pizza Aposentada" },
      ])
    );

    const user = await abrirVitrine();
    await user.click(barraSacola());

    const avancar = () => screen.getByRole("button", { name: /Ir para a entrega/ });
    expect(avancar()).toBeDisabled();

    const remover = screen.getAllByRole("button", { name: "Remover" });
    await user.click(remover[1]);

    expect(screen.queryByText("Pizza Aposentada")).toBeNull();
    expect(avancar()).toBeEnabled();
  });

  it("preço que o dono mudou aparece na barra, na sacola e no total a pagar", async () => {
    mockCarregarCardapio.mockResolvedValue({
      data: {
        ...CARDAPIO,
        produtos: [{ ...CARDAPIO.produtos[0], preco: 30 }],
      },
      error: null,
    });

    const user = await abrirVitrine();

    // A barra fixa já mostra o preço de agora, não o de quando escolheu.
    expect(barraSacola()).toHaveTextContent("R$ 30,00");

    await user.click(barraSacola());
    // O selo na linha (qual item mudou) e o aviso no rodapé (o que isso
    // significa) são duas fiações diferentes — as duas têm que chegar.
    expect(screen.getByText(/Preço atualizado pelo estabelecimento/)).toBeInTheDocument();
    expect(screen.getByText(/O preço de um item mudou desde que você escolheu/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Ir para a entrega/ })).toHaveTextContent(
      "R$ 30,00"
    );

    await user.click(screen.getByRole("button", { name: /Ir para a entrega/ }));
    await user.type(screen.getByLabelText("Seu nome"), "Ana");
    await user.type(screen.getByLabelText("Endereço (rua, número)"), "Rua X, 10");
    await user.type(screen.getByLabelText("CEP"), "90000000");
    await assentar();
    await user.click(screen.getByRole("button", { name: "Ir para o pagamento" }));

    // 30,00 do item + 7,50 de taxa — o valor que o servidor vai cobrar.
    expect(botaoConfirmar()).toHaveTextContent("R$ 37,50");
  });

  it("cardápio que não carregou não acusa a sacola de nada", async () => {
    // Falha de rede nossa não pode dizer ao cliente que a sacola dele
    // sumiu. Sem cardápio a página inteira já é um estado de erro; o que
    // se prova aqui é que a sacola sobrevive intacta no armazenamento.
    mockCarregarCardapio.mockResolvedValue({ data: null, error: { message: "rede" } });

    await abrirVitrine();

    expect(screen.getByText(/Não conseguimos carregar o cardápio/)).toBeInTheDocument();
    expect(JSON.parse(sessionStorage.getItem(chaveSacola()))).toHaveLength(1);
  });
});

describe("CardapioPage — jargão técnico não chega ao cliente (Run 6, leva 9)", () => {
  /** Vai até o pagamento e confirma, devolvendo o texto do aviso na tela. */
  async function confirmarEler(user) {
    await irAtePagamento(user);
    await user.click(screen.getByText("Pix na entrega"));
    await act(async () => {
      botaoConfirmar().click();
    });
    return screen.getByRole("alert").textContent;
  }

  it("falha de rede não mostra 'TypeError: Failed to fetch'", async () => {
    // O catch do enviarPedido repassa a mensagem do throw, sem código.
    mockEnviarPedido.mockResolvedValue({
      data: null,
      error: { message: "TypeError: Failed to fetch" },
    });

    const user = await abrirVitrine();
    const aviso = await confirmarEler(user);

    expect(aviso).not.toMatch(/TypeError|fetch/i);
    expect(aviso).toBe("Não foi possível enviar o pedido. Tente novamente.");
  });

  it("função fora do cache do PostgREST não vaza o nome da RPC", async () => {
    mockEnviarPedido.mockResolvedValue({
      data: null,
      error: {
        code: "PGRST202",
        message:
          "Could not find the function public.criar_pedido_delivery(p_payload, p_slug) in the schema cache",
      },
    });

    const user = await abrirVitrine();
    const aviso = await confirmarEler(user);

    expect(aviso).not.toMatch(/criar_pedido_delivery|schema cache|public\./i);
    expect(aviso).toBe("Não foi possível enviar o pedido. Tente novamente.");
  });

  it("violação de RLS não expõe o nome da tabela ao cliente anônimo", async () => {
    mockEnviarPedido.mockResolvedValue({
      data: null,
      error: {
        code: "42501",
        message:
          'new row violates row-level security policy for table "delivery_pedidos"',
      },
    });

    const user = await abrirVitrine();
    const aviso = await confirmarEler(user);

    expect(aviso).not.toMatch(/delivery_pedidos|row-level|policy/i);
  });

  it("a recusa escrita pelo servidor continua chegando inteira", async () => {
    mockEnviarPedido.mockResolvedValue({
      data: null,
      error: {
        code: "23514",
        message: "Muitos pedidos em sequência. Aguarde um instante e tente de novo.",
      },
    });

    const user = await abrirVitrine();
    const aviso = await confirmarEler(user);

    expect(aviso).toBe(
      "Muitos pedidos em sequência. Aguarde um instante e tente de novo."
    );
  });

  it("depois do erro técnico a sacola e o caminho de nova tentativa seguem de pé", async () => {
    mockEnviarPedido.mockResolvedValue({
      data: null,
      error: { code: "57014", message: "canceling statement due to statement timeout" },
    });

    const user = await abrirVitrine();
    await confirmarEler(user);

    // Trocar a mensagem não pode custar o pedido: continua no pagamento, com
    // o botão vivo e a sacola intacta.
    expect(screen.getByText("Pagamento")).toBeInTheDocument();
    expect(botaoConfirmar()).toBeEnabled();
    expect(JSON.parse(sessionStorage.getItem(`kora.delivery.sacola.${SLUG}`))).toHaveLength(1);
  });
});

describe("CardapioPage — a vitrine que não carregou tem saída (Run 6, leva 10)", () => {
  /** Rede oscilando: o carregarCardapio devolve erro sem código. */
  const FALHA = { data: null, error: { message: "Failed to fetch" } };

  it("falha de carregamento oferece 'Tentar de novo', e a segunda tentativa entra", async () => {
    mockCarregarCardapio.mockResolvedValueOnce(FALHA);

    const user = await abrirVitrine();

    expect(
      screen.getByText(
        "Não conseguimos carregar o cardápio agora. Tente novamente em instantes."
      )
    ).toBeInTheDocument();
    expect(mockCarregarCardapio).toHaveBeenCalledTimes(1);

    // O beforeEach deixou o mock devolvendo o cardápio bom — é o que a rede
    // devolve quando volta. Sem o botão, a única saída daqui era recarregar
    // o navegador, na porta de entrada do estabelecimento.
    await user.click(screen.getByRole("button", { name: "Tentar de novo" }));
    await assentar();

    expect(mockCarregarCardapio).toHaveBeenCalledTimes(2);
    expect(screen.getByText("Pizza Calabresa")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Tentar de novo" })).toBeNull();
    // E a sacola que o cliente já tinha montado atravessou a falha inteira.
    expect(screen.getByRole("button", { name: "Ver a sacola" })).toBeInTheDocument();
  });

  it("uma segunda falha mantém a saída na tela, e o botão continua valendo", async () => {
    mockCarregarCardapio.mockResolvedValue(FALHA);

    const user = await abrirVitrine();
    await user.click(screen.getByRole("button", { name: "Tentar de novo" }));
    await assentar();

    expect(mockCarregarCardapio).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("button", { name: "Tentar de novo" })).toBeInTheDocument();

    // Conexão ruim não falha uma vez só: o botão tem que valer sempre, não
    // apenas no primeiro toque.
    await user.click(screen.getByRole("button", { name: "Tentar de novo" }));
    await assentar();

    expect(mockCarregarCardapio).toHaveBeenCalledTimes(3);
    expect(screen.getByRole("button", { name: "Tentar de novo" })).toBeInTheDocument();
  });

  it("enquanto a nova tentativa corre, a tela diz que está carregando", async () => {
    let liberar;
    mockCarregarCardapio
      .mockResolvedValueOnce(FALHA)
      .mockReturnValueOnce(
        new Promise((resolver) => {
          liberar = resolver;
        })
      );

    const user = await abrirVitrine();
    await user.click(screen.getByRole("button", { name: "Tentar de novo" }));

    // Sem sinal de que a tentativa está correndo o cliente toca de novo, e
    // de novo — o botão precisa sair do caminho enquanto a rede responde.
    expect(screen.getByText("Carregando o cardápio…")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Tentar de novo" })).toBeNull();

    await act(async () => {
      liberar({ data: CARDAPIO, error: null });
    });

    expect(screen.getByText("Pizza Calabresa")).toBeInTheDocument();
  });

  it("endereço sem delivery não oferece um botão que não resolveria nada", async () => {
    // RPC devolvendo NULL: o slug não atende delivery (inclusive depois do
    // gate de plano do DL30). Tentar de novo daria exatamente o mesmo nada,
    // e um botão que não resolve é pior que botão nenhum.
    mockCarregarCardapio.mockResolvedValue({ data: null, error: null });

    await abrirVitrine();

    expect(
      screen.getByText(/Este endereço ainda não tem delivery disponível/)
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Tentar de novo" })).toBeNull();
  });
});
