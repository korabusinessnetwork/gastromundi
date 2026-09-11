// @vitest-environment jsdom
//
// F022-SAUDE — a aba "Saúde da operação" do Console.
//
// O que este arquivo protege:
//
// 1. Que a falha da leitura NÃO vire atestado de saúde. A RPC
//    `saude_plataforma` é da 20260928 e ainda não está aplicada em produção:
//    enquanto não estiver, o PostgREST devolve PGRST202 e uma tela ingênua
//    mostraria "nenhuma pendência" para uma base inteira com nota parada. Aqui
//    "não sei" precisa ser dito, porque o dono decide ligar para o cliente em
//    cima disso.
// 2. Que "nada parado" seja uma AFIRMAÇÃO na tela, e não uma tabela de zeros —
//    tabela de zeros lê como "não carregou".
// 3. Que quem está quebrado apareça ANTES dos números, ordenado por há quanto
//    tempo está parado, que é a única coisa da tela que pede ação.
// 4. Que a tela não misture período com estado de agora: trocar de 7 para 90
//    dias muda as falhas contadas, nunca o que está parado.
import { useState } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/lib/supabase", async () => {
  const { createMockSupabase } = await import("@/test/mockSupabase");
  return { supabase: createMockSupabase() };
});

// `resumirSaude` fica REAL — é ela que decide quem aparece, em que ordem e
// quem está quebrado. Só a ida ao banco é dublada.
const { mockListar } = vi.hoisted(() => ({ mockListar: vi.fn() }));
vi.mock("@/lib/console", async () => {
  const real = await vi.importActual("@/lib/console");
  return { ...real, listarSaude: mockListar };
});

import SaudeDashboard from "./SaudeDashboard";

// A tela usa `new Date()` (não recebe "hoje"), então as datas são relativas —
// data fixa aqui viraria bomba de tempo.
function diasAtras(n) {
  return new Date(Date.now() - n * 86400000).toISOString();
}

const TENANTS = [
  { id: "t-fiscal", nome: "Bar do Zé" },
  { id: "t-impressao", nome: "Café Central" },
  { id: "t-limpo", nome: "Padaria Nova" },
];

const SAUDE = [
  {
    tenant_id: "t-fiscal",
    fiscais_recusadas: 4,
    fiscais_paradas: 2,
    fiscal_parada_desde: diasAtras(9),
    impressoes_com_erro: 0,
    impressoes_paradas: 0,
    impressao_parada_desde: null,
  },
  {
    tenant_id: "t-impressao",
    fiscais_recusadas: 0,
    fiscais_paradas: 0,
    fiscal_parada_desde: null,
    impressoes_com_erro: 1,
    impressoes_paradas: 7,
    impressao_parada_desde: diasAtras(1),
  },
  // t-limpo não vem da RPC: nunca emitiu nota nem imprimiu nada.
];

// O período é propriedade controlada pela página (ele mora na URL — ver
// ConsolePage). Aqui a casca guarda o mesmo estado que a página guarda, para
// que o teste de troca de período exerça o caminho real: clicar → a página
// muda o valor → o componente recarrega.
function Casca({ diasInicial = 30, tenants = TENANTS }) {
  const [dias, setDias] = useState(diasInicial);
  return <SaudeDashboard tenants={tenants} dias={dias} aoTrocarPeriodo={setDias} />;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockListar.mockResolvedValue({ data: SAUDE, error: null });
});

describe("SaudeDashboard", () => {
  it("avisa que está carregando antes de a RPC responder", async () => {
    let liberar;
    mockListar.mockReturnValue(new Promise((r) => { liberar = r; }));

    render(<Casca />);
    expect(screen.getByText(/carregando a saúde/i)).toBeTruthy();

    liberar({ data: SAUDE, error: null });
    // O nome aparece duas vezes, na lista de ação e na tabela.
    expect((await screen.findAllByText(/Bar do Zé/)).length).toBe(2);
  });

  it("leitura que falha diz que não sabe, e não dá atestado de saúde", async () => {
    mockListar.mockResolvedValue({ data: [], error: { message: "PGRST202" } });

    render(<Casca />);

    // O texto tem de negar a leitura explicitamente: sem isso a tela vazia
    // seria lida como "está tudo funcionando".
    expect(
      await screen.findByText(/não quer dizer que\s+está tudo funcionando/i)
    ).toBeTruthy();
    // E não pode afirmar o contrário em lugar nenhum.
    expect(screen.queryByText(/nenhum estabelecimento com nota fiscal/i)).toBeNull();
    expect(screen.getByRole("button", { name: /tentar de novo/i })).toBeTruthy();
  });

  it("tentar de novo chama a RPC outra vez", async () => {
    mockListar.mockResolvedValue({ data: [], error: { message: "PGRST202" } });
    render(<Casca />);

    const botao = await screen.findByRole("button", { name: /tentar de novo/i });
    mockListar.mockResolvedValue({ data: SAUDE, error: null });
    await userEvent.click(botao);

    expect(await screen.findByText(/2 estabelecimentos com algo parado agora/i)).toBeTruthy();
  });

  it("quem está quebrado vem antes dos números, do mais antigo para o mais novo", async () => {
    render(<Casca />);

    const alerta = await screen.findByRole("status", {
      name: /estabelecimentos com pendência parada/i,
    });
    expect(within(alerta).getByText(/2 estabelecimentos com algo parado agora/i)).toBeTruthy();

    // Parado há 9 dias na frente de parado há 1: gravidade é tempo, não
    // quantidade — o Café Central tem 7 pendências e mesmo assim vem depois.
    const itens = within(alerta).getAllByRole("listitem");
    expect(itens).toHaveLength(2);
    expect(itens[0].textContent).toMatch(/Bar do Zé/);
    expect(itens[0].textContent).toMatch(/2 notas fiscais/);
    expect(itens[0].textContent).toMatch(/Há 9 dias/);
    expect(itens[1].textContent).toMatch(/Café Central/);
    expect(itens[1].textContent).toMatch(/7 impressões/);
    expect(itens[1].textContent).toMatch(/Ontem/);

    // O alerta aparece no documento antes dos cartões de número.
    const kpi = screen.getByText("Notas paradas agora");
    expect(alerta.compareDocumentPosition(kpi) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("a frase de quem está quebrado só cita o que tem pendência", async () => {
    render(<Casca />);
    const alerta = await screen.findByRole("status", {
      name: /estabelecimentos com pendência parada/i,
    });
    const itens = within(alerta).getAllByRole("listitem");

    // O Bar do Zé tem zero impressão parada: dizer "0 impressões" obrigaria a
    // ler um zero para descobrir que não é nada.
    expect(itens[0].textContent).not.toMatch(/impress/i);
    expect(itens[1].textContent).not.toMatch(/nota/i);
  });

  it("base sem nenhuma pendência afirma que está tudo certo", async () => {
    mockListar.mockResolvedValue({
      data: [
        {
          tenant_id: "t-fiscal",
          fiscais_recusadas: 3,
          fiscais_paradas: 0,
          fiscal_parada_desde: null,
          impressoes_com_erro: 0,
          impressoes_paradas: 0,
          impressao_parada_desde: null,
        },
      ],
      error: null,
    });

    render(<Casca />);

    expect(
      await screen.findByText(/nenhum estabelecimento com nota fiscal ou impressão parada/i)
    ).toBeTruthy();
    expect(screen.queryByText(/com algo parado agora/i)).toBeNull();
    // Recusa já resolvida continua contada no histórico: ela não põe ninguém
    // na lista de ação, mas também não some da tela.
    expect(screen.getByText("Notas recusadas")).toBeTruthy();
  });

  it("quem a RPC não devolveu aparece zerado, em vez de sumir da tabela", async () => {
    render(<Casca />);

    const tabela = await screen.findByRole("table");
    const linha = within(tabela).getByRole("row", { name: /Padaria Nova/ });
    // Nunca emitiu nem imprimiu: cinco zeros e travessão em "parado desde" —
    // ausência de linha na RPC é ausência de falha, não falha desconhecida.
    // O nome é <th scope="row">, que tem papel rowheader: as cinco 
    // são as quatro contagens e o "parado desde".
    const celulas = within(linha).getAllByRole("cell");
    expect(celulas.map((c) => c.textContent)).toEqual(["0", "0", "0", "0", "—"]);
  });

  it("base sem estabelecimento nenhum diz isso, em vez de mostrar tabela vazia", async () => {
    mockListar.mockResolvedValue({ data: [], error: null });
    render(<Casca tenants={[]} />);

    expect(await screen.findByText(/nenhum estabelecimento ainda/i)).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("trocar o período recarrega com o novo número de dias", async () => {
    render(<Casca />);
    await screen.findByRole("table");

    expect(mockListar).toHaveBeenLastCalledWith(30);
    await userEvent.click(screen.getByRole("button", { name: "90 dias" }));

    expect(mockListar).toHaveBeenLastCalledWith(90);
    expect(screen.getByRole("button", { name: "90 dias" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("a tela diz que 'parado agora' não usa o período", async () => {
    render(<Casca />);
    // Sem esta frase, o dono leria "7 impressões paradas" como "nos últimos 30
    // dias" e concluiria errado que o problema é recente.
    expect(await screen.findByText(/não usa o período/i)).toBeTruthy();
  });
});
