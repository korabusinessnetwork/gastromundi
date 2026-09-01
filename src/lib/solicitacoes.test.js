import { describe, it, expect, vi, beforeEach } from "vitest";

// solicitacoes.js importa ./supabase (que exige VITE_* já no import).
// Mesmo padrão de leads.test.js: mockamos o módulo inteiro.
vi.mock("./supabase", async () => {
  const { createMockSupabase } = await import("@/test/mockSupabase");
  return { supabase: createMockSupabase() };
});

import { supabase } from "./supabase";
import { validarSolicitacao, registrarSolicitacaoConta } from "./solicitacoes";

const VALIDO = {
  nome: "Maria Silva",
  whatsapp: "(11) 98888-7777",
  email: "maria@bardamaria.com.br",
  estabelecimento: "Bar da Maria",
  endereco: "bardamaria",
};

describe("validarSolicitacao", () => {
  it("aceita o cadastro completo e bem preenchido", () => {
    expect(validarSolicitacao(VALIDO)).toEqual({ valido: true, erros: {} });
  });

  it("acusa os campos errados DE UMA VEZ, não um por vez", () => {
    const { valido, erros } = validarSolicitacao({
      nome: "M",
      whatsapp: "119",
      email: "maria@",
      estabelecimento: "",
      endereco: "",
    });
    expect(valido).toBe(false);
    expect(Object.keys(erros).sort()).toEqual([
      "email", "estabelecimento", "nome", "whatsapp",
    ]);
  });

  it("não repete a bronca no endereço quando o problema é o nome do negócio", () => {
    // O endereço nasce do nome; sem nome não há endereço, e dois erros para
    // a mesma causa fazem a pessoa procurar um problema que não existe.
    const { erros } = validarSolicitacao({ ...VALIDO, estabelecimento: "", endereco: "" });
    expect(erros.estabelecimento).toBeTruthy();
    expect(erros.endereco).toBeUndefined();
  });

  it("recusa endereço reservado do sistema antes de gastar uma ida ao banco", () => {
    const { valido, erros } = validarSolicitacao({ ...VALIDO, endereco: "console" });
    expect(valido).toBe(false);
    expect(erros.endereco).toMatch(/reservado/i);
  });

  it("normaliza o endereço como o banco faria antes de julgar o tamanho", () => {
    // "Bar do Zé" vira "bardoze": acento e espaço somem, então o endereço
    // é válido mesmo tendo sido digitado com eles.
    expect(validarSolicitacao({ ...VALIDO, endereco: "Bar do Zé" }).valido).toBe(true);
    // Só símbolos não sobra nada — e aí o endereço é o campo culpado.
    const { erros } = validarSolicitacao({ ...VALIDO, endereco: "!!!" });
    expect(erros.endereco).toBeTruthy();
  });

  it("não quebra com campos ausentes", () => {
    expect(validarSolicitacao({}).valido).toBe(false);
    expect(validarSolicitacao(undefined).valido).toBe(false);
  });
});

describe("registrarSolicitacaoConta", () => {
  beforeEach(() => {
    supabase.rpc.mockClear();
    supabase.setRpcResult("registrar_solicitacao_conta", {
      data: { ok: true, endereco: "bardamaria" },
      error: null,
    });
  });

  it("normaliza os dados antes de mandar para o banco", async () => {
    const r = await registrarSolicitacaoConta({
      ...VALIDO,
      nome: "  Maria Silva  ",
      email: "  MARIA@Bar.com.BR ",
      endereco: "Bar da Maria",
      plano: { codigo: "restaurante", nome: "Restaurante", total: 427, itens: ["Estoque"] },
    });

    expect(r.ok).toBe(true);
    expect(supabase.rpc).toHaveBeenCalledWith("registrar_solicitacao_conta", {
      p_nome: "Maria Silva",
      p_whatsapp: "11988887777",
      p_email: "maria@bar.com.br",
      p_estabelecimento: "Bar da Maria",
      p_slug: "bardamaria",
      p_plano_codigo: "restaurante",
      p_plano_nome: "Restaurante",
      p_total: 427,
      p_itens: ["Estoque"],
    });
  });

  it("aceita cadastro sem plano escolhido — decidir depois é uma resposta", async () => {
    await registrarSolicitacaoConta({ ...VALIDO, plano: null });
    const args = supabase.rpc.mock.calls[0][1];
    expect(args.p_plano_codigo).toBeNull();
    expect(args.p_total).toBeNull();
  });

  it("devolve o endereço EFETIVO que o banco gravou", async () => {
    supabase.setRpcResult("registrar_solicitacao_conta", {
      data: { ok: true, endereco: "bardamaria" },
      error: null,
    });
    const r = await registrarSolicitacaoConta({ ...VALIDO, endereco: "Bar da Maria" });
    expect(r.endereco).toBe("bardamaria");
  });

  it("nem chama o banco quando os dados são inválidos", async () => {
    const r = await registrarSolicitacaoConta({ ...VALIDO, email: "maria@" });
    expect(r.ok).toBe(false);
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("endereço em uso volta colado no campo, com a sugestão livre do banco", async () => {
    supabase.setRpcResult("registrar_solicitacao_conta", {
      data: { ok: false, erro: "endereco_em_uso", sugestao: "bardamaria2" },
      error: null,
    });
    const r = await registrarSolicitacaoConta(VALIDO);
    expect(r.ok).toBe(false);
    expect(r.campo).toBe("endereco");
    expect(r.sugestao).toBe("bardamaria2");
    expect(r.erro).toMatch(/bardamaria2/);
  });

  it("endereço em uso sem sugestão ainda diz o que fazer", async () => {
    supabase.setRpcResult("registrar_solicitacao_conta", {
      data: { ok: false, erro: "endereco_em_uso" },
      error: null,
    });
    const r = await registrarSolicitacaoConta(VALIDO);
    expect(r.campo).toBe("endereco");
    expect(r.erro).toMatch(/escolha outro/i);
  });

  it("traduz a recusa do freio de abuso em mensagem para gente", async () => {
    supabase.setRpcResult("registrar_solicitacao_conta", {
      data: { ok: false, erro: "muitas_tentativas" },
      error: null,
    });
    const r = await registrarSolicitacaoConta(VALIDO);
    expect(r.erro).toMatch(/aguarde alguns minutos/i);
  });

  it("devolve erro tratável quando o Supabase falha", async () => {
    supabase.setRpcError("registrar_solicitacao_conta", { message: "boom" });
    const r = await registrarSolicitacaoConta(VALIDO);
    expect(r).toEqual({ ok: false, erro: expect.stringMatching(/tente de novo/i) });
  });

  it("não deixa exceção de rede vazar para a tela", async () => {
    supabase.rpc.mockImplementationOnce(() => {
      throw new Error("network");
    });
    const r = await registrarSolicitacaoConta(VALIDO);
    expect(r.ok).toBe(false);
    expect(r.erro).toBeTruthy();
  });
});
