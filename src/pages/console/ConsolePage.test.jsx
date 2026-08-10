// @vitest-environment jsdom
//
// R7L2 — o Console mentia quando uma das duas leituras secundárias falhava.
//
// `listarPlanos` e `listarAssinaturas` nunca lançam: em caso de erro devolvem
// `{ data: [], error }`. O `carregar()` descartava os dois `error`, e lista
// vazia é indistinguível de "não tem nenhum". Consequência: uma falha na
// leitura da cobrança fazia a aba "Planos e assinaturas" afirmar receita
// mensal R$ 0,00, base ativa 0 e nenhum alerta — exatamente o que a tela
// mostraria se a plataforma não tivesse nenhum cliente pagando. E uma falha
// na leitura dos planos deixava o botão "Novo estabelecimento" abrir um
// formulário sem plano nenhum para escolher, sem dizer por quê.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor, waitForElementToBeRemoved, within, render, fireEvent } from "@testing-library/react";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import userEvent from "@testing-library/user-event";

vi.mock("@/context/AppContext", async () => {
  const { mockUseApp } = await import("@/test/mockApp");
  return { useApp: mockUseApp, AppProvider: ({ children }) => children };
});

vi.mock("@/lib/supabase", async () => {
  const { createMockSupabase } = await import("@/test/mockSupabase");
  return { supabase: createMockSupabase() };
});

// Só as três leituras são dubladas; `resumirPlataforma` fica REAL, senão o
// teste não prova nada sobre o que a tela calcula a partir delas.
// `provisionarEstabelecimento` entra na lista porque é a única porta que cria
// `auth.users` — chamá-la de verdade num teste não faria sentido. O cartão de
// primeiro acesso (CONSOLE-UX 11) precisa dela para chegar até a tela de
// sucesso pelo caminho real: preencher o formulário e enviar.
// `definirMensalidade` entra pelo mesmo motivo (CONSOLE-UX 12): é a segunda
// escrita do cadastro, feita pela RPC `definir_mensalidade_tenant`.
// `renomearEstabelecimento` entra pelo mesmo motivo (pré-venda §1.8): é a
// escrita da RPC `renomear_tenant`, e quem a testa de verdade é
// `RenomearEstabelecimentoModal.test.jsx`. Aqui interessa a PORTA — o card
// abre o modal do estabelecimento certo e a tela confirma o novo nome.
const { mockListarEstabelecimentos, mockListarPlanos, mockListarAssinaturas, mockProvisionar, mockDefinirMensalidade, mockRenomear, banco } = vi.hoisted(() => ({
  mockListarEstabelecimentos: vi.fn(),
  mockListarPlanos: vi.fn(),
  mockListarAssinaturas: vi.fn(),
  mockProvisionar: vi.fn(),
  mockDefinirMensalidade: vi.fn(),
  mockRenomear: vi.fn(),
  // Holder mutável em vez de vi.fn(): os `mockReset()` dos beforeEach
  // existentes não apagam esta leitura, que toda aba faz.
  banco: { addons: [], erroAddons: null },
}));
vi.mock("@/lib/console/console", async () => {
  const real = await vi.importActual("@/lib/console/console");
  return {
    ...real,
    listarEstabelecimentos: mockListarEstabelecimentos,
    listarPlanos: mockListarPlanos,
    listarAssinaturas: mockListarAssinaturas,
    provisionarEstabelecimento: mockProvisionar,
    definirMensalidade: mockDefinirMensalidade,
    renomearEstabelecimento: mockRenomear,
    listarAddonsPorTenant: async () =>
      banco.erroAddons ? { data: [], error: banco.erroAddons } : { data: banco.addons, error: null },
  };
});

// CONSOLE-UX 18 — o cartão de primeiro acesso passou a montar o endereço com
// as mesmas funções puras que os cards da lista usam, e uma delas só devolve
// `null` quando existe domínio raiz. Esse domínio é lido do ambiente na CARGA
// do módulo (`VITE_ROOT_DOMAIN`), então `vi.stubEnv` não alcança mais nada
// depois do import. O holder abaixo é o seam: vazio (o normal), as duas
// funções são as reais, sem desvio nenhum; preenchido, elas rodam com o
// domínio raiz ligado — o estado em que o endereço do Console e o do cliente
// deixam de ser o mesmo lugar.
const { dominioRaiz } = vi.hoisted(() => ({ dominioRaiz: { valor: "" } }));
vi.mock("@/lib/host/tenantSlug", async () => {
  const real = await vi.importActual("@/lib/host/tenantSlug");
  const comRaiz = (opcoes) =>
    dominioRaiz.valor ? { ...opcoes, rootDomain: dominioRaiz.valor } : opcoes;
  return {
    ...real,
    urlDeAcessoDoTenant: (slug, opcoes = {}) => real.urlDeAcessoDoTenant(slug, comRaiz(opcoes)),
    urlDoCardapioPublico: (slug, hostname, opcoes = {}) =>
      real.urlDoCardapioPublico(slug, hostname, comRaiz(opcoes)),
  };
});
afterEach(() => {
  dominioRaiz.valor = "";
});

// A renovação pelo card usa o modal que já existe, e ele grava pela RPC
// `confirmar_renovacao_assinatura`. Aqui interessa a PORTA (o card abre o
// modal certo e trata o retorno), não a RPC — que tem teste próprio.
// O histórico pelo card segue a mesma ideia: `listarPagamentosAssinatura` é
// dublada porque quem a testa de verdade é `HistoricoPagamentosModal.test.jsx`.
const { mockConfirmarRenovacao, mockListarPagamentos, mockEstornarPagamento } = vi.hoisted(() => ({
  mockConfirmarRenovacao: vi.fn(),
  mockListarPagamentos: vi.fn(),
  mockEstornarPagamento: vi.fn(),
}));
vi.mock("@/lib/console/assinatura", async () => {
  const real = await vi.importActual("@/lib/console/assinatura");
  return {
    ...real,
    confirmarRenovacaoAssinatura: mockConfirmarRenovacao,
    listarPagamentosAssinatura: mockListarPagamentos,
    estornarPagamentoAssinatura: mockEstornarPagamento,
  };
});

import { montarMensagemPrimeiroAcesso } from "@/lib/console/console";
import { formatarReais } from "@/lib/delivery/deliveryPedidos";
import { setAppMock, renderWithProviders } from "@/test/mockApp";
import ConsolePage from "./ConsolePage";

const TENANTS = [
  { id: "t1", nome: "Bar do Zé", plano_codigo: "basico", tema: {}, created_at: "2026-01-10T12:00:00Z" },
  { id: "t2", nome: "Café Central", plano_codigo: "avancado", tema: {}, created_at: "2026-02-11T12:00:00Z" },
];
const PLANOS = [
  { codigo: "basico", nome: "Básico" },
  { codigo: "avancado", nome: "Avançado" },
];
// Vencimento bem no futuro: sem a falha de leitura, ninguém precisa de atenção.
const ASSINATURAS = [
  { tenant_id: "t1", valor_mensal: 149.9, data_vencimento: "2099-01-10", carencia_dias: 3, status: "ativo" },
  { tenant_id: "t2", valor_mensal: 249.9, data_vencimento: "2099-02-11", carencia_dias: 3, status: "ativo" },
];

const ok = (data) => ({ data, error: null });
const falhou = () => ({ data: [], error: { message: "network" } });

async function abrirAbaPlanos(user) {
  await user.click(await screen.findByRole("button", { name: /Planos e assinaturas/i }));
}

describe("ConsolePage — leituras secundárias que falham", () => {
  beforeEach(() => {
    mockListarEstabelecimentos.mockReset();
    mockListarPlanos.mockReset();
    mockListarAssinaturas.mockReset();
    mockListarEstabelecimentos.mockResolvedValue(ok(TENANTS));
    mockListarPlanos.mockResolvedValue(ok(PLANOS));
    mockListarAssinaturas.mockResolvedValue(ok(ASSINATURAS));
    setAppMock({ currentUser: { name: "Plataforma" }, logout: vi.fn() });
  });

  it("mostra o dashboard normalmente quando as três leituras dão certo", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ConsolePage />);
    await abrirAbaPlanos(user);

    expect(screen.getByText("R$ 399,80")).toBeInTheDocument(); // 149,90 + 249,90
    expect(screen.getByText("Receita mensal")).toBeInTheDocument();
    expect(screen.queryByText(/não foi possível carregar a cobrança/i)).not.toBeInTheDocument();
  });

  it("não mostra receita R$ 0,00 quando a leitura da cobrança falha — diz que não sabe", async () => {
    mockListarAssinaturas.mockResolvedValue(falhou());
    const user = userEvent.setup();
    renderWithProviders(<ConsolePage />);
    await abrirAbaPlanos(user);

    expect(screen.getByText(/não foi possível carregar a cobrança/i)).toBeInTheDocument();
    expect(screen.getByText(/não quer dizer que ninguém está pagando/i)).toBeInTheDocument();
    // O dashboard inteiro fica fora: nenhum número inventado na tela.
    expect(screen.queryByText("Receita mensal")).not.toBeInTheDocument();
    expect(screen.queryByText("R$ 0,00")).not.toBeInTheDocument();
    expect(screen.queryByText(/precisam? de atenção/i)).not.toBeInTheDocument();
  });

  it("o 'Tentar de novo' da cobrança relê e mostra o dashboard", async () => {
    mockListarAssinaturas.mockResolvedValueOnce(falhou()).mockResolvedValue(ok(ASSINATURAS));
    const user = userEvent.setup();
    renderWithProviders(<ConsolePage />);
    await abrirAbaPlanos(user);

    await user.click(screen.getByRole("button", { name: /Tentar de novo/i }));
    await waitFor(() => expect(screen.getByText("R$ 399,80")).toBeInTheDocument());
    expect(screen.queryByText(/não foi possível carregar a cobrança/i)).not.toBeInTheDocument();
  });

  it("a aba de estabelecimentos continua funcionando com a cobrança fora do ar", async () => {
    mockListarAssinaturas.mockResolvedValue(falhou());
    renderWithProviders(<ConsolePage />);

    expect(await screen.findByText("Bar do Zé")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Novo estabelecimento/i })).toBeEnabled();
  });

  it("com a leitura dos planos falhando, avisa e não deixa abrir o cadastro", async () => {
    mockListarPlanos.mockResolvedValue(falhou());
    renderWithProviders(<ConsolePage />);

    expect(await screen.findByText(/não foi possível carregar a lista de planos/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Novo estabelecimento/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Tentar de novo/i })).toBeInTheDocument();
  });

  it("catálogo de planos vazio SEM erro dá o aviso do catálogo, não o de falha de leitura", async () => {
    mockListarPlanos.mockResolvedValue(ok([]));
    renderWithProviders(<ConsolePage />);

    expect(await screen.findByText(/nenhum plano disponível no catálogo/i)).toBeInTheDocument();
    expect(screen.queryByText(/não foi possível carregar a lista de planos/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Novo estabelecimento/i })).toBeDisabled();
    // Nada a reler: o aviso do catálogo vazio não oferece "Tentar de novo".
    expect(screen.queryByRole("button", { name: /Tentar de novo/i })).not.toBeInTheDocument();
  });

  it("com os planos carregados, o cadastro está liberado e sem aviso", async () => {
    renderWithProviders(<ConsolePage />);

    expect(await screen.findByText("Bar do Zé")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Novo estabelecimento/i })).toBeEnabled();
    expect(screen.queryByText(/nenhum plano disponível/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/não foi possível carregar a lista de planos/i)).not.toBeInTheDocument();
  });

  it("o 'Tentar de novo' dos planos relê e libera o cadastro", async () => {
    mockListarPlanos.mockResolvedValueOnce(falhou()).mockResolvedValue(ok(PLANOS));
    const user = userEvent.setup();
    renderWithProviders(<ConsolePage />);

    await user.click(await screen.findByRole("button", { name: /Tentar de novo/i }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Novo estabelecimento/i })).toBeEnabled()
    );
    expect(screen.queryByText(/não foi possível carregar a lista de planos/i)).not.toBeInTheDocument();
  });

  it("falha na leitura dos estabelecimentos continua sendo erro de tela cheia", async () => {
    mockListarEstabelecimentos.mockResolvedValue(falhou());
    renderWithProviders(<ConsolePage />);

    expect(await screen.findByText(/não foi possível carregar os estabelecimentos/i)).toBeInTheDocument();
    expect(screen.queryByText("Bar do Zé")).not.toBeInTheDocument();
  });
});

describe("ConsolePage — o alerta de validade chega à tela", () => {
  beforeEach(() => {
    mockListarEstabelecimentos.mockReset();
    mockListarPlanos.mockReset();
    mockListarAssinaturas.mockReset();
    mockListarPlanos.mockResolvedValue(ok(PLANOS));
    setAppMock({ currentUser: { name: "Plataforma" }, logout: vi.fn() });
  });

  // R7L2: o estabelecimento que a plataforma não cobra tem de aparecer no
  // bloco de atenção do topo, não só como um selo cinza no fim da tabela.
  it("nomeia no topo o estabelecimento sem assinatura", async () => {
    mockListarEstabelecimentos.mockResolvedValue(ok(TENANTS));
    mockListarAssinaturas.mockResolvedValue(ok([ASSINATURAS[0]])); // t2 sem assinatura
    const user = userEvent.setup();
    renderWithProviders(<ConsolePage />);
    await abrirAbaPlanos(user);

    const alerta = screen.getByRole("status", { name: /precisam de atenção|assinaturas que precisam/i });
    expect(alerta).toHaveTextContent("Café Central");
    expect(alerta).toHaveTextContent("Sem assinatura");
    expect(screen.getByText("1 estabelecimento precisa de atenção")).toBeInTheDocument();
  });

  it("sem ninguém pendente, não existe bloco de atenção", async () => {
    mockListarEstabelecimentos.mockResolvedValue(ok(TENANTS));
    mockListarAssinaturas.mockResolvedValue(ok(ASSINATURAS));
    const user = userEvent.setup();
    renderWithProviders(<ConsolePage />);
    await abrirAbaPlanos(user);

    expect(screen.queryByText(/precisa de atenção|precisam de atenção/i)).not.toBeInTheDocument();
  });
});

// F022-ADDONS — quem já contratou add-on pago precisa ser visível DA LISTA.
// Sem isso o dono teria de abrir estabelecimento por estabelecimento para
// descobrir quem tem NF-e ou TEF ligado (Princípio nº1 — estado sempre
// visível).
describe("ConsolePage — add-ons no card do estabelecimento", () => {
  const cardDe = (nome) => screen.getByText(nome).closest("li");

  beforeEach(() => {
    mockListarEstabelecimentos.mockReset();
    mockListarPlanos.mockReset();
    mockListarAssinaturas.mockReset();
    mockListarEstabelecimentos.mockResolvedValue(ok(TENANTS));
    mockListarPlanos.mockResolvedValue(ok(PLANOS));
    mockListarAssinaturas.mockResolvedValue(ok(ASSINATURAS));
    banco.addons = [];
    banco.erroAddons = null;
    setAppMock({ currentUser: { name: "Plataforma" }, logout: vi.fn() });
  });

  it("o botão diz quantos add-ons estão ligados naquele estabelecimento", async () => {
    banco.addons = [
      { tenant_id: "t1", addon_codigo: "nfe", ativo: true, ativado_em: null },
      { tenant_id: "t1", addon_codigo: "tef", ativo: true, ativado_em: null },
    ];
    renderWithProviders(<ConsolePage />);

    expect(await screen.findByText("Bar do Zé")).toBeInTheDocument();
    await waitFor(() =>
      expect(within(cardDe("Bar do Zé")).getByRole("button", { name: "2 add-ons" })).toBeInTheDocument()
    );
    // O vizinho não herda a contagem.
    expect(within(cardDe("Café Central")).getByRole("button", { name: "Sem add-ons" })).toBeInTheDocument();
  });

  it("add-on contratado e depois desligado não conta como ligado", async () => {
    banco.addons = [{ tenant_id: "t1", addon_codigo: "nfe", ativo: false, ativado_em: null }];
    renderWithProviders(<ConsolePage />);

    expect(await screen.findByText("Bar do Zé")).toBeInTheDocument();
    await waitFor(() =>
      expect(within(cardDe("Bar do Zé")).getByRole("button", { name: "Sem add-ons" })).toBeInTheDocument()
    );
  });

  // Leitura vazia por falha é indistinguível de "não tem nenhum": todos os
  // cards diriam "Sem add-ons" e o dono poderia desligar a cobrança de quem
  // está com módulo pago ligado. A tela precisa dizer que não sabe.
  it("com a leitura dos add-ons falhando, o card diz que não sabe — não 'Sem add-ons'", async () => {
    banco.erroAddons = { message: "network" };
    renderWithProviders(<ConsolePage />);

    expect(await screen.findByText("Bar do Zé")).toBeInTheDocument();
    await waitFor(() =>
      expect(within(cardDe("Bar do Zé")).getByRole("button", { name: "Add-ons indisponíveis" })).toBeInTheDocument()
    );
    expect(within(cardDe("Bar do Zé")).queryByRole("button", { name: "Sem add-ons" })).not.toBeInTheDocument();
    expect(within(cardDe("Café Central")).getByRole("button", { name: "Add-ons indisponíveis" })).toBeInTheDocument();
  });

  it("clicar no botão abre os add-ons daquele estabelecimento, não a troca de plano", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ConsolePage />);
    expect(await screen.findByText("Bar do Zé")).toBeInTheDocument();

    await user.click(within(cardDe("Bar do Zé")).getByRole("button", { name: "Sem add-ons" }));

    const modal = await screen.findByRole("dialog", { name: /add-ons do estabelecimento/i });
    expect(within(modal).getByText("Bar do Zé")).toBeInTheDocument();
  });
});

// CONSOLE-UX rodada 1 — a situação da cobrança no card do estabelecimento.
//
// A aba Estabelecimentos é a primeira tela do Console e mostrava nome, data de
// criação, plano, layout e add-ons — tudo menos o que decide a próxima ação do
// dono: quem está vencendo, quem está em atraso, quem está bloqueado. Isso só
// existia na outra aba, com os dados já carregados neste mesmo componente
// (Princípio nº1 — estado sempre visível).
describe("ConsolePage — situação da cobrança no card", () => {
  const cardDe = (nome) => screen.getByText(nome).closest("li");

  // data_vencimento é `date` puro: monta a string pelo calendário local, não
  // por toISOString() (que é UTC e trocaria o dia à noite no fuso -03).
  const emDias = (n) => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  beforeEach(() => {
    mockListarEstabelecimentos.mockReset();
    mockListarPlanos.mockReset();
    mockListarAssinaturas.mockReset();
    mockListarEstabelecimentos.mockResolvedValue(ok(TENANTS));
    mockListarPlanos.mockResolvedValue(ok(PLANOS));
    mockListarAssinaturas.mockResolvedValue(ok(ASSINATURAS));
    banco.addons = [];
    banco.erroAddons = null;
    setAppMock({ currentUser: { name: "Plataforma" }, logout: vi.fn() });
  });

  it("assinatura em dia mostra 'Ativo' e a data de vencimento no próprio card", async () => {
    renderWithProviders(<ConsolePage />);
    expect(await screen.findByText("Bar do Zé")).toBeInTheDocument();

    const card = cardDe("Bar do Zé");
    expect(within(card).getByText("Ativo")).toBeInTheDocument();
    // 2099-01-10 formatado pela string: sem new Date(), que recuaria um dia.
    expect(within(card).getByText("vence 10/01/2099")).toBeInTheDocument();
  });

  it("quem vence nos próximos dias aparece com a contagem, sem trocar de aba", async () => {
    mockListarAssinaturas.mockResolvedValue(ok([
      { tenant_id: "t1", valor_mensal: 149.9, data_vencimento: emDias(3), carencia_dias: 3, status: "ativo" },
      ...ASSINATURAS.filter((a) => a.tenant_id !== "t1"),
    ]));
    renderWithProviders(<ConsolePage />);
    expect(await screen.findByText("Bar do Zé")).toBeInTheDocument();

    await waitFor(() =>
      expect(within(cardDe("Bar do Zé")).getByText("Vence em 3 dias")).toBeInTheDocument()
    );
    // O outro segue em dia — o alerta é de quem vence, não da lista inteira.
    expect(within(cardDe("Café Central")).getByText("Ativo")).toBeInTheDocument();
  });

  it("estabelecimento sem linha de assinatura diz 'Sem assinatura' — não fica em branco", async () => {
    mockListarAssinaturas.mockResolvedValue(ok(ASSINATURAS.filter((a) => a.tenant_id !== "t2")));
    renderWithProviders(<ConsolePage />);
    expect(await screen.findByText("Café Central")).toBeInTheDocument();

    await waitFor(() =>
      expect(within(cardDe("Café Central")).getByText("Sem assinatura")).toBeInTheDocument()
    );
  });

  it("com a leitura das assinaturas falhando, o card diz que não sabe — não 'Ativo'", async () => {
    // Lista vazia por falha é idêntica a "ninguém tem assinatura": sem esta
    // distinção o dono leria "Sem assinatura" em toda a base e poderia sair
    // cobrando quem está em dia.
    mockListarAssinaturas.mockResolvedValue(falhou());
    renderWithProviders(<ConsolePage />);
    expect(await screen.findByText("Bar do Zé")).toBeInTheDocument();

    await waitFor(() =>
      expect(within(cardDe("Bar do Zé")).getByText("Situação indisponível")).toBeInTheDocument()
    );
    expect(within(cardDe("Bar do Zé")).queryByText("Ativo")).not.toBeInTheDocument();
    expect(within(cardDe("Bar do Zé")).queryByText("Sem assinatura")).not.toBeInTheDocument();
    expect(within(cardDe("Café Central")).getByText("Situação indisponível")).toBeInTheDocument();
  });
});

describe("ConsolePage — ordem da lista por urgência", () => {
  // data_vencimento é `date` puro: monta a string pelo calendário local.
  const emDias = (n) => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const nomesNaOrdem = () =>
    screen.getAllByRole("listitem").map((li) => li.querySelector(".console__card-nome")?.textContent);

  beforeEach(() => {
    mockListarEstabelecimentos.mockReset();
    mockListarPlanos.mockReset();
    mockListarAssinaturas.mockReset();
    mockListarEstabelecimentos.mockResolvedValue(ok(TENANTS));
    mockListarPlanos.mockResolvedValue(ok(PLANOS));
    mockListarAssinaturas.mockResolvedValue(ok(ASSINATURAS));
    banco.addons = [];
    banco.erroAddons = null;
    setAppMock({ currentUser: { name: "Plataforma" }, logout: vi.fn() });
  });

  it("põe quem precisa de ação no topo, mesmo vindo depois do banco", async () => {
    // t2 (segundo na lista do banco) está bloqueado: venceu há 30 dias.
    mockListarAssinaturas.mockResolvedValue(ok([
      ASSINATURAS[0],
      { tenant_id: "t2", valor_mensal: 249.9, data_vencimento: emDias(-30), carencia_dias: 3, status: "ativo" },
    ]));
    renderWithProviders(<ConsolePage />);
    expect(await screen.findByText("Bar do Zé")).toBeInTheDocument();

    expect(nomesNaOrdem()).toEqual(["Café Central", "Bar do Zé"]);
  });

  it("explica a ordem com o número de quem precisa de atenção", async () => {
    mockListarAssinaturas.mockResolvedValue(ok([
      ASSINATURAS[0],
      { tenant_id: "t2", valor_mensal: 249.9, data_vencimento: emDias(-30), carencia_dias: 3, status: "ativo" },
    ]));
    renderWithProviders(<ConsolePage />);
    expect(await screen.findByText("Bar do Zé")).toBeInTheDocument();

    expect(
      screen.getByText("1 estabelecimento precisa de atenção e aparece primeiro.")
    ).toBeInTheDocument();
  });

  it("usa o plural quando mais de um precisa de atenção", async () => {
    mockListarAssinaturas.mockResolvedValue(ok([
      { tenant_id: "t1", valor_mensal: 149.9, data_vencimento: emDias(2), carencia_dias: 3, status: "ativo" },
      { tenant_id: "t2", valor_mensal: 249.9, data_vencimento: emDias(-30), carencia_dias: 3, status: "ativo" },
    ]));
    renderWithProviders(<ConsolePage />);
    expect(await screen.findByText("Bar do Zé")).toBeInTheDocument();

    expect(
      screen.getByText("2 estabelecimentos precisam de atenção e aparecem primeiro.")
    ).toBeInTheDocument();
    // bloqueado vem antes de quem só está vencendo
    expect(nomesNaOrdem()).toEqual(["Café Central", "Bar do Zé"]);
  });

  it("base toda em dia: mantém a ordem do banco e não mostra legenda", async () => {
    renderWithProviders(<ConsolePage />);
    expect(await screen.findByText("Bar do Zé")).toBeInTheDocument();

    expect(nomesNaOrdem()).toEqual(["Bar do Zé", "Café Central"]);
    expect(screen.queryByText(/precisa[m]? de atenção/)).not.toBeInTheDocument();
  });

  it("com a leitura das assinaturas quebrada, não reordena nem afirma nada", async () => {
    mockListarAssinaturas.mockResolvedValue(falhou("RLS negou"));
    renderWithProviders(<ConsolePage />);
    expect(await screen.findByText("Bar do Zé")).toBeInTheDocument();

    expect(nomesNaOrdem()).toEqual(["Bar do Zé", "Café Central"]);
    expect(screen.queryByText(/precisa[m]? de atenção/)).not.toBeInTheDocument();
  });
});

describe("ConsolePage — busca por nome", () => {
  const emDias = (n) => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const nomesNaOrdem = () =>
    screen.getAllByRole("listitem").map((li) => li.querySelector(".console__card-nome")?.textContent);
  const campo = () => screen.getByLabelText("Buscar estabelecimento pelo nome ou endereço");

  beforeEach(() => {
    mockListarEstabelecimentos.mockReset();
    mockListarPlanos.mockReset();
    mockListarAssinaturas.mockReset();
    mockListarEstabelecimentos.mockResolvedValue(ok(TENANTS));
    mockListarPlanos.mockResolvedValue(ok(PLANOS));
    mockListarAssinaturas.mockResolvedValue(ok(ASSINATURAS));
    banco.addons = [];
    banco.erroAddons = null;
    setAppMock({ currentUser: { name: "Plataforma" }, logout: vi.fn() });
  });

  it("filtra a lista enquanto digita, sem ligar para acento nem caixa", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ConsolePage />);
    expect(await screen.findByText("Bar do Zé")).toBeInTheDocument();

    await user.type(campo(), "cafe");
    expect(nomesNaOrdem()).toEqual(["Café Central"]);
  });

  it("casa com um trecho do meio do nome", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ConsolePage />);
    expect(await screen.findByText("Bar do Zé")).toBeInTheDocument();

    await user.type(campo(), "central");
    expect(nomesNaOrdem()).toEqual(["Café Central"]);
  });

  it("limpar o campo traz a lista inteira de volta", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ConsolePage />);
    expect(await screen.findByText("Bar do Zé")).toBeInTheDocument();

    await user.type(campo(), "cafe");
    expect(nomesNaOrdem()).toEqual(["Café Central"]);
    await user.clear(campo());
    expect(nomesNaOrdem()).toEqual(["Bar do Zé", "Café Central"]);
  });

  it("sem resultado, mostra o vazio de busca com o termo e o botão de limpar", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ConsolePage />);
    expect(await screen.findByText("Bar do Zé")).toBeInTheDocument();

    await user.type(campo(), "pizzaria");
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
    expect(screen.getByText(/Nenhum estabelecimento com/)).toHaveTextContent("pizzaria");
    // não pode ser confundido com o vazio de base (critério 8)
    expect(screen.queryByRole("button", { name: /Criar o primeiro/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Limpar busca" }));
    expect(nomesNaOrdem()).toEqual(["Bar do Zé", "Café Central"]);
  });

  it("a legenda de urgência conta só quem está na tela", async () => {
    // os dois precisam de atenção; a busca esconde um deles
    mockListarAssinaturas.mockResolvedValue(ok([
      { tenant_id: "t1", valor_mensal: 149.9, data_vencimento: emDias(2), carencia_dias: 3, status: "ativo" },
      { tenant_id: "t2", valor_mensal: 249.9, data_vencimento: emDias(-30), carencia_dias: 3, status: "ativo" },
    ]));
    const user = userEvent.setup();
    renderWithProviders(<ConsolePage />);
    expect(await screen.findByText("Bar do Zé")).toBeInTheDocument();
    expect(
      screen.getByText("2 estabelecimentos precisam de atenção e aparecem primeiro.")
    ).toBeInTheDocument();

    await user.type(campo(), "cafe");
    expect(
      screen.getByText("1 estabelecimento precisa de atenção e aparece primeiro.")
    ).toBeInTheDocument();

    await user.clear(campo());
    await user.type(campo(), "pizzaria");
    expect(screen.queryByText(/precisa[m]? de atenção/)).not.toBeInTheDocument();
  });

  it("base vazia mostra o vazio de cadastro, não o campo de busca", async () => {
    mockListarEstabelecimentos.mockResolvedValue(ok([]));
    renderWithProviders(<ConsolePage />);
    expect(await screen.findByText("Nenhum estabelecimento ainda")).toBeInTheDocument();

    expect(screen.queryByLabelText("Buscar estabelecimento pelo nome ou endereço")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Criar o primeiro/i })).toBeInTheDocument();
  });

  it("busca funciona mesmo com a leitura das assinaturas quebrada", async () => {
    mockListarAssinaturas.mockResolvedValue(falhou());
    const user = userEvent.setup();
    renderWithProviders(<ConsolePage />);
    expect(await screen.findByText("Bar do Zé")).toBeInTheDocument();

    await user.type(campo(), "bar");
    expect(nomesNaOrdem()).toEqual(["Bar do Zé"]);
    expect(screen.queryByText(/precisa[m]? de atenção/)).not.toBeInTheDocument();
  });
});

describe("ConsolePage — registrar pagamento pelo card", () => {
  const emDias = (n) => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  // t2 bloqueado (venceu há 30 dias), t1 em dia lá em 2099.
  const COM_ATRASO = [
    ASSINATURAS[0],
    { tenant_id: "t2", valor_mensal: 249.9, data_vencimento: emDias(-30), carencia_dias: 3, status: "ativo" },
  ];
  const botaoCobrar = (nome) => screen.queryByRole("button", { name: `Registrar pagamento de ${nome}` });

  beforeEach(() => {
    mockListarEstabelecimentos.mockReset();
    mockListarPlanos.mockReset();
    mockListarAssinaturas.mockReset();
    mockConfirmarRenovacao.mockReset();
    mockListarEstabelecimentos.mockResolvedValue(ok(TENANTS));
    mockListarPlanos.mockResolvedValue(ok(PLANOS));
    mockListarAssinaturas.mockResolvedValue(ok(ASSINATURAS));
    banco.addons = [];
    banco.erroAddons = null;
    setAppMock({ currentUser: { name: "Plataforma" }, logout: vi.fn() });
  });

  it("mostra o botão só em quem precisa de ação", async () => {
    mockListarAssinaturas.mockResolvedValue(ok(COM_ATRASO));
    renderWithProviders(<ConsolePage />);
    expect(await screen.findByText("Bar do Zé")).toBeInTheDocument();

    expect(botaoCobrar("Café Central")).toBeInTheDocument(); // bloqueado
    expect(botaoCobrar("Bar do Zé")).not.toBeInTheDocument(); // em dia
  });

  it("não mostra o botão em quem está sem assinatura (a RPC recusaria)", async () => {
    mockListarAssinaturas.mockResolvedValue(ok([ASSINATURAS[0]])); // t2 sem linha
    renderWithProviders(<ConsolePage />);
    expect(await screen.findByText("Café Central")).toBeInTheDocument();

    expect(botaoCobrar("Café Central")).not.toBeInTheDocument();
  });

  it("não mostra o botão em estabelecimento cancelado", async () => {
    mockListarAssinaturas.mockResolvedValue(ok([
      ASSINATURAS[0],
      { tenant_id: "t2", valor_mensal: 249.9, data_vencimento: emDias(-30), carencia_dias: 3, status: "cancelado" },
    ]));
    renderWithProviders(<ConsolePage />);
    expect(await screen.findByText("Café Central")).toBeInTheDocument();

    expect(botaoCobrar("Café Central")).not.toBeInTheDocument();
  });

  it("com a leitura das assinaturas quebrada, nenhum card oferece cobrar", async () => {
    mockListarAssinaturas.mockResolvedValue(falhou());
    renderWithProviders(<ConsolePage />);
    expect(await screen.findByText("Bar do Zé")).toBeInTheDocument();

    expect(botaoCobrar("Bar do Zé")).not.toBeInTheDocument();
    expect(botaoCobrar("Café Central")).not.toBeInTheDocument();
  });

  it("abre o modal de renovação já preenchido com o estabelecimento", async () => {
    mockListarAssinaturas.mockResolvedValue(ok(COM_ATRASO));
    const user = userEvent.setup();
    renderWithProviders(<ConsolePage />);
    expect(await screen.findByText("Bar do Zé")).toBeInTheDocument();

    await user.click(botaoCobrar("Café Central"));
    const modal = screen.getByRole("dialog", { name: "Registrar pagamento da assinatura" });
    expect(within(modal).getByText("Café Central")).toBeInTheDocument();
    expect(within(modal).getByText(/Mensalidade combinada/)).toHaveTextContent("249,90");
  });

  it("confirmado o pagamento, anuncia o novo vencimento e recarrega a lista", async () => {
    mockListarAssinaturas.mockResolvedValue(ok(COM_ATRASO));
    mockConfirmarRenovacao.mockResolvedValue(ok({ data_vencimento: "2026-09-15", status: "ativo" }));
    const user = userEvent.setup();
    renderWithProviders(<ConsolePage />);
    expect(await screen.findByText("Bar do Zé")).toBeInTheDocument();
    const leiturasAntes = mockListarEstabelecimentos.mock.calls.length;

    await user.click(botaoCobrar("Café Central"));
    const modal = screen.getByRole("dialog", { name: "Registrar pagamento da assinatura" });
    await user.click(within(modal).getByRole("button", { name: "Registrar pagamento" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(mockConfirmarRenovacao).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "t2", valor: 249.9, confirmadoPor: "Plataforma" })
    );
    expect(screen.getByRole("status")).toHaveTextContent("Café Central");
    expect(screen.getByRole("status")).toHaveTextContent("15/09/2026");
    expect(mockListarEstabelecimentos.mock.calls.length).toBeGreaterThan(leiturasAntes);
  });

  it("cancelar não grava, não anuncia sucesso e não recarrega", async () => {
    mockListarAssinaturas.mockResolvedValue(ok(COM_ATRASO));
    const user = userEvent.setup();
    renderWithProviders(<ConsolePage />);
    expect(await screen.findByText("Bar do Zé")).toBeInTheDocument();
    const leiturasAntes = mockListarEstabelecimentos.mock.calls.length;

    await user.click(botaoCobrar("Café Central"));
    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(mockConfirmarRenovacao).not.toHaveBeenCalled();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(mockListarEstabelecimentos.mock.calls.length).toBe(leiturasAntes);
  });

  it("registrar durante uma busca preserva o termo buscado", async () => {
    mockListarAssinaturas.mockResolvedValue(ok(COM_ATRASO));
    mockConfirmarRenovacao.mockResolvedValue(ok({ data_vencimento: "2026-09-15", status: "ativo" }));
    const user = userEvent.setup();
    renderWithProviders(<ConsolePage />);
    expect(await screen.findByText("Bar do Zé")).toBeInTheDocument();

    const campo = screen.getByLabelText("Buscar estabelecimento pelo nome ou endereço");
    await user.type(campo, "cafe");
    await user.click(botaoCobrar("Café Central"));
    const modal = screen.getByRole("dialog", { name: "Registrar pagamento da assinatura" });
    await user.click(within(modal).getByRole("button", { name: "Registrar pagamento" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(campo).toHaveValue("cafe");
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// CONSOLE-UX rodada 5 — ver pagamentos direto do card
//
// A rodada 4 deixou o dono cobrar sem trocar de aba; conferir o que já foi
// lançado (e desfazer um lançamento errado) ainda mandava para "Planos e
// assinaturas". Aqui o que importa é a PORTA: quem ganha o botão, quem não
// ganha, e o que a lista faz quando o histórico desfaz um pagamento.
// ---------------------------------------------------------------------------
describe("ConsolePage — ver pagamentos pelo card", () => {
  const botaoPagamentos = (nome) =>
    screen.queryByRole("button", { name: `Ver pagamentos de ${nome}` });

  const PAGAMENTO = {
    id: "pg1",
    competencia: "2026-07-01",
    valor: 249.9,
    metodo: "Pix",
    confirmado_por: "Plataforma",
    confirmado_em: "2026-07-01T12:00:00.000Z",
  };

  beforeEach(() => {
    mockListarEstabelecimentos.mockReset();
    mockListarPlanos.mockReset();
    mockListarAssinaturas.mockReset();
    mockListarPagamentos.mockReset();
    mockEstornarPagamento.mockReset();
    mockListarEstabelecimentos.mockResolvedValue(ok(TENANTS));
    mockListarPlanos.mockResolvedValue(ok(PLANOS));
    mockListarAssinaturas.mockResolvedValue(ok(ASSINATURAS));
    mockListarPagamentos.mockResolvedValue(ok([PAGAMENTO]));
    mockEstornarPagamento.mockResolvedValue(ok({ id: "pg1" }));
    banco.addons = [];
    banco.erroAddons = null;
    setAppMock({ currentUser: { name: "Plataforma" }, logout: vi.fn() });
  });

  it("oferece o histórico em quem tem assinatura, mesmo estando em dia", async () => {
    renderWithProviders(<ConsolePage />);
    expect(await screen.findByText("Bar do Zé")).toBeInTheDocument();

    expect(botaoPagamentos("Bar do Zé")).toBeInTheDocument();
    expect(botaoPagamentos("Café Central")).toBeInTheDocument();
  });

  it("não oferece o histórico em quem está sem assinatura", async () => {
    mockListarAssinaturas.mockResolvedValue(ok([ASSINATURAS[0]])); // t2 sem linha
    renderWithProviders(<ConsolePage />);
    expect(await screen.findByText("Café Central")).toBeInTheDocument();

    expect(botaoPagamentos("Café Central")).not.toBeInTheDocument();
    expect(botaoPagamentos("Bar do Zé")).toBeInTheDocument();
  });

  it("oferece o histórico em estabelecimento cancelado — é onde se confere o que foi pago", async () => {
    mockListarAssinaturas.mockResolvedValue(ok([
      ASSINATURAS[0],
      { tenant_id: "t2", valor_mensal: 249.9, data_vencimento: "2026-05-10", carencia_dias: 3, status: "cancelado" },
    ]));
    renderWithProviders(<ConsolePage />);
    expect(await screen.findByText("Café Central")).toBeInTheDocument();

    expect(botaoPagamentos("Café Central")).toBeInTheDocument();
  });

  it("com a leitura das assinaturas quebrada, nenhum card oferece o histórico", async () => {
    mockListarAssinaturas.mockResolvedValue(falhou());
    renderWithProviders(<ConsolePage />);
    expect(await screen.findByText("Bar do Zé")).toBeInTheDocument();

    expect(botaoPagamentos("Bar do Zé")).not.toBeInTheDocument();
    expect(botaoPagamentos("Café Central")).not.toBeInTheDocument();
  });

  it("abre o histórico do estabelecimento clicado", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ConsolePage />);
    expect(await screen.findByText("Café Central")).toBeInTheDocument();

    await user.click(botaoPagamentos("Café Central"));

    const modal = await screen.findByRole("dialog", { name: "Pagamentos da assinatura" });
    expect(modal).toBeInTheDocument();
    // Consultou o tenant certo, e não o primeiro da lista.
    expect(mockListarPagamentos).toHaveBeenCalledWith("t2");
    expect(await within(modal).findByText("julho/2026")).toBeInTheDocument();
  });

  it("fechar o histórico não deixa faixa de sucesso nem recarrega a lista", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ConsolePage />);
    expect(await screen.findByText("Café Central")).toBeInTheDocument();

    await user.click(botaoPagamentos("Café Central"));
    const modal = await screen.findByRole("dialog", { name: "Pagamentos da assinatura" });
    const antes = mockListarEstabelecimentos.mock.calls.length;

    // O modal tem dois "Fechar" (o X do cabeçalho e o do rodapé) — o do rodapé
    // é o que o dono usa quando terminou de conferir.
    const fechar = within(modal).getAllByRole("button", { name: "Fechar" });
    await user.click(fechar[fechar.length - 1]);

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Pagamentos da assinatura" })).not.toBeInTheDocument();
    });
    expect(mockListarEstabelecimentos.mock.calls.length).toBe(antes);
    expect(mockEstornarPagamento).not.toHaveBeenCalled();
  });

  it("cancelar um pagamento recarrega a lista e mantém o histórico aberto", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ConsolePage />);
    expect(await screen.findByText("Café Central")).toBeInTheDocument();

    await user.click(botaoPagamentos("Café Central"));
    const modal = await screen.findByRole("dialog", { name: "Pagamentos da assinatura" });
    const antes = mockListarEstabelecimentos.mock.calls.length;

    await user.click(within(modal).getByRole("button", { name: "Cancelar o pagamento de julho/2026" }));
    await user.type(
      within(modal).getByRole("textbox", { name: "Motivo do cancelamento de julho/2026" }),
      "valor digitado errado",
    );
    await user.click(within(modal).getByRole("button", { name: "Cancelar o pagamento" }));

    await waitFor(() => {
      expect(mockListarEstabelecimentos.mock.calls.length).toBeGreaterThan(antes);
    });
    // O vencimento do card mudou por baixo, mas o dono continua no histórico.
    expect(screen.getByRole("dialog", { name: "Pagamentos da assinatura" })).toBeInTheDocument();
  });

  it("abrir o histórico durante uma busca preserva o termo buscado", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ConsolePage />);
    expect(await screen.findByText("Café Central")).toBeInTheDocument();

    const campo = screen.getByLabelText("Buscar estabelecimento pelo nome ou endereço");
    await user.type(campo, "cafe");
    await user.click(botaoPagamentos("Café Central"));

    expect(await screen.findByRole("dialog", { name: "Pagamentos da assinatura" })).toBeInTheDocument();
    expect(campo).toHaveValue("cafe");
    expect(screen.queryByText("Bar do Zé")).not.toBeInTheDocument();
  });
});

describe("ConsolePage — filtro por situação", () => {
  const emDias = (n) => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const nomesNaOrdem = () =>
    screen.getAllByRole("listitem").map((li) => li.querySelector(".console__card-nome")?.textContent);
  const campo = () => screen.getByLabelText("Buscar estabelecimento pelo nome ou endereço");
  // Escopado ao grupo de situação: a linha de planos também tem um botão
  // que começa com "Todos" ("Todos os planos").
  const atalho = (nome) =>
    within(atalhos()).getByRole("button", { name: new RegExp(`^${nome}`) });
  const atalhos = () => screen.queryByRole("group", { name: /Filtrar por situação/i });

  // t1 vencido há um mês (precisa de atenção), t2 longe do vencimento (em dia).
  const MISTO = [
    { tenant_id: "t1", valor_mensal: 149.9, data_vencimento: emDias(-30), carencia_dias: 3, status: "ativo" },
    { tenant_id: "t2", valor_mensal: 249.9, data_vencimento: "2099-02-11", carencia_dias: 3, status: "ativo" },
  ];

  beforeEach(() => {
    mockListarEstabelecimentos.mockReset();
    mockListarPlanos.mockReset();
    mockListarAssinaturas.mockReset();
    mockListarEstabelecimentos.mockResolvedValue(ok(TENANTS));
    mockListarPlanos.mockResolvedValue(ok(PLANOS));
    mockListarAssinaturas.mockResolvedValue(ok(MISTO));
    banco.addons = [];
    banco.erroAddons = null;
    setAppMock({ currentUser: { name: "Plataforma" }, logout: vi.fn() });
  });

  it("mostra os três atalhos com contagens que somam a base", async () => {
    renderWithProviders(<ConsolePage />);
    expect(await screen.findByText("Bar do Zé")).toBeInTheDocument();

    expect(atalho("Todos")).toHaveTextContent("2");
    expect(atalho("Precisam de atenção")).toHaveTextContent("1");
    expect(atalho("Em dia")).toHaveTextContent("1");
  });

  it("recorta a lista pelo atalho escolhido e volta com 'Todos'", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ConsolePage />);
    expect(await screen.findByText("Bar do Zé")).toBeInTheDocument();

    await user.click(atalho("Precisam de atenção"));
    expect(nomesNaOrdem()).toEqual(["Bar do Zé"]);

    await user.click(atalho("Em dia"));
    expect(nomesNaOrdem()).toEqual(["Café Central"]);

    await user.click(atalho("Todos"));
    expect(nomesNaOrdem()).toEqual(["Bar do Zé", "Café Central"]);
  });

  it("marca o atalho ativo com aria-pressed, sem depender de cor", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ConsolePage />);
    expect(await screen.findByText("Bar do Zé")).toBeInTheDocument();

    expect(atalho("Todos")).toHaveAttribute("aria-pressed", "true");
    expect(atalho("Em dia")).toHaveAttribute("aria-pressed", "false");

    await user.click(atalho("Em dia"));
    expect(atalho("Em dia")).toHaveAttribute("aria-pressed", "true");
    expect(atalho("Todos")).toHaveAttribute("aria-pressed", "false");
  });

  it("filtro e busca se combinam, e trocar de filtro não apaga o termo digitado", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ConsolePage />);
    expect(await screen.findByText("Bar do Zé")).toBeInTheDocument();

    await user.type(campo(), "bar");
    await user.click(atalho("Precisam de atenção"));
    expect(nomesNaOrdem()).toEqual(["Bar do Zé"]);
    expect(campo()).toHaveValue("bar");

    // "Bar do Zé" não está em dia: o cruzamento fica vazio, e o termo continua lá.
    await user.click(atalho("Em dia"));
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
    expect(campo()).toHaveValue("bar");
    expect(screen.getByText(/Nenhum estabelecimento com “bar” em “Em dia”/)).toBeInTheDocument();
  });

  it("recorte vazio diz o que está filtrando e oferece voltar para 'Todos'", async () => {
    // ninguém precisa de atenção
    mockListarAssinaturas.mockResolvedValue(ok(ASSINATURAS));
    const user = userEvent.setup();
    renderWithProviders(<ConsolePage />);
    expect(await screen.findByText("Bar do Zé")).toBeInTheDocument();

    expect(atalho("Precisam de atenção")).toHaveTextContent("0");
    await user.click(atalho("Precisam de atenção"));

    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
    expect(screen.getByText("Nenhum estabelecimento precisa de atenção agora")).toBeInTheDocument();
    // não é o vazio de base nem o de busca
    expect(screen.queryByRole("button", { name: /Criar o primeiro/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Limpar busca" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Ver todos" }));
    expect(nomesNaOrdem()).toEqual(["Bar do Zé", "Café Central"]);
  });

  it("a legenda de urgência continua contando só o que está na tela", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ConsolePage />);
    expect(await screen.findByText("Bar do Zé")).toBeInTheDocument();
    expect(
      screen.getByText("1 estabelecimento precisa de atenção e aparece primeiro.")
    ).toBeInTheDocument();

    await user.click(atalho("Em dia"));
    expect(
      screen.queryByText(/estabelecimentos? precisam? de atenção e aparece/)
    ).not.toBeInTheDocument();
  });

  it("com a leitura das assinaturas quebrada, os atalhos não aparecem", async () => {
    mockListarAssinaturas.mockResolvedValue(falhou());
    renderWithProviders(<ConsolePage />);
    expect(await screen.findByText("Bar do Zé")).toBeInTheDocument();

    expect(atalhos()).not.toBeInTheDocument();
    expect(nomesNaOrdem()).toEqual(["Bar do Zé", "Café Central"]);
  });

  it("base vazia não mostra atalhos — o vazio de cadastro já resolve", async () => {
    mockListarEstabelecimentos.mockResolvedValue(ok([]));
    renderWithProviders(<ConsolePage />);
    expect(await screen.findByText("Nenhum estabelecimento ainda")).toBeInTheDocument();

    expect(atalhos()).not.toBeInTheDocument();
  });
});

describe("ConsolePage — o recorte escolhido fica na URL", () => {
  // O MemoryRouter não mexe em `window.location`, então a única forma honesta
  // de ver o endereço é perguntar ao próprio roteador. O espião também expõe um
  // "voltar" para provar que trocar de recorte não empilha histórico.
  const EspiaoURL = () => {
    const loc = useLocation();
    const navigate = useNavigate();
    return (
      <>
        <span data-testid="url">{loc.pathname + loc.search}</span>
        <button type="button" onClick={() => navigate(-1)}>
          voltar-teste
        </button>
      </>
    );
  };
  const url = () => screen.getByTestId("url").textContent;
  const renderComEspiao = (route = "/console", anteriores = []) =>
    render(
      <MemoryRouter initialEntries={[...anteriores, route]} initialIndex={anteriores.length}>
        <ConsolePage />
        <EspiaoURL />
      </MemoryRouter>
    );

  const emDias = (n) => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const nomesNaOrdem = () =>
    screen.getAllByRole("listitem").map((li) => li.querySelector(".console__card-nome")?.textContent);
  const campo = () => screen.getByLabelText("Buscar estabelecimento pelo nome ou endereço");
  // Escopado ao grupo de situação: a linha de planos também tem um botão
  // que começa com "Todos" ("Todos os planos").
  const atalho = (nome) =>
    within(atalhos()).getByRole("button", { name: new RegExp(`^${nome}`) });
  const atalhos = () => screen.queryByRole("group", { name: /Filtrar por situação/i });

  // t1 vencido há um mês (precisa de atenção), t2 longe do vencimento (em dia).
  const MISTO = [
    { tenant_id: "t1", valor_mensal: 149.9, data_vencimento: emDias(-30), carencia_dias: 3, status: "ativo" },
    { tenant_id: "t2", valor_mensal: 249.9, data_vencimento: "2099-02-11", carencia_dias: 3, status: "ativo" },
  ];

  beforeEach(() => {
    mockListarEstabelecimentos.mockReset();
    mockListarPlanos.mockReset();
    mockListarAssinaturas.mockReset();
    mockListarEstabelecimentos.mockResolvedValue(ok(TENANTS));
    mockListarPlanos.mockResolvedValue(ok(PLANOS));
    mockListarAssinaturas.mockResolvedValue(ok(MISTO));
    banco.addons = [];
    banco.erroAddons = null;
    setAppMock({ currentUser: { name: "Plataforma" }, logout: vi.fn() });
  });

  it("abrir com ?situacao=atencao já mostra a lista recortada, sem clique", async () => {
    renderWithProviders(<ConsolePage />, { route: "/console?situacao=atencao" });
    expect(await screen.findByText("Bar do Zé")).toBeInTheDocument();

    expect(nomesNaOrdem()).toEqual(["Bar do Zé"]);
    expect(atalho("Precisam de atenção")).toHaveAttribute("aria-pressed", "true");
    expect(atalho("Todos")).toHaveAttribute("aria-pressed", "false");
  });

  it("abrir com ?situacao=em_dia mostra o complemento", async () => {
    renderWithProviders(<ConsolePage />, { route: "/console?situacao=em_dia" });
    expect(await screen.findByText("Café Central")).toBeInTheDocument();

    expect(nomesNaOrdem()).toEqual(["Café Central"]);
    expect(atalho("Em dia")).toHaveAttribute("aria-pressed", "true");
  });

  it("valor inventado na URL cai em 'Todos' e não esconde ninguém", async () => {
    renderWithProviders(<ConsolePage />, { route: "/console?situacao=ATENCAO" });
    expect(await screen.findByText("Bar do Zé")).toBeInTheDocument();

    expect(nomesNaOrdem()).toEqual(["Bar do Zé", "Café Central"]);
    expect(atalho("Todos")).toHaveAttribute("aria-pressed", "true");
  });

  it("clicar num atalho escreve o parâmetro; 'Todos' o remove", async () => {
    const user = userEvent.setup();
    renderComEspiao();
    expect(await screen.findByText("Bar do Zé")).toBeInTheDocument();

    await user.click(atalho("Precisam de atenção"));
    expect(url()).toBe("/console?situacao=atencao");

    // endereço limpo é o que se copia sem pensar
    await user.click(atalho("Todos"));
    expect(url()).toBe("/console");
  });

  it("outros parâmetros da URL sobrevivem à escrita do recorte", async () => {
    const user = userEvent.setup();
    renderComEspiao("/console?origem=email");
    expect(await screen.findByText("Bar do Zé")).toBeInTheDocument();

    await user.click(atalho("Em dia"));
    expect(url()).toContain("origem=email");
    expect(url()).toContain("situacao=em_dia");
  });

  it("trocar de recorte não empilha histórico: 'voltar' sai do Console", async () => {
    const user = userEvent.setup();
    renderComEspiao("/console", ["/inicio"]);
    expect(await screen.findByText("Bar do Zé")).toBeInTheDocument();

    await user.click(atalho("Precisam de atenção"));
    await user.click(atalho("Em dia"));
    await user.click(atalho("Todos"));
    await user.click(atalho("Precisam de atenção"));

    await user.click(screen.getByRole("button", { name: "voltar-teste" }));
    expect(url()).toBe("/inicio");
  });

  it("o termo da busca não vai para a URL, e trocar de recorte não o apaga", async () => {
    const user = userEvent.setup();
    renderComEspiao();
    expect(await screen.findByText("Bar do Zé")).toBeInTheDocument();

    await user.type(campo(), "bar");
    expect(url()).toBe("/console");

    await user.click(atalho("Precisam de atenção"));
    expect(campo()).toHaveValue("bar");
    expect(url()).toBe("/console?situacao=atencao");
  });

  it("com a leitura das assinaturas quebrada, o parâmetro da URL é ignorado", async () => {
    mockListarAssinaturas.mockResolvedValue(falhou());
    renderWithProviders(<ConsolePage />, { route: "/console?situacao=atencao" });
    expect(await screen.findByText("Bar do Zé")).toBeInTheDocument();

    // sem os atalhos na tela, recortar seria um corte que ninguém explica
    expect(atalhos()).not.toBeInTheDocument();
    expect(nomesNaOrdem()).toEqual(["Bar do Zé", "Café Central"]);
  });

  it("base vazia com recorte na URL mostra o vazio de cadastro", async () => {
    mockListarEstabelecimentos.mockResolvedValue(ok([]));
    renderWithProviders(<ConsolePage />, { route: "/console?situacao=atencao" });

    expect(await screen.findByText("Nenhum estabelecimento ainda")).toBeInTheDocument();
    expect(atalhos()).not.toBeInTheDocument();
  });
});

describe("ConsolePage — a aba aberta fica na URL", () => {
  const EspiaoURL = () => {
    const loc = useLocation();
    const navigate = useNavigate();
    return (
      <>
        <span data-testid="url">{loc.pathname + loc.search}</span>
        <button type="button" onClick={() => navigate(-1)}>
          voltar-teste
        </button>
      </>
    );
  };
  const url = () => screen.getByTestId("url").textContent;
  const renderComEspiao = (route = "/console", anteriores = []) =>
    render(
      <MemoryRouter initialEntries={[...anteriores, route]} initialIndex={anteriores.length}>
        <ConsolePage />
        <EspiaoURL />
      </MemoryRouter>
    );
  const abaBotao = (nome) => screen.getByRole("button", { name: new RegExp(nome, "i") });

  beforeEach(() => {
    mockListarEstabelecimentos.mockReset();
    mockListarPlanos.mockReset();
    mockListarAssinaturas.mockReset();
    mockListarEstabelecimentos.mockResolvedValue(ok(TENANTS));
    mockListarPlanos.mockResolvedValue(ok(PLANOS));
    mockListarAssinaturas.mockResolvedValue(ok(ASSINATURAS));
    banco.addons = [];
    banco.erroAddons = null;
    setAppMock({ currentUser: { name: "Plataforma" }, logout: vi.fn() });
  });

  it("abrir com ?aba=planos já mostra a aba de planos, sem clique", async () => {
    renderComEspiao("/console?aba=planos");

    expect(await screen.findByText("Receita mensal")).toBeInTheDocument();
    expect(abaBotao("Planos e assinaturas")).toHaveClass("console__aba--ativa");
  });

  it("abrir com ?aba=uso já mostra a aba de uso", async () => {
    renderComEspiao("/console?aba=uso");

    expect(await screen.findByText("Mostrando os últimos")).toBeInTheDocument();
    expect(abaBotao("Uso e faturamento")).toHaveClass("console__aba--ativa");
  });

  it("aba inventada na URL cai em Estabelecimentos — o Console nunca abre vazio", async () => {
    renderComEspiao("/console?aba=PLANOS");

    expect(await screen.findByText("Bar do Zé")).toBeInTheDocument();
    expect(abaBotao("Estabelecimentos")).toHaveClass("console__aba--ativa");
  });

  it("clicar numa aba escreve o parâmetro; voltar para Estabelecimentos o remove", async () => {
    const user = userEvent.setup();
    renderComEspiao();
    expect(await screen.findByText("Bar do Zé")).toBeInTheDocument();

    await user.click(abaBotao("Planos e assinaturas"));
    expect(url()).toBe("/console?aba=planos");

    await user.click(abaBotao("Estabelecimentos"));
    expect(url()).toBe("/console");
  });

  it("trocar de aba não empilha histórico: 'voltar' sai do Console", async () => {
    const user = userEvent.setup();
    renderComEspiao("/console", ["/inicio"]);
    expect(await screen.findByText("Bar do Zé")).toBeInTheDocument();

    await user.click(abaBotao("Planos e assinaturas"));
    await user.click(abaBotao("Uso e faturamento"));
    await user.click(abaBotao("Estabelecimentos"));

    await user.click(screen.getByRole("button", { name: "voltar-teste" }));
    expect(url()).toBe("/inicio");
  });

  it("aba e recorte de situação convivem: um não apaga o outro", async () => {
    const user = userEvent.setup();
    renderComEspiao("/console?situacao=em_dia");
    expect(await screen.findByText("Bar do Zé")).toBeInTheDocument();

    await user.click(abaBotao("Planos e assinaturas"));
    expect(url()).toContain("situacao=em_dia");
    expect(url()).toContain("aba=planos");

    await user.click(abaBotao("Estabelecimentos"));
    expect(url()).toBe("/console?situacao=em_dia");
  });
});

describe("ConsolePage — o período do uso fica na URL", () => {
  const EspiaoURL = () => {
    const loc = useLocation();
    const navigate = useNavigate();
    return (
      <>
        <span data-testid="url">{loc.pathname + loc.search}</span>
        <button type="button" onClick={() => navigate(-1)}>
          voltar-teste
        </button>
      </>
    );
  };
  const url = () => screen.getByTestId("url").textContent;
  const renderComEspiao = (route = "/console", anteriores = []) =>
    render(
      <MemoryRouter initialEntries={[...anteriores, route]} initialIndex={anteriores.length}>
        <ConsolePage />
        <EspiaoURL />
      </MemoryRouter>
    );
  const periodoBotao = (rotulo) => screen.getByRole("button", { name: rotulo });
  // A aba de uso só existe depois que o grupo de período aparece.
  const esperarUso = () => screen.findByText("Mostrando os últimos");

  beforeEach(() => {
    mockListarEstabelecimentos.mockReset();
    mockListarPlanos.mockReset();
    mockListarAssinaturas.mockReset();
    mockListarEstabelecimentos.mockResolvedValue(ok(TENANTS));
    mockListarPlanos.mockResolvedValue(ok(PLANOS));
    mockListarAssinaturas.mockResolvedValue(ok(ASSINATURAS));
    banco.addons = [];
    banco.erroAddons = null;
    setAppMock({ currentUser: { name: "Plataforma" }, logout: vi.fn() });
  });

  it("abrir com ?aba=uso&dias=90 já mostra 90 dias marcado, sem clique", async () => {
    renderComEspiao("/console?aba=uso&dias=90");
    await esperarUso();

    expect(periodoBotao("90 dias")).toHaveAttribute("aria-pressed", "true");
    expect(periodoBotao("30 dias")).toHaveAttribute("aria-pressed", "false");
  });

  it("período inventado na URL cai em 30 dias, o padrão de hoje", async () => {
    renderComEspiao("/console?aba=uso&dias=45");
    await esperarUso();

    expect(periodoBotao("30 dias")).toHaveAttribute("aria-pressed", "true");
  });

  it("clicar num período escreve o parâmetro; 30 dias o remove", async () => {
    const user = userEvent.setup();
    renderComEspiao("/console?aba=uso");
    await esperarUso();

    await user.click(periodoBotao("90 dias"));
    expect(url()).toBe("/console?aba=uso&dias=90");

    await user.click(periodoBotao("30 dias"));
    expect(url()).toBe("/console?aba=uso");
  });

  it("trocar de período não empilha histórico: 'voltar' sai do Console", async () => {
    const user = userEvent.setup();
    renderComEspiao("/console?aba=uso", ["/inicio"]);
    await esperarUso();

    await user.click(periodoBotao("7 dias"));
    await user.click(periodoBotao("90 dias"));
    await user.click(periodoBotao("30 dias"));

    await user.click(screen.getByRole("button", { name: "voltar-teste" }));
    expect(url()).toBe("/inicio");
  });

  it("período, aba e recorte convivem: nenhuma escrita apaga a outra", async () => {
    const user = userEvent.setup();
    renderComEspiao("/console?aba=uso&situacao=em_dia");
    await esperarUso();

    await user.click(periodoBotao("90 dias"));
    expect(url()).toContain("aba=uso");
    expect(url()).toContain("situacao=em_dia");
    expect(url()).toContain("dias=90");

    // Sair da aba de uso mantém o período guardado para quando ela voltar.
    await user.click(screen.getByRole("button", { name: /Estabelecimentos/i }));
    expect(url()).toBe("/console?situacao=em_dia&dias=90");
  });

  it("o período fica na URL mesmo com outra aba aberta, e volta a valer no uso", async () => {
    const user = userEvent.setup();
    renderComEspiao("/console?dias=90");
    expect(await screen.findByText("Bar do Zé")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Uso e faturamento/i }));
    await esperarUso();
    expect(periodoBotao("90 dias")).toHaveAttribute("aria-pressed", "true");
  });
});

describe("ConsolePage — o recorte por plano", () => {
  // Mesmo espião das rodadas 33 a 35: o MemoryRouter não mexe em
  // `window.location`, então o endereço se lê pelo roteador.
  const EspiaoURL = () => {
    const loc = useLocation();
    const navigate = useNavigate();
    return (
      <>
        <span data-testid="url">{loc.pathname + loc.search}</span>
        <button type="button" onClick={() => navigate(-1)}>
          voltar-teste
        </button>
      </>
    );
  };
  const url = () => screen.getByTestId("url").textContent;
  const renderComEspiao = (route = "/console", anteriores = []) =>
    render(
      <MemoryRouter initialEntries={[...anteriores, route]} initialIndex={anteriores.length}>
        <ConsolePage />
        <EspiaoURL />
      </MemoryRouter>
    );

  // Três estabelecimentos: um em cada plano e um AINDA SEM plano — é ele que
  // prova que o recorte não afirma o que não sabe.
  const BASE = [
    { id: "t1", nome: "Bar do Zé", plano_codigo: "basico", tema: {}, created_at: "2026-01-10T12:00:00Z" },
    { id: "t2", nome: "Café Central", plano_codigo: "avancado", tema: {}, created_at: "2026-02-11T12:00:00Z" },
    { id: "t3", nome: "Padaria São João", plano_codigo: null, tema: {}, created_at: "2026-03-12T12:00:00Z" },
  ];
  // Catálogo com um plano a mais, que ninguém contratou.
  const CATALOGO = [
    { codigo: "basico", nome: "Básico" },
    { codigo: "avancado", nome: "Avançado" },
    { codigo: "premium", nome: "Premium" },
  ];
  const EM_DIA = BASE.map((t, i) => ({
    tenant_id: t.id,
    valor_mensal: 149.9,
    data_vencimento: `2099-0${i + 1}-10`,
    carencia_dias: 3,
    status: "ativo",
  }));

  const emDias = (n) => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const nomes = () =>
    screen.getAllByRole("listitem").map((li) => li.querySelector(".console__card-nome")?.textContent);
  const linhaPlanos = () => screen.queryByRole("group", { name: /Filtrar por plano/i });
  const atalhoPlano = (nome) =>
    within(linhaPlanos()).getByRole("button", { name: new RegExp(`^${nome}`) });
  const atalhoSituacao = (nome) =>
    within(screen.getByRole("group", { name: /Filtrar por situação/i })).getByRole("button", {
      name: new RegExp(`^${nome}`),
    });

  beforeEach(() => {
    mockListarEstabelecimentos.mockReset();
    mockListarPlanos.mockReset();
    mockListarAssinaturas.mockReset();
    mockListarEstabelecimentos.mockResolvedValue(ok(BASE));
    mockListarPlanos.mockResolvedValue(ok(CATALOGO));
    mockListarAssinaturas.mockResolvedValue(ok(EM_DIA));
    banco.addons = [];
    banco.erroAddons = null;
    setAppMock({ currentUser: { name: "Plataforma" }, logout: vi.fn() });
  });

  it("mostra um atalho por plano do catálogo, com a contagem no próprio botão", async () => {
    renderComEspiao();
    expect(await screen.findByText("Bar do Zé")).toBeInTheDocument();

    const botoes = within(linhaPlanos()).getAllByRole("button");
    // "Premium" aparece com zero de propósito: "ninguém está nesse plano"
    // também é resposta, e some da tela seria esconder o catálogo.
    expect(botoes.map((b) => b.textContent)).toEqual([
      "Todos os planos3",
      "Básico1",
      "Avançado1",
      "Premium0",
    ]);
  });

  it("abrir /console?plano=basico já mostra a lista recortada e o atalho marcado", async () => {
    renderComEspiao("/console?plano=basico");
    expect(await screen.findByText("Bar do Zé")).toBeInTheDocument();

    expect(nomes()).toEqual(["Bar do Zé"]);
    expect(atalhoPlano("Básico")).toHaveAttribute("aria-pressed", "true");
    expect(atalhoPlano("Todos os planos")).toHaveAttribute("aria-pressed", "false");
  });

  it("quem ainda não tem plano aparece em 'Todos os planos' e em nenhum recorte", async () => {
    const user = userEvent.setup();
    renderComEspiao();
    expect(await screen.findByText("Padaria São João")).toBeInTheDocument();

    await user.click(atalhoPlano("Básico"));
    expect(nomes()).not.toContain("Padaria São João");

    await user.click(atalhoPlano("Todos os planos"));
    expect(nomes()).toContain("Padaria São João");
  });

  it("clicar num plano escreve o parâmetro; 'Todos os planos' o remove", async () => {
    const user = userEvent.setup();
    renderComEspiao();
    expect(await screen.findByText("Bar do Zé")).toBeInTheDocument();

    await user.click(atalhoPlano("Avançado"));
    expect(url()).toBe("/console?plano=avancado");

    await user.click(atalhoPlano("Todos os planos"));
    expect(url()).toBe("/console");
  });

  it("plano inventado na URL não esconde ninguém", async () => {
    renderComEspiao("/console?plano=xpto");
    expect(await screen.findByText("Bar do Zé")).toBeInTheDocument();

    expect(nomes()).toEqual(["Bar do Zé", "Café Central", "Padaria São João"]);
    expect(atalhoPlano("Todos os planos")).toHaveAttribute("aria-pressed", "true");
  });

  it("trocar de plano não empilha histórico: 'voltar' sai do Console", async () => {
    const user = userEvent.setup();
    renderComEspiao("/console", ["/inicio"]);
    expect(await screen.findByText("Bar do Zé")).toBeInTheDocument();

    await user.click(atalhoPlano("Básico"));
    await user.click(atalhoPlano("Avançado"));
    await user.click(atalhoPlano("Todos os planos"));

    await user.click(screen.getByRole("button", { name: "voltar-teste" }));
    expect(url()).toBe("/inicio");
  });

  it("plano, situação, aba e período convivem no mesmo endereço", async () => {
    const user = userEvent.setup();
    renderComEspiao("/console?situacao=em_dia&dias=90");
    expect(await screen.findByText("Bar do Zé")).toBeInTheDocument();

    await user.click(atalhoPlano("Básico"));
    expect(url()).toBe("/console?situacao=em_dia&dias=90&plano=basico");

    // Trocar de aba não apaga nenhum dos recortes da lista.
    await user.click(screen.getByRole("button", { name: /Planos e assinaturas/i }));
    expect(url()).toBe("/console?situacao=em_dia&dias=90&plano=basico&aba=planos");
  });

  it("os três cortes se combinam: situação, depois plano, depois busca", async () => {
    const user = userEvent.setup();
    // t1 vencido há um mês (precisa de atenção); os outros dois em dia.
    mockListarAssinaturas.mockResolvedValue(
      ok([
        { tenant_id: "t1", valor_mensal: 149.9, data_vencimento: emDias(-30), carencia_dias: 3, status: "ativo" },
        { tenant_id: "t2", valor_mensal: 249.9, data_vencimento: "2099-02-11", carencia_dias: 3, status: "ativo" },
        { tenant_id: "t3", valor_mensal: 249.9, data_vencimento: "2099-03-12", carencia_dias: 3, status: "ativo" },
      ])
    );
    renderComEspiao();
    expect(await screen.findByText("Bar do Zé")).toBeInTheDocument();

    await user.click(atalhoSituacao("Em dia"));
    expect(nomes()).toEqual(["Café Central", "Padaria São João"]);

    await user.click(atalhoPlano("Avançado"));
    expect(nomes()).toEqual(["Café Central"]);

    await user.type(screen.getByLabelText("Buscar estabelecimento pelo nome ou endereço"), "zé");
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
    expect(
      screen.getByText(/Nenhum estabelecimento com “zé” em “Em dia e Avançado”/)
    ).toBeInTheDocument();
  });

  it("o vazio do plano nomeia o plano e volta com um clique só", async () => {
    const user = userEvent.setup();
    renderComEspiao();
    expect(await screen.findByText("Bar do Zé")).toBeInTheDocument();

    await user.click(atalhoPlano("Premium"));
    expect(screen.getByText("Nenhum estabelecimento em “Premium”")).toBeInTheDocument();
    expect(screen.getByText(/A lista está filtrada por “Premium”/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Ver todos" }));
    expect(nomes()).toEqual(["Bar do Zé", "Café Central", "Padaria São João"]);
    expect(url()).toBe("/console");
  });

  it("o 'Ver todos' do vazio limpa situação e plano de uma vez", async () => {
    const user = userEvent.setup();
    renderComEspiao("/console?situacao=em_dia&plano=premium");
    await waitFor(() =>
      expect(screen.getByText(/A lista está filtrada por/)).toBeInTheDocument()
    );

    expect(screen.getByText("Nenhum estabelecimento em “Em dia e Premium”")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Ver todos" }));
    expect(url()).toBe("/console");
  });

  it("com um plano só no catálogo a linha não aparece — não haveria o que recortar", async () => {
    mockListarPlanos.mockResolvedValue(ok([{ codigo: "basico", nome: "Básico" }]));
    renderComEspiao();
    expect(await screen.findByText("Bar do Zé")).toBeInTheDocument();

    expect(linhaPlanos()).not.toBeInTheDocument();
  });

  it("catálogo que falhou ao carregar esconde a linha e ignora o parâmetro", async () => {
    mockListarPlanos.mockResolvedValue(falhou());
    renderComEspiao("/console?plano=basico");
    expect(await screen.findByText("Bar do Zé")).toBeInTheDocument();

    expect(linhaPlanos()).not.toBeInTheDocument();
    // Sem catálogo confiável, ninguém some da lista por causa da URL.
    expect(nomes()).toEqual(["Bar do Zé", "Café Central", "Padaria São João"]);
  });

  it("os rótulos saem do catálogo do banco, não de uma lista fixa no código", async () => {
    mockListarPlanos.mockResolvedValue(
      ok([
        { codigo: "food_truck", nome: "Food Truck" },
        { codigo: "rede", nome: "Rede" },
      ])
    );
    renderComEspiao();
    expect(await screen.findByText("Bar do Zé")).toBeInTheDocument();

    const botoes = within(linhaPlanos()).getAllByRole("button");
    expect(botoes.map((b) => b.textContent)).toEqual(["Todos os planos3", "Food Truck0", "Rede0"]);
  });
});

// CONSOLE-UX 11 — o minuto seguinte à venda: o dono acabou de criar o
// estabelecimento e precisa mandar o acesso para o cliente. O cartão é
// exercitado pela porta de verdade (preencher e enviar o formulário de
// criação), não injetando estado na página.
describe("ConsolePage — o cartão de primeiro acesso", () => {
  const RESPOSTA = { nome: "Bar do Zé", slug: "bar-do-ze", admin: { username: "barze" } };

  // A mensagem esperada é a da própria função pura: se ela mudar, o teste
  // acompanha; o que se prova aqui é que a tela copia EXATAMENTE o que ela
  // devolve, e não um texto montado à parte no JSX.
  const mensagemEsperada = () =>
    montarMensagemPrimeiroAcesso({
      estabelecimento: "Bar do Zé",
      plano: "Avançado",
      endereco: window.location.origin,
      usuario: "barze",
    });

  const prepararTela = () => {
    const user = userEvent.setup();
    const escrever = vi.fn().mockResolvedValue(undefined);
    // Área de transferência dublada depois do setup: em jsdom ela não existe
    // de verdade, e é justamente a chamada que precisamos observar.
    Object.defineProperty(window.navigator, "clipboard", {
      value: { writeText: escrever },
      configurable: true,
    });
    renderWithProviders(<ConsolePage />);
    return { user, escrever };
  };

  const criarEstabelecimento = async (user) => {
    await user.click(await screen.findByRole("button", { name: /Novo estabelecimento/i }));
    await user.type(screen.getByLabelText(/Nome do estabelecimento/i), "Bar do Zé");
    await user.type(screen.getByLabelText(/Nome do responsável/i), "José da Silva");
    // O campo já vem preenchido a partir do responsável (CONSOLE-UX 22) —
    // limpar antes evita concatenar com a sugestão.
    await user.clear(screen.getByLabelText(/Usuário de acesso/i));
    await user.type(screen.getByLabelText(/Usuário de acesso/i), "barze");
    await user.type(screen.getByLabelText(/Senha provisória/i), "senha-forte-123");
    // Sem o aceite dos Termos o botão nasce travado (pré-venda §1.5) — marcar
    // aqui é o que este helper faz de propósito: quem testa o Console não está
    // testando o aceite, e sim o que vem depois do cadastro.
    await user.click(screen.getByRole("checkbox", { name: /Termos de Uso/i }));
    await user.click(screen.getByRole("button", { name: /^Criar estabelecimento$/i }));
    return screen.findByRole("region", { name: /Dados de primeiro acesso/i });
  };

  const cartao = () => screen.queryByRole("region", { name: /Dados de primeiro acesso/i });
  const dado = (rotulo) => {
    const dt = screen.getByText(rotulo, { selector: "dt" });
    return dt.parentElement.querySelector("dd")?.textContent;
  };

  beforeEach(() => {
    mockListarEstabelecimentos.mockReset();
    mockListarPlanos.mockReset();
    mockListarAssinaturas.mockReset();
    mockProvisionar.mockReset();
    mockListarEstabelecimentos.mockResolvedValue(ok(TENANTS));
    mockListarPlanos.mockResolvedValue(ok(PLANOS));
    mockListarAssinaturas.mockResolvedValue(ok(ASSINATURAS));
    mockProvisionar.mockResolvedValue({ data: RESPOSTA, error: null });
    banco.addons = [];
    banco.erroAddons = null;
    setAppMock({ currentUser: { name: "Plataforma" }, logout: vi.fn() });
  });

  it("depois de criar, mostra os dados que o cliente precisa para entrar", async () => {
    const { user } = prepararTela();
    await criarEstabelecimento(user);

    expect(dado("Estabelecimento")).toBe("Bar do Zé");
    expect(dado("Usuário")).toBe("barze");
    // O plano vem do formulário (pré-selecionado no mais completo) e aparece
    // pelo NOME, não pelo código.
    expect(dado("Plano")).toBe("Avançado");
    expect(dado("Endereço de entrada")).toBe(window.location.origin);
    expect(screen.getByRole("button", { name: /Copiar dados de acesso/i })).toBeInTheDocument();
  });

  it("a senha nunca aparece na tela — só a instrução de mandá-la em separado", async () => {
    const { user } = prepararTela();
    await criarEstabelecimento(user);

    expect(dado("Senha")).toMatch(/definiu no cadastro/i);
    expect(screen.queryByText(/senha-forte-123/)).not.toBeInTheDocument();
  });

  it("copiar põe a mensagem pronta na área de transferência e confirma na tela", async () => {
    const { user, escrever } = prepararTela();
    await criarEstabelecimento(user);

    expect(screen.queryByText("Copiado!")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Copiar dados de acesso/i }));

    expect(escrever).toHaveBeenCalledTimes(1);
    const texto = escrever.mock.calls[0][0];
    expect(texto).toBe(mensagemEsperada());
    expect(texto).not.toContain("senha-forte-123");
    expect(await screen.findByText("Copiado!")).toBeInTheDocument();
  });

  it("cópia que falha não mente: mostra o texto para copiar à mão", async () => {
    const { user, escrever } = prepararTela();
    escrever.mockRejectedValue(new Error("permissão negada"));
    await criarEstabelecimento(user);

    await user.click(screen.getByRole("button", { name: /Copiar dados de acesso/i }));

    const caixa = await screen.findByLabelText("Mensagem de primeiro acesso");
    expect(caixa).toHaveValue(mensagemEsperada());
    expect(screen.queryByText("Copiado!")).not.toBeInTheDocument();
  });

  it("o cartão é dispensável", async () => {
    const { user } = prepararTela();
    await criarEstabelecimento(user);

    await user.click(screen.getByRole("button", { name: "Dispensar" }));
    expect(cartao()).not.toBeInTheDocument();
  });

  it("resposta sem usuário não vira 'undefined' na tela", async () => {
    mockProvisionar.mockResolvedValue({ data: { nome: "Bar do Zé" }, error: null });
    const { user } = prepararTela();
    await criarEstabelecimento(user);

    expect(screen.queryByText("Usuário", { selector: "dt" })).not.toBeInTheDocument();
    expect(screen.queryByText(/undefined/)).not.toBeInTheDocument();
    expect(dado("Estabelecimento")).toBe("Bar do Zé");
  });

  // CONSOLE-UX 18 — no minuto seguinte à criação o dono está com o cliente na
  // linha. O endereço da loja pública já existe; mostrá-lo aqui evita a volta
  // "e o cardápio, qual é o link?".
  it("mostra o endereço do cardápio recém-criado, como link de aba nova", async () => {
    const { user } = prepararTela();
    const cartaoCriado = await criarEstabelecimento(user);

    expect(dado("Endereço do cardápio")).toBe("/cardapio?loja=bar-do-ze");
    const link = within(cartaoCriado).getByRole("link", { name: "/cardapio?loja=bar-do-ze" });
    expect(link).toHaveAttribute("href", "/cardapio?loja=bar-do-ze");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("resposta sem slug não inventa endereço de cardápio", async () => {
    mockProvisionar.mockResolvedValue({ data: { nome: "Bar do Zé" }, error: null });
    const { user } = prepararTela();
    const cartaoCriado = await criarEstabelecimento(user);

    expect(screen.queryByText("Endereço do cardápio", { selector: "dt" })).not.toBeInTheDocument();
    expect(within(cartaoCriado).queryByRole("link")).not.toBeInTheDocument();
  });

  it("slug fora do formato de endereço também não vira link", async () => {
    mockProvisionar.mockResolvedValue({ data: { ...RESPOSTA, slug: "bar do zé" }, error: null });
    const { user } = prepararTela();
    await criarEstabelecimento(user);

    expect(screen.queryByText("Endereço do cardápio", { selector: "dt" })).not.toBeInTheDocument();
  });

  // Com domínio raiz ligado, a origem do navegador é a porta do CONSOLE — não
  // a do cliente. O cartão precisa falar do estabelecimento criado.
  it("com domínio raiz, a entrada é o subdomínio do estabelecimento, não o do Console", async () => {
    dominioRaiz.valor = "gastromundi.app";
    const { user } = prepararTela();
    await criarEstabelecimento(user);

    expect(dado("Endereço de entrada")).toBe("https://bar-do-ze.gastromundi.app");
  });

  it("endereço que não dá para afirmar some do cartão e da mensagem copiada", async () => {
    dominioRaiz.valor = "gastromundi.app";
    mockProvisionar.mockResolvedValue({
      data: { nome: "Bar do Zé", admin: { username: "barze" } },
      error: null,
    });
    const { user, escrever } = prepararTela();
    await criarEstabelecimento(user);

    expect(screen.queryByText("Endereço de entrada", { selector: "dt" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Copiar dados de acesso/i }));
    const texto = escrever.mock.calls[0][0];
    expect(texto).not.toMatch(/Endereço:/);
    expect(texto).not.toMatch(/undefined|null/);
    expect(texto).toContain("Usuário: barze");
  });

  it("começar outra ação fecha o cartão — a tela não acumula dois avisos", async () => {
    const { user } = prepararTela();
    await criarEstabelecimento(user);

    await user.click(screen.getByRole("button", { name: /^Café Central/ }));
    expect(cartao()).not.toBeInTheDocument();
  });
});

// CONSOLE-UX 12 — o preço combinado é gravado no ato do cadastro. O que se
// prova aqui é o lado da TELA: o cartão confere o valor gravado, a mensagem
// para o cliente continua sem qualquer valor financeiro, e a falha só do
// preço aparece como aviso — nunca como "a criação falhou".
describe("ConsolePage — a mensalidade no cartão de primeiro acesso", () => {
  const prepararTela = () => {
    const user = userEvent.setup();
    const escrever = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window.navigator, "clipboard", {
      value: { writeText: escrever },
      configurable: true,
    });
    renderWithProviders(<ConsolePage />);
    return { user, escrever };
  };

  const criarEstabelecimento = async (user, mensalidade) => {
    await user.click(await screen.findByRole("button", { name: /Novo estabelecimento/i }));
    await user.type(screen.getByLabelText(/Nome do estabelecimento/i), "Bar do Zé");
    if (mensalidade) await user.type(screen.getByLabelText(/Mensalidade combinada/i), mensalidade);
    await user.type(screen.getByLabelText(/Nome do responsável/i), "José da Silva");
    // O campo já vem preenchido a partir do responsável (CONSOLE-UX 22) —
    // limpar antes evita concatenar com a sugestão.
    await user.clear(screen.getByLabelText(/Usuário de acesso/i));
    await user.type(screen.getByLabelText(/Usuário de acesso/i), "barze");
    await user.type(screen.getByLabelText(/Senha provisória/i), "senha-forte-123");
    // Sem o aceite dos Termos o botão nasce travado (pré-venda §1.5) — marcar
    // aqui é o que este helper faz de propósito: quem testa o Console não está
    // testando o aceite, e sim o que vem depois do cadastro.
    await user.click(screen.getByRole("checkbox", { name: /Termos de Uso/i }));
    await user.click(screen.getByRole("button", { name: /^Criar estabelecimento$/i }));
    return screen.findByRole("region", { name: /Dados de primeiro acesso/i });
  };

  const dado = (rotulo) => {
    const dt = screen.queryByText(rotulo, { selector: "dt" });
    return dt ? dt.parentElement.querySelector("dd")?.textContent : null;
  };

  beforeEach(() => {
    mockListarEstabelecimentos.mockReset();
    mockListarPlanos.mockReset();
    mockListarAssinaturas.mockReset();
    mockProvisionar.mockReset();
    mockDefinirMensalidade.mockReset();
    mockListarEstabelecimentos.mockResolvedValue(ok(TENANTS));
    mockListarPlanos.mockResolvedValue(ok(PLANOS));
    mockListarAssinaturas.mockResolvedValue(ok(ASSINATURAS));
    mockProvisionar.mockResolvedValue({
      data: { tenant_id: "t-novo", nome: "Bar do Zé", admin: { username: "barze" } },
      error: null,
    });
    mockDefinirMensalidade.mockResolvedValue({ data: { valor_mensal: 300 }, error: null });
    banco.addons = [];
    banco.erroAddons = null;
    setAppMock({ currentUser: { name: "Plataforma" }, logout: vi.fn() });
  });

  it("mostra o preço gravado, mas não o manda para o cliente", async () => {
    const { user, escrever } = prepararTela();
    await criarEstabelecimento(user, "300,00");

    expect(mockDefinirMensalidade).toHaveBeenCalledWith("t-novo", 300);
    expect(dado("Mensalidade")).toBe(`${formatarReais(300)} por mês`);

    await user.click(screen.getByRole("button", { name: /Copiar dados de acesso/i }));
    const texto = escrever.mock.calls[0][0];
    expect(texto).not.toMatch(/R\$/);
    expect(texto).not.toMatch(/mensalidade/i);
    expect(texto).not.toMatch(/300,00|300\.00/);
  });

  it("sem preço combinado, o cartão não inventa uma linha de mensalidade", async () => {
    const { user } = prepararTela();
    await criarEstabelecimento(user);

    expect(mockDefinirMensalidade).not.toHaveBeenCalled();
    expect(dado("Mensalidade")).toBeNull();
  });

  it("preço que não salvou vira aviso — a criação não é desmentida", async () => {
    mockDefinirMensalidade.mockResolvedValue({ data: null, error: { message: "recusado" } });
    const { user } = prepararTela();
    await criarEstabelecimento(user, "300,00");

    const aviso = screen.getByRole("alert");
    expect(aviso).toHaveTextContent(/O estabelecimento foi criado, mas a mensalidade não foi salva/i);
    expect(aviso).toHaveTextContent(/Planos e assinaturas/i);
    // O cartão segue inteiro: o acesso do cliente não depende do preço.
    expect(dado("Usuário")).toBe("barze");
    expect(dado("Mensalidade")).toBeNull();
  });
});

// CONSOLE-UX 13 — quem está sendo cobrado sem preço definido aparece na lista.
//
// `provisionar_tenant` (20260908) cria a assinatura com `valor_mensal = 0`, e
// quem entrou antes da rodada 38 segue assim. Até aqui isso só existia como um
// número no aviso da outra aba: na lista principal, o cliente de cortesia e o
// cliente de R$ 300 tinham exatamente a mesma cara.
describe("ConsolePage — quem está sem mensalidade na lista", () => {
  const cardDe = (nome) => screen.getByText(nome).closest("li");
  const semPreco = (extra = {}) => ({
    tenant_id: "t1",
    valor_mensal: 0,
    data_vencimento: "2099-01-10",
    carencia_dias: 3,
    status: "ativo",
    ...extra,
  });

  beforeEach(() => {
    mockListarEstabelecimentos.mockReset();
    mockListarPlanos.mockReset();
    mockListarAssinaturas.mockReset();
    mockDefinirMensalidade.mockReset();
    mockListarEstabelecimentos.mockResolvedValue(ok(TENANTS));
    mockListarPlanos.mockResolvedValue(ok(PLANOS));
    mockListarAssinaturas.mockResolvedValue(ok([semPreco(), ASSINATURAS[1]]));
    mockDefinirMensalidade.mockResolvedValue({ data: { tenant_id: "t1", valor_mensal: 300 }, error: null });
    banco.addons = [];
    banco.erroAddons = null;
    setAppMock({ currentUser: { name: "Plataforma" }, logout: vi.fn() });
  });

  it("card de quem cobra sem preço diz 'Sem mensalidade' — quem tem preço não ganha marca", async () => {
    renderWithProviders(<ConsolePage />);
    expect(await screen.findByText("Bar do Zé")).toBeInTheDocument();

    await waitFor(() =>
      expect(within(cardDe("Bar do Zé")).getByText("Sem mensalidade")).toBeInTheDocument()
    );
    // Segue ativo: o que falta é o preço, não a assinatura.
    expect(within(cardDe("Bar do Zé")).getByText("Ativo")).toBeInTheDocument();
    expect(within(cardDe("Café Central")).queryByText("Sem mensalidade")).not.toBeInTheDocument();
  });

  it("em carência sem preço também é marcado — continua sendo base que paga", async () => {
    const ontem = new Date();
    ontem.setDate(ontem.getDate() - 1);
    const dia = `${ontem.getFullYear()}-${String(ontem.getMonth() + 1).padStart(2, "0")}-${String(ontem.getDate()).padStart(2, "0")}`;
    mockListarAssinaturas.mockResolvedValue(ok([semPreco({ data_vencimento: dia }), ASSINATURAS[1]]));
    renderWithProviders(<ConsolePage />);
    expect(await screen.findByText("Bar do Zé")).toBeInTheDocument();

    await waitFor(() =>
      expect(within(cardDe("Bar do Zé")).getByText("Sem mensalidade")).toBeInTheDocument()
    );
  });

  it("cancelado e sem assinatura não ganham a marca — não é dinheiro esquecido", async () => {
    mockListarAssinaturas.mockResolvedValue(ok([semPreco({ status: "cancelado" })]));
    renderWithProviders(<ConsolePage />);
    expect(await screen.findByText("Café Central")).toBeInTheDocument();

    await waitFor(() =>
      expect(within(cardDe("Café Central")).getByText("Sem assinatura")).toBeInTheDocument()
    );
    expect(screen.queryByText("Sem mensalidade")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Definir mensalidade de/i })).not.toBeInTheDocument();
  });

  it("com a leitura da cobrança quebrada, a tela não afirma que falta preço", async () => {
    mockListarAssinaturas.mockResolvedValue(falhou());
    renderWithProviders(<ConsolePage />);
    expect(await screen.findByText("Bar do Zé")).toBeInTheDocument();

    await waitFor(() =>
      expect(within(cardDe("Bar do Zé")).getByText("Situação indisponível")).toBeInTheDocument()
    );
    expect(screen.queryByText("Sem mensalidade")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Definir mensalidade de/i })).not.toBeInTheDocument();
  });

  it("o botão do card abre o modal do estabelecimento certo, grava e confirma na tela", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ConsolePage />);
    expect(await screen.findByText("Bar do Zé")).toBeInTheDocument();

    const botao = await screen.findByRole("button", { name: "Definir mensalidade de Bar do Zé" });
    // Só o card sem preço tem o botão — o outro não é oferecido à toa.
    expect(
      screen.queryByRole("button", { name: "Definir mensalidade de Café Central" })
    ).not.toBeInTheDocument();
    await user.click(botao);

    const modal = await screen.findByRole("dialog", { name: /Definir mensalidade do estabelecimento/i });
    expect(within(modal).getByText("Bar do Zé")).toBeInTheDocument();

    // A releitura já traz o preço gravado: a marca some sozinha, sem clique extra.
    mockListarAssinaturas.mockResolvedValue(ok([semPreco({ valor_mensal: 300 }), ASSINATURAS[1]]));
    await user.type(within(modal).getByLabelText(/Mensalidade/i), "300");
    await user.click(within(modal).getByRole("button", { name: /Salvar mensalidade/i }));

    expect(mockDefinirMensalidade).toHaveBeenCalledWith("t1", 300);
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: /Definir mensalidade do estabelecimento/i })
      ).not.toBeInTheDocument()
    );
    const faixa = await screen.findByText(/Mensalidade de/i);
    expect(faixa).toHaveTextContent("Bar do Zé");
    expect(faixa.textContent.replace(/\s/g, " ")).toContain(formatarReais(300).replace(/\s/g, " "));
    await waitFor(() => expect(screen.queryByText("Sem mensalidade")).not.toBeInTheDocument());
  });
});

// Pré-venda §1.8 — o Console cadastrava e nunca mais consertava.
//
// `tenants` é SELECT-only sob RLS e nenhuma RPC escrevia `nome`, então um erro
// de digitação no cadastro só saía por UPDATE cru no SQL Editor. O modal tem
// teste próprio (`RenomearEstabelecimentoModal.test.jsx`); o que falta provar
// aqui é a PORTA: existe botão em cada card, ele abre o modal do
// estabelecimento certo, e a lista mostra o nome novo sem recarregar a página.
describe("ConsolePage — renomear um estabelecimento já criado", () => {
  const cardDe = (nome) => screen.getByText(nome).closest("li");

  beforeEach(() => {
    mockListarEstabelecimentos.mockReset();
    mockListarPlanos.mockReset();
    mockListarAssinaturas.mockReset();
    mockRenomear.mockReset();
    mockListarEstabelecimentos.mockResolvedValue(ok(TENANTS));
    mockListarPlanos.mockResolvedValue(ok(PLANOS));
    mockListarAssinaturas.mockResolvedValue(ok(ASSINATURAS));
    mockRenomear.mockResolvedValue(ok({ id: "t1", nome: "Bar do Zé — Centro" }));
    banco.addons = [];
    banco.erroAddons = null;
    setAppMock({ currentUser: { name: "Plataforma" }, logout: vi.fn() });
  });

  it("o botão do card abre o modal do estabelecimento certo, grava e a lista já mostra o nome novo", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ConsolePage />);
    expect(await screen.findByText("Bar do Zé")).toBeInTheDocument();

    // O rótulo carrega o nome: com cinco botões por card e vários cards na
    // tela, "Renomear" sozinho não diria QUAL estabelecimento.
    const botao = await screen.findByRole("button", { name: "Renomear Bar do Zé" });
    expect(within(cardDe("Café Central")).getByRole("button", { name: "Renomear Café Central" }))
      .toBeInTheDocument();
    await user.click(botao);

    const modal = await screen.findByRole("dialog", { name: /Renomear estabelecimento/i });
    // Já preenchido com o nome de hoje: corrige-se a letra em vez de redigitar.
    expect(within(modal).getByRole("textbox")).toHaveValue("Bar do Zé");

    // A releitura traz o nome novo — a lista se corrige sozinha, sem F5.
    mockListarEstabelecimentos.mockResolvedValue(
      ok([{ ...TENANTS[0], nome: "Bar do Zé — Centro" }, TENANTS[1]])
    );
    await user.clear(within(modal).getByRole("textbox"));
    await user.type(within(modal).getByRole("textbox"), "Bar do Zé — Centro");
    await user.click(within(modal).getByRole("button", { name: /Salvar nome/i }));

    expect(mockRenomear).toHaveBeenCalledWith("t1", "Bar do Zé — Centro");
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: /Renomear estabelecimento/i })).not.toBeInTheDocument()
    );
    const faixa = await screen.findByText(/Estabelecimento renomeado para/i);
    expect(faixa).toHaveTextContent("Bar do Zé — Centro");
    // O nome novo entra na LISTA (não só na faixa) e o antigo sai de cena.
    await waitFor(() => expect(screen.queryByText("Bar do Zé")).not.toBeInTheDocument());
    expect(
      screen.getAllByText("Bar do Zé — Centro").some((no) => no.closest("li"))
    ).toBe(true);
  });
});

// CONSOLE-UX 14 — a lista sai por partes.
//
// Renderizar todos os tenants de uma vez era o único ponto do Console que
// piorava conforme a venda dá certo: cada card carrega selo, vencimento e até
// cinco botões. O corte é só de renderização — ordem, recortes, busca e
// contagens continuam sobre a base inteira, senão todo contador da tela
// passaria a mentir.
describe("ConsolePage — lista de estabelecimentos por partes", () => {
  // 25 estabelecimentos em dia: mais que um bloco, sem ninguém no topo por
  // urgência (isso é assunto do último teste).
  const MUITOS = Array.from({ length: 25 }, (_, i) => ({
    id: `m${i + 1}`,
    nome: `Estabelecimento ${String(i + 1).padStart(2, "0")}`,
    plano_codigo: i % 2 === 0 ? "basico" : "avancado",
    tema: {},
    created_at: "2026-03-01T12:00:00Z",
  }));
  const ASSINATURAS_MUITOS = MUITOS.map((t) => ({
    tenant_id: t.id,
    valor_mensal: 200,
    data_vencimento: "2099-05-05",
    carencia_dias: 3,
    status: "ativo",
  }));
  const cards = () => document.querySelectorAll(".console__lista > li");

  beforeEach(() => {
    mockListarEstabelecimentos.mockReset();
    mockListarPlanos.mockReset();
    mockListarAssinaturas.mockReset();
    mockListarEstabelecimentos.mockResolvedValue(ok(MUITOS));
    mockListarPlanos.mockResolvedValue(ok(PLANOS));
    mockListarAssinaturas.mockResolvedValue(ok(ASSINATURAS_MUITOS));
    banco.addons = [];
    banco.erroAddons = null;
    setAppMock({ currentUser: { name: "Plataforma" }, logout: vi.fn() });
  });

  it("mostra o primeiro bloco e diz quantos existem no total", async () => {
    renderWithProviders(<ConsolePage />);
    expect(await screen.findByText("Estabelecimento 01")).toBeInTheDocument();

    await waitFor(() => expect(cards()).toHaveLength(20));
    expect(screen.getByText("Mostrando 20 de 25 estabelecimentos.")).toBeInTheDocument();
    // O 21º existe na base, mas ainda não foi renderizado.
    expect(screen.queryByText("Estabelecimento 21")).not.toBeInTheDocument();
  });

  it("o botão revela o resto e some quando não sobra ninguém", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ConsolePage />);
    expect(await screen.findByText("Estabelecimento 01")).toBeInTheDocument();

    await user.click(await screen.findByRole("button", { name: "Ver mais 5 estabelecimentos" }));

    await waitFor(() => expect(cards()).toHaveLength(25));
    // Quem já estava na tela continua lá — revelar não recomeça a lista.
    expect(screen.getByText("Estabelecimento 01")).toBeInTheDocument();
    expect(screen.getByText("Estabelecimento 25")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Ver mais/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/Mostrando \d+ de/)).not.toBeInTheDocument();
    // Nenhuma leitura nova: revelar é local.
    expect(mockListarEstabelecimentos).toHaveBeenCalledTimes(1);
  });

  it("com poucos estabelecimentos a tela fica como sempre foi", async () => {
    mockListarEstabelecimentos.mockResolvedValue(ok(TENANTS));
    mockListarAssinaturas.mockResolvedValue(ok(ASSINATURAS));
    renderWithProviders(<ConsolePage />);
    expect(await screen.findByText("Bar do Zé")).toBeInTheDocument();

    expect(screen.queryByRole("button", { name: /Ver mais/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/Mostrando \d+ de/)).not.toBeInTheDocument();
  });

  it("buscar volta ao primeiro bloco — a lista nova não herda o que foi revelado", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ConsolePage />);
    expect(await screen.findByText("Estabelecimento 01")).toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "Ver mais 5 estabelecimentos" }));
    await waitFor(() => expect(cards()).toHaveLength(25));

    // Busca que casa com todos ("Estabelecimento"): o recorte é do mesmo
    // tamanho, mas é uma lista nova — começa do primeiro bloco.
    await user.type(screen.getByLabelText("Buscar estabelecimento pelo nome ou endereço"), "Estabelecimento");

    await waitFor(() => expect(cards()).toHaveLength(20));
    expect(screen.getByText("Mostrando 20 de 25 estabelecimentos.")).toBeInTheDocument();
  });

  it("recortar por plano corta a conta junto — o rodapé fala do recorte, não da base", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ConsolePage />);
    expect(await screen.findByText("Estabelecimento 01")).toBeInTheDocument();

    // 13 no Básico (índices pares de 25): um bloco cheio e mais nada a revelar
    // além disso — o rodapé precisa contar 13, não 25.
    await user.click(await screen.findByRole("button", { name: /^Básico/ }));

    await waitFor(() => expect(cards()).toHaveLength(13));
    expect(screen.queryByRole("button", { name: /Ver mais/i })).not.toBeInTheDocument();
  });

  it("quem precisa de atenção cabe no primeiro bloco — o corte não esconde bloqueado", async () => {
    // O último da base, que sem urgência cairia no segundo bloco. O status vem
    // do vencimento (`resumirPlataforma` recalcula), então o que se muda aqui é
    // a data: vencida e fora da carência é bloqueado.
    const bloqueadas = ASSINATURAS_MUITOS.map((a) =>
      a.tenant_id === "m25" ? { ...a, data_vencimento: "2026-01-05" } : a
    );
    mockListarAssinaturas.mockResolvedValue(ok(bloqueadas));
    renderWithProviders(<ConsolePage />);
    expect(await screen.findByText("Estabelecimento 01")).toBeInTheDocument();

    await waitFor(() => expect(cards()).toHaveLength(20));
    expect(screen.getByText("Estabelecimento 25")).toBeInTheDocument();
    expect(cards()[0].textContent).toContain("Estabelecimento 25");
  });
});

// ── CONSOLE-UX 15 — prévia do cardápio de cada estabelecimento ──────
//
// O dono acaba de criar (ou de cobrar) um estabelecimento e quer ver a loja
// de pé. Até aqui isso só existia dentro do app do próprio estabelecimento,
// onde o super-admin não entra.
describe("ConsolePage — atalho para o cardápio do estabelecimento", () => {
  // Um com slug, um sem (tenant anterior à migration 20260740).
  const COM_SLUG = [
    { ...TENANTS[0], slug: "bar-do-ze" },
    { ...TENANTS[1], slug: null },
  ];

  beforeEach(() => {
    mockListarEstabelecimentos.mockReset();
    mockListarPlanos.mockReset();
    mockListarAssinaturas.mockReset();
    mockListarEstabelecimentos.mockResolvedValue(ok(COM_SLUG));
    mockListarPlanos.mockResolvedValue(ok(PLANOS));
    mockListarAssinaturas.mockResolvedValue(ok(ASSINATURAS));
    setAppMock({ currentUser: { name: "Plataforma" }, logout: vi.fn() });
  });

  it("o card com slug ganha um link para a vitrine pública daquele estabelecimento", async () => {
    renderWithProviders(<ConsolePage />);

    const link = await screen.findByRole("link", { name: /Ver cardápio de Bar do Zé/i });
    expect(link).toHaveAttribute("href", "/cardapio?loja=bar-do-ze");
    expect(within(link).getByText("Ver cardápio")).toBeInTheDocument();
  });

  it("abre em aba nova, sem entregar a aba do Console à página aberta", async () => {
    renderWithProviders(<ConsolePage />);

    const link = await screen.findByRole("link", { name: /Ver cardápio de Bar do Zé/i });
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  // Prevenção de erro > mensagem de erro: sem slug não há endereço, então o
  // atalho não existe — melhor do que um link que abre a loja de outro.
  it("card sem slug não mostra o atalho", async () => {
    renderWithProviders(<ConsolePage />);
    await screen.findByText("Café Central");

    expect(screen.queryByRole("link", { name: /Ver cardápio de Café Central/i })).not.toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /Ver cardápio/i })).toHaveLength(1);
  });

  it("slug fora do formato de endereço também não vira link", async () => {
    mockListarEstabelecimentos.mockResolvedValue(ok([{ ...TENANTS[0], slug: "bar do zé" }]));
    renderWithProviders(<ConsolePage />);
    await screen.findByText("Bar do Zé");

    expect(screen.queryByRole("link", { name: /Ver cardápio/i })).not.toBeInTheDocument();
  });

  // O link é IRMÃO do card, não filho: âncora dentro de <button> é HTML
  // inválido, e clicar nele trocaria o plano junto de abrir a loja.
  it("o link não fica dentro do botão que troca o plano", async () => {
    renderWithProviders(<ConsolePage />);
    const link = await screen.findByRole("link", { name: /Ver cardápio de Bar do Zé/i });

    expect(link.closest("button")).toBeNull();
    expect(link.closest("li")).not.toBeNull();
  });

  it("o atalho não atrapalha os outros do mesmo card", async () => {
    renderWithProviders(<ConsolePage />);
    await screen.findByText("Bar do Zé");
    const card = screen.getByRole("link", { name: /Ver cardápio de Bar do Zé/i }).closest("li");

    expect(within(card).getByTitle("Trocar o layout deste estabelecimento")).toBeInTheDocument();
    expect(within(card).getByTitle(/add-ons pagos deste estabelecimento/i)).toBeInTheDocument();
  });
});

// ── CONSOLE-UX 16 — copiar o acesso de um estabelecimento já existente ──
//
// O cartão de primeiro acesso só existe no minuto seguinte à criação. Quando o
// cliente pergunta "onde eu entro?" semanas depois, o dono não tinha de onde
// tirar a resposta sem abrir o banco.
describe("ConsolePage — copiar o acesso de quem já existe", () => {
  const prepararTela = ({ falharCopia = false } = {}) => {
    const user = userEvent.setup();
    const escrever = falharCopia
      ? vi.fn().mockRejectedValue(new Error("NotAllowedError"))
      : vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window.navigator, "clipboard", {
      value: { writeText: escrever },
      configurable: true,
    });
    renderWithProviders(<ConsolePage />);
    return { user, escrever };
  };

  beforeEach(() => {
    mockListarEstabelecimentos.mockReset();
    mockListarPlanos.mockReset();
    mockListarAssinaturas.mockReset();
    mockListarEstabelecimentos.mockResolvedValue(ok(TENANTS));
    mockListarPlanos.mockResolvedValue(ok(PLANOS));
    mockListarAssinaturas.mockResolvedValue(ok(ASSINATURAS));
    setAppMock({ currentUser: { name: "Plataforma" }, logout: vi.fn() });
  });

  it("copia nome, plano e endereço de entrada do estabelecimento clicado", async () => {
    const { user, escrever } = prepararTela();
    await screen.findByText("Bar do Zé");

    await user.click(screen.getByRole("button", { name: /Copiar acesso de Bar do Zé/i }));

    expect(escrever).toHaveBeenCalledTimes(1);
    const texto = escrever.mock.calls[0][0];
    expect(texto).toContain("Acesso do Bar do Zé");
    expect(texto).toContain("Plano: Básico");
    expect(texto).toContain(`Endereço: ${window.location.origin}`);
  });

  // A regra dura desta rodada: o que NÃO pode estar no texto. Usuário está
  // fora do alcance da RLS, senha não circula por área de transferência e
  // mensalidade é fatura, não é acesso.
  it("não copia usuário, senha nem valor", async () => {
    const { user, escrever } = prepararTela();
    await screen.findByText("Bar do Zé");

    await user.click(screen.getByRole("button", { name: /Copiar acesso de Bar do Zé/i }));

    const texto = escrever.mock.calls[0][0];
    expect(texto).not.toMatch(/Usuário:/);
    expect(texto).not.toMatch(/149|R\$/);
    expect(texto).toContain("Senha: a que foi definida no cadastro.");
    expect(texto).not.toMatch(/Senha:.*\w{6,}$/m);
  });

  it("o retorno aparece só no card clicado", async () => {
    const { user } = prepararTela();
    await screen.findByText("Café Central");

    await user.click(screen.getByRole("button", { name: /Copiar acesso de Café Central/i }));

    const avisos = await screen.findAllByText("Copiado!");
    expect(avisos).toHaveLength(1);
    expect(within(avisos[0].closest("li")).getByText("Café Central")).toBeInTheDocument();
  });

  it("copiar outro estabelecimento move o retorno de lugar", async () => {
    const { user } = prepararTela();
    await screen.findByText("Bar do Zé");

    await user.click(screen.getByRole("button", { name: /Copiar acesso de Bar do Zé/i }));
    await screen.findByText("Copiado!");
    await user.click(screen.getByRole("button", { name: /Copiar acesso de Café Central/i }));

    const avisos = await screen.findAllByText("Copiado!");
    expect(avisos).toHaveLength(1);
    expect(within(avisos[0].closest("li")).getByText("Café Central")).toBeInTheDocument();
  });

  // Sem área de transferência (contexto não seguro, permissão negada) a tela
  // não pode dizer "Copiado!": o dono mandaria uma mensagem vazia ao cliente.
  it("quando a área de transferência recusa, mostra o texto para copiar à mão", async () => {
    const { user } = prepararTela({ falharCopia: true });
    await screen.findByText("Bar do Zé");

    await user.click(screen.getByRole("button", { name: /Copiar acesso de Bar do Zé/i }));

    const manual = await screen.findByLabelText("Acesso de Bar do Zé");
    expect(manual.value).toContain("Acesso do Bar do Zé");
    expect(manual.value).toContain(`Endereço: ${window.location.origin}`);
    expect(screen.queryByText("Copiado!")).not.toBeInTheDocument();
  });

  it("o botão é irmão do card, não filho do botão que troca o plano", async () => {
    prepararTela();
    await screen.findByText("Bar do Zé");
    const botao = screen.getByRole("button", { name: /Copiar acesso de Bar do Zé/i });

    expect(botao.closest("button")).toBe(botao);
    expect(botao.closest("li")).not.toBeNull();
    expect(within(botao.closest("li")).getByTitle("Trocar o layout deste estabelecimento")).toBeInTheDocument();
  });

  it("todo estabelecimento da lista tem o atalho enquanto a entrada é compartilhada", async () => {
    prepararTela();
    await screen.findByText("Café Central");

    expect(screen.getAllByRole("button", { name: /Copiar acesso de/i })).toHaveLength(2);
  });
});

// ── CONSOLE-UX 17 — o endereço no card e na busca ───────────────────
//
// O cliente liga e se identifica pelo link ("meu link é bar-do-ze"). Até aqui
// esse dado só existia escondido no href do cardápio e no texto copiado: não
// dava para achar o estabelecimento por ele, nem para distinguir dois cards de
// nome parecido.
describe("ConsolePage — endereço do estabelecimento no card e na busca", () => {
  const COM_ENDERECO = [
    { ...TENANTS[0], slug: "bar-do-ze" },
    { ...TENANTS[1], slug: null },
  ];

  beforeEach(() => {
    mockListarEstabelecimentos.mockReset();
    mockListarPlanos.mockReset();
    mockListarAssinaturas.mockReset();
    mockListarEstabelecimentos.mockResolvedValue(ok(COM_ENDERECO));
    mockListarPlanos.mockResolvedValue(ok(PLANOS));
    mockListarAssinaturas.mockResolvedValue(ok(ASSINATURAS));
    setAppMock({ currentUser: { name: "Plataforma" }, logout: vi.fn() });
  });

  it("mostra o endereço no card de quem tem, e nada no card de quem não tem", async () => {
    renderWithProviders(<ConsolePage />);
    await screen.findByText("Café Central");

    const linha = screen.getByText("Endereço: bar-do-ze");
    expect(within(linha.closest("li")).getByText("Bar do Zé")).toBeInTheDocument();
    expect(screen.getAllByText(/^Endereço:/)).toHaveLength(1);
    expect(screen.queryByText(/Endereço: *$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/null|undefined/)).not.toBeInTheDocument();
  });

  // É informação do card, não atalho novo: nada de botão ou link aninhado.
  it("o endereço fica dentro do card, sem virar botão ou link", async () => {
    renderWithProviders(<ConsolePage />);
    const linha = await screen.findByText("Endereço: bar-do-ze");

    expect(linha.tagName).toBe("SPAN");
    expect(linha.closest("button")).toHaveClass("console__card");
    expect(within(linha).queryByRole("link")).not.toBeInTheDocument();
  });

  it("digitar o endereço acha o estabelecimento", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ConsolePage />);
    await screen.findByText("Café Central");

    await user.type(
      screen.getByLabelText("Buscar estabelecimento pelo nome ou endereço"),
      "bar-do"
    );

    expect(await screen.findByText("Bar do Zé")).toBeInTheDocument();
    expect(screen.queryByText("Café Central")).not.toBeInTheDocument();
  });

  it("o campo de busca avisa que dá para buscar por endereço", async () => {
    renderWithProviders(<ConsolePage />);
    await screen.findByText("Bar do Zé");

    expect(screen.getByPlaceholderText("Buscar pelo nome ou endereço")).toBeInTheDocument();
  });

  it("quando nada casa, o texto manda conferir o nome ou o endereço", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ConsolePage />);
    await screen.findByText("Bar do Zé");

    await user.type(
      screen.getByLabelText("Buscar estabelecimento pelo nome ou endereço"),
      "pizzaria"
    );

    expect(await screen.findByText(/Nenhum estabelecimento com/)).toBeInTheDocument();
    expect(screen.getByText(/Confira o nome ou o endereço/)).toBeInTheDocument();
  });
});

// ── Sem conexão com a internet (CONSOLE-UX 26) ─────────────────────
//
// O Console é a ferramenta que o dono usa na rua, no celular, na frente do
// cliente. Sem sinal, cada botão de salvar levava o formulário inteiro até um
// erro em inglês no fim. Aqui a tela avisa ANTES de o dono digitar.
describe("ConsolePage — sem conexão com a internet", () => {
  const ficarOffline = () =>
    Object.defineProperty(window.navigator, "onLine", { value: false, configurable: true });
  const voltarOnline = () =>
    Object.defineProperty(window.navigator, "onLine", { value: true, configurable: true });

  beforeEach(() => {
    mockListarEstabelecimentos.mockReset();
    mockListarPlanos.mockReset();
    mockListarAssinaturas.mockReset();
    mockListarEstabelecimentos.mockResolvedValue(ok(TENANTS));
    mockListarPlanos.mockResolvedValue(ok(PLANOS));
    mockListarAssinaturas.mockResolvedValue(ok(ASSINATURAS));
    setAppMock({ currentUser: { name: "Plataforma" }, logout: vi.fn() });
  });

  afterEach(() => {
    voltarOnline();
  });

  it("mostra a faixa no topo e continua deixando ler a lista", async () => {
    ficarOffline();
    renderWithProviders(<ConsolePage />);

    expect(await screen.findByText("Sem conexão com a internet.")).toBeInTheDocument();
    expect(screen.getByText(/para criar ou alterar, reconecte/i)).toBeInTheDocument();
    // Leitura não trava: o que já carregou continua na tela.
    expect(await screen.findByText("Bar do Zé")).toBeInTheDocument();
    expect(screen.getByText("Café Central")).toBeInTheDocument();
  });

  it("trava o botão de criar estabelecimento e diz por quê", async () => {
    ficarOffline();
    renderWithProviders(<ConsolePage />);
    await screen.findByText("Bar do Zé");

    const botao = screen.getByRole("button", { name: /Novo estabelecimento/i });

    expect(botao).toBeDisabled();
    expect(botao.getAttribute("title")).toMatch(/sem conex/i);
  });

  it("trava também os botões de escrita de cada card", async () => {
    ficarOffline();
    renderWithProviders(<ConsolePage />);
    await screen.findByText("Bar do Zé");

    for (const botao of screen.getAllByTitle(/sem conex/i)) {
      expect(botao).toBeDisabled();
    }
    // O layout aparece em todo card — garante que a varredura acima não passou vazia.
    expect(screen.getAllByTitle(/sem conex/i).length).toBeGreaterThan(1);
  });

  it("com internet, nada disso aparece — a faixa é só para quando cai", async () => {
    renderWithProviders(<ConsolePage />);
    await screen.findByText("Bar do Zé");

    expect(screen.queryByText("Sem conexão com a internet.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Novo estabelecimento/i })).toBeEnabled();
  });

  it("quando a conexão volta, a faixa some e os botões destravam sozinhos", async () => {
    ficarOffline();
    renderWithProviders(<ConsolePage />);
    await screen.findByText("Sem conexão com a internet.");

    voltarOnline();
    fireEvent(window, new Event("online"));

    await waitFor(() => {
      expect(screen.queryByText("Sem conexão com a internet.")).not.toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /Novo estabelecimento/i })).toBeEnabled();
  });
});

// ── A volta da conexão (CONSOLE-UX 27) ─────────────────────────────
//
// A rodada 52 destravava os botões quando a internet voltava, mas os números
// na tela continuavam sendo os de antes da queda — vencimento, receita, quem
// precisa de atenção — sem nada dizendo isso. Aqui a volta puxa os dados de
// novo em silêncio (a lista não pisca) e a faixa conta o que aconteceu.
describe("ConsolePage — quando a conexão volta", () => {
  const ficarOffline = () =>
    Object.defineProperty(window.navigator, "onLine", { value: false, configurable: true });
  const voltarOnline = () =>
    Object.defineProperty(window.navigator, "onLine", { value: true, configurable: true });
  const dispararOnline = () => fireEvent(window, new Event("online"));

  beforeEach(() => {
    mockListarEstabelecimentos.mockReset();
    mockListarPlanos.mockReset();
    mockListarAssinaturas.mockReset();
    mockListarEstabelecimentos.mockResolvedValue(ok(TENANTS));
    mockListarPlanos.mockResolvedValue(ok(PLANOS));
    mockListarAssinaturas.mockResolvedValue(ok(ASSINATURAS));
    setAppMock({ currentUser: { name: "Plataforma" }, logout: vi.fn() });
  });

  afterEach(() => {
    voltarOnline();
  });

  // Critério 2: abrir o Console já online é UMA carga. Sem isso, a recarga da
  // volta viraria uma segunda chamada na montagem para todo mundo.
  it("abrir o Console já online lê uma vez só", async () => {
    renderWithProviders(<ConsolePage />);
    await screen.findByText("Bar do Zé");

    expect(mockListarEstabelecimentos).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/Conexão de volta/i)).not.toBeInTheDocument();
  });

  // Critério 4: o ponto da rodada. O que mudou enquanto a internet estava fora
  // aparece na tela sem o dono recarregar a página.
  it("traz os dados novos sem recarregar a página", async () => {
    ficarOffline();
    renderWithProviders(<ConsolePage />);
    await screen.findByText("Bar do Zé");
    expect(screen.queryByText("Padaria Nova")).not.toBeInTheDocument();

    mockListarEstabelecimentos.mockResolvedValue(
      ok([...TENANTS, { id: "t3", nome: "Padaria Nova", plano_codigo: "basico", tema: {}, created_at: "2026-03-01T12:00:00Z" }])
    );
    voltarOnline();
    dispararOnline();

    expect(await screen.findByText("Padaria Nova")).toBeInTheDocument();
    // A lista antiga não sumiu no caminho: é recarga, não recomeço.
    expect(screen.getByText("Bar do Zé")).toBeInTheDocument();
  });

  // Critério 5: a faixa narra os dois momentos e some sozinha. A leitura fica
  // presa de propósito para o "atualizando" existir por tempo observável — com
  // o mock resolvendo na hora, os dois estados cairiam no mesmo commit.
  it("diz que está atualizando, depois que atualizou, e some sozinha", async () => {
    ficarOffline();
    renderWithProviders(<ConsolePage />);
    await screen.findByText("Bar do Zé");

    let liberar;
    mockListarEstabelecimentos.mockReturnValue(
      new Promise((resolve) => { liberar = () => resolve(ok(TENANTS)); })
    );
    voltarOnline();
    dispararOnline();

    expect(await screen.findByText(/Atualizando os dados da tela/i)).toBeInTheDocument();
    // Enquanto atualiza, a lista continua de pé — nada de "Carregando…".
    expect(screen.getByText("Bar do Zé")).toBeInTheDocument();
    expect(screen.queryByText("Carregando…")).not.toBeInTheDocument();

    liberar();
    expect(await screen.findByText("Dados atualizados.")).toBeInTheDocument();

    await waitForElementToBeRemoved(() => screen.queryByText("Dados atualizados."), { timeout: 6000 });
  }, 10000);

  // Critérios 6 e 7: sinal de volta que não chega ao servidor (Wi-Fi sem saída).
  // A faixa não pode sumir fingindo que deu certo, e a tela não pode ser apagada
  // por uma atualização que o dono não pediu.
  it("recarga que falha mantém a faixa com Tentar de novo e não apaga a tela", async () => {
    ficarOffline();
    renderWithProviders(<ConsolePage />);
    await screen.findByText("Bar do Zé");

    mockListarEstabelecimentos.mockResolvedValue(falhou());
    voltarOnline();
    dispararOnline();

    expect(await screen.findByText("Não foi possível atualizar os dados.")).toBeInTheDocument();
    // Nada apagado: os cards de antes da queda continuam legíveis.
    expect(screen.getByText("Bar do Zé")).toBeInTheDocument();
    expect(screen.getByText("Café Central")).toBeInTheDocument();
    // E o bloco de erro que substitui a lista não entrou no lugar dela.
    expect(screen.queryByText(/Não foi possível carregar os estabelecimentos/i)).not.toBeInTheDocument();

    mockListarEstabelecimentos.mockResolvedValue(ok(TENANTS));
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Tentar de novo/i }));

    expect(await screen.findByText("Dados atualizados.")).toBeInTheDocument();
  });

  // Critério 3: o navegador dispara `online` mais de uma vez em troca de rede.
  // Duas recargas sobrepostas escreveriam a lista duas vezes, fora de ordem.
  it("dois eventos de volta seguidos não disparam duas recargas", async () => {
    ficarOffline();
    renderWithProviders(<ConsolePage />);
    await screen.findByText("Bar do Zé");
    const antes = mockListarEstabelecimentos.mock.calls.length;

    let liberar;
    mockListarEstabelecimentos.mockReturnValue(
      new Promise((resolve) => { liberar = () => resolve(ok(TENANTS)); })
    );
    voltarOnline();
    dispararOnline();
    dispararOnline();
    dispararOnline();

    await screen.findByText(/Atualizando os dados da tela/i);
    expect(mockListarEstabelecimentos.mock.calls.length).toBe(antes + 1);

    liberar();
    await screen.findByText("Dados atualizados.");
  });
});
