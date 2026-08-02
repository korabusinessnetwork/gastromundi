// @vitest-environment jsdom
//
// F022-ADDONS — a tela que liga e desliga os add-ons pagos (NF-e, TEF) de um
// estabelecimento.
//
// O que estava em aberto: `tenant_addons` não tem policy de escrita, então o
// único jeito de habilitar NF-e ou TEF para um cliente era um INSERT cru no
// SQL Editor de produção. Errar o `tenant_id` ali entrega um recurso pago ao
// cliente errado — e desabilita em silêncio quem estava pagando.
//
// O que esta tela precisa garantir, além de chamar a RPC: que falha de
// leitura nunca vire "nenhum add-on contratado" (a segunda frase convida a
// ligar de novo o que já estava ligado), que desligar peça um "sim" que
// NOMEIA o que vai parar de funcionar, que o aviso do que ainda não funciona
// de ponta a ponta apareça ANTES do clique (o dono não pode vender ao cliente
// algo que a tela deixou parecer pronto), e que o estado mostrado depois de
// salvar venha do que o servidor gravou, não do que pedimos.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/lib/supabase", async () => {
  const { createMockSupabase } = await import("@/test/mockSupabase");
  return { supabase: createMockSupabase() };
});

// `resumirAddonsDoTenant` fica REAL — é ela que cruza catálogo com o que o
// tenant contratou. Só o que fala com o banco é dublado.
const { mockListarAddons, mockListarPorTenant, mockAlternar } = vi.hoisted(() => ({
  mockListarAddons: vi.fn(),
  mockListarPorTenant: vi.fn(),
  mockAlternar: vi.fn(),
}));
vi.mock("@/lib/console", async () => {
  const real = await vi.importActual("@/lib/console");
  return {
    ...real,
    listarAddons: mockListarAddons,
    listarAddonsPorTenant: mockListarPorTenant,
    alternarAddon: mockAlternar,
  };
});

import AddonsModal from "./AddonsModal";

const TENANT = { id: "t-1", nome: "Café Central" };

const CATALOGO = [
  { codigo: "nfe", nome: "Nota fiscal eletrônica", descricao: "Emite NFC-e no pagamento." },
  { codigo: "tef", nome: "Maquininha integrada", descricao: "Cartão direto pelo PDV." },
];

const linhaAtiva = (codigo, ativo = true, tenantId = TENANT.id) => ({
  tenant_id: tenantId,
  addon_codigo: codigo,
  ativo,
  ativado_em: "2026-08-01T12:00:00.000Z",
});

const itemDe = (nome) => screen.getByText(nome).closest("li");
const botaoDe = (nome, acao) => within(itemDe(nome)).getByRole("button", { name: acao });

function montar(extras = {}) {
  const onFechar = vi.fn();
  const onAlterado = vi.fn();
  render(<AddonsModal tenant={TENANT} onFechar={onFechar} onAlterado={onAlterado} {...extras} />);
  return { onFechar, onAlterado };
}

// Espera a leitura inicial terminar — todo teste começa depois dela.
const carregado = () => screen.findByText("Nota fiscal eletrônica");

beforeEach(() => {
  vi.clearAllMocks();
  mockListarAddons.mockResolvedValue({ data: CATALOGO, error: null });
  mockListarPorTenant.mockResolvedValue({ data: [], error: null });
  mockAlternar.mockResolvedValue({ data: linhaAtiva("nfe"), error: null });
});

describe("AddonsModal — leitura", () => {
  it("mostra uma linha por add-on do catálogo, com nome e descrição do banco", async () => {
    montar();
    await carregado();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText("Emite NFC-e no pagamento.")).toBeInTheDocument();
    expect(screen.getByText("Maquininha integrada")).toBeInTheDocument();
  });

  it("escreve o estado por extenso, não só por cor", async () => {
    mockListarPorTenant.mockResolvedValue({ data: [linhaAtiva("nfe")], error: null });
    montar();
    await carregado();
    expect(within(itemDe("Nota fiscal eletrônica")).getByText("Ligado")).toBeInTheDocument();
    expect(within(itemDe("Maquininha integrada")).getByText("Desligado")).toBeInTheDocument();
  });

  it("o add-on ligado do vizinho não aparece como ligado aqui", async () => {
    mockListarPorTenant.mockResolvedValue({
      data: [linhaAtiva("nfe", true, "t-outro")],
      error: null,
    });
    montar();
    await carregado();
    expect(within(itemDe("Nota fiscal eletrônica")).getByText("Desligado")).toBeInTheDocument();
  });

  it("avisa o que ainda não funciona de ponta a ponta ANTES do clique", async () => {
    montar();
    await carregado();
    expect(within(itemDe("Maquininha integrada")).getByText(/apenas simula a aprovação/i)).toBeInTheDocument();
    expect(within(itemDe("Nota fiscal eletrônica")).getByText(/certificado A1/i)).toBeInTheDocument();
  });

  it("falha de leitura NÃO vira 'catálogo vazio' — diz o que houve e oferece tentar de novo", async () => {
    mockListarPorTenant.mockResolvedValue({ data: [], error: { message: "rede" } });
    montar();
    expect(await screen.findByRole("alert")).toHaveTextContent(/não foi possível ler os add-ons/i);
    expect(screen.queryByText(/nenhum add-on cadastrado/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
  });

  it("'Tentar de novo' relê e a tela se recupera", async () => {
    const user = userEvent.setup();
    mockListarAddons.mockResolvedValueOnce({ data: [], error: { message: "rede" } });
    montar();
    await user.click(await screen.findByRole("button", { name: /tentar de novo/i }));
    await carregado();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("catálogo vazio de verdade tem sua própria frase", async () => {
    mockListarAddons.mockResolvedValue({ data: [], error: null });
    montar();
    expect(await screen.findByText(/nenhum add-on cadastrado/i)).toBeInTheDocument();
  });

  it("o rodapé conta quantos estão ligados", async () => {
    mockListarPorTenant.mockResolvedValue({
      data: [linhaAtiva("nfe"), linhaAtiva("tef")],
      error: null,
    });
    montar();
    await carregado();
    expect(screen.getByText("2 add-ons ligados")).toBeInTheDocument();
  });
});

describe("AddonsModal — ligar", () => {
  it("liga direto, sem confirmação: nada é tirado do cliente", async () => {
    const user = userEvent.setup();
    montar();
    await carregado();
    await user.click(botaoDe("Nota fiscal eletrônica", /ligar/i));
    expect(mockAlternar).toHaveBeenCalledWith("t-1", "nfe", true);
  });

  it("repinta a linha com o que o SERVIDOR gravou, não com o que pedimos", async () => {
    const user = userEvent.setup();
    // O servidor devolve ativo=false mesmo tendo sido pedido true (regra
    // futura, gatilho, corrida). A tela obedece ao banco.
    mockAlternar.mockResolvedValue({ data: linhaAtiva("nfe", false), error: null });
    montar();
    await carregado();
    await user.click(botaoDe("Nota fiscal eletrônica", /ligar/i));
    expect(await within(itemDe("Nota fiscal eletrônica")).findByText("Desligado")).toBeInTheDocument();
  });

  it("avisa o Console de que houve mudança", async () => {
    const user = userEvent.setup();
    const { onAlterado } = montar();
    await carregado();
    await user.click(botaoDe("Nota fiscal eletrônica", /ligar/i));
    expect(onAlterado).toHaveBeenCalledWith({ codigo: "nfe", ativo: true });
  });

  it("recusa do banco vira frase na própria linha, e o estado não muda", async () => {
    const user = userEvent.setup();
    mockAlternar.mockResolvedValue({
      data: null,
      error: { message: "Apenas a plataforma pode ligar ou desligar um add-on." },
    });
    const { onAlterado } = montar();
    await carregado();
    await user.click(botaoDe("Nota fiscal eletrônica", /ligar/i));
    const linha = itemDe("Nota fiscal eletrônica");
    expect(await within(linha).findByRole("alert")).toHaveTextContent(/apenas a plataforma pode/i);
    expect(within(linha).getByText("Desligado")).toBeInTheDocument();
    expect(onAlterado).not.toHaveBeenCalled();
  });

  it("o erro de uma linha não contamina a outra", async () => {
    const user = userEvent.setup();
    mockAlternar.mockResolvedValue({ data: null, error: { message: "falhou" } });
    montar();
    await carregado();
    await user.click(botaoDe("Nota fiscal eletrônica", /ligar/i));
    await within(itemDe("Nota fiscal eletrônica")).findByRole("alert");
    expect(within(itemDe("Maquininha integrada")).queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("AddonsModal — desligar", () => {
  beforeEach(() => {
    mockListarPorTenant.mockResolvedValue({ data: [linhaAtiva("nfe")], error: null });
  });

  it("não desliga no primeiro clique — pede confirmação nomeando a consequência", async () => {
    const user = userEvent.setup();
    montar();
    await carregado();
    await user.click(botaoDe("Nota fiscal eletrônica", /^desligar$/i));
    expect(mockAlternar).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog")).toHaveTextContent(/para de emitir nota fiscal/i);
  });

  it("'Manter ligado' desiste sem tocar no banco", async () => {
    const user = userEvent.setup();
    montar();
    await carregado();
    await user.click(botaoDe("Nota fiscal eletrônica", /^desligar$/i));
    await user.click(screen.getByRole("button", { name: /manter ligado/i }));
    expect(mockAlternar).not.toHaveBeenCalled();
    expect(within(itemDe("Nota fiscal eletrônica")).getByText("Ligado")).toBeInTheDocument();
  });

  // Sem a trava, dois cliques disparam duas chamadas e a resposta mais lenta
  // repinta a linha com um estado velho — o dono vê "Ligado" num add-on que
  // acabou de desligar (e vice-versa).
  it("clicar duas vezes em 'Desligar mesmo assim' não manda duas chamadas", async () => {
    const user = userEvent.setup();
    let liberar;
    mockAlternar.mockImplementation(
      () => new Promise((resolve) => { liberar = () => resolve({ data: linhaAtiva("nfe", false), error: null }); })
    );
    montar();
    await carregado();
    await user.click(botaoDe("Nota fiscal eletrônica", /^desligar$/i));

    await user.click(screen.getByRole("button", { name: /desligar mesmo assim/i }));
    expect(mockAlternar).toHaveBeenCalledTimes(1);

    // Enquanto a chamada está no ar a linha não aceita um segundo pedido.
    const emAndamento = botaoDe("Nota fiscal eletrônica", /salvando/i);
    expect(emAndamento).toBeDisabled();
    await user.click(emAndamento);
    expect(mockAlternar).toHaveBeenCalledTimes(1);

    liberar();
    expect(await within(itemDe("Nota fiscal eletrônica")).findByText("Desligado")).toBeInTheDocument();
  });

  it("confirmar desliga de fato", async () => {
    const user = userEvent.setup();
    mockAlternar.mockResolvedValue({ data: linhaAtiva("nfe", false), error: null });
    montar();
    await carregado();
    await user.click(botaoDe("Nota fiscal eletrônica", /^desligar$/i));
    await user.click(screen.getByRole("button", { name: /desligar mesmo assim/i }));
    expect(mockAlternar).toHaveBeenCalledWith("t-1", "nfe", false);
    expect(await within(itemDe("Nota fiscal eletrônica")).findByText("Desligado")).toBeInTheDocument();
  });
});
