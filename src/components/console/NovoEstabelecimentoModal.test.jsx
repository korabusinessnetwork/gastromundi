// @vitest-environment jsdom
//
// CONSOLE-UX 12 — a mensalidade combinada entra no cadastro.
//
// `provisionar_tenant` (20260908) cria a assinatura com `valor_mensal = 0`, e
// até esta rodada lembrar de definir o preço em outra aba era com o dono. O
// resultado prático era cliente vendido valendo R$ 0,00 na base e "Receita
// mensal" mentindo. O que estes testes protegem: que o preço combinado seja
// perguntado onde a venda acontece, que o número gravado seja o número que a
// pessoa quis, e que uma falha só do preço nunca vire "a criação falhou".
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/lib/supabase", async () => {
  const { createMockSupabase } = await import("@/test/mockSupabase");
  return { supabase: createMockSupabase() };
});

// `validarNovoEstabelecimento`, `valorDigitado` e `MENSALIDADE_MAXIMA` ficam
// REAIS — são a regra sob teste. Só as duas escritas são dubladas.
const { mockProvisionar, mockDefinir } = vi.hoisted(() => ({
  mockProvisionar: vi.fn(),
  mockDefinir: vi.fn(),
}));
vi.mock("@/lib/console", async () => {
  const real = await vi.importActual("@/lib/console");
  return { ...real, provisionarEstabelecimento: mockProvisionar, definirMensalidade: mockDefinir };
});

import NovoEstabelecimentoModal from "./NovoEstabelecimentoModal";
import { MENSALIDADE_MAXIMA } from "@/lib/console";
import { formatarReais } from "@/lib/deliveryPedidos";

const PLANOS = [
  { codigo: "basico", nome: "Básico" },
  { codigo: "avancado", nome: "Avançado" },
];

// `formatarReais` usa espaço NÃO-QUEBRÁVEL depois do "R$", e o matcher de
// texto normaliza espaços — daí a regex com `\s*`.
function comoRegex(reais) {
  return reais.replace(/[$.]/g, "\\$&").replace(/\s/g, "\\s*");
}

const mensalidade = () => screen.getByLabelText(/Mensalidade combinada/i);
const criar = () => screen.getByRole("button", { name: /Criar estabelecimento|Criando/i });

function montar() {
  const user = userEvent.setup();
  const onCriado = vi.fn();
  const onFechar = vi.fn();
  render(<NovoEstabelecimentoModal planos={PLANOS} onFechar={onFechar} onCriado={onCriado} />);
  return { user, onCriado, onFechar };
}

// Preenche tudo o que a validação real exige, menos a mensalidade.
async function preencher(user) {
  await user.type(screen.getByLabelText(/Nome do estabelecimento/i), "Bar do Zé");
  await user.type(screen.getByLabelText(/Nome do responsável/i), "José da Silva");
  await user.type(screen.getByLabelText(/Usuário de acesso/i), "barze");
  await user.type(screen.getByLabelText(/Senha provisória/i), "senha-forte-123");
}

describe("NovoEstabelecimentoModal — a mensalidade combinada", () => {
  beforeEach(() => {
    mockProvisionar.mockReset();
    mockDefinir.mockReset();
    mockProvisionar.mockResolvedValue({
      data: { tenant_id: "t-novo", nome: "Bar do Zé", admin: { username: "barze" } },
      error: null,
    });
    mockDefinir.mockResolvedValue({ data: { tenant_id: "t-novo", valor_mensal: 300 }, error: null });
  });

  it("ecoa em reais o valor entendido antes de salvar", async () => {
    const { user } = montar();
    await user.type(mensalidade(), "300,00");
    expect(screen.getByText(new RegExp(`Vai ficar ${comoRegex(formatarReais(300))} por mês`))).toBeInTheDocument();
  });

  it("vírgula e ponto não viram valor errado — o eco mostra o que será gravado", async () => {
    const { user } = montar();
    await user.type(mensalidade(), "1.200,50");
    expect(screen.getByText(new RegExp(comoRegex(formatarReais(1200.5))))).toBeInTheDocument();
  });

  it("valor inválido explica em português e trava o botão", async () => {
    const { user } = montar();
    await user.type(mensalidade(), "trezentos");
    expect(screen.getByText(/Digite só números, com vírgula nos centavos/i)).toBeInTheDocument();
    expect(criar()).toBeDisabled();
  });

  it("acima do teto é recusado antes de sair da tela", async () => {
    const { user } = montar();
    await user.type(mensalidade(), "100000,01");
    expect(
      screen.getByText(new RegExp(`O máximo aceito é ${comoRegex(formatarReais(MENSALIDADE_MAXIMA))}`))
    ).toBeInTheDocument();
    expect(criar()).toBeDisabled();
    await user.clear(mensalidade());
    await user.type(mensalidade(), "100000");
    expect(criar()).toBeEnabled();
  });

  it("vazio é caminho legítimo: cria sem preço e diz onde defini-lo depois", async () => {
    const { user, onCriado } = montar();
    expect(screen.getByText(/define depois em "Planos e assinaturas"/i)).toBeInTheDocument();

    await preencher(user);
    await user.click(criar());

    expect(mockProvisionar).toHaveBeenCalledTimes(1);
    expect(mockDefinir).not.toHaveBeenCalled();
    expect(onCriado).toHaveBeenCalledWith(
      expect.objectContaining({ mensalidade: null, mensalidadeFalhou: false })
    );
  });

  it("zero digitado é o mesmo que vazio — não chama a RPC à toa", async () => {
    const { user, onCriado } = montar();
    await user.type(mensalidade(), "0");
    await preencher(user);
    await user.click(criar());

    expect(mockDefinir).not.toHaveBeenCalled();
    expect(onCriado).toHaveBeenCalledWith(expect.objectContaining({ mensalidade: null }));
  });

  it("com valor, grava o preço pela RPC logo depois de criar o estabelecimento", async () => {
    const { user, onCriado } = montar();
    await user.type(mensalidade(), "300,00");
    await preencher(user);
    await user.click(criar());

    expect(mockDefinir).toHaveBeenCalledWith("t-novo", 300);
    expect(mockProvisionar.mock.invocationCallOrder[0]).toBeLessThan(
      mockDefinir.mock.invocationCallOrder[0]
    );
    expect(onCriado).toHaveBeenCalledWith(
      expect.objectContaining({ tenant_id: "t-novo", plano_codigo: "avancado", mensalidade: 300, mensalidadeFalhou: false })
    );
  });

  it("preço que falha não apaga o estabelecimento nem mente que a criação falhou", async () => {
    mockDefinir.mockResolvedValue({ data: null, error: { message: "permissao negada" } });
    const { user, onCriado } = montar();
    await user.type(mensalidade(), "300");
    await preencher(user);
    await user.click(criar());

    expect(onCriado).toHaveBeenCalledWith(
      expect.objectContaining({ tenant_id: "t-novo", mensalidade: null, mensalidadeFalhou: true })
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("provisionamento que falha nem chega a mexer no preço", async () => {
    mockProvisionar.mockResolvedValue({ data: null, error: { message: "usuario ja existe" } });
    const { user, onCriado } = montar();
    await user.type(mensalidade(), "300");
    await preencher(user);
    await user.click(criar());

    expect(mockDefinir).not.toHaveBeenCalled();
    expect(onCriado).not.toHaveBeenCalled();
    expect(criar()).toBeEnabled();
  });
});
