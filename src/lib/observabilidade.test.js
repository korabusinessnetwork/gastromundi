import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock do SDK do Sentry: não queremos rede nem estado global real nos testes.
// Cada função é um spy para checarmos o que foi (ou não) enviado.
const captureException = vi.fn();
const captureMessage = vi.fn();
const setTag = vi.fn();
const setContext = vi.fn();
const setLevel = vi.fn();
const withScope = vi.fn((cb) => cb({ setTag, setContext, setLevel }));

vi.mock("@sentry/react", () => ({
  captureException: (...a) => captureException(...a),
  captureMessage: (...a) => captureMessage(...a),
  withScope: (...a) => withScope(...a),
  init: vi.fn(),
}));

import {
  scrubDeep,
  scrubLGPD,
  CHAVES_PROIBIDAS,
  reportarFalha,
  reportarInconsistencia,
  setTenantObservabilidade,
  tenantAtualObservabilidade,
} from "./observabilidade";

beforeEach(() => {
  vi.clearAllMocks();
  setTenantObservabilidade(null);
});

describe("scrubDeep", () => {
  it("apaga chaves sensíveis em qualquer profundidade, preservando o resto", () => {
    const obj = {
      code: "23505",
      authorization: "Bearer xyz",
      nivel1: {
        telefone: "11999998888",
        rota: "addSale",
        nivel2: { senha: "abc", valor: 42, ok: true },
      },
    };
    scrubDeep(obj);
    expect(obj.authorization).toBeUndefined();
    expect(obj.nivel1.telefone).toBeUndefined();
    expect(obj.nivel1.nivel2.senha).toBeUndefined();
    expect(obj.nivel1.nivel2.valor).toBeUndefined();
    // Allowlist preservada:
    expect(obj.code).toBe("23505");
    expect(obj.nivel1.rota).toBe("addSale");
    expect(obj.nivel1.nivel2.ok).toBe(true);
  });

  it("varre arrays e não lança em ciclo (referência circular)", () => {
    const a = { token: "x", filhos: [{ cpf: "123" }, { nome_ok: 1 }] };
    a.self = a; // ciclo
    expect(() => scrubDeep(a)).not.toThrow();
    expect(a.token).toBeUndefined();
    expect(a.filhos[0].cpf).toBeUndefined();
    expect(a.filhos[1].nome_ok).toBe(1);
  });

  it("é pura para valores primitivos/null (não lança, devolve o alvo)", () => {
    expect(scrubDeep(null)).toBeNull();
    expect(scrubDeep(42)).toBe(42);
    expect(scrubDeep("texto")).toBe("texto");
  });

  it("o regex CHAVES_PROIBIDAS pega token, senha, cpf, telefone, valor, total, preço", () => {
    for (const chave of ["token", "senha", "password", "cpf", "cnpj", "telefone", "valor", "total", "preco", "authorization", "hash", "cookie"]) {
      expect(CHAVES_PROIBIDAS.test(chave)).toBe(true);
    }
    for (const chave of ["code", "acao", "tabela", "tenant_id", "id"]) {
      expect(CHAVES_PROIBIDAS.test(chave)).toBe(false);
    }
  });
});

describe("scrubLGPD", () => {
  it("remove cookies, identidade do usuário e chaves sensíveis; mantém code/tags úteis", () => {
    const evento = {
      request: { cookies: "sid=abc", headers: { authorization: "Bearer x" } },
      user: { id: "u1", email: "a@b.com" },
      extra: { telefone: "11999", operacao: "addSale" },
      contexts: { operacao: { valor: 10, code: "23505" } },
      tags: { tenant_id: "uuid-1" },
    };
    const saida = scrubLGPD(evento);
    expect(saida).not.toBeNull();
    expect(saida.request.cookies).toBeUndefined();
    expect(saida.request.headers.authorization).toBeUndefined();
    expect(saida.user).toBeUndefined();
    expect(saida.extra.telefone).toBeUndefined();
    expect(saida.extra.operacao).toBe("addSale");
    expect(saida.contexts.operacao.valor).toBeUndefined();
    expect(saida.contexts.operacao.code).toBe("23505");
    expect(saida.tags.tenant_id).toBe("uuid-1");
  });

  it("nunca lança e devolve null se algo der muito errado", () => {
    expect(scrubLGPD(undefined)).toBeNull();
    expect(scrubLGPD(null)).toBeNull();
  });
});

describe("registro de tenant", () => {
  it("só aceita string não-vazia (UUID); qualquer outra coisa vira null", () => {
    setTenantObservabilidade("uuid-abc");
    expect(tenantAtualObservabilidade()).toBe("uuid-abc");
    setTenantObservabilidade({ id: "x" });
    expect(tenantAtualObservabilidade()).toBeNull();
    setTenantObservabilidade("");
    expect(tenantAtualObservabilidade()).toBeNull();
  });
});

describe("reportarFalha", () => {
  it("NÃO reporta erro de rede (fluxo esperado offline-first)", () => {
    reportarFalha({ message: "Failed to fetch" }, { acao: "addSale" });
    expect(captureException).not.toHaveBeenCalled();
  });

  it("reporta erro não-rede com tag de tenant e contexto da operação", () => {
    setTenantObservabilidade("uuid-1");
    reportarFalha({ code: "23505", message: "duplicate key" }, { acao: "addSale", tabela: "sales" });
    expect(captureException).toHaveBeenCalledTimes(1);
    expect(setTag).toHaveBeenCalledWith("tenant_id", "uuid-1");
    expect(setContext).toHaveBeenCalledWith("operacao", { acao: "addSale", tabela: "sales" });
    // { error } do supabase-js vira Error com o code no name (agrupamento).
    const enviado = captureException.mock.calls[0][0];
    expect(enviado).toBeInstanceOf(Error);
    expect(enviado.name).toBe("SupabaseError(23505)");
  });

  it("usa 'desconhecido' quando não há tenant registrado", () => {
    reportarFalha({ message: "boom" }, {});
    expect(setTag).toHaveBeenCalledWith("tenant_id", "desconhecido");
  });

  it("é fire-and-forget: NUNCA lança mesmo se o SDK falhar", () => {
    withScope.mockImplementationOnce(() => { throw new Error("SDK caiu"); });
    expect(() => reportarFalha({ message: "boom" }, {})).not.toThrow();
  });
});

describe("reportarInconsistencia", () => {
  it("envia captureMessage em nível warning com tag de tenant", () => {
    setTenantObservabilidade("uuid-9");
    reportarInconsistencia("write afetou 0 linhas", { acao: "updateUser", id: "u1" });
    expect(captureMessage).toHaveBeenCalledWith("write afetou 0 linhas");
    expect(setLevel).toHaveBeenCalledWith("warning");
    expect(setTag).toHaveBeenCalledWith("tenant_id", "uuid-9");
  });

  it("é fire-and-forget: NUNCA lança mesmo se o SDK falhar", () => {
    withScope.mockImplementationOnce(() => { throw new Error("SDK caiu"); });
    expect(() => reportarInconsistencia("x", {})).not.toThrow();
  });
});
