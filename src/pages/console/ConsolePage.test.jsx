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
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, within, render } from "@testing-library/react";
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
const { mockListarEstabelecimentos, mockListarPlanos, mockListarAssinaturas, banco } = vi.hoisted(() => ({
  mockListarEstabelecimentos: vi.fn(),
  mockListarPlanos: vi.fn(),
  mockListarAssinaturas: vi.fn(),
  // Holder mutável em vez de vi.fn(): os `mockReset()` dos beforeEach
  // existentes não apagam esta leitura, que toda aba faz.
  banco: { addons: [], erroAddons: null },
}));
vi.mock("@/lib/console", async () => {
  const real = await vi.importActual("@/lib/console");
  return {
    ...real,
    listarEstabelecimentos: mockListarEstabelecimentos,
    listarPlanos: mockListarPlanos,
    listarAssinaturas: mockListarAssinaturas,
    listarAddonsPorTenant: async () =>
      banco.erroAddons ? { data: [], error: banco.erroAddons } : { data: banco.addons, error: null },
  };
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
vi.mock("@/lib/assinatura", async () => {
  const real = await vi.importActual("@/lib/assinatura");
  return {
    ...real,
    confirmarRenovacaoAssinatura: mockConfirmarRenovacao,
    listarPagamentosAssinatura: mockListarPagamentos,
    estornarPagamentoAssinatura: mockEstornarPagamento,
  };
});

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
  const campo = () => screen.getByLabelText("Buscar estabelecimento pelo nome");

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

    expect(screen.queryByLabelText("Buscar estabelecimento pelo nome")).not.toBeInTheDocument();
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

    const campo = screen.getByLabelText("Buscar estabelecimento pelo nome");
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

    const campo = screen.getByLabelText("Buscar estabelecimento pelo nome");
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
  const campo = () => screen.getByLabelText("Buscar estabelecimento pelo nome");
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
  const campo = () => screen.getByLabelText("Buscar estabelecimento pelo nome");
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

    await user.type(screen.getByLabelText("Buscar estabelecimento pelo nome"), "zé");
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
