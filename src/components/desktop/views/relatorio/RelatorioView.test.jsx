// @vitest-environment jsdom
//
// Run 1 da auditoria — a fiação do relatório de fechamentos.
//
// A conta em si mora em @/lib/caixa e tem teste próprio (caixa.test.js). O que
// este arquivo prende é o que a tela e a planilha realmente mostram: o MESMO
// fechamento aparecia "Caixa Conferido" na hora de fechar e "Falta no Caixa
// -R$ 20.00" depois, na linha do relatório, no detalhe e no arquivo exportado,
// porque cada um desses três lugares recalculava `totalVendas + fundo` por
// conta própria. Sem estes testes, voltar qualquer um dos três à conta antiga
// não quebra nada.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

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
  exportToPDF: (titulo, headers, rows, periodo, opts) => exportado.pdf.push({ titulo, headers, rows, opts }),
  exportToXLSX: (titulo, headers, rows, periodo, opts) => exportado.xlsx.push({ titulo, headers, rows, opts }),
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

describe("RelatorioView — fechamentos com método sem conferência (Run 1)", () => {
  it("a linha do relatório mostra diferença zero, não a falsa falta do fiado", () => {
    montar([COM_FIADO]);

    const [, usuario, fundo, vendas, conferido, diferenca] = celulas();
    expect(usuario).toBe("Ana");
    expect(fundo).toBe("R$ 0.00");
    expect(vendas).toBe("R$ 70.00");
    expect(conferido).toBe("R$ 50.00");
    expect(diferenca).toBe("R$ 0.00"); // antes: "R$ -20.00"
  });

  it("o detalhe do fechamento concorda com a tela de fechar o caixa", () => {
    montar([COM_FIADO]);
    fireEvent.click(document.querySelector("tbody tr"));

    expect(resumo("Total de Vendas (sistema)")).toContain("R$ 70.00");
    expect(resumo("Total Esperado em Caixa")).toContain("R$ 50.00");
    expect(resumo("Total Conferido")).toContain("R$ 50.00");
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

describe("RelatorioView — marca no cabeçalho do arquivo exportado (Run 5, leva 11)", () => {
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

describe("RelatorioView — fechamento gravado antes desta versão (Run 1)", () => {
  it("sem o campo gravado, mantém a leitura histórica em vez de inventar zero", () => {
    // Retrocompatibilidade: fechamentos antigos não têm `totalEsperado`, e o
    // fallback (`vendas + fundo`) é o que a tela mostrava na época. Este teste
    // é o contrapeso do anterior — impede "corrigir" tudo para zero.
    montar([ANTIGO]);

    expect(celulas()[5]).toBe("R$ -20.00");

    fireEvent.click(document.querySelector("tbody tr"));
    expect(resumo("Total Esperado em Caixa")).toContain("R$ 70.00");
    expect(screen.getByText("Falta no Caixa")).toBeInTheDocument();
  });
});
