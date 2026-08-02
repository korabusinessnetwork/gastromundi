// S1-3 — identidade do estabelecimento (nome de exibição e logo).
//
// O que estes testes protegem:
// 1. o caminho do logo, que é o que garante UM arquivo por tenant e o
//    isolamento por pasta que as policies de 20260826 exigem;
// 2. o "mudou?", que é o que mantém o botão de salvar apagado — se ele
//    mentisse, o dono clicaria em salvar sem ter mudado nada;
// 3. os guardas do upload (tipo e tamanho), que precisam recusar ANTES de
//    gastar rede;
// 4. o contrato da RPC: convenção null = não mexe / "" = remove, e nunca
//    lançar exceção para fora.
import { describe, it, expect, vi, beforeEach } from "vitest";

const { rpc, upload, getPublicUrl } = vi.hoisted(() => ({
  rpc: vi.fn(),
  upload: vi.fn(),
  getPublicUrl: vi.fn(),
}));

vi.mock("./supabase", () => ({
  supabase: {
    rpc,
    storage: { from: () => ({ upload, getPublicUrl }) },
  },
}));

import {
  caminhoLogoTenant,
  limparNomeExibicao,
  nomeExibicaoValido,
  identidadeMudou,
  enviarLogoTenant,
  salvarIdentidadeTenant,
  MAX_NOME_EXIBICAO,
  MAX_LADO_LOGO,
} from "./identidadeTenant";

beforeEach(() => {
  vi.clearAllMocks();
  rpc.mockResolvedValue({ data: { id: "t1", tema: {} }, error: null });
  upload.mockResolvedValue({ error: null });
  getPublicUrl.mockReturnValue({ data: { publicUrl: "https://cdn.exemplo/t1/identidade/logo.png" } });
});

describe("caminhoLogoTenant", () => {
  it("monta {tenant}/identidade/logo.png — determinístico, um por tenant", () => {
    expect(caminhoLogoTenant("t1")).toBe("t1/identidade/logo.png");
    expect(caminhoLogoTenant("abc-uuid")).toBe("abc-uuid/identidade/logo.png");
  });

  it("a PRIMEIRA pasta é o tenant — é nela que a policy do Storage casa", () => {
    expect(caminhoLogoTenant("t1").split("/")[0]).toBe("t1");
  });

  it("apara espaços e devolve null sem tenant", () => {
    expect(caminhoLogoTenant("  t1 ")).toBe("t1/identidade/logo.png");
    expect(caminhoLogoTenant("")).toBe(null);
    expect(caminhoLogoTenant(null)).toBe(null);
    expect(caminhoLogoTenant(undefined)).toBe(null);
  });
});

describe("limparNomeExibicao / nomeExibicaoValido", () => {
  it("apara as pontas e tolera nulo", () => {
    expect(limparNomeExibicao("  Bar do Zé  ")).toBe("Bar do Zé");
    expect(limparNomeExibicao("   ")).toBe("");
    expect(limparNomeExibicao(null)).toBe("");
    expect(limparNomeExibicao(undefined)).toBe("");
  });

  it("aceita até o limite e recusa acima — o mesmo teto que a RPC valida", () => {
    expect(nomeExibicaoValido("a".repeat(MAX_NOME_EXIBICAO))).toBe(true);
    expect(nomeExibicaoValido("a".repeat(MAX_NOME_EXIBICAO + 1))).toBe(false);
  });

  it("vazio é válido — significa 'usar o nome cadastrado', não erro", () => {
    expect(nomeExibicaoValido("")).toBe(true);
    expect(nomeExibicaoValido("   ")).toBe(true);
  });

  it("conta o nome já aparado — espaço nas pontas não estoura o limite", () => {
    expect(nomeExibicaoValido(`   ${"a".repeat(MAX_NOME_EXIBICAO)}   `)).toBe(true);
  });
});

describe("identidadeMudou", () => {
  const salvo = { nome: "Bar do Zé", logoUrl: "https://cdn/x.png" };

  it("falso quando nada mudou", () => {
    expect(identidadeMudou(salvo, { ...salvo })).toBe(false);
  });

  it("espaço nas pontas NÃO conta como mudança (o que vai ao banco é o trim)", () => {
    expect(identidadeMudou(salvo, { nome: "  Bar do Zé  ", logoUrl: salvo.logoUrl })).toBe(false);
  });

  it("verdadeiro ao mudar o nome ou o logo", () => {
    expect(identidadeMudou(salvo, { nome: "Bar do Ze", logoUrl: salvo.logoUrl })).toBe(true);
    expect(identidadeMudou(salvo, { nome: salvo.nome, logoUrl: "https://cdn/y.png" })).toBe(true);
  });

  it("remover o logo conta como mudança", () => {
    expect(identidadeMudou(salvo, { nome: salvo.nome, logoUrl: "" })).toBe(true);
  });

  it("nulo e vazio são a mesma coisa — não inventa mudança no bootstrap", () => {
    expect(identidadeMudou({ nome: "", logoUrl: "" }, { nome: null, logoUrl: undefined })).toBe(false);
  });
});

describe("enviarLogoTenant — guardas antes de gastar rede", () => {
  it("recusa arquivo que não é imagem, sem chamar o Storage", async () => {
    const { url, error } = await enviarLogoTenant({
      file: { type: "application/pdf", size: 10 },
      tenantId: "t1",
    });

    expect(url).toBe(null);
    expect(error.message).toMatch(/imagem/i);
    expect(upload).not.toHaveBeenCalled();
  });

  it("recusa imagem acima de 8 MB com o motivo em português", async () => {
    const { url, error } = await enviarLogoTenant({
      file: { type: "image/png", size: 9 * 1024 * 1024 },
      tenantId: "t1",
    });

    expect(url).toBe(null);
    expect(error.message).toMatch(/muito grande/i);
    expect(upload).not.toHaveBeenCalled();
  });

  it("sem tenant não tenta subir — não haveria caminho isolado", async () => {
    const { url, error } = await enviarLogoTenant({ file: { type: "image/png", size: 10 }, tenantId: "" });

    expect(url).toBe(null);
    expect(error.message).toMatch(/estabelecimento/i);
    expect(upload).not.toHaveBeenCalled();
  });

  it("sem arquivo devolve erro em vez de estourar", async () => {
    const { error } = await enviarLogoTenant({ file: null, tenantId: "t1" });
    expect(error).toBeInstanceOf(Error);
  });

  it("fora do navegador (sem <canvas>) vira erro tratado, não exceção", async () => {
    // Ambiente node: comprimirLogo rejeita, e o erro precisa voltar
    // como { url, error } — a tela mostra a mensagem e segue viva.
    const { url, error } = await enviarLogoTenant({
      file: { type: "image/png", size: 100 },
      tenantId: "t1",
    });

    expect(url).toBe(null);
    expect(error).toBeInstanceOf(Error);
    expect(upload).not.toHaveBeenCalled();
  });
});

describe("salvarIdentidadeTenant — contrato da RPC", () => {
  it("chama a RPC pelo nome, com o nome aparado", async () => {
    await salvarIdentidadeTenant({ nomeExibicao: "  Bar do Zé  ", logoUrl: "https://cdn/x.png" });

    expect(rpc).toHaveBeenCalledWith("atualizar_identidade_tenant", {
      p_nome_exibicao: "Bar do Zé",
      p_logo_url: "https://cdn/x.png",
    });
  });

  it("NÃO manda id de tenant — o alvo é sempre quem está logado", async () => {
    await salvarIdentidadeTenant({ nomeExibicao: "X", logoUrl: "" });

    const [, args] = rpc.mock.calls[0];
    expect(Object.keys(args)).toEqual(["p_nome_exibicao", "p_logo_url"]);
  });

  it("string vazia significa REMOVER a chave; null significa não mexer", async () => {
    await salvarIdentidadeTenant({ nomeExibicao: "Bar", logoUrl: "" });
    expect(rpc.mock.calls[0][1].p_logo_url).toBe("");

    await salvarIdentidadeTenant({ nomeExibicao: "Bar" });
    expect(rpc.mock.calls[1][1].p_logo_url).toBe(null);
  });

  it("recusa nome longo demais no cliente, sem ida ao servidor", async () => {
    const { data, error } = await salvarIdentidadeTenant({
      nomeExibicao: "a".repeat(MAX_NOME_EXIBICAO + 1),
    });

    expect(data).toBe(null);
    expect(error.message).toMatch(new RegExp(String(MAX_NOME_EXIBICAO)));
    expect(rpc).not.toHaveBeenCalled();
  });

  it("erro do servidor volta em { error }, sem lançar", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "permissão negada" } });

    const { data, error } = await salvarIdentidadeTenant({ nomeExibicao: "Bar" });

    expect(data).toBe(null);
    expect(error.message).toBe("permissão negada");
  });

  it("exceção de rede também vira { error }", async () => {
    rpc.mockRejectedValue(new Error("Failed to fetch"));

    const { data, error } = await salvarIdentidadeTenant({ nomeExibicao: "Bar" });

    expect(data).toBe(null);
    expect(error.message).toBe("Failed to fetch");
  });

  it("desembrulha a linha quando a RPC devolve array", async () => {
    rpc.mockResolvedValue({ data: [{ id: "t1", tema: { nome_exibicao: "Bar" } }], error: null });

    const { data } = await salvarIdentidadeTenant({ nomeExibicao: "Bar" });

    expect(data.tema.nome_exibicao).toBe("Bar");
  });
});

describe("constantes", () => {
  it("o logo cabe no cabeçalho — lado máximo pequeno de propósito", () => {
    expect(MAX_LADO_LOGO).toBe(512);
  });
});
