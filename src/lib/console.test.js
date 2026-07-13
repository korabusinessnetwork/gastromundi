import { describe, it, expect, vi } from "vitest";

// console.js importa ./supabase (que exige VITE_* no import). Como estes
// testes exercitam só as funções PURAS, mockamos o módulo para não
// disparar a checagem de env — mesmo padrão de assinatura.test.js.
vi.mock("./supabase", async () => {
  const { createMockSupabase } = await import("@/test/mockSupabase");
  return { supabase: createMockSupabase() };
});

import { normalizarUsername, validarNovoEstabelecimento } from "./console";

describe("normalizarUsername", () => {
  it("baixa a caixa e remove espaços", () => {
    expect(normalizarUsername("  João Silva ")).toBe("joaosilva");
  });

  it("remove acentos (login global é ASCII)", () => {
    expect(normalizarUsername("Ação")).toBe("acao");
    expect(normalizarUsername("münchen")).toBe("munchen");
  });

  it("mantém ponto, hífen e sublinhado, descarta o resto", () => {
    expect(normalizarUsername("bar.do_zé-01!@#")).toBe("bar.do_ze-01");
  });

  it("é idempotente — normalizar duas vezes dá o mesmo resultado", () => {
    const uma = normalizarUsername("Café Central 42");
    expect(normalizarUsername(uma)).toBe(uma);
  });

  it("trata nulo/indefinido como string vazia", () => {
    expect(normalizarUsername(null)).toBe("");
    expect(normalizarUsername(undefined)).toBe("");
  });
});

describe("validarNovoEstabelecimento", () => {
  const valido = {
    nome: "Restaurante do Sul",
    planoCodigo: "avancado",
    adminNome: "Maria",
    adminUsername: "maria",
    adminPassword: "senha123",
  };

  it("aprova um formulário completo e válido", () => {
    const { ok, erros } = validarNovoEstabelecimento(valido);
    expect(ok).toBe(true);
    expect(erros).toEqual({});
  });

  it("exige o nome do estabelecimento", () => {
    const { ok, erros } = validarNovoEstabelecimento({ ...valido, nome: "   " });
    expect(ok).toBe(false);
    expect(erros.nome).toBeTruthy();
  });

  it("exige um plano", () => {
    const { erros } = validarNovoEstabelecimento({ ...valido, planoCodigo: "" });
    expect(erros.planoCodigo).toBeTruthy();
  });

  it("exige o nome do responsável", () => {
    const { erros } = validarNovoEstabelecimento({ ...valido, adminNome: "" });
    expect(erros.adminNome).toBeTruthy();
  });

  it("rejeita username que vira vazio após normalizar", () => {
    const { erros } = validarNovoEstabelecimento({ ...valido, adminUsername: "!!!" });
    expect(erros.adminUsername).toBeTruthy();
  });

  it("rejeita username curto demais (< 3 após normalizar)", () => {
    const { erros } = validarNovoEstabelecimento({ ...valido, adminUsername: "ab" });
    expect(erros.adminUsername).toBeTruthy();
  });

  it("rejeita senha com menos de 6 caracteres", () => {
    const { erros } = validarNovoEstabelecimento({ ...valido, adminPassword: "123" });
    expect(erros.adminPassword).toBeTruthy();
  });

  it("acumula múltiplos erros de uma vez", () => {
    const { ok, erros } = validarNovoEstabelecimento({});
    expect(ok).toBe(false);
    expect(Object.keys(erros).sort()).toEqual(
      ["adminNome", "adminPassword", "adminUsername", "nome", "planoCodigo"].sort()
    );
  });
});
