// @vitest-environment jsdom
//
// A aba "Leads" do Console — onde o dono vê quem pediu demonstração no site.
//
// O que este arquivo protege:
//
// 1. Que falha de leitura NÃO vire "ninguém pediu demonstração". A tabela
//    `leads` é da 20260920 e, enquanto não estiver aplicada em produção, o
//    PostgREST devolve erro; uma tela ingênua mostraria a lista vazia e o
//    dono pararia de olhar a aba enquanto os contatos se acumulam.
// 2. Que a aba ABRA no que exige ação (quem ainda não recebeu resposta) e
//    que os já atendidos continuem alcançáveis em "Todos".
// 3. Que marcar "já falei" não recarregue a lista debaixo do cursor, e que
//    falha ao gravar a marcação não minta dizendo que gravou.
// 4. Que o botão principal leve à conversa certa — o número que a PESSOA
//    deixou, com a mensagem já escrita.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/lib/supabase", async () => {
  const { createMockSupabase } = await import("@/test/mockSupabase");
  return { supabase: createMockSupabase() };
});

// As funções PURAS de leads.js ficam reais — são elas que contam os KPIs,
// mascaram o telefone, traduzem os códigos do plano e montam o link. Só a
// ida ao banco é dublada.
const { mockListar, mockMarcar } = vi.hoisted(() => ({
  mockListar: vi.fn(),
  mockMarcar: vi.fn(),
}));
vi.mock("@/lib/leads", async () => {
  const real = await vi.importActual("@/lib/leads");
  return { ...real, listarLeads: mockListar, marcarLeadAtendido: mockMarcar };
});

import LeadsDashboard from "./LeadsDashboard";

// A tela usa `new Date()` (não recebe "hoje"), então as datas são relativas.
const diasAtras = (n) => new Date(Date.now() - n * 86400000).toISOString();

const PENDENTE = {
  id: "l-1",
  nome: "Ana Souza",
  whatsapp: "11987654321",
  email: "ana@bardaana.com.br",
  origem: "apex_planos",
  plano_total_centavos: 18900,
  plano_modulos: ["mesas"],
  plano_addons: ["jarvas"],
  atendido_em: null,
  atendido_por: null,
  created_at: diasAtras(0),
};
const ATENDIDO = {
  id: "l-2",
  nome: "Carlos Lima",
  whatsapp: "1133334444",
  email: "carlos@cafe.com",
  origem: "apex_planos",
  plano_total_centavos: null,
  plano_modulos: [],
  plano_addons: [],
  atendido_em: diasAtras(1),
  atendido_por: "Matheus",
  created_at: diasAtras(2),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockListar.mockResolvedValue({ data: [], error: null });
  mockMarcar.mockResolvedValue({ data: true, error: null });
});

describe("LeadsDashboard — leitura", () => {
  it("erro de leitura diz que não conseguiu ler, e NÃO que ninguém pediu", async () => {
    mockListar.mockResolvedValue({ data: [], error: { message: "PGRST202" } });
    render(<LeadsDashboard />);

    expect(await screen.findByText(/não foi possível ler os contatos/i)).toBeTruthy();
    expect(screen.queryByText(/nenhum contato ainda/i)).toBeNull();
  });

  it("o botão de tentar de novo relê a lista", async () => {
    mockListar.mockResolvedValueOnce({ data: [], error: { message: "falhou" } });
    mockListar.mockResolvedValue({ data: [PENDENTE], error: null });
    render(<LeadsDashboard />);

    await userEvent.click(await screen.findByRole("button", { name: /tentar de novo/i }));

    expect(await screen.findByText("Ana Souza")).toBeTruthy();
    expect(mockListar).toHaveBeenCalledTimes(2);
  });

  it("base sem nenhum lead mostra o estado vazio explicando de onde eles vêm", async () => {
    render(<LeadsDashboard />);
    expect(await screen.findByText(/nenhum contato ainda/i)).toBeTruthy();
    expect(screen.getByText(/kora\.codes/i)).toBeTruthy();
    // Sem lead nenhum não há o que filtrar.
    expect(screen.queryByRole("button", { name: /^todos/i })).toBeNull();
  });

  it("conta recebidos, a atender e os dos últimos 7 dias", async () => {
    mockListar.mockResolvedValue({
      data: [
        PENDENTE,
        ATENDIDO,
        { ...PENDENTE, id: "l-3", nome: "Rita Antiga", created_at: diasAtras(30) },
      ],
      error: null,
    });
    render(<LeadsDashboard />);

    await screen.findByText("Ana Souza");
    const valor = (rotulo) =>
      screen.getByText(rotulo).parentElement.querySelector(".leads__kpi-valor").textContent;

    expect(valor("Contatos recebidos")).toBe("3");
    expect(valor("A atender")).toBe("2");
    expect(valor("Últimos 7 dias")).toBe("2");
  });
});

describe("LeadsDashboard — o cartão do lead", () => {
  beforeEach(() => {
    mockListar.mockResolvedValue({ data: [PENDENTE], error: null });
  });

  it("traz o que se precisa para ligar agora: nome, telefone, e-mail, plano e espera", async () => {
    render(<LeadsDashboard />);

    expect(await screen.findByText("Ana Souza")).toBeTruthy();
    expect(screen.getByText("(11) 98765-4321")).toBeTruthy();
    expect(screen.getByText("ana@bardaana.com.br")).toBeTruthy();
    expect(screen.getByText("R$ 189,00/mês")).toBeTruthy();
    // Códigos do banco viram nome de gente na tela.
    expect(screen.getByText("Mesas e comandas · JARVAS (IA)")).toBeTruthy();
    expect(screen.getByText("Hoje")).toBeTruthy();
  });

  it("o botão principal abre a conversa com o número que a pessoa deixou", async () => {
    render(<LeadsDashboard />);

    const link = await screen.findByRole("link", { name: /falar no whatsapp/i });
    expect(link.getAttribute("href")).toContain("https://wa.me/5511987654321");
    expect(decodeURIComponent(link.getAttribute("href"))).toContain("Oi, Ana!");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
  });

  it("número incompleto avisa em vez de oferecer link quebrado", async () => {
    mockListar.mockResolvedValue({
      data: [{ ...PENDENTE, whatsapp: "119876" }],
      error: null,
    });
    render(<LeadsDashboard />);

    expect(await screen.findByText(/número incompleto/i)).toBeTruthy();
    expect(screen.queryByRole("link", { name: /falar no whatsapp/i })).toBeNull();
  });
});

describe("LeadsDashboard — filtro e marcação", () => {
  it("abre em 'a atender': quem já foi atendido não polui a fila", async () => {
    mockListar.mockResolvedValue({ data: [PENDENTE, ATENDIDO], error: null });
    render(<LeadsDashboard />);

    expect(await screen.findByText("Ana Souza")).toBeTruthy();
    expect(screen.queryByText("Carlos Lima")).toBeNull();

    const aAtender = screen.getByRole("button", { name: /a atender \(1\)/i });
    expect(aAtender.getAttribute("aria-pressed")).toBe("true");

    await userEvent.click(screen.getByRole("button", { name: /todos \(2\)/i }));
    expect(screen.getByText("Carlos Lima")).toBeTruthy();
    expect(screen.getByText(/já falamos · Matheus/i)).toBeTruthy();
  });

  it("marcar 'já falei' grava com quem fez e tira o lead da fila", async () => {
    mockListar.mockResolvedValue({ data: [PENDENTE], error: null });
    render(<LeadsDashboard operador="Matheus" />);

    await userEvent.click(
      await screen.findByRole("button", { name: /já falei com essa pessoa/i })
    );

    expect(mockMarcar).toHaveBeenCalledWith("l-1", true, "Matheus");
    // Não relê a lista: o estado da linha muda no lugar.
    expect(mockListar).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(/tudo respondido/i)).toBeTruthy();
  });

  it("de 'tudo respondido' dá pra voltar a ver todos, já com 'Reabrir'", async () => {
    mockListar.mockResolvedValue({ data: [ATENDIDO], error: null });
    render(<LeadsDashboard />);

    await userEvent.click(
      await screen.findByRole("button", { name: /ver todos os contatos/i })
    );

    const card = screen.getByText("Carlos Lima").closest("li");
    expect(within(card).getByRole("button", { name: /reabrir/i })).toBeTruthy();
  });

  it("reabrir desmarca e devolve o lead para a fila", async () => {
    mockListar.mockResolvedValue({ data: [ATENDIDO], error: null });
    render(<LeadsDashboard operador="Matheus" />);

    await userEvent.click(
      await screen.findByRole("button", { name: /ver todos os contatos/i })
    );
    await userEvent.click(screen.getByRole("button", { name: /reabrir/i }));

    expect(mockMarcar).toHaveBeenCalledWith("l-2", false, "Matheus");
    expect(
      await screen.findByRole("button", { name: /já falei com essa pessoa/i })
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: /a atender \(1\)/i })).toBeTruthy();
  });

  it("falha ao gravar a marcação avisa e o lead continua na fila", async () => {
    mockListar.mockResolvedValue({ data: [PENDENTE], error: null });
    mockMarcar.mockResolvedValue({ data: null, error: { message: "não autorizado" } });
    render(<LeadsDashboard />);

    await userEvent.click(
      await screen.findByRole("button", { name: /já falei com essa pessoa/i })
    );

    expect(screen.getByRole("alert").textContent).toMatch(/não conseguimos gravar/i);
    expect(screen.getByText("Ana Souza")).toBeTruthy();
    expect(screen.queryByText(/tudo respondido/i)).toBeNull();
  });
});
