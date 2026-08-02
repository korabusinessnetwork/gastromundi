// @vitest-environment jsdom
//
// F022-HISTORICO — o histórico de pagamentos da assinatura e o conserto de um
// lançamento errado.
//
// O que estava em aberto: desde a 20260909 a plataforma registra o pagamento e
// o vencimento anda um ciclo, mas nada no sistema mostrava o que foi lançado.
// Valor trocado, mês trocado ou clique no estabelecimento errado só se
// desfaziam com UPDATE manual em produção — e errar o `data_vencimento` no SQL
// Editor bloqueia um cliente que não deve nada.
//
// O que esta tela precisa garantir, além de chamar a RPC: que falha de leitura
// NUNCA apareça como "nenhum pagamento" (as duas frases levam a decisões
// opostas — a segunda leva a lançar o mesmo mês de novo), que o motivo seja
// exigido antes do clique e não depois (a recusa do banco existe, mas chegar
// nela é falha de tela), que o pagamento cancelado continue visível com quem
// cancelou e por quê, e que a recusa do banco apareça como frase.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/lib/supabase", async () => {
  const { createMockSupabase } = await import("@/test/mockSupabase");
  return { supabase: createMockSupabase() };
});

// `resumirPagamentos` fica REAL — é ela que ordena, separa estornado e soma em
// centavos. Só o que fala com o banco é dublado.
const { mockListar, mockEstornar } = vi.hoisted(() => ({
  mockListar: vi.fn(),
  mockEstornar: vi.fn(),
}));
vi.mock("@/lib/assinatura", async () => {
  const real = await vi.importActual("@/lib/assinatura");
  return {
    ...real,
    listarPagamentosAssinatura: mockListar,
    estornarPagamentoAssinatura: mockEstornar,
  };
});

import HistoricoPagamentosModal from "./HistoricoPagamentosModal";

const LINHA = { tenantId: "t-pago", nome: "Café Central", valorMensal: 300 };

const pg = (id, competencia, valor, extra = {}) => ({
  id,
  competencia,
  valor,
  metodo: "Pix",
  confirmado_por: "Dona da Plataforma",
  confirmado_em: `${competencia}T12:00:00.000Z`,
  ...extra,
});

const itens = () => screen.getAllByRole("listitem");
const itemDe = (mes) => screen.getByText(mes).closest("li");
const confirmarCancelamento = () => screen.getByRole("button", { name: /^Cancelar o pagamento$/i });
const campoMotivo = () => screen.getByRole("textbox");

function montar(extras = {}) {
  const onFechar = vi.fn();
  const onEstornado = vi.fn();
  render(
    <HistoricoPagamentosModal
      linha={LINHA}
      confirmadoPor="Dona da Plataforma"
      onFechar={onFechar}
      onEstornado={onEstornado}
      {...extras}
    />
  );
  return { onFechar, onEstornado };
}

beforeEach(() => {
  mockListar.mockReset();
  mockEstornar.mockReset();
  mockListar.mockResolvedValue({ data: [], error: null });
  mockEstornar.mockResolvedValue({ data: { data_vencimento: "2026-07-05" }, error: null });
});

describe("HistoricoPagamentosModal — leitura", () => {
  it("busca o histórico do estabelecimento da linha", async () => {
    montar();
    expect(await screen.findByText(/Nenhum pagamento registrado ainda/)).toBeInTheDocument();
    // Buscar de outro tenant mostraria o dinheiro de um cliente na tela de
    // outro — o Console vê todos.
    expect(mockListar).toHaveBeenCalledWith("t-pago");
  });

  it("falha de leitura NÃO vira 'nenhum pagamento'", async () => {
    // As duas frases levam a decisões opostas: "não há pagamento" convida a
    // lançar de novo o mês que talvez já esteja lançado.
    mockListar.mockResolvedValue({
      data: [],
      error: { message: "Falha ao carregar os pagamentos da assinatura." },
    });
    montar();

    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent(/Não foi possível carregar os pagamentos/);
    expect(screen.queryByText(/Nenhum pagamento registrado/)).toBeNull();
    expect(within(alerta).getByRole("button", { name: /Tentar de novo/i })).toBeInTheDocument();
  });

  it("'Tentar de novo' consulta o banco outra vez e mostra o que veio", async () => {
    const user = userEvent.setup();
    mockListar.mockResolvedValueOnce({ data: [], error: { message: "sem rede" } });
    mockListar.mockResolvedValueOnce({ data: [pg("p1", "2026-08-01", 300)], error: null });
    montar();

    await user.click(await screen.findByRole("button", { name: /Tentar de novo/i }));
    expect(await screen.findByText("agosto/2026")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(mockListar).toHaveBeenCalledTimes(2);
  });

  it("lista do mais recente para o mais antigo, com total, forma e quem registrou", async () => {
    mockListar.mockResolvedValue({
      data: [pg("p-jun", "2026-06-01", 300), pg("p-ago", "2026-08-01", 300)],
      error: null,
    });
    montar();

    expect(await screen.findByText("agosto/2026")).toBeInTheDocument();
    // Quem abre o histórico está procurando o que acabou de lançar.
    const meses = itens().map((li) => li.querySelector(".hpm-item__mes").textContent);
    expect(meses).toEqual(["agosto/2026", "junho/2026"]);

    const item = itemDe("agosto/2026");
    expect(item).toHaveTextContent(/R\$\s*300,00/);
    expect(item).toHaveTextContent(/Pix · registrado por Dona da Plataforma/);

    expect(screen.getByText(/recebidos em/)).toHaveTextContent(/R\$\s*600,00/);
    expect(screen.getByText(/recebidos em/)).toHaveTextContent("2 pagamentos");
  });

  it("pagamento cancelado continua visível, fora do total e sem oferecer novo cancelamento", async () => {
    mockListar.mockResolvedValue({
      data: [
        pg("p-ago", "2026-08-01", 300),
        pg("p-jul", "2026-07-01", 999, {
          estornado_em: "2026-07-10T10:00:00.000Z",
          estornado_por: "Dona da Plataforma",
          estorno_motivo: "valor digitado errado",
        }),
      ],
      error: null,
    });
    montar();

    const cancelado = (await screen.findByText("julho/2026")).closest("li");
    // Histórico de dinheiro não some: some da conta, não da tela.
    expect(cancelado).toHaveTextContent(/Cancelado/);
    expect(cancelado).toHaveTextContent(/por Dona da Plataforma/);
    expect(cancelado).toHaveTextContent(/valor digitado errado/);
    // Estornar de novo descontaria um segundo ciclo de um pagamento só; o
    // banco recusa, mas a tela nem oferece (prevenção de erro > mensagem).
    expect(within(cancelado).queryByRole("button")).toBeNull();

    expect(screen.getByText(/recebidos em/)).toHaveTextContent(/R\$\s*300,00/);
    expect(screen.getByText(/recebidos em/)).toHaveTextContent("1 pagamento");
  });

  it("linha antiga sem quem confirmou não mostra buraco", async () => {
    mockListar.mockResolvedValue({
      data: [pg("p1", "2026-08-01", 300, { confirmado_por: null, metodo: null })],
      error: null,
    });
    montar();
    expect(await screen.findByText(/registrado por não registrado/)).toBeInTheDocument();
  });
});

describe("HistoricoPagamentosModal — cancelar um pagamento", () => {
  beforeEach(() => {
    mockListar.mockResolvedValue({ data: [pg("p-ago", "2026-08-01", 300)], error: null });
  });

  it("o motivo é exigido ANTES do clique, não depois", async () => {
    const user = userEvent.setup();
    montar();
    await user.click(await screen.findByRole("button", { name: /^Cancelar o pagamento de agosto/i }));

    // A RPC recusa motivo curto com check_violation; chegar nessa recusa já
    // seria falha de tela.
    expect(confirmarCancelamento()).toBeDisabled();
    await user.type(campoMotivo(), "ab");
    expect(confirmarCancelamento()).toBeDisabled();
    await user.type(campoMotivo(), "c");
    expect(confirmarCancelamento()).toBeEnabled();
  });

  it("diz o que vai acontecer com o vencimento antes de confirmar", async () => {
    const user = userEvent.setup();
    montar();
    await user.click(await screen.findByRole("button", { name: /^Cancelar o pagamento de agosto/i }));

    // Sem esta frase o clique é no escuro: o estorno mexe na data que decide
    // o bloqueio do cliente.
    const aviso = screen.getByText(/volta um ciclo de cobrança/);
    expect(aviso).toHaveTextContent(/agosto\/2026 fica livre para ser registrado de novo/);
  });

  it("confirmar manda pagamento, motivo e quem cancelou, recarrega e avisa a tabela", async () => {
    const user = userEvent.setup();
    const { onEstornado } = montar();
    await user.click(await screen.findByRole("button", { name: /^Cancelar o pagamento de agosto/i }));
    await user.type(campoMotivo(), "  valor digitado errado  ");
    await user.click(confirmarCancelamento());

    expect(mockEstornar).toHaveBeenCalledWith({
      pagamentoId: "p-ago",
      // O motivo entra no histórico como texto; espaço de sobra vira ruído
      // permanente (o banco também faz btrim).
      motivo: "  valor digitado errado  ",
      estornadoPor: "Dona da Plataforma",
    });
    // Sem recarregar, a linha continuaria na tela como se nada tivesse
    // acontecido; sem avisar a tabela, ela seguiria mostrando o vencimento
    // antigo.
    expect(
      await screen.findByRole("button", { name: /^Cancelar o pagamento de agosto/i })
    ).toBeInTheDocument();
    expect(mockListar).toHaveBeenCalledTimes(2);
    expect(onEstornado).toHaveBeenCalledTimes(1);
  });

  it("'Voltar' desiste sem escrever nada", async () => {
    const user = userEvent.setup();
    const { onEstornado } = montar();
    await user.click(await screen.findByRole("button", { name: /^Cancelar o pagamento de agosto/i }));
    await user.type(campoMotivo(), "enganei");
    await user.click(screen.getByRole("button", { name: /^Voltar$/i }));

    expect(mockEstornar).not.toHaveBeenCalled();
    expect(onEstornado).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("a recusa do banco aparece como frase, o modal fica aberto e a tabela não recarrega", async () => {
    const user = userEvent.setup();
    // Frase e SQLSTATE copiados da 20260913 (linhas 117-119) — a tela repassa
    // o que o banco disse, não escreve uma versão própria.
    mockEstornar.mockResolvedValue({
      data: null,
      error: { code: "23514", message: "Este pagamento já foi cancelado em 10/07/2026." },
    });
    const { onEstornado } = montar();
    await user.click(await screen.findByRole("button", { name: /^Cancelar o pagamento de agosto/i }));
    await user.type(campoMotivo(), "duplicado");
    await user.click(confirmarCancelamento());

    expect(screen.getByRole("alert")).toHaveTextContent("Este pagamento já foi cancelado em 10/07/2026.");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(onEstornado).not.toHaveBeenCalled();
    // Botão travado depois do erro deixaria a pessoa sem saída nenhuma.
    expect(confirmarCancelamento()).toBeEnabled();
  });

  it("a recusa de permissão do banco também chega inteira", async () => {
    const user = userEvent.setup();
    mockEstornar.mockResolvedValue({
      data: null,
      error: { code: "42501", message: "Somente a plataforma pode cancelar um pagamento de assinatura." },
    });
    montar();
    await user.click(await screen.findByRole("button", { name: /^Cancelar o pagamento de agosto/i }));
    await user.type(campoMotivo(), "teste");
    await user.click(confirmarCancelamento());

    expect(screen.getByRole("alert")).toHaveTextContent(/Somente a plataforma pode cancelar/);
  });

  it("as duas saídas (o X e o rodapé) fecham o modal", async () => {
    const user = userEvent.setup();
    const { onFechar } = montar();
    await screen.findByText("agosto/2026");

    const saidas = screen.getAllByRole("button", { name: /^Fechar$/i });
    expect(saidas).toHaveLength(2);
    for (const botao of saidas) await user.click(botao);
    expect(onFechar).toHaveBeenCalledTimes(2);
  });
});
