// @vitest-environment jsdom
//
// F022 — a assinatura vencia e não havia como renová-la por lugar nenhum.
//
// A RPC `confirmar_renovacao_assinatura` (20260909) é a ÚNICA porta de escrita
// da renovação desde que a mesma migration tirou o UPDATE direto em
// `assinaturas` — e até aqui nenhuma tela a chamava. Na prática: vencimento
// passou, o estabelecimento entra em carência, depois bloqueia, e o dono da
// plataforma não tem botão nenhum para dizer "esse aqui pagou".
//
// Esta tela é essa porta. O que ela precisa garantir, além de chamar a RPC:
// que a competência default seja o mês do vencimento lido pela STRING (o fuso
// do Brasil empurra o mês para trás em todo dia 1º), que o valor gravado seja
// o que a pessoa quis (o eco em reais antes do clique), que a recusa
// `p_valor <= 0` do banco seja barrada antes da rede, e que uma recusa do
// banco nunca desapareça nem feche o modal como se tivesse dado certo.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/lib/supabase", async () => {
  const { createMockSupabase } = await import("@/test/mockSupabase");
  return { supabase: createMockSupabase() };
});

// `valorDigitado` (o parser de dinheiro) e `rotuloCompetencia` ficam REAIS —
// são a regra sob teste. Só a escrita no banco é dublada.
const { mockRenovar } = vi.hoisted(() => ({ mockRenovar: vi.fn() }));
vi.mock("@/lib/console/assinatura", async () => {
  const real = await vi.importActual("@/lib/console/assinatura");
  return { ...real, confirmarRenovacaoAssinatura: mockRenovar };
});

import ConfirmarRenovacaoModal from "./ConfirmarRenovacaoModal";
// `rotuloCompetencia` mudou de casa para `@/lib/assinatura` (S1-3): a aba do
// estabelecimento usa o mesmo rótulo de mês e não importa nada do Console.
import { rotuloCompetencia } from "@/lib/console/assinatura";
import { formatarReais } from "@/lib/delivery/deliveryPedidos";

const COM_PRECO = {
  tenantId: "t-pago",
  nome: "Café Central",
  valorMensal: 300,
  dataVencimento: "2026-08-05",
  status: "carencia",
};
const CORTESIA = {
  tenantId: "t-zero",
  nome: "Bar do Zé",
  valorMensal: 0,
  dataVencimento: "2026-08-05",
  status: "ativo",
};

const mes = () => screen.getByLabelText("Mês pago (competência)");
const valor = () => screen.getByLabelText("Valor recebido (R$)");
const forma = () => screen.getByLabelText("Como foi pago");
const confirmar = () => screen.getByRole("button", { name: /^Registrar pagamento$/i });
// Durante o envio o rótulo do botão vira "Registrando…" — buscar só por
// "Registrar pagamento" não o encontraria mais.
const confirmarOuRegistrando = () =>
  screen.getByRole("button", { name: /Registrar pagamento|Registrando/i });
const cancelar = () => screen.getByRole("button", { name: /^Cancelar$/i });

// `formatarReais` usa espaço NÃO-QUEBRÁVEL depois do "R$", e o
// `toHaveTextContent` normaliza espaços — então o valor esperado entra na
// regex com `\s*` no lugar de qualquer espaço, e `$`/`.` escapados.
function comoRegex(reais) {
  return reais.replace(/[$.]/g, "\\$&").replace(/\s/g, "\\s*");
}

function montar(linha = COM_PRECO, extras = {}) {
  const onFechar = vi.fn();
  const onConfirmado = vi.fn();
  render(
    <ConfirmarRenovacaoModal
      linha={linha}
      vencimentoAtual="05/08/2026"
      confirmadoPor="Dona da Plataforma"
      onFechar={onFechar}
      onConfirmado={onConfirmado}
      {...extras}
    />
  );
  return { onFechar, onConfirmado };
}

describe("rotuloCompetencia — o mês em português", () => {
  it("traduz o mês para o nome por extenso", () => {
    expect(rotuloCompetencia("2026-03")).toBe("março/2026");
    expect(rotuloCompetencia("2026-12")).toBe("dezembro/2026");
  });

  // Sem isto, um mês vazio ou fora da faixa viraria "undefined/2026" na tela
  // — e, pior, passaria pela trava do botão como se fosse competência válida.
  it("devolve vazio para mês ausente ou fora da faixa", () => {
    expect(rotuloCompetencia("")).toBe("");
    expect(rotuloCompetencia(null)).toBe("");
    expect(rotuloCompetencia("2026-13")).toBe("");
    expect(rotuloCompetencia("2026-00")).toBe("");
    expect(rotuloCompetencia("agosto")).toBe("");
  });
});

describe("ConfirmarRenovacaoModal — dar baixa na mensalidade", () => {
  beforeEach(() => {
    mockRenovar.mockReset();
    mockRenovar.mockResolvedValue({
      data: { tenant_id: "t-pago", data_vencimento: "2026-09-05", status: "ativo" },
      error: null,
    });
  });

  it("abre pronto para confirmar: competência e valor já preenchidos", () => {
    montar();
    expect(screen.getByText("Café Central")).toBeInTheDocument();
    expect(mes()).toHaveValue("2026-08");
    expect(valor()).toHaveValue("300");
    // Caminho feliz em um clique: quem só quer confirmar o combinado não
    // precisa digitar nada.
    expect(confirmar()).toBeEnabled();
  });

  // O bug que este teste existe para impedir: `new Date("2026-08-01")` é
  // meia-noite UTC, que no Brasil (-03) é 31/07 — a competência default viria
  // como julho e o pagamento de agosto seria gravado no mês errado.
  it("lê o mês do vencimento pela string, sem deixar o fuso empurrar o mês", () => {
    montar({ ...COM_PRECO, dataVencimento: "2026-08-01" });
    expect(mes()).toHaveValue("2026-08");
  });

  it("sem vencimento na linha, cai no mês corrente em vez de campo vazio", () => {
    montar({ ...COM_PRECO, dataVencimento: null });
    const hoje = new Date();
    const esperado = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;
    expect(mes()).toHaveValue(esperado);
  });

  it("mostra a mensalidade combinada e o vencimento de hoje", () => {
    montar();
    expect(
      screen.getByText(new RegExp(`Mensalidade combinada:\\s*${comoRegex(formatarReais(300))}`))
    ).toBeInTheDocument();
    expect(screen.getByText(/Vencimento de hoje:\s*05\/08\/2026/)).toBeInTheDocument();
  });

  it("ecoa em português o que vai ser gravado, antes do clique", async () => {
    const user = userEvent.setup();
    montar();
    expect(
      screen.getByText(
        new RegExp(
          `Pagamento de agosto/2026, no valor de ${comoRegex(formatarReais(300))}, via Pix`
        )
      )
    ).toBeInTheDocument();

    await user.selectOptions(forma(), "Dinheiro");
    expect(screen.getByText(/via Dinheiro/)).toBeInTheDocument();
  });

  // A RPC anda UM ciclo por chamada. Quem chega aqui com quatro meses de
  // atraso precisa saber disso antes de clicar, senão espera que uma
  // confirmação zere a dívida inteira.
  it("avisa que o vencimento anda um ciclo de cobrança", () => {
    montar();
    expect(screen.getByText(/avança um ciclo de cobrança/i)).toBeInTheDocument();
  });

  it("manda a competência no dia 1º, o valor como número e quem confirmou", async () => {
    const user = userEvent.setup();
    montar();
    await user.click(confirmar());

    expect(mockRenovar).toHaveBeenCalledWith({
      tenantId: "t-pago",
      competencia: "2026-08-01",
      valor: 300,
      metodo: "Pix",
      confirmadoPor: "Dona da Plataforma",
    });
  });

  it("devolve o registro e o mês por extenso para quem abriu o modal", async () => {
    const user = userEvent.setup();
    const { onConfirmado } = montar();
    await user.click(confirmar());

    expect(onConfirmado).toHaveBeenCalledTimes(1);
    expect(onConfirmado).toHaveBeenCalledWith(
      expect.objectContaining({ data_vencimento: "2026-09-05", status: "ativo" }),
      "agosto/2026"
    );
  });

  it("grava o valor digitado no teclado brasileiro, não o texto cru", async () => {
    const user = userEvent.setup();
    montar();
    await user.clear(valor());
    await user.type(valor(), "1.250,50");
    expect(screen.getByText(new RegExp(comoRegex(formatarReais(1250.5))))).toBeInTheDocument();

    await user.click(confirmar());
    expect(mockRenovar).toHaveBeenCalledWith(expect.objectContaining({ valor: 1250.5 }));
  });

  // Espelho em português da recusa `p_valor <= 0` da RPC: a pessoa não pode
  // descobrir a regra pelo erro do servidor (prevenção de erro > erro).
  it.each([
    ["0", /maior que zero/i],
    ["0,00", /maior que zero/i],
    ["-50", /maior que zero/i],
    ["abc", /só números/i],
  ])("recusa o valor %s antes de chegar na rede", async (digitado, esperado) => {
    const user = userEvent.setup();
    montar(CORTESIA);
    await user.type(valor(), digitado);

    expect(screen.getByRole("alert")).toHaveTextContent(esperado);
    expect(confirmar()).toBeDisabled();
    await user.click(confirmar());
    expect(mockRenovar).not.toHaveBeenCalled();
  });

  it("cortesia abre com o valor vazio, explicando por quê, e travado", () => {
    montar(CORTESIA);
    expect(valor()).toHaveValue("");
    expect(screen.getByText(/sem mensalidade definida/i)).toBeInTheDocument();
    expect(confirmar()).toBeDisabled();
    expect(screen.getByText(/como você escreveria no papel/i)).toBeInTheDocument();
  });

  it("competência apagada trava o botão e diz o que fazer", () => {
    montar();
    fireEvent.change(mes(), { target: { value: "" } });

    expect(screen.getByRole("alert")).toHaveTextContent(/Escolha o mês/i);
    expect(confirmar()).toBeDisabled();
    expect(mockRenovar).not.toHaveBeenCalled();
  });

  // As três recusas reais da RPC, com o texto que a 20260909 devolve palavra
  // por palavra (linhas 102, 139 e 129 da migration): papel errado
  // (insufficient_privilege → 42501), competência repetida (índice único de
  // `assinaturas_pagamentos` → 23505) e tenant sem assinatura — esta última
  // sem ERRCODE declarado, então chega como P0001, e com o UUID no meio da
  // frase. O modal não interpreta nenhuma: mostra o que o banco disse.
  it.each([
    ["42501", "Somente a plataforma pode confirmar renovação de assinatura."],
    ["23505", "A competência 08/2026 já foi confirmada para este estabelecimento."],
    ["P0001", "Assinatura não encontrada para o tenant t-pago."],
  ])("recusa do banco (%s) aparece na tela e o modal NÃO fecha", async (code, message) => {
    const user = userEvent.setup();
    mockRenovar.mockResolvedValue({ data: null, error: { code, message } });
    const { onFechar, onConfirmado } = montar();

    await user.click(confirmar());

    expect(screen.getByRole("alert")).toHaveTextContent(message);
    // Fechar aqui seria mentir: o dono acharia que deu baixa e o vencimento
    // continuaria o mesmo.
    expect(onConfirmado).not.toHaveBeenCalled();
    expect(onFechar).not.toHaveBeenCalled();
    // E dá para corrigir e tentar de novo sem reabrir a tela.
    expect(confirmar()).toBeEnabled();
  });

  it("clique repetido no botão registra o pagamento uma vez só", async () => {
    const user = userEvent.setup();
    let liberar;
    mockRenovar.mockImplementation(() => new Promise((r) => { liberar = r; }));
    montar();

    await user.click(confirmar());
    expect(screen.getByText(/Registrando…/)).toBeInTheDocument();
    expect(confirmarOuRegistrando()).toBeDisabled();
    // Cancelar também trava: fechar no meio do envio deixaria a escrita
    // acontecendo sem ninguém para ler a resposta.
    expect(cancelar()).toBeDisabled();

    await user.click(confirmarOuRegistrando());
    expect(mockRenovar).toHaveBeenCalledTimes(1);

    await act(async () => {
      liberar({ data: { data_vencimento: "2026-09-05", status: "ativo" }, error: null });
    });
  });

  it("Cancelar fecha sem escrever nada", async () => {
    const user = userEvent.setup();
    const { onFechar, onConfirmado } = montar();
    await user.click(cancelar());

    expect(onFechar).toHaveBeenCalledTimes(1);
    expect(onConfirmado).not.toHaveBeenCalled();
    expect(mockRenovar).not.toHaveBeenCalled();
  });
});
