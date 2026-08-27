import { describe, it, expect, vi, beforeEach } from "vitest";

// leads.js importa ./supabase (que exige VITE_* já no import). Mesmo
// padrão de console.test.js: mockamos o módulo inteiro.
vi.mock("./supabase", async () => {
  const { createMockSupabase } = await import("@/test/mockSupabase");
  return { supabase: createMockSupabase() };
});

import { supabase } from "./supabase";
import { validarLead, registrarLeadApex } from "./leads";

const VALIDO = {
  nome: "Maria Silva",
  whatsapp: "(11) 98888-7777",
  email: "maria@bardamaria.com.br",
};

describe("validarLead", () => {
  it("aceita nome, WhatsApp com DDD e e-mail bem formado", () => {
    expect(validarLead(VALIDO)).toEqual({ valido: true, erros: {} });
  });

  it("acusa os campos errados DE UMA VEZ, não um por vez", () => {
    const { valido, erros } = validarLead({ nome: "M", whatsapp: "119", email: "maria@" });
    expect(valido).toBe(false);
    expect(Object.keys(erros).sort()).toEqual(["email", "nome", "whatsapp"]);
  });

  it("aceita telefone fixo (10 dígitos) e celular (11)", () => {
    expect(validarLead({ ...VALIDO, whatsapp: "(11) 3333-4444" }).valido).toBe(true);
    expect(validarLead({ ...VALIDO, whatsapp: "(11) 93333-4444" }).valido).toBe(true);
  });

  it("recusa telefone curto demais ou longo demais", () => {
    expect(validarLead({ ...VALIDO, whatsapp: "(11) 333-444" }).valido).toBe(false);
    expect(validarLead({ ...VALIDO, whatsapp: "11933334444555" }).valido).toBe(false);
  });

  it("recusa e-mail sem domínio completo", () => {
    for (const email of ["maria", "maria@casa", "maria@casa.", "@casa.com.br"]) {
      expect(validarLead({ ...VALIDO, email }).valido, email).toBe(false);
    }
  });

  it("não trava com e-mail longo e ainda incompleto (regex linear)", () => {
    const inicio = Date.now();
    validarLead({ ...VALIDO, email: "a".repeat(40) + "@" + "b".repeat(40) });
    expect(Date.now() - inicio).toBeLessThan(200);
  });

  it("não quebra com campos ausentes", () => {
    expect(validarLead({}).valido).toBe(false);
    expect(validarLead(undefined).valido).toBe(false);
  });
});

describe("registrarLeadApex", () => {
  beforeEach(() => {
    supabase.rpc.mockClear();
    supabase.setRpcResult("registrar_lead_apex", { data: { ok: true }, error: null });
  });

  it("normaliza os dados antes de mandar para o banco", async () => {
    const r = await registrarLeadApex({
      nome: "  Maria Silva  ",
      whatsapp: "(11) 98888-7777",
      email: "  MARIA@Bar.com.BR ",
      total: 349,
      itens: ["Estoque", "Cozinha (KDS)"],
    });

    expect(r).toEqual({ ok: true, erro: null });
    expect(supabase.rpc).toHaveBeenCalledWith("registrar_lead_apex", {
      p_nome: "Maria Silva",
      p_whatsapp: "11988887777",
      p_email: "maria@bar.com.br",
      p_total: 349,
      p_itens: ["Estoque", "Cozinha (KDS)"],
    });
  });

  it("nem chama o banco quando os dados são inválidos", async () => {
    const r = await registrarLeadApex({ ...VALIDO, email: "maria@" });
    expect(r.ok).toBe(false);
    expect(r.erro).toBeTruthy();
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("manda total nulo quando não é número", async () => {
    await registrarLeadApex({ ...VALIDO, total: undefined });
    expect(supabase.rpc.mock.calls[0][1].p_total).toBeNull();
  });

  it("traduz a recusa do freio de abuso em mensagem para gente", async () => {
    supabase.setRpcResult("registrar_lead_apex", {
      data: { ok: false, erro: "muitas_tentativas" },
      error: null,
    });
    const r = await registrarLeadApex(VALIDO);
    expect(r.ok).toBe(false);
    expect(r.erro).toMatch(/aguarde alguns minutos/i);
  });

  it("devolve erro tratável quando o Supabase falha", async () => {
    supabase.setRpcError("registrar_lead_apex", { message: "boom" });
    const r = await registrarLeadApex(VALIDO);
    expect(r).toEqual({ ok: false, erro: expect.stringMatching(/tente de novo/i) });
  });

  it("não deixa exceção de rede vazar para a tela", async () => {
    supabase.rpc.mockImplementationOnce(() => {
      throw new Error("network");
    });
    const r = await registrarLeadApex(VALIDO);
    expect(r.ok).toBe(false);
    expect(r.erro).toBeTruthy();
  });
});
