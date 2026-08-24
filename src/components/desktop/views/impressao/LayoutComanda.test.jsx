// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LayoutComanda from "./LayoutComanda";

/**
 * Editor do layout da comanda. O que estes testes protegem: o papel que
 * o dono VÊ é o papel que a impressora recebe, nas duas saídas, e salvar
 * o layout nunca leva junto nada que não seja dele.
 *
 * Só o que fala com o Supabase é dublado — o renderizador é o de
 * verdade, senão a pré-visualização estaria sendo testada contra uma
 * imitação dela mesma.
 */
const { mockBuscarConfig, mockSalvarConfig } = vi.hoisted(() => ({
  mockBuscarConfig: vi.fn(),
  mockSalvarConfig: vi.fn(),
}));

vi.mock("@/lib/impressao", async () => {
  const real = await vi.importActual("@/lib/impressao");
  return { ...real, buscarConfigImpressao: mockBuscarConfig, salvarConfigImpressao: mockSalvarConfig };
});

const { mockTenant } = vi.hoisted(() => ({ mockTenant: { valor: null } }));
vi.mock("@/context/AppContext", () => ({ useApp: () => ({ tenant: mockTenant.valor }) }));

const CONFIG_BASE = {
  mostrarLogo: true,
  mostrarEnderecoCnpj: true,
  endereco: "Rua das Flores, 10",
  cnpj: "12.345.678/0001-90",
  rodapePersonalizado: "Obrigado pela preferência!",
  perfilImpressora: { larguraMm: 58, driver: "browser-raster", margemMm: 2, cortaPapel: true, fonteBase: null, impressora: null },
  layoutComanda: [],
};

// O HTML que o navegador imprimiria, exatamente como está na tela.
const papel = () => document.querySelector(".layout-comanda__preview-iframe")?.getAttribute("srcdoc") ?? "";

const acharBloco = (rotulo) => screen.getByText(rotulo).closest("li");

beforeEach(() => {
  vi.clearAllMocks();
  mockTenant.valor = { nome: "Restaurante Exemplo", tema: {} };
  mockBuscarConfig.mockResolvedValue({ data: { ...CONFIG_BASE }, error: null });
  mockSalvarConfig.mockResolvedValue({ error: null });
});

async function abrirEditor() {
  render(<LayoutComanda />);
  await waitFor(() => expect(screen.getByText("Lista dos itens")).toBeInTheDocument());
}

describe("LayoutComanda — a lista mostra a comanda de cima para baixo", () => {
  it("abre com os blocos do estabelecimento e o papel já montado", async () => {
    await abrirEditor();

    expect(screen.getByText("Nome do estabelecimento")).toBeInTheDocument();
    expect(screen.getByText("Mensagem final")).toBeInTheDocument();
    expect(papel()).toContain("Restaurante Exemplo");
    expect(papel()).toContain("Obrigado pela preferência!");
    expect(papel()).toContain("Rua das Flores, 10");
  });

  it("mostra na própria linha o texto que aquele bloco imprime", async () => {
    await abrirEditor();

    expect(within(acharBloco("Endereço")).getByText("Rua das Flores, 10")).toBeInTheDocument();
  });
});

describe("mexer no layout muda o papel na hora, antes de salvar", () => {
  it("desligar um bloco tira ele do papel — e não salva nada", async () => {
    await abrirEditor();

    await userEvent.click(screen.getByRole("switch", { name: "Imprimir Mensagem final" }));

    await waitFor(() => expect(papel()).not.toContain("Obrigado pela preferência!"));
    expect(papel()).toContain("Restaurante Exemplo");
    expect(mockSalvarConfig).not.toHaveBeenCalled();
  });

  it("subir um bloco muda a ordem impressa", async () => {
    await abrirEditor();

    const antes = papel();
    expect(antes.indexOf("Restaurante Exemplo")).toBeLessThan(antes.indexOf("Obrigado pela preferência!"));

    const linha = acharBloco("Mensagem final");
    for (let i = 0; i < 20; i += 1) {
      const subir = within(linha).getByRole("button", { name: "Subir Mensagem final" });
      if (subir.disabled) break;
      await userEvent.click(subir);
    }

    await waitFor(() => {
      const depois = papel();
      expect(depois.indexOf("Obrigado pela preferência!")).toBeLessThan(depois.indexOf("Restaurante Exemplo"));
    });
  });

  it("acrescentar um texto livre imprime o que foi digitado", async () => {
    await abrirEditor();

    await userEvent.click(screen.getByRole("button", { name: /Texto livre/ }));
    await userEvent.type(screen.getByLabelText("O que escrever"), "Wi-fi: gastro2026");

    await waitFor(() => expect(papel()).toContain("Wi-fi: gastro2026"));
  });

  it("o que o dono digita nunca vira HTML no papel (XSS na janela de impressão)", async () => {
    await abrirEditor();

    await userEvent.click(screen.getByRole("button", { name: /Texto livre/ }));
    await userEvent.type(screen.getByLabelText("O que escrever"), "<img src=x onerror=alert(1)>");

    await waitFor(() => expect(papel()).toContain("&lt;img src=x"));
    expect(papel()).not.toContain("<img src=x");
  });

  it("editar o texto de um bloco muda o papel", async () => {
    await abrirEditor();

    await userEvent.click(screen.getByText("Mensagem final"));
    const campo = screen.getByLabelText("Texto");
    await userEvent.clear(campo);
    await userEvent.type(campo, "Volte sempre!");

    await waitFor(() => expect(papel()).toContain("Volte sempre!"));
    expect(papel()).not.toContain("Obrigado pela preferência!");
  });
});

describe("as duas saídas de impressão", () => {
  it("a aba da térmica mostra o texto puro, na largura real do papel", async () => {
    await abrirEditor();

    await userEvent.click(screen.getByRole("button", { name: "Na térmica" }));

    const termica = document.querySelector(".layout-comanda__preview-termica");
    expect(termica).toBeInTheDocument();
    expect(termica.textContent).toContain("Restaurante Exemplo");
    expect(termica.textContent).toContain("Obrigado pela preferência!");
    // 58mm = 32 colunas de hardware; nenhuma linha pode passar disso.
    for (const linha of termica.textContent.split("\n")) expect(linha.length).toBeLessThanOrEqual(32);
  });

  it("quem imprime na térmica já abre a tela vendo a térmica", async () => {
    mockBuscarConfig.mockResolvedValue({
      data: { ...CONFIG_BASE, perfilImpressora: { ...CONFIG_BASE.perfilImpressora, driver: "escpos-ponte" } },
      error: null,
    });

    await abrirEditor();

    expect(document.querySelector(".layout-comanda__preview-termica")).toBeInTheDocument();
  });
});

describe("salvar", () => {
  it("grava o layout e mantém o que é da outra aba", async () => {
    await abrirEditor();

    await userEvent.click(screen.getByRole("switch", { name: "Imprimir Mensagem final" }));
    await userEvent.click(screen.getByRole("button", { name: "Salvar layout" }));

    await waitFor(() => expect(mockSalvarConfig).toHaveBeenCalledTimes(1));
    const gravado = mockSalvarConfig.mock.calls[0][0];

    expect(gravado.layoutComanda.find((b) => b.tipo === "rodape").visivel).toBe(false);
    expect(gravado.perfilImpressora.larguraMm).toBe(58);
  });

  it("desligar endereço e CNPJ desliga também a flag antiga que a identidade lê", async () => {
    await abrirEditor();

    await userEvent.click(screen.getByRole("switch", { name: "Imprimir Endereço" }));
    await userEvent.click(screen.getByRole("switch", { name: "Imprimir CNPJ" }));
    await userEvent.click(screen.getByRole("button", { name: "Salvar layout" }));

    await waitFor(() => expect(mockSalvarConfig).toHaveBeenCalledTimes(1));
    expect(mockSalvarConfig.mock.calls[0][0].mostrarEnderecoCnpj).toBe(false);
  });

  it("o botão fica desabilitado enquanto nada mudou", async () => {
    await abrirEditor();

    expect(screen.getByRole("button", { name: "Salvar layout" })).toBeDisabled();
    expect(screen.getByText("Tudo salvo.")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("switch", { name: "Imprimir Mensagem final" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Salvar layout" })).toBeEnabled());
  });

  it("falha ao salvar avisa e não finge que salvou", async () => {
    mockSalvarConfig.mockResolvedValue({ error: { message: "sem internet" } });
    await abrirEditor();

    await userEvent.click(screen.getByRole("switch", { name: "Imprimir Mensagem final" }));
    await userEvent.click(screen.getByRole("button", { name: "Salvar layout" }));

    await waitFor(() => expect(screen.getByText(/Falha ao salvar/)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Salvar layout" })).toBeEnabled();
  });
});

describe("voltar ao padrão", () => {
  it("pede confirmação antes e preserva o conteúdo — só a arrumação volta ao padrão", async () => {
    await abrirEditor();

    await userEvent.click(screen.getByRole("button", { name: /Voltar ao padrão/ }));
    expect(screen.getByText(/O que você escreveu e o que está\s+imprimindo continuam/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Sim, voltar ao padrão" }));

    await waitFor(() => expect(papel()).toContain("Obrigado pela preferência!"));
    expect(papel()).toContain("Rua das Flores, 10");
  });

  it("cancelar não mexe em nada", async () => {
    await abrirEditor();

    await userEvent.click(screen.getByRole("button", { name: /Voltar ao padrão/ }));
    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(screen.getByRole("button", { name: "Salvar layout" })).toBeDisabled();
  });
});

describe("erro de leitura", () => {
  it("tranca a tela em vez de mostrar o layout de fábrica", async () => {
    mockBuscarConfig.mockResolvedValue({ data: null, error: { message: "sem conexão" } });

    render(<LayoutComanda />);

    await waitFor(() => expect(screen.getByText(/Não deu para carregar o layout/)).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Salvar layout" })).not.toBeInTheDocument();
    expect(document.querySelector(".layout-comanda__preview-iframe")).not.toBeInTheDocument();
  });
});
