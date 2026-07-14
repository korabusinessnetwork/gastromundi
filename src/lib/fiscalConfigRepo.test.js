import { describe, it, expect, beforeEach, vi } from "vitest";

// Builder encadeável falso: select/upsert registram os argumentos e devolvem
// o builder; `maybeSingle` é o terminal e resolve a resposta configurada.
const h = vi.hoisted(() => {
  const state = { selectArgs: [], upsertArgs: null, resposta: { data: {}, error: null } };
  const criar = () => {
    const b = {};
    b.select = (...a) => { state.selectArgs.push(a); return b; };
    b.upsert = (...a) => { state.upsertArgs = a; return b; };
    b.maybeSingle = () => Promise.resolve(state.resposta);
    return b;
  };
  return {
    fromMock: vi.fn(() => criar()),
    state,
    reset: () => { state.selectArgs = []; state.upsertArgs = null; state.resposta = { data: {}, error: null }; },
  };
});

vi.mock("./supabase", () => ({ supabase: { from: h.fromMock } }));

import { buscarConfigFiscal, salvarConfigFiscal } from "./fiscalConfigRepo";

beforeEach(() => {
  vi.clearAllMocks();
  h.reset();
});

describe("buscarConfigFiscal (Leva 13)", () => {
  it("seleciona colunas explícitas (sem select *) da tabela do tenant", async () => {
    h.state.resposta = { data: { cnpj: "11222333000181", ambiente: 2 }, error: null };
    const { data, error } = await buscarConfigFiscal();

    expect(h.fromMock).toHaveBeenCalledWith("tenant_fiscal_config");
    const colunas = h.state.selectArgs[0][0];
    expect(typeof colunas).toBe("string");
    expect(colunas).not.toContain("*");
    expect(colunas).toContain("cnpj");
    expect(data).toEqual({ cnpj: "11222333000181", ambiente: 2 });
    expect(error).toBeNull();
  });

  it("tenant sem config ainda → data null, sem erro", async () => {
    h.state.resposta = { data: null, error: null };
    const { data, error } = await buscarConfigFiscal();
    expect(data).toBeNull();
    expect(error).toBeNull();
  });

  it("erro do supabase vira { data: null, error } sem lançar", async () => {
    h.state.resposta = { data: null, error: new Error("boom") };
    const { data, error } = await buscarConfigFiscal();
    expect(data).toBeNull();
    expect(error).toBeInstanceOf(Error);
  });
});

describe("salvarConfigFiscal — allow-list e fronteira de segredo (Leva 13)", () => {
  it("upsert grava só as colunas do allow-list e usa onConflict tenant_id", async () => {
    await salvarConfigFiscal({ cnpj: "11222333000181", ambiente: 1, serie: 2, ativo: true });

    const [payload, opts] = h.state.upsertArgs;
    expect(payload.cnpj).toBe("11222333000181");
    expect(payload.ambiente).toBe(1);
    expect(payload.serie).toBe(2);
    expect(payload.ativo).toBe(true);
    expect(opts).toEqual({ onConflict: "tenant_id" });
  });

  it("DESCARTA qualquer chave secreta ou fora do allow-list (certificado/CSC-valor/tenant_id)", async () => {
    await salvarConfigFiscal({
      cnpj: "11222333000181",
      // Nada disto pode chegar ao banco:
      certificado: "BASE64PFX",
      senha_certificado: "segredo",
      pfx: "xxx",
      csc_valor: "TOKEN-SECRETO",
      csc: "TOKEN-SECRETO",
      tenant_id: "outro-tenant",
      created_at: "2020-01-01",
    });

    const [payload] = h.state.upsertArgs;
    expect(payload).not.toHaveProperty("certificado");
    expect(payload).not.toHaveProperty("senha_certificado");
    expect(payload).not.toHaveProperty("pfx");
    expect(payload).not.toHaveProperty("csc_valor");
    expect(payload).not.toHaveProperty("csc");
    expect(payload).not.toHaveProperty("tenant_id");
    expect(payload).not.toHaveProperty("created_at");
    // Só o campo legítimo passou (+ updated_at gerido pelo repo).
    expect(payload.cnpj).toBe("11222333000181");
    expect(payload).toHaveProperty("updated_at");
  });

  it("retorna a linha salva; nunca faz select *", async () => {
    h.state.resposta = { data: { cnpj: "11222333000181", ambiente: 1 }, error: null };
    const { data, error } = await salvarConfigFiscal({ cnpj: "11222333000181" });
    expect(data).toEqual({ cnpj: "11222333000181", ambiente: 1 });
    expect(error).toBeNull();
    expect(h.state.selectArgs[0][0]).not.toContain("*");
  });

  it("erro do supabase vira { data: null, error } sem lançar", async () => {
    h.state.resposta = { data: null, error: new Error("falhou") };
    const { data, error } = await salvarConfigFiscal({ cnpj: "11222333000181" });
    expect(data).toBeNull();
    expect(error).toBeInstanceOf(Error);
  });
});
