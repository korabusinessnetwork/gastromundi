// @vitest-environment jsdom
//
// Run 1 da auditoria — a fiação do relatório de fechamentos.
//
// A conta em si mora em @/lib/caixa e tem teste próprio (caixa.test.js). O que
// este arquivo prende é o que a tela e a planilha realmente mostram: o MESMO
// fechamento aparecia "Caixa Conferido" na hora de fechar e "Falta no Caixa
// -R$ 20,00" depois, na linha do relatório, no detalhe e no arquivo exportado,
// porque cada um desses três lugares recalculava `totalVendas + fundo` por
// conta própria. Sem estes testes, voltar qualquer um dos três à conta antiga
// não quebra nada.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

const { mockSupabase } = vi.hoisted(() => ({ mockSupabase: { current: null } }));
vi.mock("@/lib/supabase", async () => {
  const { createMockSupabase } = await import("@/test/mockSupabase");
  mockSupabase.current = createMockSupabase();
  return { supabase: mockSupabase.current };
});

// Captura o que seria escrito no arquivo, em vez de gerar PDF/XLSX de verdade.
// `opts` entra junto porque é lá que viaja o cabeçalho com a marca do
// estabelecimento (`opts.empresa`) — sem capturá-lo, o nome impresso no
// arquivo exportado fica fora do alcance do teste.
const { exportado } = vi.hoisted(() => ({ exportado: { pdf: [], xlsx: [] } }));
vi.mock("@/lib/exportReport", () => ({
  exportToPDF: (titulo, headers, rows, periodo, opts) => exportado.pdf.push({ titulo, headers, rows, periodo, opts }),
  exportToXLSX: (titulo, headers, rows, periodo, opts) => exportado.xlsx.push({ titulo, headers, rows, periodo, opts }),
}));

// A aba Desempenho tem relatório e teste próprios; aqui ela só não pode
// arrastar as consultas dela para dentro deste teste.
vi.mock("./DesempenhoReport", () => ({ default: () => <div>Desempenho</div> }));

const { contexto } = vi.hoisted(() => ({ contexto: { current: {} } }));
vi.mock("@/context/AppContext", () => ({ useApp: () => contexto.current }));

import RelatorioView from "./RelatorioView";

/** R$ 70 vendidos com R$ 20 em fiado: só R$ 50 podiam ser contados na gaveta. */
const COM_FIADO = {
  id: 1,
  at: new Date().toISOString(),
  user: "Ana",
  fundo: 0,
  totalVendas: 70,
  totalEsperado: 50,
  totalConferido: 50,
  conferidoPorMetodo: { dinheiro: 50 },
};

/** O mesmo caixa, gravado antes desta versão (sem `totalEsperado`). */
const ANTIGO = {
  id: 2,
  at: new Date().toISOString(),
  user: "Ana",
  fundo: 0,
  totalVendas: 70,
  totalConferido: 50,
  conferidoPorMetodo: { dinheiro: 50 },
};

/** Células da linha da tabela: [data, usuário, fundo, vendas, conferido, diferença, ação]. */
const celulas = (i = 0) =>
  [...document.querySelectorAll("tbody tr")[i].querySelectorAll("td")]
    .map(td => td.textContent.trim());

/** Valor da linha do resumo dentro do modal de detalhe. */
const resumo = (label) => screen.getByText(label).parentElement.textContent;

function montar(fechamentos, tenant = null) {
  contexto.current = {
    sales: [],
    fechamentos,
    pending: [],
    users: [],
    currentUser: { role: "gerente" },
    tenant,
    metodosCustom: [],
  };
  render(<RelatorioView />);
  fireEvent.click(screen.getByText("Fechamentos"));
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSupabase.current.reset();
  exportado.pdf.length = 0;
  exportado.xlsx.length = 0;
});

describe("RelatorioView, fechamentos com método sem conferência (Run 1)", () => {
  it("a linha do relatório mostra diferença zero, não a falsa falta do fiado", () => {
    montar([COM_FIADO]);

    const [, usuario, fundo, vendas, conferido, diferenca] = celulas();
    expect(usuario).toBe("Ana");
    expect(fundo).toBe("R$ 0,00");
    expect(vendas).toBe("R$ 70,00");
    expect(conferido).toBe("R$ 50,00");
    expect(diferenca).toBe("R$ 0,00"); // antes: "-R$ 20,00"
  });

  it("o detalhe do fechamento concorda com a tela de fechar o caixa", () => {
    montar([COM_FIADO]);
    fireEvent.click(document.querySelector("tbody tr"));

    expect(resumo("Total de Vendas (sistema)")).toContain("R$ 70,00");
    expect(resumo("Total Esperado em Caixa")).toContain("R$ 50,00");
    expect(resumo("Total Conferido")).toContain("R$ 50,00");
    expect(screen.getByText("Caixa Conferido")).toBeInTheDocument();
    expect(screen.queryByText("Falta no Caixa")).not.toBeInTheDocument();
  });

  it("a planilha exportada leva o esperado em caixa e a diferença certa", () => {
    montar([COM_FIADO]);
    fireEvent.click(screen.getByTitle("Exportar Excel"));

    expect(exportado.xlsx).toHaveLength(1);
    const { titulo, headers, rows } = exportado.xlsx[0];
    expect(titulo).toBe("Fechamentos de Caixa");
    expect(headers).toContain("Esperado em Caixa (R$)");

    const esperadoIdx = headers.indexOf("Esperado em Caixa (R$)");
    const difIdx = headers.indexOf("Diferença (R$)");
    expect(rows[0][esperadoIdx]).toBe("50.00");
    expect(rows[0][difIdx]).toBe("0.00"); // antes: "-20.00"
  });

  it("o PDF sai com as mesmas colunas da planilha", () => {
    montar([COM_FIADO]);
    fireEvent.click(screen.getByTitle("Exportar PDF"));

    expect(exportado.pdf).toHaveLength(1);
    expect(exportado.pdf[0].headers).toContain("Esperado em Caixa (R$)");
    expect(exportado.pdf[0].rows[0]).toContain("50.00");
  });
});

describe("RelatorioView, marca no cabeçalho do arquivo exportado (Run 5, leva 11)", () => {
  it("sem tema custom, o PDF e a planilha saem com o nome CADASTRADO do estabelecimento", () => {
    // O relatório exportado sai do sistema: vai para o contador, para o
    // sócio, para o banco. Enquanto o fallback era a marca de um cliente,
    // todo estabelecimento sem `nome_exibicao` mandava para fora um arquivo
    // carimbado com o nome de outra empresa (decisão 017).
    montar([COM_FIADO], { id: "t1", nome: "Casa Coffee", tema: {} });

    fireEvent.click(screen.getByTitle("Exportar PDF"));
    fireEvent.click(screen.getByTitle("Exportar Excel"));

    expect(exportado.pdf[0].opts.empresa).toBe("CASA COFFEE by Kora");
    expect(exportado.xlsx[0].opts.empresa).toBe("CASA COFFEE by Kora");
    expect(exportado.pdf[0].opts.empresa).not.toContain("GASTROMUNDI");
  });

  it("com nome_exibicao, o tema manda no cabeçalho", () => {
    montar([COM_FIADO], { id: "t2", nome: "Casa Coffee LTDA", tema: { nome_exibicao: "Casa Coffee" } });

    fireEvent.click(screen.getByTitle("Exportar PDF"));

    expect(exportado.pdf[0].opts.empresa).toBe("CASA COFFEE by Kora");
  });

  it("sem tenant carregado, o cabeçalho é só a marca da plataforma", () => {
    // Abertura offline / bootstrap ainda em voo: sem marca alheia e sem o
    // redundante "KORA by Kora".
    montar([COM_FIADO], null);

    fireEvent.click(screen.getByTitle("Exportar PDF"));

    expect(exportado.pdf[0].opts.empresa).toBe("Kora");
  });
});

describe("RelatorioView, fechamento gravado antes desta versão (Run 1)", () => {
  it("sem o campo gravado, mantém a leitura histórica em vez de inventar zero", () => {
    // Retrocompatibilidade: fechamentos antigos não têm `totalEsperado`, e o
    // fallback (`vendas + fundo`) é o que a tela mostrava na época. Este teste
    // é o contrapeso do anterior — impede "corrigir" tudo para zero.
    montar([ANTIGO]);

    expect(celulas()[5]).toBe("-R$ 20,00");

    fireEvent.click(document.querySelector("tbody tr"));
    expect(resumo("Total Esperado em Caixa")).toContain("R$ 70,00");
    expect(screen.getByText("Falta no Caixa")).toBeInTheDocument();
  });
});

/**
 * Item cancelado dentro de uma venda VÁLIDA.
 *
 * A venda cancelada inteira já ficava fora de todos os relatórios (Leva 15.3),
 * mas o item cancelado dentro de uma venda que foi cobrada continuava listado
 * no detalhado como se tivesse sido vendido, contava no "N itens" do cabeçalho
 * e ia para o PDF e para a planilha. O total da comanda é calculado sem ele
 * (useFinalizarPagamento), então a soma dos subtotais exibidos não fechava com
 * o total mostrado ao lado, e o mesmo item ainda aparecia na aba Cancelamentos:
 * dois lugares da mesma tela se contradizendo.
 */
const VENDA_COM_ITEM_CANCELADO = {
  id: 9,
  comanda: "12",
  cashier: "Ana",
  at: new Date().toISOString(),
  // Cobrado: 2 cervejas a 16,10 = 32,20. A batata foi cancelada.
  total: 32.2,
  pagamentos: [{ metodo: "dinheiro", valor: 32.2 }],
  items: [
    { uid: "a1", name: "Cerveja", price: 16.1, qty: 2 },
    { uid: "a2", name: "Batata", price: 20, qty: 1, cancelado: true, motivoCancelamento: "cliente desistiu", canceladoPor: "Ana" },
  ],
};

function montarVendaDetalhada() {
  contexto.current = {
    sales: [VENDA_COM_ITEM_CANCELADO],
    fechamentos: [],
    pending: [],
    users: [],
    currentUser: { role: "gerente" },
    tenant: null,
    metodosCustom: [],
  };
  render(<RelatorioView />);
  fireEvent.click(screen.getByText("Detalhado"));
}

describe("RelatorioView, item cancelado dentro de venda válida", () => {
  it("o detalhado não lista o item cancelado e conta só o que foi cobrado", () => {
    montarVendaDetalhada();

    expect(screen.getByText("Cerveja")).toBeInTheDocument();
    expect(screen.queryByText("Batata")).not.toBeInTheDocument();
    expect(screen.getByText("2 itens")).toBeInTheDocument();
  });

  it("a soma dos subtotais exibidos fecha com o total da comanda", () => {
    montarVendaDetalhada();

    const celulasDeDinheiro = [...document.querySelectorAll("tbody td")]
      .map(td => td.textContent.trim())
      .filter(t => /^R\$ /.test(t));
    // "R$ 1.234,56" para 1234.56: ponto é milhar e vírgula é decimal desde que
    // o dinheiro da tela passou a ser formatado em pt-BR.
    const subtotais = celulasDeDinheiro.map(t =>
      Number(t.replace("R$ ", "").replace(/\./g, "").replace(",", ".")),
    );
    // Unitário 16,10 e subtotal 32,20 da única linha que sobrou.
    expect(subtotais).toEqual([16.1, 32.2]);
    expect(subtotais[subtotais.length - 1]).toBe(VENDA_COM_ITEM_CANCELADO.total);
  });

  it("o arquivo exportado também sai sem o item cancelado", () => {
    montarVendaDetalhada();
    fireEvent.click(screen.getByTitle("Exportar Excel"));

    const { titulo, rows } = exportado.xlsx[0];
    expect(titulo).toBe("Vendas Detalhado");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toContain("Cerveja");
    expect(rows.flat()).not.toContain("Batata");
  });
});

/**
 * Atalho de período mais largo: o chip dizia "Tudo" e não recortava nada, só
 * que a lista que ele não recorta já vem limitada a 90 dias pelo bootstrap.
 * O PDF e a planilha saíam com "Período: Todo o período" impresso sobre dados
 * de 90 dias, e é esse arquivo que vai para o contador.
 */
describe("RelatorioView, janela real do atalho mais largo (R04)", () => {
  it("o atalho diz a janela real, em vez de prometer todo o histórico", () => {
    montar([COM_FIADO]);

    expect(screen.getByText("90 dias")).toBeInTheDocument();
    expect(screen.queryByText("Tudo")).not.toBeInTheDocument();
  });

  it("o cabeçalho do arquivo exportado diz a janela real", () => {
    montar([COM_FIADO]);
    fireEvent.click(screen.getByText("90 dias"));

    fireEvent.click(screen.getByTitle("Exportar PDF"));
    fireEvent.click(screen.getByTitle("Exportar Excel"));

    // Antes: "tudo", que o exportReport imprime como "Todo o período".
    expect(exportado.pdf[0].periodo).toBe("Últimos 90 dias");
    expect(exportado.xlsx[0].periodo).toBe("Últimos 90 dias");
  });

  it("os demais atalhos continuam chegando iguais ao arquivo", () => {
    montar([COM_FIADO]);
    fireEvent.click(screen.getByText("30 dias"));
    fireEvent.click(screen.getByTitle("Exportar PDF"));

    expect(exportado.pdf[0].periodo).toBe("mes");
  });
});

/**
 * Aba Logs: falha de leitura contra período realmente sem atividade.
 *
 * A carga de `operator_logs` ignorava o erro e caía em `data ?? []`: a aba
 * ficava vazia com "Nenhum evento no período selecionado", indistinguível de
 * "não houve atividade". É a aba que o dono abre justamente quando desconfia
 * de algo, então vazio por engano é o pior resultado possível.
 */
function montarLogs() {
  contexto.current = {
    sales: [],
    fechamentos: [],
    pending: [],
    users: [],
    currentUser: { role: "gerente" },
    tenant: null,
    metodosCustom: [],
  };
  render(<RelatorioView />);
  fireEvent.click(screen.getByText("Logs"));
}

const LOG_DE_AGORA = {
  id: "log1",
  operator_id: "ana",
  action_type: "caixa:abertura",
  payload: { name: "Ana", role: "gerente", msg: "Abriu o caixa" },
  created_at: new Date().toISOString(),
};

describe("RelatorioView, leitura dos logs de operadores", () => {
  it("falha de leitura mostra o motivo e um botão de tentar de novo", async () => {
    mockSupabase.current.setTableError("operator_logs", { message: "conexão perdida" });
    montarLogs();

    expect(await screen.findByText(/Não foi possível carregar os logs/)).toBeInTheDocument();
    expect(screen.getByText(/conexão perdida/)).toBeInTheDocument();
    // O engano que existia antes: aba vazia como se nada tivesse acontecido.
    expect(screen.queryByText("Nenhum evento no período selecionado")).not.toBeInTheDocument();
  });

  it("tentar de novo refaz a busca e mostra os logs quando o banco responde", async () => {
    mockSupabase.current.setTableError("operator_logs", { message: "conexão perdida" });
    montarLogs();
    await screen.findByText("Tentar de novo");

    mockSupabase.current.reset();
    mockSupabase.current.setTableResult("operator_logs", { data: [LOG_DE_AGORA], error: null });
    fireEvent.click(screen.getByText("Tentar de novo"));

    expect(await screen.findByText("Abriu o caixa")).toBeInTheDocument();
    expect(screen.queryByText(/Não foi possível carregar os logs/)).not.toBeInTheDocument();
  });

  it("período realmente sem atividade continua mostrando o estado vazio", async () => {
    mockSupabase.current.setTableResult("operator_logs", { data: [], error: null });
    montarLogs();

    expect(await screen.findByText("Nenhum evento no período selecionado")).toBeInTheDocument();
    expect(screen.queryByText(/Não foi possível carregar os logs/)).not.toBeInTheDocument();
  });
});

// ── Refino: a aba que atravessa a meia-noite ──────────────────────────
//
// O PDV nunca fecha, a aba fica aberta 24 horas por dia. O recorte "Hoje" era
// resolvido dentro de um useMemo cujas dependências não tinham nada ligado ao
// relógio, então ele só reavaliava quando entrava uma venda nova: à 00h05 o
// relatório ainda mostrava o movimento da noite anterior como se fosse de hoje,
// e a lista só se corrigia quando a próxima venda chegava, do nada.

/** Uma venda de R$ 100 em dinheiro no instante informado. */
const vendaEm = (data, comanda) => ({
  id: comanda, comanda, cashier: "Ana", at: data.toISOString(),
  total: 100, metodo: "dinheiro", items: [{ id: 1, qty: 1 }],
});

function montarVendas(sales) {
  contexto.current = {
    sales,
    fechamentos: [],
    pending: [],
    users: [],
    currentUser: { role: "gerente" },
    tenant: null,
    metodosCustom: [],
  };
  render(<RelatorioView />);
}

describe("RelatorioView, virada do dia com a aba aberta (refino)", () => {
  afterEach(() => { vi.useRealTimers(); });

  it("o recorte Hoje solta a venda de ontem na virada do dia, sem venda nova para provocar", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 11, 23, 50));

    montarVendas([vendaEm(new Date(2026, 8, 11, 20, 0), "12")]);

    // 23h50 do dia 11: a venda das 20h é de hoje.
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(document.querySelectorAll("tbody tr")).toHaveLength(1);

    // Passa da meia-noite. Nada mais acontece: nenhuma venda entra, ninguém
    // toca na tela, a aba não recarrega.
    act(() => {
      vi.setSystemTime(new Date(2026, 8, 12, 0, 5));
      vi.advanceTimersByTime(30000);
    });

    // Antes: a mesma linha continuava lá, como movimento "de hoje".
    expect(screen.getByText("Nenhuma venda no período selecionado")).toBeInTheDocument();
    expect(screen.queryByText("12")).not.toBeInTheDocument();
  });

  it("a visão Admin consolidada também vira o dia junto", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 11, 23, 50));

    contexto.current = {
      sales: [vendaEm(new Date(2026, 8, 11, 20, 0), "12")],
      fechamentos: [],
      pending: [],
      users: [],
      currentUser: { role: "admin" },
      tenant: null,
      metodosCustom: [],
    };
    render(<RelatorioView />);
    fireEvent.click(screen.getByText("Admin"));

    expect(screen.queryAllByText("R$ 100,00").length).toBeGreaterThan(0);

    act(() => {
      vi.setSystemTime(new Date(2026, 8, 12, 0, 5));
      vi.advanceTimersByTime(30000);
    });

    // Antes: o faturamento de ontem seguia carimbado como o de hoje.
    expect(screen.queryAllByText("R$ 100,00")).toHaveLength(0);
  });
});
