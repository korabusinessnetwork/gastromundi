// @vitest-environment jsdom
//
// Run 1 da auditoria — conferência do fechamento de caixa.
//
// Os quatro furos que estes testes prendem, todos da mesma família ("a tela
// mente sobre o dinheiro"):
//
//   1. o esperado em caixa era `totalVendas + fundo`, então valor recebido em
//      método NÃO configurado (fiado, método removido da config) entrava na
//      conta sem ter campo onde ser conferido — o caixa exato era acusado de
//      falta pelo valor inteiro do método, e a falsa falta era gravada;
//   2. sem round2, a soma de centavos deriva (16.10 × 3 = 48.300000000000004)
//      e o caixa conferido no centavo aparecia em vermelho como falta;
//   3. abertura de caixa ilegível virava NaN e o filtro descartava TODAS as
//      vendas: "0 vendas hoje" com o caixa cheio na gaveta;
//   4. o botão travava em "Fechando..." depois de uma falha, justamente
//      quando o aviso pede para tentar de novo.
//
// Contexto FAKE (src/test/mockApp.jsx) porque o modal só consome o shape de
// useApp(); o alvo aqui é a aritmética e o estado do próprio modal.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

vi.mock("@/context/AppContext", async () => {
  const { mockUseApp } = await import("@/test/mockApp");
  return { useApp: mockUseApp, AppProvider: ({ children }) => children };
});

import { setAppMock } from "@/test/mockApp";
import FechamentoModal, { inicioSessao } from "./FechamentoModal";

/** Venda fechada com um ou mais pagamentos, no instante do teste. */
const venda = (id, pagamentos) => ({
  id,
  at: new Date().toISOString(),
  total: pagamentos.reduce((s, p) => s + p.valor, 0),
  pagamentos,
});

/** Texto da linha do resumo (label e valor moram no mesmo pai). */
const linha = (label) => screen.getByText(label).parentElement.textContent;

/** Campo "Conferido", na ordem em que os meios são exibidos. */
const inputConferido = (i = 0) =>
  document.querySelectorAll(".fechamento-modal__input-conferido")[i];

function montar(props = {}) {
  return render(
    <FechamentoModal
      sales={[]}
      fundoAtual={0}
      sessaoAbertaEm={null}
      onConfirm={vi.fn(() => Promise.resolve())}
      onClose={vi.fn()}
      {...props}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  setAppMock({ meiosPagamento: ["dinheiro", "credito", "debito", "pix"] });
});

describe("FechamentoModal — método não configurado (Run 1)", () => {
  it("valor em método sem linha de conferência fica FORA do esperado em caixa", () => {
    // R$ 50 em dinheiro (confere) + R$ 20 em fiado (não é meio configurado).
    montar({ sales: [venda(1, [{ metodo: "dinheiro", valor: 50 }, { metodo: "fiado", valor: 20 }])] });

    // O fiado aparece no aviso, e o aviso explica que está fora da conta.
    expect(screen.getByText(/R\$ 20\.00 em métodos não configurados/)).toBeInTheDocument();
    expect(screen.getByText(/Fica fora da conferência do caixa/)).toBeInTheDocument();

    // Total de vendas segue sendo os R$ 70 vendidos, mas o esperado NA GAVETA
    // é só o que pode ser conferido: R$ 50.
    expect(linha("Total de Vendas (sistema)")).toContain("R$ 70.00");
    expect(linha("Total Esperado em Caixa")).toContain("R$ 50.00");
    expect(linha("Total Conferido")).toContain("R$ 50.00");

    // E o caixa está certo — antes acusava "Falta no Caixa" de R$ 20.00.
    expect(screen.getByText("Caixa Conferido")).toBeInTheDocument();
    expect(screen.queryByText("Falta no Caixa")).not.toBeInTheDocument();
  });

  it("o valor não conferível também não é gravado como falta no fechamento", async () => {
    const onConfirm = vi.fn(() => Promise.resolve());
    montar({ sales: [venda(1, [{ metodo: "dinheiro", valor: 50 }, { metodo: "fiado", valor: 20 }])], onConfirm });

    await act(async () => { fireEvent.click(screen.getByText("Confirmar Fechamento")); });

    // totalVendas guarda a venda inteira (relatório), totalConferido só o que
    // foi contado, e totalEsperado registra o que DEVIA estar na gaveta — sem
    // ele o relatório e o Jarvas recalculam vendas + fundo e a falsa falta de
    // R$ 20 volta a aparecer depois do fechamento.
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({
      totalVendas: 70,
      totalEsperado: 50,
      totalConferido: 50,
      conferidoPorMetodo: { dinheiro: 50, credito: 0, debito: 0, pix: 0 },
    }));
  });
});

describe("FechamentoModal — deriva de centavos (Run 1)", () => {
  it("caixa conferido no centavo não aparece como falta", () => {
    // 16.10 × 3 = 48.300000000000004 em ponto flutuante.
    setAppMock({ meiosPagamento: ["dinheiro"] });
    montar({
      sales: [
        venda(1, [{ metodo: "dinheiro", valor: 16.1 }]),
        venda(2, [{ metodo: "dinheiro", valor: 16.1 }]),
        venda(3, [{ metodo: "dinheiro", valor: 16.1 }]),
      ],
    });

    expect(linha("Total Esperado em Caixa")).toContain("R$ 48.30");
    expect(linha("Caixa Conferido")).toContain("R$ 0.00");
    expect(screen.queryByText("Falta no Caixa")).not.toBeInTheDocument();
  });

  it("diferença de verdade continua sendo acusada", () => {
    // O guarda do guarda: arredondar não pode engolir falta real.
    setAppMock({ meiosPagamento: ["dinheiro"] });
    montar({ sales: [venda(1, [{ metodo: "dinheiro", valor: 50 }])] });

    fireEvent.change(inputConferido(), { target: { value: "40" } });

    expect(linha("Falta no Caixa")).toContain("R$ -10.00");
  });

  it("campo esvaziado vale zero (o operador disse que não tem nada ali)", () => {
    setAppMock({ meiosPagamento: ["dinheiro"] });
    montar({ sales: [venda(1, [{ metodo: "dinheiro", valor: 50 }])] });

    fireEvent.change(inputConferido(), { target: { value: "" } });

    expect(linha("Total Conferido")).toContain("R$ 0.00");
    expect(linha("Falta no Caixa")).toContain("R$ -50.00");
  });
});

describe("FechamentoModal — janela da sessão (Run 1)", () => {
  it("abertura de caixa ilegível não faz as vendas do dia desaparecerem", () => {
    // Valor fora do padrão ISO guardado em config.sessao_aberta_em: antes
    // virava NaN e o filtro `>= NaN` descartava todas as vendas.
    montar({
      sessaoAbertaEm: "31/07/2026 08:00",
      sales: [venda(1, [{ metodo: "dinheiro", valor: 50 }])],
    });

    expect(screen.getByText(/1 venda hoje/)).toBeInTheDocument();
    expect(linha("Total de Vendas (sistema)")).toContain("R$ 50.00");
  });

  it("inicioSessao: abertura válida manda; ilegível ou ausente cai no início do dia local", () => {
    const abertura = "2026-07-29T14:00:00.000Z";
    expect(inicioSessao(abertura)).toBe(new Date(abertura).getTime());

    const referencia = new Date(2026, 6, 29, 15, 30, 0).getTime();
    const meiaNoiteLocal = new Date(2026, 6, 29, 0, 0, 0, 0).getTime();
    expect(inicioSessao("31/07/2026 08:00", referencia)).toBe(meiaNoiteLocal);
    expect(inicioSessao(null, referencia)).toBe(meiaNoiteLocal);
    expect(inicioSessao("", referencia)).toBe(meiaNoiteLocal);
  });
});

describe("FechamentoModal — meio de pagamento que chega depois (Run 1)", () => {
  it("linha nova nasce com o valor do sistema, não em branco", () => {
    // A config chega por realtime: o modal pode abrir antes de o Pix existir
    // na lista de meios. Com o retrato congelado em useState, a linha nova
    // ficava vazia e o caixa certo acusava falta do valor inteiro do Pix.
    setAppMock({ meiosPagamento: ["dinheiro"] });
    const sales = [venda(1, [{ metodo: "dinheiro", valor: 50 }, { metodo: "pix", valor: 30 }])];
    const { rerender } = montar({ sales });

    expect(screen.getByText(/R\$ 30\.00 em métodos não configurados/)).toBeInTheDocument();

    setAppMock({ meiosPagamento: ["dinheiro", "pix"] });
    rerender(
      <FechamentoModal sales={sales} fundoAtual={0} sessaoAbertaEm={null} onConfirm={vi.fn()} onClose={vi.fn()} />,
    );

    expect(linha("Total Esperado em Caixa")).toContain("R$ 80.00");
    expect(linha("Total Conferido")).toContain("R$ 80.00");
    expect(screen.getByText("Caixa Conferido")).toBeInTheDocument();
    expect(screen.queryByText("Falta no Caixa")).not.toBeInTheDocument();
  });
});

describe("FechamentoModal — botão depois de uma falha (Run 1)", () => {
  it("falha ao gravar libera o botão para tentar de novo", async () => {
    // Falha de verdade: quem chama avisa o operador e MANTÉM o modal aberto
    // (DesktopLayout). O botão precisa voltar a funcionar, senão o "tente
    // novamente" do aviso é impossível de seguir.
    const onConfirm = vi.fn(() => Promise.resolve());
    montar({ sales: [venda(1, [{ metodo: "dinheiro", valor: 50 }])], onConfirm });

    const botao = screen.getByText("Confirmar Fechamento").closest("button");
    await act(async () => { fireEvent.click(botao); });

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(botao).not.toBeDisabled();
    expect(screen.getByText("Confirmar Fechamento")).toBeInTheDocument();
    expect(screen.queryByText("Fechando...")).not.toBeInTheDocument();

    await act(async () => { fireEvent.click(botao); });
    expect(onConfirm).toHaveBeenCalledTimes(2);
  });

  it("não dispara dois fechamentos no clique duplo", async () => {
    let liberar;
    const onConfirm = vi.fn(() => new Promise((resolve) => { liberar = resolve; }));
    montar({ sales: [venda(1, [{ metodo: "dinheiro", valor: 50 }])], onConfirm });

    const botao = screen.getByText("Confirmar Fechamento").closest("button");
    fireEvent.click(botao);
    fireEvent.click(botao);

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Fechando...")).toBeInTheDocument();

    await act(async () => { liberar(); });
  });
});
