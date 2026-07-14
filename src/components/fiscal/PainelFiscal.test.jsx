// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

// Repositório mockado (não toca supabase real → suíte hermética, sem .env.local).
// A validação (validarConfigFiscal) roda DE VERDADE — é pura.
const buscarConfigFiscal = vi.fn().mockResolvedValue({ data: null, error: null });
const salvarConfigFiscal = vi.fn().mockResolvedValue({ data: {}, error: null });
vi.mock("@/lib/fiscalConfigRepo", () => ({
  buscarConfigFiscal: (...a) => buscarConfigFiscal(...a),
  salvarConfigFiscal: (...a) => salvarConfigFiscal(...a),
}));

import PainelFiscal from "./PainelFiscal";

// Preenche todos os campos obrigatórios com valores válidos (ativo=false, então
// os endpoints não são exigidos).
async function preencherValido() {
  const set = (label, valor) =>
    fireEvent.change(screen.getByLabelText(label), { target: { value: valor } });
  set(/CNPJ/i, "11222333000181");
  set(/Inscrição Estadual/i, "1234567");
  set(/Razão social/i, "Zé Lanches LTDA");
  set(/^UF$/i, "RS");
  set(/Código IBGE/i, "4314902");
  set(/^Município$/i, "Porto Alegre");
  set(/Logradouro/i, "Rua das Flores");
  set(/^Número$/i, "100");
  set(/Bairro/i, "Centro");
  set(/^CEP$/i, "90000000");
  // série (1) e ambiente (Homologação) já vêm no padrão.
}

beforeEach(() => {
  vi.clearAllMocks();
  buscarConfigFiscal.mockResolvedValue({ data: null, error: null });
  salvarConfigFiscal.mockResolvedValue({ data: {}, error: null });
});

describe("<PainelFiscal> — configuração fiscal do tenant (Leva 13)", () => {
  it("renderiza as seções e campos após carregar", async () => {
    render(<PainelFiscal />);
    expect(await screen.findByLabelText(/CNPJ/i)).toBeTruthy();
    expect(screen.getByLabelText(/Razão social/i)).toBeTruthy();
    expect(screen.getByLabelText(/Ambiente de emissão/i)).toBeTruthy();
    expect(screen.getByLabelText(/Série da NFC-e/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Salvar configuração/i })).toBeTruthy();
  });

  it("NÃO expõe campo de certificado nem de valor do CSC (fronteira de segredo)", async () => {
    render(<PainelFiscal />);
    await screen.findByLabelText(/CNPJ/i);
    expect(screen.queryByLabelText(/certificado/i)).toBeNull();
    expect(screen.queryByLabelText(/senha/i)).toBeNull();
    expect(screen.queryByLabelText(/valor do csc/i)).toBeNull();
    // Só o IDENTIFICADOR do CSC (não secreto) aparece.
    expect(screen.getByLabelText(/ID do CSC/i)).toBeTruthy();
  });

  it("erro de validação mantém o botão Salvar desabilitado", async () => {
    render(<PainelFiscal />);
    await screen.findByLabelText(/CNPJ/i);
    // Formulário em branco → inválido.
    expect(screen.getByRole("button", { name: /Salvar configuração/i })).toBeDisabled();

    // CNPJ inválido também bloqueia.
    fireEvent.change(screen.getByLabelText(/CNPJ/i), { target: { value: "11222333000182" } });
    expect(screen.getByRole("button", { name: /Salvar configuração/i })).toBeDisabled();
  });

  it("com dados válidos, Salvar chama salvarConfigFiscal e mostra sucesso", async () => {
    render(<PainelFiscal />);
    await screen.findByLabelText(/CNPJ/i);
    await preencherValido();

    const botao = screen.getByRole("button", { name: /Salvar configuração/i });
    await waitFor(() => expect(botao).not.toBeDisabled());
    fireEvent.click(botao);

    await waitFor(() => expect(salvarConfigFiscal).toHaveBeenCalledTimes(1));
    const enviado = salvarConfigFiscal.mock.calls[0][0];
    expect(enviado.cnpj).toBe("11222333000181");
    expect(enviado.ambiente).toBe(2);
    expect(await screen.findByText(/Configuração salva/i)).toBeTruthy();
  });

  it("ligar Produção pede confirmação explícita antes de aplicar", async () => {
    render(<PainelFiscal />);
    await screen.findByLabelText(/CNPJ/i);

    fireEvent.change(screen.getByLabelText(/Ambiente de emissão/i), { target: { value: "1" } });
    // Aparece a confirmação; o select ainda não virou Produção.
    expect(await screen.findByRole("dialog", { name: /Produção/i })).toBeTruthy();
    expect(screen.getByText(/notas fiscais reais/i)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Sim, usar Produção/i }));
    await waitFor(() =>
      expect(screen.getByLabelText(/Ambiente de emissão/i).value).toBe("1"));
  });

  it("falha ao salvar mostra mensagem humana de erro", async () => {
    salvarConfigFiscal.mockResolvedValue({ data: null, error: new Error("boom") });
    render(<PainelFiscal />);
    await screen.findByLabelText(/CNPJ/i);
    await preencherValido();

    const botao = screen.getByRole("button", { name: /Salvar configuração/i });
    await waitFor(() => expect(botao).not.toBeDisabled());
    fireEvent.click(botao);

    expect(await screen.findByText(/Não foi possível salvar/i)).toBeTruthy();
  });

  it("mostra estado de erro se a carga inicial falhar", async () => {
    buscarConfigFiscal.mockResolvedValue({ data: null, error: new Error("sem rede") });
    render(<PainelFiscal />);
    expect(await screen.findByText(/Não foi possível carregar/i)).toBeTruthy();
  });
});
