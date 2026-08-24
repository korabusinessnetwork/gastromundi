// @vitest-environment jsdom
//
// Layout da comanda — o que sai impresso no papel do cliente.
//
// Esta tela é a primeira a deixar o dono digitar texto que vai PARAR
// dentro do HTML de impressão (endereço, CNPJ, rodapé). Dois riscos
// concretos, os dois cobertos aqui: texto digitado virar HTML executável
// na janela de impressão (stored XSS), e a pré-visualização mentir —
// mostrar uma coisa e o papel sair outra.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, act, screen, fireEvent } from "@testing-library/react";

// Só o que fala com o Supabase vira dublê; o renderizador do cupom
// (montarCupomPreNota + gerarHtmlComPerfil) fica REAL — é ele que
// produz o HTML avaliado aqui, o mesmo que sai na impressora.
const { mockBuscarConfig, mockSalvarConfig } = vi.hoisted(() => ({
  mockBuscarConfig: vi.fn(),
  mockSalvarConfig: vi.fn(),
}));
vi.mock("@/lib/impressao", async () => {
  const real = await vi.importActual("@/lib/impressao");
  return { ...real, buscarConfigImpressao: mockBuscarConfig, salvarConfigImpressao: mockSalvarConfig };
});

// O tenant vem do contexto do app; aqui só interessa o que ele empresta
// pro papel (nome e logo).
const { mockTenant } = vi.hoisted(() => ({ mockTenant: { valor: null } }));
vi.mock("@/context/AppContext", () => ({
  useApp: () => ({ tenant: mockTenant.valor }),
}));

import LayoutComanda, { formatarCnpj, normalizarLayout } from "./LayoutComanda";
import { CONFIG_IMPRESSAO_PADRAO } from "@/lib/impressao";

const CONFIG_SALVA = {
  ...CONFIG_IMPRESSAO_PADRAO,
  mostrarEnderecoCnpj: true,
  endereco: "Rua das Palmeiras, 100 — Centro",
  cnpj: "12.345.678/0001-90",
  rodapePersonalizado: "Volte sempre!",
};

/** HTML do cupom de exemplo, exatamente como vai para o iframe da tela. */
const previewHtml = () =>
  document.querySelector(".layout-comanda__preview-iframe")?.getAttribute("srcdoc") ?? "";

const abrir = async () => {
  await act(async () => { render(<LayoutComanda />); });
};

const digitar = (rotulo, valor) => {
  fireEvent.change(screen.getByLabelText(rotulo), { target: { value: valor } });
};

beforeEach(() => {
  vi.clearAllMocks();
  mockTenant.valor = { nome: "Restaurante do Teste", tema: null };
  mockBuscarConfig.mockResolvedValue({ data: CONFIG_SALVA, error: null });
  mockSalvarConfig.mockResolvedValue({ error: null });
});

describe("LayoutComanda", () => {
  it("mostra no papel de exemplo o que já está salvo", async () => {
    await abrir();

    const html = previewHtml();
    expect(html).toContain("Restaurante do Teste");
    expect(html).toContain("Rua das Palmeiras, 100");
    expect(html).toContain("CNPJ: 12.345.678/0001-90");
    expect(html).toContain("Volte sempre!");
  });

  it("a pré-visualização acompanha o que o dono digita, antes de salvar", async () => {
    await abrir();

    digitar("Mensagem no fim da comanda", "Wi-fi: convidado");

    expect(previewHtml()).toContain("Wi-fi: convidado");
    expect(previewHtml()).not.toContain("Volte sempre!");
    expect(mockSalvarConfig).not.toHaveBeenCalled();
  });

  it("desligar endereço e CNPJ tira os dois do papel, mesmo preenchidos", async () => {
    await abrir();

    fireEvent.click(screen.getByRole("switch", { name: "Imprimir endereço e CNPJ" }));

    const html = previewHtml();
    expect(html).not.toContain("Rua das Palmeiras");
    expect(html).not.toContain("CNPJ:");
    expect(html).toContain("Restaurante do Teste");
  });

  it("texto digitado nunca vira HTML na janela de impressão", async () => {
    await abrir();

    digitar("Mensagem no fim da comanda", '<img src=x onerror="alert(1)">');

    const html = previewHtml();
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img src=x");
  });

  it("só salva a fatia de layout — a impressora escolhida na outra aba fica", async () => {
    mockBuscarConfig.mockResolvedValue({
      data: { ...CONFIG_SALVA, perfilImpressora: { ...CONFIG_IMPRESSAO_PADRAO.perfilImpressora, larguraMm: 58 } },
      error: null,
    });
    await abrir();

    digitar("Mensagem no fim da comanda", "Obrigado!");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /salvar layout/i })); });

    const salvo = mockSalvarConfig.mock.calls[0][0];
    expect(salvo.rodapePersonalizado).toBe("Obrigado!");
    expect(salvo.perfilImpressora.larguraMm).toBe(58);
  });

  it("sem nada alterado, não há o que salvar", async () => {
    await abrir();

    expect(screen.getByRole("button", { name: /salvar layout/i })).toBeDisabled();
  });

  it("falha ao ler tranca a tela em vez de mostrar o layout de fábrica", async () => {
    mockBuscarConfig.mockResolvedValue({ data: null, error: { message: "sem internet" } });
    await abrir();

    expect(screen.getByText(/não deu para carregar o layout da comanda/i)).toBeTruthy();
    expect(document.querySelector(".layout-comanda__preview-iframe")).toBeNull();
    expect(screen.queryByRole("button", { name: /salvar layout/i })).toBeNull();
  });
});

describe("formatarCnpj", () => {
  it("põe a pontuação enquanto o dono digita só os números", () => {
    expect(formatarCnpj("12345678000190")).toBe("12.345.678/0001-90");
    expect(formatarCnpj("12345")).toBe("12.345");
    expect(formatarCnpj("")).toBe("");
  });

  it("ignora o que não é número e não passa de 14 dígitos", () => {
    expect(formatarCnpj("12.345.678/0001-90")).toBe("12.345.678/0001-90");
    expect(formatarCnpj("123456780001909999")).toBe("12.345.678/0001-90");
  });
});

describe("normalizarLayout", () => {
  it("tira espaço sobrando e corta texto grande demais para o papel", () => {
    const r = normalizarLayout({ endereco: "  Rua A  ", rodapePersonalizado: "x".repeat(200) });
    expect(r.endereco).toBe("Rua A");
    expect(r.rodapePersonalizado).toHaveLength(120);
  });

  it("mantém os defaults: logo ligada, endereço/CNPJ desligados", () => {
    const r = normalizarLayout({});
    expect(r.mostrarLogo).toBe(true);
    expect(r.mostrarEnderecoCnpj).toBe(false);
  });
});
