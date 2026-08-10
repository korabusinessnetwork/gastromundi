// @vitest-environment jsdom
//
// Run 6, leva 1 — a folha de pagamento da vitrine pública.
//
// Dois defeitos que faziam o cliente perder o pedido em silêncio:
//
// 1. A mensagem de falha do envio era desenhada no CORPO DA PÁGINA, e a
//    folha de pagamento é `position: fixed; z-index: 40` cobrindo a tela
//    inteira. O cliente apertava "Confirmar pedido", o botão voltava de
//    "Enviando pedido…" para "Confirmar pedido" — e nada mais acontecia.
//    O aviso existia, atrás do modal, onde ninguém via.
//
// 2. O campo "troco para" aceita vírgula (é teclado brasileiro), e
//    `Number("50,00")` é NaN. `NaN > 0` é falso, então o troco não
//    aparecia, o aviso de valor insuficiente não aparecia, e o valor não
//    chegava ao servidor: o entregador ia sem troco nenhum.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// A camada de delivery importa o client Supabase no topo (exige VITE_*).
vi.mock("@/lib/supabase", async () => {
  const { createMockSupabase } = await import("@/test/mockSupabase");
  return { supabase: createMockSupabase() };
});

import CheckoutPagamento from "./CheckoutPagamento";

const DADOS_PADRAO = { forma: "", trocoPara: "", levarMaquininha: false };

/** Renderiza a folha com o total em R$ 32,50 (subtotal 25 + taxa 7,50). */
function abrir(props = {}) {
  const onConfirmar = vi.fn();
  const onMudar = vi.fn();
  render(
    <CheckoutPagamento
      dados={{ ...DADOS_PADRAO, ...(props.dados ?? {}) }}
      subtotal={25}
      taxa={7.5}
      onMudar={onMudar}
      onVoltar={vi.fn()}
      onConfirmar={onConfirmar}
      enviando={props.enviando ?? false}
      erro={props.erro ?? ""}
    />
  );
  return { onConfirmar, onMudar };
}

const botaoConfirmar = () =>
  screen.getByRole("button", { name: /Confirmar pedido|Enviando pedido/ });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("CheckoutPagamento — falha de envio visível (Run 6, leva 1)", () => {
  it("mostra a mensagem de falha DENTRO da folha, onde o cliente está olhando", () => {
    abrir({ dados: { forma: "pix" }, erro: "Estabelecimento fechado para pedidos no momento." });

    const aviso = screen.getByRole("alert");
    expect(aviso).toHaveTextContent("Estabelecimento fechado para pedidos no momento.");

    // O ponto do defeito: o aviso precisa estar dentro do painel do modal.
    // Fora dele, fica atrás de um `position: fixed` e ninguém vê.
    const painel = document.querySelector(".modal-painel");
    expect(painel).toBeTruthy();
    expect(painel.contains(aviso)).toBe(true);
  });

  it("sem falha, nenhum aviso de erro aparece", () => {
    abrir({ dados: { forma: "pix" } });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("depois da falha o cliente ainda pode tentar de novo", () => {
    abrir({ dados: { forma: "pix" }, erro: "Não foi possível enviar o pedido." });
    expect(botaoConfirmar()).toBeEnabled();
  });

  it("enquanto envia, o botão trava e avisa que está enviando", () => {
    abrir({ dados: { forma: "pix" }, enviando: true });
    expect(botaoConfirmar()).toBeDisabled();
    expect(screen.getByText("Enviando pedido…")).toBeInTheDocument();
  });
});

describe("CheckoutPagamento — troco digitado com vírgula (Run 6, leva 1)", () => {
  it("R$ 50,00 num total de R$ 32,50 mostra o troco de R$ 17,50", () => {
    abrir({ dados: { forma: "dinheiro", trocoPara: "50,00" } });

    expect(screen.getByText("R$ 17,50")).toBeInTheDocument();
    expect(screen.queryByText(/O valor precisa ser maior que o total/)).toBeNull();
    expect(botaoConfirmar()).toBeEnabled();
  });

  it("R$ 1.234,56 (milhar à brasileira) também vira troco", () => {
    abrir({ dados: { forma: "dinheiro", trocoPara: "1.234,56" } });
    expect(screen.getByText("R$ 1202,06")).toBeInTheDocument();
  });

  it("valor com vírgula ABAIXO do total avisa e trava o pedido", () => {
    // Era o pior caso: NaN não é > 0, então a tela não avisava nada e
    // deixava confirmar — o cliente pedia troco pra menos que a conta.
    abrir({ dados: { forma: "dinheiro", trocoPara: "20,00" } });

    expect(
      screen.getByText(/O valor precisa ser maior que o total \(R\$ 32,50\)/)
    ).toBeInTheDocument();
    expect(botaoConfirmar()).toBeDisabled();
  });

  it("campo de troco vazio é opcional: nem avisa, nem trava, nem mostra troco", () => {
    abrir({ dados: { forma: "dinheiro", trocoPara: "" } });

    expect(screen.queryByText(/O valor precisa ser maior que o total/)).toBeNull();
    expect(screen.queryByText(/Troco a levar/)).toBeNull();
    expect(botaoConfirmar()).toBeEnabled();
  });

  it("sem forma de pagamento escolhida não dá pra confirmar", () => {
    abrir();
    expect(botaoConfirmar()).toBeDisabled();
  });
});

// ── Run 6, leva 4 ──────────────────────────────────────────────────
// D13 — o teclado não conseguia pagar.
//
// As três formas de pagamento eram <div onClick>. Div não recebe foco,
// não entra na ordem do Tab e não responde a Enter nem a espaço. Quem
// navega por teclado (ou por leitor de tela, que anda pelos controles)
// tabulava do × direto para "Confirmar pedido" — que fica desabilitado
// justamente até escolher uma forma. Não havia NENHUM caminho para
// escolher: o checkout inteiro era impossível de terminar sem mouse.
describe("CheckoutPagamento — pagar só com o teclado (Run 6, leva 4)", () => {
  it("cada forma de pagamento é um controle de verdade, não um texto clicável", () => {
    abrir();

    for (const nome of ["Dinheiro", "Pix na entrega", "Cartão na entrega"]) {
      expect(screen.getByRole("button", { name: nome })).toBeInTheDocument();
    }
  });

  it("a forma escolhida se anuncia como escolhida (e as outras, não)", () => {
    abrir({ dados: { forma: "pix" } });

    expect(screen.getByRole("button", { name: "Pix na entrega" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.getByRole("button", { name: "Dinheiro" })).toHaveAttribute(
      "aria-pressed",
      "false"
    );
  });

  it("o Tab alcança as formas de pagamento", async () => {
    abrir();
    const user = userEvent.setup();

    // × (voltar) → Dinheiro → Pix → Cartão. Antes o Tab pulava as três.
    await user.tab();
    await user.tab();
    expect(screen.getByRole("button", { name: "Dinheiro" })).toHaveFocus();

    await user.tab();
    expect(screen.getByRole("button", { name: "Pix na entrega" })).toHaveFocus();
  });

  it("Enter na forma focada escolhe a forma", async () => {
    const { onMudar } = abrir();
    const user = userEvent.setup();

    screen.getByRole("button", { name: "Cartão na entrega" }).focus();
    await user.keyboard("{Enter}");

    expect(onMudar).toHaveBeenCalledWith({ forma: "cartao" });
  });

  it("espaço na forma focada também escolhe", async () => {
    const { onMudar } = abrir();
    const user = userEvent.setup();

    screen.getByRole("button", { name: "Dinheiro" }).focus();
    await user.keyboard(" ");

    expect(onMudar).toHaveBeenCalledWith({ forma: "dinheiro" });
  });

  it("o clique de mouse continua funcionando como antes", async () => {
    const { onMudar } = abrir();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Pix na entrega" }));

    expect(onMudar).toHaveBeenCalledWith({ forma: "pix" });
  });

  it("a maquininha é um interruptor alcançável pelo teclado", async () => {
    const { onMudar } = abrir({ dados: { forma: "cartao" } });
    const user = userEvent.setup();

    const toggle = screen.getByRole("button", { name: /Levar a maquininha/ });
    expect(toggle).toHaveAttribute("aria-pressed", "false");

    toggle.focus();
    await user.keyboard("{Enter}");

    expect(onMudar).toHaveBeenCalledWith({ levarMaquininha: true });
  });

  it("maquininha já marcada se anuncia marcada e o teclado desmarca", async () => {
    const { onMudar } = abrir({ dados: { forma: "cartao", levarMaquininha: true } });
    const user = userEvent.setup();

    const toggle = screen.getByRole("button", { name: /Levar a maquininha/ });
    expect(toggle).toHaveAttribute("aria-pressed", "true");

    toggle.focus();
    await user.keyboard(" ");

    expect(onMudar).toHaveBeenCalledWith({ levarMaquininha: false });
  });
});
