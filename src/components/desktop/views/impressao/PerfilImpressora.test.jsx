// @vitest-environment jsdom
//
// Run 5, leva 11 — o cupom de exemplo da tela de perfil de impressão.
//
// A pré-visualização é a única coisa desta tela que TODO estabelecimento vê
// antes de configurar a impressora, e o documento de exemplo é fixo no
// código. Enquanto o nome dele era a marca de um cliente específico, o dono
// de qualquer outro restaurante abria a tela e via o cupom de outra empresa
// como modelo do próprio (decisão 017).
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act, cleanup } from "@testing-library/react";

// Só o que fala com o Supabase vira dublê; o renderizador do cupom
// (gerarHtmlComPerfil) fica REAL — é ele que produz o HTML avaliado aqui.
const { mockBuscarConfig } = vi.hoisted(() => ({
  mockBuscarConfig: vi.fn(),
}));
vi.mock("@/lib/impressao", async () => {
  const real = await vi.importActual("@/lib/impressao");
  return { ...real, buscarConfigImpressao: mockBuscarConfig, salvarConfigImpressao: vi.fn() };
});
vi.mock("@/lib/ponte", () => ({
  listarImpressorasPonte: vi.fn(() => Promise.resolve({ data: [], error: null })),
}));

import PerfilImpressora from "./PerfilImpressora";
import { CONFIG_IMPRESSAO_PADRAO, PERFIL_IMPRESSORA_PADRAO } from "@/lib/impressao";

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

// ── O botão que baixa o programa da impressora ─────────────────────────────
//
// Quem escolhe a impressora térmica precisa da Ponte KORA rodando no PC, e a
// tela sempre mandou "dê dois cliques no KoraPonte.exe" sem nunca dizer de
// onde vem esse arquivo — o dono que não recebeu o instalador por fora ficava
// travado aqui. O endereço do download mora no ambiente (o .exe tem 56 MB e
// não entra no repositório), então o botão só pode existir quando há endereço
// de verdade: botão que não leva a lugar nenhum é pior que botão nenhum.
const CONFIG_TERMICA = {
  ...CONFIG_IMPRESSAO_PADRAO,
  perfilImpressora: { ...PERFIL_IMPRESSORA_PADRAO, driver: "escpos-ponte" },
};

const ENDERECO = "https://exemplo.invalid/KoraPonte.zip";

/** Abre a tela como se o build tivesse recebido este endereço de download. */
const abrirComEndereco = async (endereco) => {
  vi.resetModules();
  vi.stubEnv("VITE_PONTE_DOWNLOAD_URL", endereco);
  const { default: Tela } = await import("./PerfilImpressora");
  await act(async () => { render(<Tela />); });
};

const botaoBaixar = () => document.querySelector(".perfil-impressora__btn-baixar");
const dicaBaixar = () => document.querySelector(".perfil-impressora__dica-baixar");

describe("PerfilImpressora — baixar o programa da impressora", () => {
  beforeEach(() => {
    mockBuscarConfig.mockResolvedValue({ data: CONFIG_TERMICA, error: null });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
  });

  it("mostra o botão apontando para o endereço configurado", async () => {
    await abrirComEndereco(ENDERECO);

    const botao = botaoBaixar();
    expect(botao).not.toBeNull();
    expect(botao.getAttribute("href")).toBe(ENDERECO);
    expect(botao.textContent).toContain("Baixar o programa da impressora");
  });

  // O programa é publicado compactado (o plano gratuito do Storage recusa o
  // .exe cru, que tem ~58 MB). Sem essa frase o dono baixa, dá dois cliques no
  // .zip, não acontece nada, e ele conclui que o programa está quebrado. A
  // dica fica colada no botão — e não só na mensagem de "a Ponte não está
  // rodando" — porque o botão aparece em qualquer estado da tela.
  it("avisa que o arquivo vem compactado, junto do botão", async () => {
    await abrirComEndereco(ENDERECO);

    const dica = dicaBaixar();
    expect(dica).not.toBeNull();
    expect(dica.textContent).toContain("descompacte");
    expect(dica.textContent).toContain("KoraPonte.exe");
  });

  it("sem endereço configurado, não existe botão nenhum", async () => {
    await abrirComEndereco("");

    expect(botaoBaixar()).toBeNull();
    // Sem download não há zip para descompactar: quem recebeu o arquivo por
    // fora já tem o .exe na mão, e a dica só confundiria.
    expect(dicaBaixar()).toBeNull();
    // A tela continua inteira: o bloco da Ponte e a busca de impressoras
    // seguem lá, só sem o botão que não teria para onde levar.
    expect(document.querySelector(".perfil-impressora__btn-detectar")).not.toBeNull();
  });

  it("endereço escrito errado no build vale o mesmo que endereço nenhum", async () => {
    await abrirComEndereco("peça-o-ao-suporte");

    expect(botaoBaixar()).toBeNull();
  });

  it("só aparece para quem escolheu a impressora térmica", async () => {
    mockBuscarConfig.mockResolvedValue({ data: CONFIG_SALVA, error: null });
    await abrirComEndereco(ENDERECO);

    expect(botaoBaixar()).toBeNull();
  });
});
