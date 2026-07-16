import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ supabase: {} }));

import { planejarImportacaoClientes, paraPayloadCliente } from "./clientes";

const itemPlanilha = (extra = {}) => ({
  linha: 2,
  nome: "Ana Souza",
  telefone: "51999990001",
  endereco: "Rua A, 1",
  observacoes: null,
  ...extra,
});

describe("planejarImportacaoClientes (idempotência por telefone no tenant)", () => {
  it("sem existentes: tudo vai pra criar", () => {
    const plano = planejarImportacaoClientes([itemPlanilha()], []);
    expect(plano.criar).toHaveLength(1);
    expect(plano.atualizar).toEqual([]);
  });

  it("casa por telefone normalizado mesmo com máscara diferente no banco", () => {
    const existente = { id: "c1", nome: "Ana", telefone: "(51) 99999-0001", endereco: null, observacoes: null };
    const plano = planejarImportacaoClientes([itemPlanilha()], [existente]);
    expect(plano.criar).toEqual([]);
    expect(plano.atualizar).toEqual([
      { id: "c1", nome: "Ana Souza", changes: { nome: "Ana Souza", endereco: "Rua A, 1" } },
    ]);
  });

  it("linha idêntica ao banco cai em iguais (rodar 2x não duplica nem regrava)", () => {
    const existente = { id: "c1", nome: "Ana Souza", telefone: "51999990001", endereco: "Rua A, 1", observacoes: null };
    const plano = planejarImportacaoClientes([itemPlanilha()], [existente]);
    expect(plano.criar).toEqual([]);
    expect(plano.atualizar).toEqual([]);
    expect(plano.iguais).toHaveLength(1);
  });

  it("campo vazio na planilha não apaga o que já existe no banco", () => {
    const existente = { id: "c1", nome: "Ana Souza", telefone: "51999990001", endereco: "Rua A, 1", observacoes: "Boa pagadora" };
    const plano = planejarImportacaoClientes([itemPlanilha({ endereco: null, observacoes: null })], [existente]);
    expect(plano.atualizar).toEqual([]);
    expect(plano.iguais).toHaveLength(1);
  });

  it("existente sem telefone nunca casa (não tem chave) — planilha cria novo", () => {
    const existente = { id: "c1", nome: "Ana Souza", telefone: null, endereco: null, observacoes: null };
    const plano = planejarImportacaoClientes([itemPlanilha()], [existente]);
    expect(plano.criar).toHaveLength(1);
  });
});

describe("paraPayloadCliente", () => {
  it("mapeia pro shape da tabela clientes — sem tenant_id (vem do JWT)", () => {
    expect(paraPayloadCliente(itemPlanilha(), "matheus")).toEqual({
      nome: "Ana Souza",
      telefone: "51999990001",
      endereco: "Rua A, 1",
      observacoes: null,
      criado_por: "matheus",
    });
  });
});
