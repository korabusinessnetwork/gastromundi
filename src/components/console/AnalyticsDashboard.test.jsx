// @vitest-environment jsdom
//
// F022-ANALYTICS — a aba "Uso e faturamento" do Console.
//
// O que este arquivo protege:
//
// 1. Que a falha da leitura NÃO vire zero na tela. A RPC `analytics_plataforma`
//    é da 20260912 e ainda não está aplicada em produção: enquanto não estiver,
//    o PostgREST devolve PGRST202 e uma tela ingênua mostraria "R$ 0,00" e
//    "nenhum pedido" para uma base inteira que está vendendo. Zero afirmado é
//    pior que erro assumido — o dono tomaria decisão de cobrança em cima dele.
// 2. Que dinheiro atravesse a tela em centavos inteiros e só vire real na hora
//    de formatar (250075 → R$ 2.500,75, não 2500.75 somado em float).
// 3. Que "paga e não está vendendo" apareça ANTES dos números, que é a única
//    coisa da tela que pede ação.
// 4. Que quem nunca vendeu apareça, em vez de sumir da tabela — a pergunta da
//    aba é justamente essa.
import { useState } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/lib/supabase", async () => {
  const { createMockSupabase } = await import("@/test/mockSupabase");
  return { supabase: createMockSupabase() };
});

// `resumirUso` fica REAL — é ela que decide quem aparece, em que ordem e quem
// está pagando sem usar. Só a ida ao banco é dublada.
const { mockListar } = vi.hoisted(() => ({ mockListar: vi.fn() }));
vi.mock("@/lib/console", async () => {
  const real = await vi.importActual("@/lib/console");
  return { ...real, listarAnalitico: mockListar };
});

import AnalyticsDashboard from "./AnalyticsDashboard";

// A tela usa `new Date()` (não recebe "hoje"), então as datas são relativas —
// data fixa aqui viraria bomba de tempo.
//
// Relativas ao DIA, e não à hora: "2 horas atrás" parece hoje, mas entre a
// meia-noite e as 2h da manhã cai no dia anterior, e o teste que espera "Hoje"
// quebrava sozinho nessa faixa (TD019 — suíte refém do relógio). Ancorar na
// meia-noite local do dia desejado dá a mesma intenção sem depender da hora em
// que a suíte roda.
function diasAtras(n) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

const TENANTS = [
  { id: "t-forte", nome: "Bar do Zé" },
  { id: "t-fraco", nome: "Café Central" },
  { id: "t-novo", nome: "Novo Cliente" },
];
const EM_DIA = TENANTS.map((t) => ({
  tenant_id: t.id,
  data_vencimento: new Date(Date.now() + 20 * 86400000).toISOString().slice(0, 10),
  carencia_dias: 3,
  status: "ativo",
}));
const USO = [
  { tenant_id: "t-forte", faturamento_centavos: 250075, pedidos: 25, ultima_venda: diasAtras(0) },
  { tenant_id: "t-fraco", faturamento_centavos: 4050, pedidos: 2, ultima_venda: diasAtras(1) },
  // t-novo não vem da RPC: nunca vendeu.
];

// O período é propriedade controlada pela página (ele mora na URL — ver
// ConsolePage). Aqui a casca guarda o mesmo estado que a página guarda, para
// que os testes de troca de período continuem exercendo o caminho real:
// clicar → a página muda o valor → o componente recarrega.
function Casca({ diasInicial = 30, ...props }) {
  const [dias, setDias] = useState(diasInicial);
  return (
    <AnalyticsDashboard
      tenants={TENANTS}
      assinaturas={EM_DIA}
      dias={dias}
      aoTrocarPeriodo={setDias}
      {...props}
    />
  );
}

function montar(props = {}) {
  return render(<Casca {...props} />);
}

// A tabela só existe depois que a leitura volta — o helper espera por ela.
const linhaDe = async (nome) =>
  within(await screen.findByRole("table")).getByText(nome).closest("tr");

beforeEach(() => {
  mockListar.mockReset();
  mockListar.mockResolvedValue({ data: USO, error: null });
});

describe("AnalyticsDashboard — carregamento", () => {
  it("mostra que está carregando antes da resposta chegar", () => {
    mockListar.mockReturnValue(new Promise(() => {}));
    montar();
    expect(screen.getByText(/Carregando o uso dos estabelecimentos/i)).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("pede 30 dias por padrão", async () => {
    montar();
    await screen.findByRole("table");
    expect(mockListar).toHaveBeenCalledWith(30);
  });
});

describe("AnalyticsDashboard — a leitura falhou", () => {
  it("diz que não sabe, em vez de mostrar zero como se fosse verdade", async () => {
    mockListar.mockResolvedValue({
      data: [],
      error: { code: "PGRST202", message: "function public.analytics_plataforma does not exist" },
    });
    montar();

    expect(await screen.findByText(/Não foi possível carregar o uso/i)).toBeInTheDocument();
    // Nenhum número inventado: sem tabela, sem cartão de faturamento.
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByText(/Faturamento da base/i)).toBeNull();
  });

  it("oferece tentar de novo, e tentar de novo chama o banco outra vez", async () => {
    mockListar.mockResolvedValue({ data: [], error: { message: "Failed to fetch" } });
    montar();

    const botao = await screen.findByRole("button", { name: /Tentar de novo/i });
    mockListar.mockResolvedValue({ data: USO, error: null });
    await userEvent.click(botao);

    expect(await screen.findByRole("table")).toBeInTheDocument();
    expect(mockListar).toHaveBeenCalledTimes(2);
  });
});

describe("AnalyticsDashboard — período", () => {
  it("marca o período escolhido e só oferece os três que o banco aceita", async () => {
    montar();
    await screen.findByRole("table");

    const grupo = screen.getByRole("group", { name: /Período/i });
    const botoes = within(grupo).getAllByRole("button");
    expect(botoes.map((b) => b.textContent)).toEqual(["7 dias", "30 dias", "90 dias"]);
    expect(botoes[1]).toHaveAttribute("aria-pressed", "true");
    expect(botoes[0]).toHaveAttribute("aria-pressed", "false");
  });

  it("abre no período que a página mandou, sem clique nenhum", async () => {
    montar({ diasInicial: 90 });
    await screen.findByRole("table");

    expect(mockListar).toHaveBeenCalledWith(90);
    expect(screen.getByRole("button", { name: "90 dias" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "30 dias" })).toHaveAttribute("aria-pressed", "false");
  });

  it("recarrega do banco ao trocar de período", async () => {
    montar();
    await screen.findByRole("table");

    await userEvent.click(screen.getByRole("button", { name: "90 dias" }));
    expect(mockListar).toHaveBeenLastCalledWith(90);
    expect(screen.getByRole("button", { name: "90 dias" })).toHaveAttribute("aria-pressed", "true");
  });
});

describe("AnalyticsDashboard — os números", () => {
  it("formata os centavos inteiros em reais só na tela", async () => {
    montar();
    const linha = await linhaDe("Bar do Zé");

    // 250075 centavos = R$ 2.500,75. Se em algum ponto do caminho a conta
    // virasse float, é aqui que apareceria.
    expect(within(linha).getByText(/2\.500,75/)).toBeInTheDocument();
    // Ticket médio: 250075 / 25 = 10003 centavos = R$ 100,03.
    expect(within(linha).getByText(/100,03/)).toBeInTheDocument();
  });

  it("soma a base inteira nos cartões do topo", async () => {
    montar();
    await screen.findByRole("table");

    // 250075 + 4050 = 254125 centavos = R$ 2.541,25 · 27 pedidos.
    expect(screen.getByText(/2\.541,25/)).toBeInTheDocument();
    expect(screen.getByText("27")).toBeInTheDocument();
    expect(screen.getByText("2 de 3")).toBeInTheDocument();
  });

  it("mostra travessão — nunca NaN — no ticket médio de quem não vendeu", async () => {
    montar();
    const linha = await linhaDe("Novo Cliente");
    expect(within(linha).getByText("—")).toBeInTheDocument();
    expect(linha.textContent).not.toMatch(/NaN|Infinity|undefined/);
  });

  it("mantém na tabela quem nunca vendeu, dizendo isso com todas as letras", async () => {
    montar();
    const linha = await linhaDe("Novo Cliente");
    expect(within(linha).getByText("Nunca vendeu")).toBeInTheDocument();
  });

  it("conta o tempo desde a última venda em vez de mostrar uma data para o dono converter", async () => {
    montar();
    expect(within(await linhaDe("Bar do Zé")).getByText("Hoje")).toBeInTheDocument();
    expect(within(await linhaDe("Café Central")).getByText("Ontem")).toBeInTheDocument();
  });
});

describe("AnalyticsDashboard — paga e não usa", () => {
  it("põe quem paga e não vendeu num bloco de atenção, antes dos números", async () => {
    montar();
    const bloco = await screen.findByRole("status", { name: /pagam e não estão vendendo/i });
    expect(within(bloco).getByText("Novo Cliente")).toBeInTheDocument();
    expect(within(bloco).getByText("Nunca vendeu")).toBeInTheDocument();
    // Quem está vendendo não entra no alerta.
    expect(within(bloco).queryByText("Bar do Zé")).toBeNull();
  });

  it("concorda no singular quando é um só", async () => {
    montar();
    const bloco = await screen.findByRole("status", { name: /pagam e não estão vendendo/i });
    expect(within(bloco).getByText(/^1 estabelecimento paga e não está vendendo$/)).toBeInTheDocument();
  });

  it("não mostra o bloco quando quem não vende também não paga", async () => {
    const cancelados = EM_DIA.map((a) =>
      a.tenant_id === "t-novo" ? { ...a, status: "cancelado" } : a
    );
    montar({ assinaturas: cancelados });
    await screen.findByRole("table");
    expect(screen.queryByRole("status", { name: /pagam e não estão vendendo/i })).toBeNull();
  });
});

describe("AnalyticsDashboard — base vazia e linguagem", () => {
  it("explica o vazio em vez de mostrar uma tabela sem linha", async () => {
    mockListar.mockResolvedValue({ data: [], error: null });
    montar({ tenants: [], assinaturas: [] });

    expect(await screen.findByText(/Nenhum estabelecimento ainda/i)).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("afirma o zero quando a base inteira ficou parada no período", async () => {
    mockListar.mockResolvedValue({ data: [], error: null });
    montar();

    expect(
      await screen.findByText(/Nenhuma venda no período.*nos últimos 30 dias/i)
    ).toBeInTheDocument();
    // A tabela continua: é ela que diz há quanto tempo cada um parou.
    expect(screen.getByRole("table")).toBeInTheDocument();
  });

  it("não repete a frase de base parada quando alguém vendeu", async () => {
    montar();
    await screen.findByRole("table");
    expect(screen.queryByText(/Nenhuma venda no período/i)).toBeNull();
  });

  it("não usa jargão na tela (CLAUDE.md — nada de MRR, GMV, churn, tenant, RPC)", async () => {
    const { container } = montar();
    await screen.findByRole("table");
    const texto = container.textContent;
    for (const jargao of ["MRR", "GMV", "churn", "tenant", "RPC", "SQL", "endpoint"]) {
      expect(texto).not.toMatch(new RegExp(jargao, "i"));
    }
  });

  it("avisa que o período é janela corrida, não mês fechado", async () => {
    montar();
    await screen.findByRole("table");
    expect(screen.getByText(/janela corrida a partir de hoje/i)).toBeInTheDocument();
  });
});
