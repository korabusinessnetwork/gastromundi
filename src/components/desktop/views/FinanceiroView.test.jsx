// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor, fireEvent, act, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

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

import { setAppMock, renderWithProviders } from "@/test/mockApp";
import FinanceiroView from "./FinanceiroView";
import { intervaloDoMes } from "@/lib/periodos";

beforeEach(() => {
  vi.clearAllMocks();
  mockSupabase.current.reset();
  setAppMock({ currentUser: { name: "Gerente Teste", username: "gerente1", role: "gerente" } });
});

describe("FinanceiroView", () => {
  it("renderiza a lista vazia sem lançar exceção", async () => {
    renderWithProviders(<FinanceiroView />);

    expect(screen.getByText("Financeiro")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Nenhum lançamento no período.")).toBeInTheDocument());
  });

  it("cria uma despesa pelo modal 'Novo lançamento' e ela chama o insert em lancamentos", async () => {
    const user = userEvent.setup();
    renderWithProviders(<FinanceiroView />);
    await waitFor(() => expect(screen.getByText("Nenhum lançamento no período.")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /novo lançamento/i }));
    expect(screen.getByText("Novo Lançamento")).toBeInTheDocument();

    await user.type(screen.getByLabelText(/valor \(r\$\)/i), "250");
    await user.type(screen.getByLabelText(/vencimento/i), "2026-08-05");

    await user.click(screen.getByRole("button", { name: /salvar lançamento/i }));

    await waitFor(() => {
      const insertCall = mockSupabase.current.calls.find((c) => c.table === "lancamentos" && c.method === "insert");
      expect(insertCall).toBeDefined();
    });

    const insertCall = mockSupabase.current.calls.find((c) => c.table === "lancamentos" && c.method === "insert");
    expect(insertCall.args[0]).toMatchObject({
      tipo: "despesa",
      categoria: "aluguel",
      valor: 250,
      status: "previsto",
      vencimento: "2026-08-05",
      origem: "manual",
      criado_por: "gerente1",
    });

    // modal fecha depois de salvar
    await waitFor(() => expect(screen.queryByText("Novo Lançamento")).not.toBeInTheDocument());
  });
});

// ── Run 2 da auditoria ────────────────────────────────────────────────
//
// A conta pura mora em @/lib/financeiro e tem teste próprio. Aqui ficam os
// defeitos que só existiam na fiação da tela: a conta atrasada que perdia o
// botão de baixa, a leitura que falha e vira "não tem lançamento", a baixa que
// falha em silêncio, e o lucro que misturava o dia UTC com o regime de caixa.
// O `financeiro.js` roda de verdade — só o banco é mockado.

/** O aluguel de julho, ainda em aberto e com o vencimento já passado. */
const ALUGUEL = {
  id: "aluguel", tipo: "despesa", categoria: "aluguel", descricao: "Aluguel de julho",
  valor: 2500, competencia: "2026-07-05", vencimento: "2026-07-05", status: "previsto",
};

/** Ficha do produto 7: R$ 30 de custo por unidade. */
const FICHA_PRATO = { produtoId: 7, rendimento: 1, ingredientes: [{ qtd: 1, custoUnit: 30 }] };

/** Uma venda de um prato do produto 7. */
const venda = (at, total = 100, extra = {}) => ({
  id: at, at, total, items: [{ id: 7, qty: 1 }], ...extra,
});

/**
 * Ensina o banco mockado a responder as consultas de `lancamentos` e as
 * fichas técnicas. `respostaBaixa` sobrescreve o retorno do update da baixa.
 */
function servirBanco({ linhas = [], erroListar = null, fichas = [], respostaBaixa } = {}) {
  const sup = mockSupabase.current;

  /** O id que a cadeia atual filtrou com `.eq("id", …)`. */
  const idFiltrado = () =>
    [...sup.calls].reverse().find((c) => c.method === "eq" && c.args?.[0] === "id")?.args?.[1];

  sup.setTableHandler("lancamentos", ({ method, args }) => {
    // baixarConta lê o tipo antes de decidir entre 'pago' e 'recebido'.
    if (method === "select" && args[0] === "id, tipo") {
      const alvo = linhas.find((l) => l.id === idFiltrado());
      return alvo ? { data: { id: alvo.id, tipo: alvo.tipo }, error: null } : { data: null, error: { message: "not found" } };
    }
    if (method === "select") {
      return erroListar ? { data: null, error: erroListar } : { data: linhas, error: null };
    }
    // processarVencidos marca em lote; a baixa grava quem baixou e quando.
    if (method === "update" && args[0]?.status === "vencido") return { data: null, error: null };
    if (method === "update" && "baixado_por" in (args[0] ?? {})) {
      if (respostaBaixa !== undefined) return respostaBaixa;
      const alvo = linhas.find((l) => l.id === idFiltrado());
      return { data: { ...alvo, status: args[0].status }, error: null };
    }
    return undefined;
  });

  sup.setTableHandler("config", () => ({ data: { key: "fichas_tecnicas", value: fichas }, error: null }));
}

/**
 * Renderiza a tela e trava o período em julho de 2026, para o teste não
 * depender do mês em que a suíte roda. A ordem importa: mexer no "Até"
 * primeiro arrasta o "De" junto (o seletor impede intervalo invertido).
 */
async function montar({ sales = [], ...banco } = {}) {
  servirBanco(banco);
  setAppMock({ currentUser: { name: "Gerente Teste", username: "gerente1", role: "gerente" }, sales });

  const utils = renderWithProviders(<FinanceiroView />);
  await waitFor(() => expect(screen.queryByText("Carregando…")).not.toBeInTheDocument());

  fireEvent.change(screen.getByLabelText("Data final do período"),   { target: { value: "2026-07-31" } });
  fireEvent.change(screen.getByLabelText("Data inicial do período"), { target: { value: "2026-07-01" } });
  // O período agora vai na consulta (refino R02), então trocar as datas refaz
  // a busca: esperar a nova carga antes de olhar a tela.
  await waitFor(() => expect(screen.queryByText("Carregando…")).not.toBeInTheDocument());
  return utils;
}

/** A linha da tabela que contém um texto. */
const linhaCom = (texto) => screen.getByText(texto).closest("tr");

/** Valor mostrado no card de um rótulo. */
const card = (rotulo) =>
  screen.getByText(rotulo).parentElement.querySelector(".resumo-cards__valor").textContent;

describe("FinanceiroView, conta atrasada (Run 2)", () => {
  it("a conta que venceu mantém o botão de baixar", async () => {
    // Abrir a tela roda processarVencidos, que vira o status para 'vencido'.
    // Daí a linha ficava vermelha e SEM botão: não existia jeito de marcar
    // como paga pela interface, embora baixarConta aceite a conta vencida e a
    // regra de negócio não restrinja a baixa ao status 'previsto'.
    await montar({ linhas: [ALUGUEL] });

    const linha = linhaCom("Aluguel de julho");
    expect(within(linha).getByText("Vencido")).toBeInTheDocument();
    expect(within(linha).getByText("Baixar")).toBeInTheDocument();
  });

  it("o dinheiro da conta vencida continua no card de a pagar", async () => {
    // Antes: "R$ 0,00 / R$ 0,00" — R$ 2,500 de aluguel atrasado sumiam do
    // resumo no mesmo instante em que a tela marcava a conta como vencida.
    await montar({ linhas: [ALUGUEL] });

    expect(card("Previsto (a receber / a pagar)")).toBe("R$ 0,00 / R$ 2.500,00");
  });

  it("conta já paga não oferece o botão de baixar de novo", async () => {
    await montar({ linhas: [{ ...ALUGUEL, status: "pago" }] });

    const linha = linhaCom("Aluguel de julho");
    expect(within(linha).getByText("Pago")).toBeInTheDocument();
    expect(within(linha).queryByText("Baixar")).not.toBeInTheDocument();
    expect(card("Saídas realizadas")).toBe("R$ 2.500,00");
  });
});

describe("FinanceiroView, leitura do financeiro falhou (Run 2)", () => {
  it("não afirma que o mês está sem lançamentos quando não conseguiu ler", async () => {
    await montar({ erroListar: { message: "network" } });

    expect(screen.getByRole("alert")).toHaveTextContent(/não foi possível carregar o financeiro/i);
    expect(screen.queryByText("Nenhum lançamento no período.")).not.toBeInTheDocument();
    expect(screen.getByText("Não foi possível carregar os lançamentos.")).toBeInTheDocument();
    // E não mostra R$ 0,00 em todos os cards como se fosse o caixa do mês.
    expect(screen.queryByText("Entradas realizadas")).not.toBeInTheDocument();
  });

  it("o botão Tentar de novo recarrega e mostra os lançamentos", async () => {
    await montar({ erroListar: { message: "network" } });

    servirBanco({ linhas: [ALUGUEL] });
    await act(async () => { fireEvent.click(screen.getByText("Tentar de novo")); });

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText("Aluguel de julho")).toBeInTheDocument();
    expect(card("Previsto (a receber / a pagar)")).toBe("R$ 0,00 / R$ 2.500,00");
  });

  it("mês de verdade sem lançamento nenhum continua dizendo que está vazio", async () => {
    // Contrapeso: o estado vazio legítimo não pode ter virado estado de erro.
    await montar({ linhas: [] });

    expect(screen.getByText("Nenhum lançamento no período.")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText("Entradas realizadas")).toBeInTheDocument();
  });
});

describe("FinanceiroView, baixar conta (Run 2)", () => {
  it("avisa na tela quando a baixa falha, em vez de não acontecer nada", async () => {
    await montar({ linhas: [ALUGUEL], respostaBaixa: { data: null, error: { message: "sem conexão" } } });

    await act(async () => { fireEvent.click(screen.getByText("Baixar")); });

    expect(screen.getByRole("status")).toHaveTextContent(/não foi possível baixar a conta/i);
    // E a conta continua em aberto, com o botão para tentar de novo.
    const linha = linhaCom("Aluguel de julho");
    expect(within(linha).getByText("Vencido")).toBeInTheDocument();
    expect(within(linha).getByText("Baixar")).toBeInTheDocument();
  });

  it("não apaga a linha quando o banco responde vazio sem erro", async () => {
    // `{ data: null, error: null }` acontece quando o update não encontra a
    // linha (RLS, id de outro tenant). Sem a guarda do `!data`, a lista ficava
    // com um `null` no lugar da conta e o render seguinte quebrava.
    await montar({ linhas: [ALUGUEL], respostaBaixa: { data: null, error: null } });

    await act(async () => { fireEvent.click(screen.getByText("Baixar")); });

    expect(screen.getByRole("status")).toHaveTextContent(/não foi possível baixar a conta/i);
    expect(linhaCom("Aluguel de julho")).toBeInTheDocument();
    expect(card("Previsto (a receber / a pagar)")).toBe("R$ 0,00 / R$ 2.500,00");
  });

  it("baixa bem-sucedida move o valor de a pagar para saída realizada", async () => {
    await montar({ linhas: [ALUGUEL] });

    await act(async () => { fireEvent.click(screen.getByText("Baixar")); });

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(within(linhaCom("Aluguel de julho")).getByText("Pago")).toBeInTheDocument();
    expect(card("Saídas realizadas")).toBe("R$ 2.500,00");
    expect(card("Previsto (a receber / a pagar)")).toBe("R$ 0,00 / R$ 0,00");
  });
});

describe("FinanceiroView, lucro do período (Run 2)", () => {
  const LUCRO = "Lucro (vendas − custo das fichas − saídas pagas)";

  // Estes testes usam julho de 2026 como mês fixo. Desde o refino R01 o card
  // Lucro depende de "hoje": período que começa antes da janela de 90 dias de
  // `sales` deixa de ser calculado. Sem parar o relógio em julho, eles
  // quebrariam sozinhos assim que julho de 2026 ficasse velho demais.
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-07-20T15:00:00.000Z"));
  });
  afterEach(() => { vi.useRealTimers(); });

  it("a venda das 21h30 do dia 31 conta no mês em que foi vendida", async () => {
    // 2026-08-01T00:30:00Z = 31/07 às 21h30 em São Paulo. Lendo o dia UTC
    // (`at.slice(0,10)`) a venda caía em agosto: no fechamento de julho o
    // lucro do último dia do mês simplesmente não existia.
    await montar({ sales: [venda("2026-08-01T00:30:00.000Z")], fichas: [FICHA_PRATO] });

    expect(card(LUCRO)).toBe("R$ 70,00"); // 100 de venda − 30 de custo
  });

  it("essa mesma venda não é contada de novo em agosto", async () => {
    // Contrapeso: o dia local tem que EXCLUIR a venda de julho do mês
    // seguinte, não só passar a incluí-la em julho.
    await montar({ sales: [venda("2026-08-01T00:30:00.000Z")], fichas: [FICHA_PRATO] });

    fireEvent.change(screen.getByLabelText("Data inicial do período"), { target: { value: "2026-08-01" } });
    fireEvent.change(screen.getByLabelText("Data final do período"),   { target: { value: "2026-08-31" } });
    await waitFor(() => expect(screen.queryByText("Carregando…")).not.toBeInTheDocument());

    expect(card(LUCRO)).toBe("R$ 0,00");
  });

  it("noite de fiado não vira prejuízo: receita e custo saem das mesmas vendas", async () => {
    // A venda foi feita e o prato saiu da cozinha, mas o cliente pagou no
    // fiado — a receita fica 'previsto'. Antes a receita do lucro vinha só do
    // realizado (R$ 0) enquanto o custo vinha de todas as vendas (R$ 30): o
    // card mostrava "-R$ 30,00" num dia que na verdade deu R$ 70 de lucro.
    await montar({
      linhas: [{
        id: "fiado", tipo: "receita", categoria: "vendas", descricao: "Fiado do 12",
        valor: 100, competencia: "2026-07-15", vencimento: "2026-08-14", status: "previsto",
      }],
      sales: [venda("2026-07-15T18:00:00.000Z")],
      fichas: [FICHA_PRATO],
    });

    expect(card(LUCRO)).toBe("R$ 70,00");
    // E o fiado continua sendo dinheiro a receber, não dinheiro recebido.
    expect(card("Previsto (a receber / a pagar)")).toBe("R$ 100,00 / R$ 0,00");
    expect(card("Entradas realizadas")).toBe("R$ 0,00");
  });

  it("desconta do lucro as despesas já pagas", async () => {
    await montar({
      linhas: [{
        id: "gas", tipo: "despesa", categoria: "insumos", descricao: "Gás",
        valor: 20, competencia: "2026-07-15", status: "pago",
      }],
      sales: [venda("2026-07-15T18:00:00.000Z")],
      fichas: [FICHA_PRATO],
    });

    expect(card(LUCRO)).toBe("R$ 50,00"); // 100 − 30 de ficha − 20 de gás
  });

  it("venda cancelada não entra na receita nem no custo", async () => {
    await montar({
      sales: [
        venda("2026-07-15T18:00:00.000Z"),
        venda("2026-07-16T18:00:00.000Z", 100, { cancelada: true }),
      ],
      fichas: [FICHA_PRATO],
    });

    expect(card(LUCRO)).toBe("R$ 70,00");
  });

  it("lucro exatamente zerado não sai negativo em vermelho", async () => {
    // 39,90 + 8,70 de vendas contra 48,60 de despesa paga: em float o
    // resultado cru é -7.1e-15, e o card imprimia "-R$ 0,00" em vermelho
    // num dia que fechou empatado.
    await montar({
      linhas: [{
        id: "d", tipo: "despesa", categoria: "outros", descricao: "Empate",
        valor: 48.6, competencia: "2026-07-15", status: "pago",
      }],
      sales: [
        venda("2026-07-15T18:00:00.000Z", 39.9, { items: [] }),
        venda("2026-07-15T19:00:00.000Z", 8.7,  { items: [] }),
      ],
    });

    expect(card(LUCRO)).toBe("R$ 0,00");
  });
});

describe("FinanceiroView, lançamento salvo fora do período visível (Run 2)", () => {
  /** Preenche e salva uma despesa paga com a competência pedida. */
  async function salvarDespesaPaga(competencia) {
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /novo lançamento/i }));
    await user.type(screen.getByLabelText(/valor \(r\$\)/i), "2500");
    fireEvent.change(screen.getByLabelText("Competência"), { target: { value: competencia } });
    await user.selectOptions(screen.getByLabelText("Status"), "pago");
    await user.click(screen.getByRole("button", { name: /salvar lançamento/i }));
    await waitFor(() => expect(screen.queryByText("Novo Lançamento")).not.toBeInTheDocument());
  }

  it("avisa quando a competência salva não está no período da tela", async () => {
    // O modal fecha, a linha é filtrada pelo período e nada aparece na tela.
    // Sem aviso, o dono acredita que não salvou e lança de novo — despesa
    // dobrada no mês seguinte, e ninguém entende de onde saiu.
    const sup = mockSupabase.current;
    await montar({ linhas: [] });
    sup.setTableHandler("lancamentos", ({ method, args }) => {
      if (method === "insert") return { data: { id: "novo", ...args[0] }, error: null };
      return { data: [], error: null };
    });

    await salvarDespesaPaga("2026-08-05");

    expect(screen.getByRole("status")).toHaveTextContent(
      "Lançamento salvo para 05/08/2026, fora do período que está na tela.",
    );
    expect(screen.getByText("Nenhum lançamento no período.")).toBeInTheDocument();
  });

  it("lançamento dentro do período aparece na lista, sem aviso", async () => {
    const sup = mockSupabase.current;
    await montar({ linhas: [] });
    sup.setTableHandler("lancamentos", ({ method, args }) => {
      if (method === "insert") return { data: { id: "novo", ...args[0] }, error: null };
      return { data: [], error: null };
    });

    await salvarDespesaPaga("2026-07-20");

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(card("Saídas realizadas")).toBe("R$ 2.500,00");
  });
});

// ── Refino, robustez do Financeiro ────────────────────────────────────
//
// R01: a receita do card Lucro vem de `sales`, que o bootstrap carrega só dos
// últimos 90 dias (AppContext.jsx:340), enquanto as saídas vêm de
// `lancamentos`, sem recorte. Escolhendo um mês mais antigo que isso, a receita
// entrava como zero, o custo como zero, e as despesas pagas daquele mês
// continuavam sendo subtraídas: prejuízo inventado, em vermelho, num mês que
// pode ter sido o melhor do ano.
//
// R02: a tela pedia TODOS os lançamentos e recortava o período na memória.
// Passando do teto de linhas do PostgREST (1000 por padrão), os mais antigos
// paravam de chegar e o mês antigo aparecia zerado, sem aviso nenhum.

/** Dia de calendário local, n dias atrás, no formato do <input type="date">. */
function diasAtras(n) {
  const d = new Date(Date.now() - n * 24 * 60 * 60 * 1000);
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mes}-${dia}`;
}

const HOJE = diasAtras(0);
const DIA_ANTIGO = diasAtras(200); // bem antes da janela de 90 dias

/**
 * Monta a tela SEM mexer no período: fica valendo o mês corrente, que é o que
 * estes testes precisam comparar com a janela de vendas carregada.
 */
async function montarNoMesCorrente({ sales = [], ...banco } = {}) {
  servirBanco(banco);
  setAppMock({ currentUser: { name: "Gerente Teste", username: "gerente1", role: "gerente" }, sales });

  const utils = renderWithProviders(<FinanceiroView />);
  await waitFor(() => expect(screen.queryByText("Carregando…")).not.toBeInTheDocument());
  return utils;
}

/** Uma despesa já paga na competência pedida. */
const despesaPaga = (competencia) => ({
  id: "hortifruti", tipo: "despesa", categoria: "insumos", descricao: "Hortifruti",
  valor: 30, competencia, status: "pago",
});

describe("FinanceiroView, lucro de período fora da janela de vendas (R01)", () => {
  const LUCRO = "Lucro (vendas − custo das fichas − saídas pagas)";

  it("dentro da janela, o card segue calculando o lucro normalmente", async () => {
    await montarNoMesCorrente({
      linhas: [despesaPaga(HOJE)],
      sales: [venda(new Date().toISOString())],
      fichas: [FICHA_PRATO],
    });

    // 100 de venda, menos 30 de ficha técnica, menos 30 de despesa paga.
    expect(card(LUCRO)).toBe("R$ 40,00");
  });

  it("período que começa antes da janela, o card diz que o lucro não está disponível", async () => {
    await montarNoMesCorrente({
      linhas: [despesaPaga(DIA_ANTIGO)],
      sales: [venda(new Date().toISOString())],
      fichas: [FICHA_PRATO],
    });

    // Puxar o "Até" para trás arrasta o "De" junto: o período inteiro fica
    // antes da janela de vendas carregada.
    fireEvent.change(screen.getByLabelText("Data final do período"), { target: { value: DIA_ANTIGO } });
    await waitFor(() => expect(screen.queryByText("Carregando…")).not.toBeInTheDocument());

    // Antes: "-R$ 30,00", só a despesa paga, sem nenhuma receita para comparar.
    expect(card(/as vendas carregadas cobrem os últimos 90 dias/)).toBe("Não disponível");
    expect(screen.queryByText(LUCRO)).not.toBeInTheDocument();
  });
});

describe("FinanceiroView, período vai na consulta de lançamentos (R02)", () => {
  const filtrosDeCompetencia = () =>
    mockSupabase.current.calls
      .filter((c) => c.table === "lancamentos" && (c.method === "gte" || c.method === "lte"))
      .map((c) => `${c.method}:${c.args[0]}:${c.args[1]}`);

  it("a primeira carga já filtra pelo período na consulta, não na memória", async () => {
    const { de, ate } = intervaloDoMes(new Date());
    await montarNoMesCorrente({ linhas: [despesaPaga(HOJE)] });

    expect(filtrosDeCompetencia()).toEqual([
      `gte:competencia:${de}`,
      `lte:competencia:${ate}`,
    ]);
  });

  it("mudar o período refaz a consulta com as novas datas", async () => {
    await montarNoMesCorrente({ linhas: [] });
    mockSupabase.current.calls.length = 0;

    fireEvent.change(screen.getByLabelText("Data inicial do período"), { target: { value: DIA_ANTIGO } });
    await waitFor(() => expect(screen.queryByText("Carregando…")).not.toBeInTheDocument());

    expect(filtrosDeCompetencia()).toContain(`gte:competencia:${DIA_ANTIGO}`);
  });
});

// ── Refino: a aba que atravessa a virada do mês ───────────────────────
//
// O PDV nunca fecha. O período nascia congelado (`useState(() =>
// intervaloDoMes(new Date()))`), então uma aba montada em 30 de agosto seguia
// no Financeiro de agosto durante todo setembro, e nenhum chip aparecia
// destacado: o PeriodoSelector recalcula o próprio "hoje" a cada render e o
// intervalo congelado já não casava com "Este mês". O dono via um período
// antigo e nenhuma pista de qual atalho estava ativo.

describe("FinanceiroView, virada do mês com a aba aberta (refino)", () => {
  afterEach(() => { vi.useRealTimers(); });

  const chipEsteMes = () => screen.getByRole("button", { name: "Este mês" });
  const de = () => screen.getByLabelText("Data inicial do período");
  const ate = () => screen.getByLabelText("Data final do período");
  const competenciasConsultadas = () =>
    mockSupabase.current.calls
      .filter((c) => c.table === "lancamentos" && (c.method === "gte" || c.method === "lte"))
      .map((c) => `${c.method}:${c.args[1]}`);

  /** Monta a tela com o relógio parado em 30/08/2026, 22h. */
  async function montarNaViradaDeAgosto() {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(2026, 7, 30, 22, 0));
    servirBanco({ linhas: [] });
    setAppMock({ currentUser: { name: "Gerente Teste", username: "gerente1", role: "gerente" }, sales: [] });
    renderWithProviders(<FinanceiroView />);
    await waitFor(() => expect(screen.queryByText("Carregando…")).not.toBeInTheDocument());
  }

  /** Passa para 1º de setembro, 00h05, e deixa o tique do relógio bater. */
  async function passarParaSetembro() {
    await act(async () => {
      vi.setSystemTime(new Date(2026, 8, 1, 0, 5));
      vi.advanceTimersByTime(30000);
    });
    await waitFor(() => expect(screen.queryByText("Carregando…")).not.toBeInTheDocument());
  }

  it("o período vai para setembro e o chip Este mês continua destacado", async () => {
    await montarNaViradaDeAgosto();

    expect(de()).toHaveValue("2026-08-01");
    expect(ate()).toHaveValue("2026-08-31");
    expect(chipEsteMes()).toHaveAttribute("aria-pressed", "true");

    mockSupabase.current.calls.length = 0;
    await passarParaSetembro();

    // Antes: continuava 01/08 a 31/08, com "personalizado" e nenhum chip aceso.
    expect(de()).toHaveValue("2026-09-01");
    expect(ate()).toHaveValue("2026-09-30");
    expect(chipEsteMes()).toHaveAttribute("aria-pressed", "true");
    // E os lançamentos do mês novo foram buscados, não os de agosto.
    expect(competenciasConsultadas()).toContain("gte:2026-09-01");
  });

  it("datas escolhidas à mão não são arrastadas pela virada do mês", async () => {
    await montarNaViradaDeAgosto();

    fireEvent.change(de(), { target: { value: "2026-08-10" } });
    fireEvent.change(ate(), { target: { value: "2026-08-20" } });
    await waitFor(() => expect(screen.queryByText("Carregando…")).not.toBeInTheDocument());

    await passarParaSetembro();

    expect(de()).toHaveValue("2026-08-10");
    expect(ate()).toHaveValue("2026-08-20");
    expect(chipEsteMes()).toHaveAttribute("aria-pressed", "false");
  });
});
