// @vitest-environment jsdom
//
// Pré-venda §1.5 — atender o cliente que pede cópia ou eliminação dos dados.
//
// Esta é a única tela do Console cuja ação não tem volta: depois do segundo
// botão, o estabelecimento e tudo o que ele produziu deixam de existir. O que
// os testes seguram não é o "salvar" — é a ORDEM e a CONFIRMAÇÃO:
//
//   • o passo 2 não existe até a cópia ter sido baixada. Apagar primeiro e
//     descobrir depois que ninguém guardou nada é o acidente sem conserto;
//   • o apagamento só libera com o endereço do estabelecimento digitado
//     igual. "Sim/não" erra com um clique torto;
//   • recusa do banco nunca pode parecer sucesso — a pessoa sairia achando
//     que atendeu um pedido formal de eliminação que não foi atendido.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/lib/supabase", async () => {
  const { createMockSupabase } = await import("@/test/mockSupabase");
  return { supabase: createMockSupabase() };
});

// `confirmacaoDeApagamento` e `mensagemDeErroDoConsole` ficam REAIS — são a
// regra sob teste. Só as duas idas ao banco são dubladas.
const { mockExportar, mockApagar } = vi.hoisted(() => ({
  mockExportar: vi.fn(),
  mockApagar: vi.fn(),
}));
vi.mock("@/lib/console/console", async () => {
  const real = await vi.importActual("@/lib/console/console");
  return {
    ...real,
    exportarDadosEstabelecimento: mockExportar,
    apagarDadosEstabelecimento: mockApagar,
  };
});

import DadosDoClienteModal from "./DadosDoClienteModal";

const TENANT = { id: "t-1", nome: "Bar do Zé", slug: "bar-do-ze" };

const DADOS = { estabelecimento: { id: "t-1" }, total_de_linhas: 42, tabelas: {} };

const baixar = () => screen.getByRole("button", { name: /Baixar cópia|Baixar de novo/i });
const apagar = () => screen.getByRole("button", { name: /Apagar tudo deste estabelecimento|Apagando/i });
const campo = () => screen.getByRole("textbox");

function montar(tenant = TENANT) {
  const onFechar = vi.fn();
  const onApagado = vi.fn();
  render(<DadosDoClienteModal tenant={tenant} onFechar={onFechar} onApagado={onApagado} />);
  return { onFechar, onApagado };
}

/** Faz o passo 1 inteiro, que é o que destrava o passo 2. */
async function exportar(user) {
  await user.click(baixar());
}

describe("DadosDoClienteModal — exportar e apagar os dados de um cliente", () => {
  beforeEach(() => {
    mockExportar.mockReset();
    mockApagar.mockReset();
    mockExportar.mockResolvedValue({ data: DADOS, error: null });
    mockApagar.mockResolvedValue({
      data: { ok: true, total_de_linhas: 42, nome: "Bar do Zé" },
      error: null,
    });
    // jsdom não implementa createObjectURL: sem estes dublês a tela cairia
    // sempre no caminho manual e o caminho normal nunca seria testado.
    URL.createObjectURL = vi.fn(() => "blob:teste");
    URL.revokeObjectURL = vi.fn();
    HTMLAnchorElement.prototype.click = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("o passo 2 nasce travado, e diz por quê", () => {
    montar();
    expect(screen.getByText(/1 · Baixar a cópia dos dados/)).toBeInTheDocument();
    expect(screen.getByText(/2 · Apagar tudo/)).toBeInTheDocument();
    // Travado de verdade: o botão e o campo nem chegam a existir.
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button", { name: /Apagar tudo deste/i })).toBeNull();
    expect(
      screen.getByText(/Disponível depois de baixar a cópia.*não tem volta/i)
    ).toBeInTheDocument();
  });

  it("baixa a cópia e confirma quantos registros vieram", async () => {
    const user = userEvent.setup();
    montar();
    await exportar(user);

    expect(mockExportar).toHaveBeenCalledWith("t-1");
    expect(URL.createObjectURL).toHaveBeenCalled();
    // O número na tela é o que a pessoa usa para saber que o arquivo não veio
    // vazio antes de apagar a origem.
    expect(screen.getByRole("status")).toHaveTextContent(/dados-bar-do-ze\.json.*42 registros/);
  });

  it("só depois da cópia é que o apagamento aparece", async () => {
    const user = userEvent.setup();
    montar();
    await exportar(user);

    expect(campo()).toBeInTheDocument();
    expect(apagar()).toBeInTheDocument();
    // E aparece travado: existir não é poder clicar.
    expect(apagar()).toBeDisabled();
    expect(screen.getByText(/Some tudo: vendas, caixa, cardápio/i)).toBeInTheDocument();
  });

  it("texto errado não apaga, e a tela diz o que se espera", async () => {
    const user = userEvent.setup();
    montar();
    await exportar(user);

    await user.type(campo(), "bar do ze");
    expect(screen.getByRole("alert")).toHaveTextContent(/Digite exatamente “bar-do-ze”/);
    expect(apagar()).toBeDisabled();
    await user.click(apagar());
    expect(mockApagar).not.toHaveBeenCalled();
  });

  it("com o endereço certo, apaga e devolve o resumo", async () => {
    const user = userEvent.setup();
    const { onApagado } = montar();
    await exportar(user);

    await user.type(campo(), "  BAR-DO-ZE  ");
    // Maiúscula e espaço nas pontas são erro de digitação, não outro
    // estabelecimento — recusar isso seria fazer a pessoa tentar de novo sem
    // entender o que está diferente.
    expect(apagar()).toBeEnabled();
    await user.click(apagar());

    expect(mockApagar).toHaveBeenCalledWith("t-1", "BAR-DO-ZE");
    expect(onApagado).toHaveBeenCalledWith({ ok: true, total_de_linhas: 42, nome: "Bar do Zé" });
  });

  it("recusa do banco aparece na tela e NÃO conta como apagado", async () => {
    const user = userEvent.setup();
    mockApagar.mockResolvedValue({
      data: null,
      error: { code: "42501", message: "Apenas a plataforma pode apagar os dados de um estabelecimento." },
    });
    const { onApagado, onFechar } = montar();
    await exportar(user);
    await user.type(campo(), "bar-do-ze");
    await user.click(apagar());

    expect(screen.getByRole("alert")).toHaveTextContent(/Apenas a plataforma pode apagar/i);
    expect(onApagado).not.toHaveBeenCalled();
    expect(onFechar).not.toHaveBeenCalled();
    // Dá para tentar de novo: nada fica travado depois da falha.
    expect(apagar()).toBeEnabled();
  });

  it("falha na exportação não destrava o apagamento", async () => {
    const user = userEvent.setup();
    mockExportar.mockResolvedValue({ data: null, error: { message: "Sem conexão com o banco." } });
    montar();
    await exportar(user);

    expect(screen.getByRole("alert")).toHaveTextContent(/Sem conexão com o banco/i);
    // O pior desfecho seria a falha da cópia abrir o passo 2 mesmo assim.
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("navegador que não baixa arquivo mostra o texto para copiar à mão", async () => {
    const user = userEvent.setup();
    // Os dados JÁ vieram do servidor — sumir com eles seria perder a
    // exportação que o cliente pediu.
    URL.createObjectURL = undefined;
    montar();
    await exportar(user);

    const area = screen.getByRole("textbox", { name: /Dados exportados/i });
    expect(area).toHaveValue(JSON.stringify(DADOS, null, 2));
    expect(area).toHaveAttribute("readonly");
  });

  it("as duas saídas fecham sem escrever nada", async () => {
    const user = userEvent.setup();
    const { onFechar } = montar();
    // O "X" do topo e o "Fechar" do rodapé: quem procura sair olha para um dos
    // dois, e nenhum dos dois pode ser o que dispara uma ação.
    const saidas = screen.getAllByRole("button", { name: /^Fechar$/i });
    expect(saidas).toHaveLength(2);
    for (const saida of saidas) await user.click(saida);

    expect(onFechar).toHaveBeenCalledTimes(2);
    expect(mockExportar).not.toHaveBeenCalled();
    expect(mockApagar).not.toHaveBeenCalled();
  });
});
