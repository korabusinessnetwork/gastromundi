// @vitest-environment jsdom
//
// S1-3 — a aba "Minha assinatura". O que estes testes protegem:
//
// 1. o recorte de quem vê (assinatura não é assunto de balcão);
// 2. o total, que precisa ignorar pagamento cancelado — se somasse tudo, o
//    estabelecimento leria que pagou um mês que a plataforma estornou;
// 3. a distinção entre "não paguei nada" e "não consegui ler" — lista vazia
//    por falha de rede faria alguém pagar de novo o que já pagou;
// 4. a ausência dos botões de registrar/cancelar pagamento: são RPCs de
//    plataforma (decisão 027) e um botão aqui só levaria a um 42501.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

vi.mock("@/context/AppContext", async () => {
  const { mockUseApp } = await import("@/test/mockApp");
  return { useApp: mockUseApp, AppProvider: ({ children }) => children };
});

const { mockSupabase } = vi.hoisted(() => ({ mockSupabase: { current: null } }));
vi.mock("@/lib/supabase", async () => {
  const { createMockSupabase } = await import("@/test/mockSupabase");
  mockSupabase.current = createMockSupabase();
  return { supabase: mockSupabase.current };
});

vi.mock("@/lib/logger", () => ({ logAction: vi.fn() }));
vi.mock("@/lib/jarvas", () => ({ emitirEvento: vi.fn() }));

import { setAppMock } from "@/test/mockApp";
import MinhaAssinaturaTab from "./MinhaAssinaturaTab";
import ConfiguracoesView from "./ConfiguracoesView";

const gerente = { id: 1, name: "Gerente Teste", username: "gerente1", role: "gerente" };
const caixa = { id: 2, name: "Caixa Teste", username: "caixa1", role: "caixa" };

/** "2026-08-05" a partir de um deslocamento em dias — no calendário LOCAL. */
function emDias(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const tenant = {
  id: "t1",
  nome: "Restaurante Teste",
  slug: "teste",
  tema: {},
  planoCodigo: "medio",
  modulosDisponiveis: ["pdv", "cozinha"],
  addonsAtivos: [],
};

const emDia = { dataVencimento: emDias(30), carenciaDias: 3, valorMensal: 300 };

function montar(overrides = {}) {
  setAppMock({ currentUser: gerente, tenant, assinatura: emDia, ...overrides });
  return render(<MinhaAssinaturaTab />);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSupabase.current.reset();
  mockSupabase.current.setTableResult("planos", { data: { codigo: "medio", nome: "Plano Médio" }, error: null });
  mockSupabase.current.setTableResult("assinaturas_pagamentos", { data: [], error: null });
});

describe("MinhaAssinaturaTab — quem enxerga a aba", () => {
  it("gerente vê a aba 'Minha assinatura' nas Configurações", () => {
    setAppMock({ currentUser: gerente, tenant, assinatura: emDia });

    render(<ConfiguracoesView />);

    expect(screen.getByRole("button", { name: /minha assinatura/i })).toBeInTheDocument();
  });

  it("caixa NÃO vê a aba — mensalidade não é assunto de balcão", () => {
    setAppMock({ currentUser: caixa, tenant, assinatura: emDia });

    render(<ConfiguracoesView />);

    expect(screen.queryByRole("button", { name: /minha assinatura/i })).toBeNull();
  });
});

describe("MinhaAssinaturaTab — situação da assinatura", () => {
  it("em dia: diz que está em dia e mostra o próximo vencimento", async () => {
    montar();

    expect(await screen.findByText("Sua assinatura está em dia")).toBeInTheDocument();
    const [a, m, d] = emDias(30).split("-");
    expect(screen.getByText(new RegExp(`${d}/${m}/${a}`))).toBeInTheDocument();
  });

  it("bloqueada: diz em português que o acesso está bloqueado", async () => {
    montar({ assinatura: { dataVencimento: emDias(-30), carenciaDias: 3, valorMensal: 300 } });

    expect(await screen.findByText(/acesso está bloqueado/i)).toBeInTheDocument();
  });

  it("sem assinatura cadastrada não quebra a tela", async () => {
    montar({ assinatura: null });

    expect(await screen.findByText(/ainda não há uma assinatura cadastrada/i)).toBeInTheDocument();
  });

  it("com o bootstrap em voo mostra carregando — não 'sem assinatura'", () => {
    montar({ tenant: null, assinatura: null });

    expect(screen.getByText(/carregando sua assinatura/i)).toBeInTheDocument();
    expect(screen.queryByText(/ainda não há uma assinatura cadastrada/i)).toBeNull();
  });
});

describe("MinhaAssinaturaTab — plano", () => {
  it("mostra o NOME do plano e os módulos por nome, nunca o código", async () => {
    montar();

    expect(await screen.findByText("Plano Médio")).toBeInTheDocument();
    expect(screen.getByText("Frente de caixa")).toBeInTheDocument();
    expect(screen.getByText("Tela da cozinha")).toBeInTheDocument();
    expect(screen.queryByText("medio")).toBeNull();
    expect(screen.queryByText("pdv")).toBeNull();
  });

  it("catálogo fora do ar vira frase neutra — nunca o código cru na tela", async () => {
    mockSupabase.current.setTableError("planos", { message: "falha de rede" });
    montar();

    expect(await screen.findByText("Plano contratado")).toBeInTheDocument();
    expect(screen.queryByText("medio")).toBeNull();
    expect(screen.getByText("Sua assinatura está em dia")).toBeInTheDocument();
  });

  it("mensalidade zero aparece como isenta, não como R$ 0,00 devido", async () => {
    montar({ assinatura: { ...emDia, valorMensal: 0 } });

    expect(await screen.findByText("Sem mensalidade")).toBeInTheDocument();
  });
});

describe("MinhaAssinaturaTab — histórico de pagamentos", () => {
  const pagamento = (id, competencia, valor, extra = {}) => ({
    id,
    competencia,
    valor,
    metodo: "Pix",
    confirmado_por: "Plataforma",
    confirmado_em: "2026-07-02T12:00:00Z",
    estornado_em: null,
    estornado_por: null,
    estorno_motivo: null,
    ...extra,
  });

  it("lista os meses pagos e soma só o que vale", async () => {
    mockSupabase.current.setTableResult("assinaturas_pagamentos", {
      data: [
        pagamento("p1", "2026-06-01", 300),
        pagamento("p2", "2026-07-01", 300, {
          estornado_em: "2026-07-10T12:00:00Z",
          estornado_por: "Plataforma",
          estorno_motivo: "valor digitado errado",
        }),
      ],
      error: null,
    });
    montar();

    expect(await screen.findByText("junho/2026")).toBeInTheDocument();
    // O cancelado continua na lista, com o motivo — histórico de dinheiro
    // não desaparece — mas fica FORA do total.
    expect(screen.getByText("julho/2026")).toBeInTheDocument();
    expect(screen.getByText(/valor digitado errado/i)).toBeInTheDocument();
    const total = screen.getByText(/pagos em 1 mensalidade\./i);
    // `formatarReais` usa espaço não-quebrável entre "R$" e o número.
    expect(total.textContent.replace(/\u00A0/g, " ")).toContain("R$ 300,00");
  });

  it("com tudo cancelado, o zero é afirmado — não parece falha de carregamento", async () => {
    mockSupabase.current.setTableResult("assinaturas_pagamentos", {
      data: [
        pagamento("p1", "2026-06-01", 300, {
          estornado_em: "2026-06-10T12:00:00Z",
          estorno_motivo: "cobrado em duplicidade",
        }),
      ],
      error: null,
    });
    montar();

    expect(await screen.findByText(/1 lançamento foi cancelado/i)).toBeInTheDocument();
    expect(screen.queryByText(/pagos em/i)).toBeNull();
  });

  it("sem pagamento nenhum diz isso com todas as letras", async () => {
    montar();

    expect(await screen.findByText(/nenhum pagamento registrado ainda/i)).toBeInTheDocument();
  });

  it("falha de leitura vira erro com 'Tentar de novo' — nunca lista vazia", async () => {
    mockSupabase.current.setTableError("assinaturas_pagamentos", { message: "falha de rede" });
    montar();

    expect(await screen.findByText(/não foi possível carregar os pagamentos/i)).toBeInTheDocument();
    expect(screen.queryByText(/nenhum pagamento registrado ainda/i)).toBeNull();

    mockSupabase.current.setTableError("assinaturas_pagamentos", null);
    mockSupabase.current.setTableResult("assinaturas_pagamentos", {
      data: [pagamento("p1", "2026-06-01", 300)],
      error: null,
    });
    fireEvent.click(screen.getByRole("button", { name: /tentar de novo/i }));

    await waitFor(() => expect(screen.getByText("junho/2026")).toBeInTheDocument());
  });

  it("não oferece registrar nem cancelar pagamento (é RPC de plataforma)", async () => {
    mockSupabase.current.setTableResult("assinaturas_pagamentos", {
      data: [pagamento("p1", "2026-06-01", 300)],
      error: null,
    });
    montar();

    await screen.findByText("junho/2026");
    for (const botao of screen.queryAllByRole("button")) {
      expect(botao.textContent).not.toMatch(/registrar|cancelar/i);
    }
  });

  it("lê só as colunas necessárias e só do próprio estabelecimento", async () => {
    montar();

    await screen.findByText(/nenhum pagamento registrado ainda/i);
    const select = mockSupabase.current.calls.find(
      (c) => c.table === "assinaturas_pagamentos" && c.method === "select"
    );
    expect(select.args[0]).not.toBe("*");
    const eq = mockSupabase.current.calls.find((c) => c.table === "assinaturas_pagamentos" && c.method === "eq");
    expect(eq.args).toEqual(["tenant_id", "t1"]);
  });
});
