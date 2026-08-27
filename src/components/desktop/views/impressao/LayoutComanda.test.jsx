// @vitest-environment jsdom
//
// Aba "Layout da comanda" — o que sai impresso no papel que o cliente leva.
//
// O que estes testes protegem:
// (1) a prévia é o MESMO renderizador da impressão de verdade, então o que o
//     dono vê digitando é o que sai na bobina;
// (2) endereço e CNPJ só saem quando a chave está ligada — a chave é o que
//     manda, não o campo preenchido;
// (3) salvar grava só os cinco campos desta tela POR CIMA da config lida:
//     mexer no rodapé não pode desfazer a impressora ou os pontos de
//     impressão configurados em outra aba;
// (4) CNPJ inválido com a chave ligada trava o salvamento (prevenção de erro
//     > mensagem de erro, Princípio nº1).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

vi.mock("@/context/AppContext", async () => {
  const { mockUseApp } = await import("@/test/mockApp");
  return { useApp: mockUseApp, AppProvider: ({ children }) => children };
});

// Só o que fala com o Supabase vira dublê; o renderizador da comanda
// (gerarHtmlComPerfil) e `resolverIdentidadeTenant` ficam REAIS — são eles
// que produzem o HTML avaliado aqui.
const { mockBuscarConfig, mockSalvarConfig } = vi.hoisted(() => ({
  mockBuscarConfig: vi.fn(),
  mockSalvarConfig: vi.fn(),
}));
vi.mock("@/lib/impressao", async () => {
  const real = await vi.importActual("@/lib/impressao");
  return { ...real, buscarConfigImpressao: mockBuscarConfig, salvarConfigImpressao: mockSalvarConfig };
});

import { setAppMock } from "@/test/mockApp";
import LayoutComanda from "./LayoutComanda";
import { CONFIG_IMPRESSAO_PADRAO, PERFIL_IMPRESSORA_PADRAO } from "@/lib/impressao";

// Config "de verdade" na conta: além dos campos desta tela, tem impressora e
// pontos de impressão configurados em outras abas — é justamente o que não
// pode ser perdido ao salvar daqui.
const PONTO = { id: "p1", nome: "Cozinha", impressora: "EPSON-COZINHA" };
const CONFIG_SALVA = {
  ...CONFIG_IMPRESSAO_PADRAO,
  perfilImpressora: { ...PERFIL_IMPRESSORA_PADRAO, larguraMm: 58, driver: "escpos-ponte" },
  pontosImpressao: [PONTO],
};

const CNPJ_VALIDO = "11.222.333/0001-81";
const CNPJ_INVALIDO = "11.222.333/0001-82";

/** HTML da comanda de exemplo, exatamente como vai para o iframe da tela. */
const previewHtml = () =>
  document.querySelector(".layout-comanda__preview-iframe").getAttribute("srcdoc");

const abrir = async (config = CONFIG_SALVA) => {
  mockBuscarConfig.mockResolvedValue({ data: config, error: null });
  await act(async () => { render(<LayoutComanda />); });
};

const digitar = (label, valor) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value: valor } });

const ligar = (nome) => fireEvent.click(screen.getByRole("switch", { name: nome }));

const botaoSalvar = () => screen.getByRole("button", { name: /Salvar layout/ });

beforeEach(() => {
  vi.clearAllMocks();
  setAppMock({});
  mockSalvarConfig.mockResolvedValue({ error: null });
});

describe("LayoutComanda — prévia ao vivo", () => {
  it("mostra o rodapé digitado na comanda de exemplo, sem precisar salvar", async () => {
    await abrir();

    expect(previewHtml()).toContain(CONFIG_IMPRESSAO_PADRAO.rodapePersonalizado);

    digitar("Última linha da comanda", "Volte sempre! Wi-Fi: senha 12345");

    expect(previewHtml()).toContain("Volte sempre! Wi-Fi: senha 12345");
    expect(previewHtml()).not.toContain(CONFIG_IMPRESSAO_PADRAO.rodapePersonalizado);
  });

  it("endereço e CNPJ só entram no papel com a chave ligada", async () => {
    await abrir();

    // Desligado: nem campo na tela, nem linha no papel.
    expect(screen.queryByLabelText("Endereço")).toBeNull();
    expect(previewHtml()).not.toContain("Rua das Flores, 120");

    ligar("Imprimir endereço e CNPJ");
    digitar("Endereço", "Rua das Flores, 120");
    digitar("CNPJ", CNPJ_VALIDO);

    expect(previewHtml()).toContain("Rua das Flores, 120");
    expect(previewHtml()).toContain(CNPJ_VALIDO);

    // Desligar de novo tira do papel sem apagar o que foi digitado.
    ligar("Imprimir endereço e CNPJ");
    expect(previewHtml()).not.toContain("Rua das Flores, 120");
  });

  it("usa a largura do papel já configurada na aba de impressora", async () => {
    await abrir();

    // 58mm salvo lá → a prévia sai em 58mm, não no padrão de 80mm.
    expect(screen.getByText("Como vai sair (58mm)")).toBeTruthy();
  });
});

describe("LayoutComanda — salvar", () => {
  it("grava os campos da tela sem desfazer impressora e pontos de impressão", async () => {
    await abrir();

    digitar("Última linha da comanda", "Obrigado, volte sempre!");
    await act(async () => { fireEvent.click(botaoSalvar()); });

    expect(mockSalvarConfig).toHaveBeenCalledTimes(1);
    const gravado = mockSalvarConfig.mock.calls[0][0];
    expect(gravado.rodapePersonalizado).toBe("Obrigado, volte sempre!");
    expect(gravado.perfilImpressora).toEqual(CONFIG_SALVA.perfilImpressora);
    expect(gravado.pontosImpressao).toEqual([PONTO]);
  });

  it("fica desligado enquanto nada mudou", async () => {
    await abrir();

    expect(botaoSalvar().disabled).toBe(true);
    expect(screen.getByText("Nada mudou ainda.")).toBeTruthy();

    digitar("Última linha da comanda", "Até a próxima!");
    expect(botaoSalvar().disabled).toBe(false);
  });

  it("trava o salvamento quando o CNPJ que vai ser impresso está errado", async () => {
    await abrir();

    ligar("Imprimir endereço e CNPJ");
    digitar("CNPJ", CNPJ_INVALIDO);

    expect(botaoSalvar().disabled).toBe(true);
    expect(screen.getByText(/Confira os 14 dígitos/)).toBeTruthy();

    digitar("CNPJ", CNPJ_VALIDO);
    expect(botaoSalvar().disabled).toBe(false);
  });

  it("CNPJ pela metade com a chave desligada não trava nada", async () => {
    await abrir();

    // Chave desligada: o CNPJ não vai ser impresso, então digitação
    // incompleta não é erro — travar aqui seria impedir de salvar o rodapé
    // por causa de um campo que ninguém vai ver.
    digitar("Última linha da comanda", "Bom apetite!");
    expect(botaoSalvar().disabled).toBe(false);
  });
});

describe("LayoutComanda — falha ao ler a configuração", () => {
  it("tranca a tela em vez de abrir com os valores de fábrica", async () => {
    mockBuscarConfig.mockResolvedValue({ data: null, error: new Error("sem conexão") });
    await act(async () => { render(<LayoutComanda />); });

    expect(screen.getByRole("alert").textContent).toContain("Não deu para carregar o layout da comanda");
    // Sem botão de salvar não há como gravar por cima do que não foi lido.
    expect(screen.queryByRole("button", { name: /Salvar layout/ })).toBeNull();
  });
});
