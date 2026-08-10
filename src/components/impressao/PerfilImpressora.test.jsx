// @vitest-environment jsdom
//
// Run 5, leva 11 — o cupom de exemplo da tela de perfil de impressão.
//
// A pré-visualização é a única coisa desta tela que TODO estabelecimento vê
// antes de configurar a impressora, e o documento de exemplo é fixo no
// código. Enquanto o nome dele era a marca de um cliente específico, o dono
// de qualquer outro restaurante abria a tela e via o cupom de outra empresa
// como modelo do próprio (decisão 017).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, act } from "@testing-library/react";

// Só o que fala com o Supabase vira dublê; o renderizador do cupom
// (gerarHtmlComPerfil) fica REAL — é ele que produz o HTML avaliado aqui.
const { mockBuscarConfig } = vi.hoisted(() => ({
  mockBuscarConfig: vi.fn(),
}));
vi.mock("@/lib/impressao/impressao", async () => {
  const real = await vi.importActual("@/lib/impressao/impressao");
  return { ...real, buscarConfigImpressao: mockBuscarConfig, salvarConfigImpressao: vi.fn() };
});
vi.mock("@/lib/impressao/ponte", () => ({
  listarImpressorasPonte: vi.fn(() => Promise.resolve({ data: [], error: null })),
}));

import PerfilImpressora from "./PerfilImpressora";
import { CONFIG_IMPRESSAO_PADRAO, PERFIL_IMPRESSORA_PADRAO } from "@/lib/impressao/impressao";

// Erro de leitura tranca a tela (e some com a pré-visualização), então o
// dublê devolve a configuração de fábrica — o estado normal de quem abre a
// tela pela primeira vez.
const CONFIG_SALVA = { ...CONFIG_IMPRESSAO_PADRAO, perfilImpressora: PERFIL_IMPRESSORA_PADRAO };

/** HTML do cupom de exemplo, exatamente como vai para o iframe da tela. */
const previewHtml = () =>
  document.querySelector(".perfil-impressora__preview-iframe").getAttribute("srcdoc");

const abrir = async () => {
  await act(async () => { render(<PerfilImpressora />); });
};

beforeEach(() => {
  vi.clearAllMocks();
  mockBuscarConfig.mockResolvedValue({ data: CONFIG_SALVA, error: null });
});

describe("PerfilImpressora — cupom de exemplo (Run 5, leva 11)", () => {
  it("o exemplo usa um nome genérico, nunca a marca de um cliente", async () => {
    await abrir();

    expect(previewHtml()).toContain("Seu Estabelecimento");
    expect(previewHtml()).not.toContain("GastroMundi");
    expect(previewHtml()).not.toContain("GASTROMUNDI");
  });
});
