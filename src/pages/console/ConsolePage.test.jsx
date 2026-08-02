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
import { screen, waitFor, within } from "@testing-library/react";
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
