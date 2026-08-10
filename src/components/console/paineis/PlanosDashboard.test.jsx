// @vitest-environment jsdom
//
// R7L8 — a coluna "Mensalidade" do Console virou a via de escrita do preço.
// F022-RENOVAR — e a coluna "Pagamento" virou a via de renovação da assinatura.
//
// O que este arquivo protege: que o "—" da coluna seja CLICÁVEL (era só
// texto, e o preço só existia via UPDATE no SQL Editor), que a linha SEM
// assinatura NÃO ofereça o clique (a RPC recusaria com no_data_found), e que
// a nota embaixo dos cartões apareça exatamente quando há alguém sem preço —
// ela é o único lugar da tela que explica por que a "Receita mensal" pode
// estar menor que a real.
//
// E, do lado do pagamento: que o botão exista em toda linha que TEM assinatura
// e só nelas (renovar um cancelado o descancelaria em silêncio), que o nome de
// quem confirmou chegue na RPC, e que a faixa de sucesso diga o vencimento novo
// — inclusive quando ele continua no passado.
//
// F022-HISTORICO — e que a mesma coluna dê para CONFERIR o que já foi lançado,
// inclusive no cancelado (que tem histórico e pode ter um lançamento errado
// para desfazer), abrindo sempre no estabelecimento da linha clicada.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/lib/supabase", async () => {
  const { createMockSupabase } = await import("@/test/mockSupabase");
  return { supabase: createMockSupabase() };
});

// `resumirPlataforma` fica REAL — é ela que decide quem está sem preço.
// Só a escrita no banco é dublada.
const { mockDefinir } = vi.hoisted(() => ({ mockDefinir: vi.fn() }));
vi.mock("@/lib/console/console", async () => {
  const real = await vi.importActual("@/lib/console/console");
  return { ...real, definirMensalidade: mockDefinir };
});

const { mockRenovar, mockListarPagamentos } = vi.hoisted(() => ({
  mockRenovar: vi.fn(),
  mockListarPagamentos: vi.fn(),
}));
vi.mock("@/lib/console/assinatura", async () => {
  const real = await vi.importActual("@/lib/console/assinatura");
  return {
    ...real,
    confirmarRenovacaoAssinatura: mockRenovar,
    listarPagamentosAssinatura: mockListarPagamentos,
  };
});

import PlanosDashboard from "./PlanosDashboard";

// O componente chama resumirPlataforma sem `hoje` (usa new Date()), então as
// datas são relativas — teste com data fixa viraria bomba de tempo.
function emDias(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mes}-${dia}`;
}
const FOLGADO = emDias(20); // ativo, longe da janela de "vence em breve"

const PLANOS = [{ codigo: "basico", nome: "Básico" }];
const ass = (id, valor, extra = {}) => ({
  tenant_id: id,
  valor_mensal: valor,
  data_vencimento: FOLGADO,
  carencia_dias: 3,
  status: "ativo",
  ...extra,
});

const tabela = () => screen.getByRole("table");
const linhaDe = (nome) => within(tabela()).getByText(nome).closest("tr");
// A linha tem mais de um botão desde a F022 — buscar "o botão" da linha passou
// a ser ambíguo. Cada um é pego pelo próprio nome acessível.
const botaoPreco = (nome) => within(linhaDe(nome)).getByRole("button", { name: /mensalidade de/i });
const botaoPagar = (nome) => within(linhaDe(nome)).getByRole("button", { name: /^Registrar pagamento de/i });
const botaoHistorico = (nome) => within(linhaDe(nome)).getByRole("button", { name: /^Ver pagamentos de/i });

function montar({ tenants, assinaturas, confirmadoPor }) {
  const onAtualizado = vi.fn();
  render(
    <PlanosDashboard
      tenants={tenants}
      planos={PLANOS}
      assinaturas={assinaturas}
      confirmadoPor={confirmadoPor}
      onAtualizado={onAtualizado}
    />
  );
  return { onAtualizado };
}

// Cenário-base: um pagante, um sem preço, um sem linha de assinatura.
const BASE = {
  tenants: [
    { id: "t-pago", nome: "Café Central", plano_codigo: "basico" },
    { id: "t-zero", nome: "Bar do Zé", plano_codigo: "basico" },
    { id: "t-sem", nome: "Lanches Novos", plano_codigo: "basico" },
  ],
  assinaturas: [ass("t-pago", 300), ass("t-zero", 0)],
};

describe("PlanosDashboard — coluna Mensalidade", () => {
  beforeEach(() => {
    mockDefinir.mockReset();
    mockDefinir.mockResolvedValue({ data: { valor_mensal: 250 }, error: null });
  });

  it("quem tem preço mostra o valor e um botão que diz que dá para alterar", () => {
    montar(BASE);
    const botao = botaoPreco("Café Central");
    expect(botao).toHaveTextContent(/R\$\s*300,00/);
    // O aria-label leva o valor de hoje: quem usa leitor de tela não vê a
    // célula ao lado e precisaria abrir o modal só para saber o preço atual.
    expect(botao).toHaveAccessibleName(/Alterar mensalidade de Café Central \(hoje R\$\s*300,00\)/);
  });

  it("o “—” de quem não tem preço É o botão que resolve o “—”", () => {
    // Este era o defeito: a célula mostrava "—" como texto morto e o único
    // jeito de definir o preço era um UPDATE cru no SQL Editor.
    montar(BASE);
    const botao = botaoPreco("Bar do Zé");
    expect(botao).toHaveTextContent("—");
    expect(botao).toHaveAccessibleName("Definir mensalidade de Bar do Zé");
  });

  it("estabelecimento SEM assinatura não oferece o clique", () => {
    // Não há linha para atualizar: a RPC recusaria com no_data_found. Oferecer
    // o botão seria empurrar a pessoa para um erro (prevenção > mensagem).
    montar(BASE);
    const linha = linhaDe("Lanches Novos");
    expect(within(linha).queryByRole("button")).toBeNull();
    expect(linha).toHaveTextContent("Sem assinatura");
  });

  it("clicar abre o modal já apontado para aquele estabelecimento", async () => {
    const user = userEvent.setup();
    montar(BASE);
    await user.click(botaoPreco("Bar do Zé"));

    const modal = screen.getByRole("dialog");
    expect(within(modal).getByRole("heading", { name: /Definir mensalidade/i })).toBeInTheDocument();
    // Apontar para o estabelecimento errado gravaria o preço no cliente errado.
    expect(within(modal).getByText("Bar do Zé")).toBeInTheDocument();
  });

  it("salvar fecha o modal e manda a tela recarregar", async () => {
    const user = userEvent.setup();
    const { onAtualizado } = montar(BASE);
    await user.click(botaoPreco("Bar do Zé"));
    await user.type(screen.getByRole("textbox"), "250");
    await user.click(screen.getByRole("button", { name: /Salvar mensalidade/i }));

    expect(mockDefinir).toHaveBeenCalledWith("t-zero", 250);
    // Sem o recarregar, a tabela continuaria mostrando "—" depois de salvar e
    // a pessoa clicaria de novo achando que não funcionou.
    expect(onAtualizado).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("cancelar fecha sem escrever nem recarregar", async () => {
    const user = userEvent.setup();
    const { onAtualizado } = montar(BASE);
    await user.click(botaoPreco("Bar do Zé"));
    await user.click(screen.getByRole("button", { name: /^Cancelar$/i }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(mockDefinir).not.toHaveBeenCalled();
    expect(onAtualizado).not.toHaveBeenCalled();
  });
});

describe("PlanosDashboard — coluna Pagamento", () => {
  beforeEach(() => {
    mockRenovar.mockReset();
    mockRenovar.mockResolvedValue({
      data: { data_vencimento: "2026-09-05", status: "ativo" },
      error: null,
    });
  });

  const modalAberto = () => screen.getByRole("dialog");
  const confirmar = () => screen.getByRole("button", { name: /^Registrar pagamento$/i });

  it("toda linha COM assinatura oferece registrar pagamento", () => {
    montar(BASE);
    expect(botaoPagar("Café Central")).toBeInTheDocument();
    // Cortesia também aparece: quem está sem mensalidade definida pode ter
    // pago avulso, e é no modal que se diz quanto entrou.
    expect(botaoPagar("Bar do Zé")).toBeInTheDocument();
  });

  it("estabelecimento SEM assinatura não tem o que renovar", () => {
    montar(BASE);
    expect(
      within(linhaDe("Lanches Novos")).queryByRole("button", { name: /Registrar pagamento/i })
    ).toBeNull();
  });

  it("cancelado não oferece registrar pagamento, mas continua com o preço editável", () => {
    // Renovar recalcula o status a partir da data nova: um cancelado voltaria
    // a "ativo" sem ninguém ter decidido reativá-lo.
    montar({
      tenants: [{ id: "t-can", nome: "Fechou as Portas", plano_codigo: "basico" }],
      assinaturas: [ass("t-can", 300, { status: "cancelado" })],
    });
    expect(linhaDe("Fechou as Portas")).toHaveTextContent("Cancelado");
    expect(
      within(linhaDe("Fechou as Portas")).queryByRole("button", { name: /Registrar pagamento/i })
    ).toBeNull();
    expect(botaoPreco("Fechou as Portas")).toBeInTheDocument();
  });

  it("confirmar manda tenant, competência, valor e quem confirmou para a RPC", async () => {
    const user = userEvent.setup();
    montar({ ...BASE, confirmadoPor: "Dona da Plataforma" });
    await user.click(botaoPagar("Café Central"));
    await user.click(within(modalAberto()).getByRole("button", { name: /^Registrar pagamento$/i }));

    // Sem `confirmadoPor` o histórico registra que alguém confirmou, mas não
    // quem — e é a plataforma inteira que compartilha esse login.
    expect(mockRenovar).toHaveBeenCalledWith({
      tenantId: "t-pago",
      competencia: `${FOLGADO.slice(0, 7)}-01`,
      valor: 300,
      metodo: "Pix",
      confirmadoPor: "Dona da Plataforma",
    });
  });

  it("sucesso fecha o modal, recarrega a tela e mostra o vencimento novo", async () => {
    const user = userEvent.setup();
    const { onAtualizado } = montar(BASE);
    await user.click(botaoPagar("Café Central"));
    await user.click(confirmar());

    expect(screen.queryByRole("dialog")).toBeNull();
    // Sem o recarregar, a tabela continuaria mostrando o vencimento velho.
    expect(onAtualizado).toHaveBeenCalledTimes(1);
    const faixa = screen.getByText(/registrado para/);
    expect(faixa).toHaveTextContent(/Pagamento de [^/]+\/\d{4} registrado para Café Central/);
    // A única pergunta que importa depois de confirmar.
    expect(faixa).toHaveTextContent("05/09/2026");
  });

  it("se o vencimento novo ainda é passado, a faixa diz que continua em atraso", async () => {
    // A RPC anda UM ciclo por chamada: quem está quatro meses atrasado segue
    // atrasado depois do primeiro pagamento. A tela não pode comemorar por ele.
    const user = userEvent.setup();
    mockRenovar.mockResolvedValue({
      data: { data_vencimento: "2026-06-05", status: "carencia" },
      error: null,
    });
    montar(BASE);
    await user.click(botaoPagar("Café Central"));
    await user.click(confirmar());

    const faixa = screen.getByText(/registrado para/);
    expect(faixa).toHaveTextContent(/continua em atraso/);
    expect(faixa).toHaveTextContent(/registre também a competência seguinte/);
  });

  it("erro da RPC aparece no modal, sem fechar e sem recarregar", async () => {
    const user = userEvent.setup();
    // Texto igual ao da RPC (20260909:139, competência em MM/YYYY) — a tela
    // repassa a frase do banco, não escreve uma própria.
    mockRenovar.mockResolvedValue({
      data: null,
      error: { code: "23505", message: "A competência 08/2026 já foi confirmada para este estabelecimento." },
    });
    const { onAtualizado } = montar(BASE);
    await user.click(botaoPagar("Café Central"));
    await user.click(confirmar());

    expect(modalAberto()).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(/já foi confirmada/);
    // Botão travado depois do erro deixaria a pessoa sem saída nenhuma.
    expect(confirmar()).toBeEnabled();
    expect(onAtualizado).not.toHaveBeenCalled();
  });
});

describe("PlanosDashboard — ver os pagamentos já lançados", () => {
  beforeEach(() => {
    mockListarPagamentos.mockReset();
    mockListarPagamentos.mockResolvedValue({ data: [], error: null });
  });

  it("toda linha COM assinatura deixa conferir o que já foi lançado", () => {
    montar(BASE);
    expect(botaoHistorico("Café Central")).toBeInTheDocument();
    expect(botaoHistorico("Bar do Zé")).toBeInTheDocument();
  });

  it("cancelado não renova, mas continua tendo histórico para conferir e consertar", () => {
    // Quem cancelou o contrato ainda pode ter um pagamento lançado errado, e
    // desfazer isso é justamente o que a F022-HISTORICO trouxe.
    montar({
      tenants: [{ id: "t-can", nome: "Fechou as Portas", plano_codigo: "basico" }],
      assinaturas: [ass("t-can", 300, { status: "cancelado" })],
    });
    expect(botaoHistorico("Fechou as Portas")).toBeInTheDocument();
  });

  it("estabelecimento SEM assinatura não tem pagamento nenhum para mostrar", () => {
    // Pagamento só existe através da RPC de renovação, que exige a linha de
    // assinatura: aqui a lista seria vazia por construção.
    montar(BASE);
    expect(
      within(linhaDe("Lanches Novos")).queryByRole("button", { name: /Ver pagamentos/i })
    ).toBeNull();
  });

  it("abre o histórico do estabelecimento da linha clicada", async () => {
    const user = userEvent.setup();
    montar(BASE);
    await user.click(botaoHistorico("Bar do Zé"));

    // Abrir no estabelecimento errado mostraria o dinheiro de um cliente na
    // linha de outro — e o cancelamento cairia na assinatura errada.
    expect(await screen.findByRole("heading", { name: "Pagamentos de Bar do Zé" })).toBeInTheDocument();
    expect(mockListarPagamentos).toHaveBeenCalledWith("t-zero");
  });
});

describe("PlanosDashboard — a nota que explica a receita mensal", () => {
  it("no singular, com quem está sem preço", () => {
    montar(BASE);
    const nota = screen.getByText(/1 estabelecimento ativo está sem mensalidade definida/);
    expect(nota).toHaveTextContent(/não entra na receita mensal/);
    // A nota tem de dizer o que FAZER, não só que há um problema.
    expect(nota).toHaveTextContent(/Clique no .*—.* da coluna Mensalidade/);
  });

  it("no plural quando são vários", () => {
    montar({
      tenants: [
        { id: "a", nome: "Um", plano_codigo: "basico" },
        { id: "b", nome: "Dois", plano_codigo: "basico" },
      ],
      assinaturas: [ass("a", 0), ass("b", 0)],
    });
    expect(
      screen.getByText(/2 estabelecimentos ativos estão sem mensalidade definida/)
    ).toBeInTheDocument();
  });

  it("desaparece quando todo mundo que paga tem preço", () => {
    // Aviso que fica na tela para sempre deixa de ser lido. Ele sai sozinho
    // quando o problema acaba.
    montar({
      tenants: [{ id: "a", nome: "Um", plano_codigo: "basico" }],
      assinaturas: [ass("a", 300)],
    });
    expect(screen.queryByText(/sem mensalidade definida/)).toBeNull();
    // E o preço definido entra de verdade na receita mensal (o cartão-herói).
    const cartao = screen.getByText("Receita mensal").closest(".pdash__kpi");
    expect(cartao).toHaveTextContent(/R\$\s*300,00/);
  });
});
