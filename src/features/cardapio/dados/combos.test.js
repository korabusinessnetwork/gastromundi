import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockSupabase } = vi.hoisted(() => ({ mockSupabase: { current: null } }));
vi.mock("@/lib/supabase", async () => {
  const { createMockSupabase } = await import("@/test/mockSupabase");
  mockSupabase.current = createMockSupabase();
  return { supabase: mockSupabase.current };
});

import { argumentosSalvarCombo, precoCustomizado, mensagemDeRecusa, salvarCombo } from "./combos";

const MODAL = {
  comboId: null,
  nome: "  Combo Família  ",
  principal: { id: "7" },
  modo: "combo",
  precoTotal: 52.5,
  itens: [{ subproduto: { id: "sub-1" }, quantidade: 2, usarCustom: false, precoCustom: "" }],
  itensProd: [{ produto: { id: "9" }, quantidade: 1, usarCustom: true, precoCustom: "8,50" }],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockSupabase.current?.reset?.();
});

describe("precoCustomizado", () => {
  it("sem preço customizado, vale o de catálogo", () => {
    expect(precoCustomizado({ usarCustom: false, precoCustom: "9" })).toBeNull();
  });

  it("aceita vírgula decimal", () => {
    expect(precoCustomizado({ usarCustom: true, precoCustom: "8,50" })).toBe(8.5);
  });

  it("zero e texto inválido voltam ao preço de catálogo, como a tela sempre gravou", () => {
    expect(precoCustomizado({ usarCustom: true, precoCustom: "0" })).toBeNull();
    expect(precoCustomizado({ usarCustom: true, precoCustom: "abc" })).toBeNull();
  });
});

describe("argumentosSalvarCombo", () => {
  it("monta exatamente os argumentos da RPC", () => {
    expect(argumentosSalvarCombo(MODAL)).toEqual({
      p_combo_id: null,
      p_nome: "Combo Família",
      p_item_principal_id: 7,
      p_modo: "combo",
      p_preco_total: 52.5,
      p_subprodutos: [{ subproduto_id: "sub-1", quantidade: 2, preco_customizado: null }],
      p_produtos: [{ produto_id: 9, quantidade: 1, preco_customizado: 8.5 }],
    });
  });

  it("na edição leva o id do combo", () => {
    expect(argumentosSalvarCombo({ ...MODAL, comboId: "c-1" }).p_combo_id).toBe("c-1");
  });
});

describe("mensagemDeRecusa", () => {
  it("recusa da RLS vira frase que diz o que fazer", () => {
    expect(mensagemDeRecusa({ code: "42501", message: "new row violates row-level security policy" }))
      .toMatch(/peça a um gerente/i);
  });

  it("recusa da própria função passa como veio", () => {
    expect(mensagemDeRecusa({ code: "P0001", message: "Informe o nome do combo." })).toBe("Informe o nome do combo.");
  });

  it("erro sem mensagem ainda diz alguma coisa", () => {
    expect(mensagemDeRecusa({})).toMatch(/não deu para salvar o combo/i);
  });
});

describe("salvarCombo", () => {
  it("chama a RPC uma vez e devolve o id", async () => {
    mockSupabase.current.setRpcResult("salvar_combo", { data: "c-9", error: null });
    await expect(salvarCombo(MODAL)).resolves.toBe("c-9");
    expect(mockSupabase.current.calls.filter((c) => c.rpc === "salvar_combo")).toHaveLength(1);
  });

  it("recusa vira exceção com a frase da tela", async () => {
    mockSupabase.current.setRpcError("salvar_combo", { code: "42501", message: "rls" });
    await expect(salvarCombo(MODAL)).rejects.toThrow(/peça a um gerente/i);
  });
});
