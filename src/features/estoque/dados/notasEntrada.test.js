import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockSupabase } = vi.hoisted(() => ({ mockSupabase: { current: null } }));
vi.mock("@/lib/supabase", async () => {
  const { createMockSupabase } = await import("@/test/mockSupabase");
  mockSupabase.current = createMockSupabase();
  return { supabase: mockSupabase.current };
});

import { argumentosImportarNota, mensagemDeRecusaNota, importarNotaFiscal } from "./notasEntrada";

const CABECALHO = {
  chaveAcesso: "3526", numero: "10", serie: "1", dataEmissao: "2026-11-20",
  fornecedorNome: "Distribuidora", fornecedorCnpj: "00", valorTotal: 50,
};
const ITENS = [
  { produto: { id: 1 }, descricaoXml: "FARINHA", codigoXml: "F1", unidadeXml: "UN",
    quantidade: 1, precoUnitario: 20, precoTotal: 20, fator: 2, qtdEstoque: 2 },
  { produto: null, descricaoXml: "SACOLA", codigoXml: "S1", unidadeXml: "UN",
    quantidade: 1, precoUnitario: 1, precoTotal: 1, fator: 1, qtdEstoque: 1 },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockSupabase.current?.reset?.();
});

describe("argumentosImportarNota", () => {
  it("monta a nota e os itens; item sem vínculo não leva fator nem quantidade de estoque", () => {
    const args = argumentosImportarNota({ cabecalho: CABECALHO, xmlString: "<xml/>", itens: ITENS, dataEntrada: "2026-11-23" });
    expect(args.p_nota).toEqual({
      chave_acesso: "3526", numero: "10", serie: "1", data_emissao: "2026-11-20",
      fornecedor_nome: "Distribuidora", fornecedor_cnpj: "00", valor_total: 50,
      xml_raw: "<xml/>", data_entrada: "2026-11-20",
    });
    expect(args.p_itens[0]).toMatchObject({ product_id: 1, fator_conversao: 2, quantidade_estoque: 2 });
    expect(args.p_itens[1]).toMatchObject({ product_id: null, fator_conversao: null, quantidade_estoque: null });
  });

  it("sem data de emissão, a entrada usa o hoje do restaurante", () => {
    const args = argumentosImportarNota({
      cabecalho: { ...CABECALHO, dataEmissao: "", chaveAcesso: "" }, xmlString: "", itens: [], dataEntrada: "2026-11-23",
    });
    expect(args.p_nota.data_emissao).toBeNull();
    expect(args.p_nota.chave_acesso).toBeNull();
    expect(args.p_nota.data_entrada).toBe("2026-11-23");
  });
});

describe("mensagemDeRecusaNota", () => {
  it("chave duplicada diz que a nota já foi importada", () => {
    expect(mensagemDeRecusaNota({ code: "23505" })).toMatch(/já foi importada/);
  });

  it("recusa da RLS diz o que fazer", () => {
    expect(mensagemDeRecusaNota({ code: "42501" })).toMatch(/peça a um gerente/i);
  });

  it("recusa da própria função passa como veio", () => {
    const frase = "Há produto vinculado com quantidade 0 para o estoque. Confira o fator de conversão.";
    expect(mensagemDeRecusaNota({ code: "P0001", message: frase })).toBe(frase);
  });
});

describe("importarNotaFiscal", () => {
  it("chama a RPC uma vez e devolve a nota e os saldos confirmados", async () => {
    mockSupabase.current.setRpcResult("importar_nota_fiscal", {
      data: [{ nota_id: "nf1", produto_id: 1, quantidade: "12", minimo: "5" }],
      error: null,
    });
    const r = await importarNotaFiscal({ cabecalho: CABECALHO, xmlString: "", itens: ITENS, dataEntrada: "2026-11-23" });
    expect(r).toEqual({ notaId: "nf1", saldos: [{ produtoId: 1, quantidade: 12, minimo: 5 }] });
    expect(mockSupabase.current.calls.filter((c) => c.rpc === "importar_nota_fiscal")).toHaveLength(1);
  });

  it("nota sem item vinculado devolve a nota e nenhum saldo", async () => {
    mockSupabase.current.setRpcResult("importar_nota_fiscal", {
      data: [{ nota_id: "nf2", produto_id: null, quantidade: null, minimo: null }],
      error: null,
    });
    const r = await importarNotaFiscal({ cabecalho: CABECALHO, xmlString: "", itens: [ITENS[1]], dataEntrada: "2026-11-23" });
    expect(r).toEqual({ notaId: "nf2", saldos: [] });
  });

  it("recusa vira exceção com a frase da tela", async () => {
    mockSupabase.current.setRpcError("importar_nota_fiscal", { code: "23505", message: "duplicate key" });
    await expect(
      importarNotaFiscal({ cabecalho: CABECALHO, xmlString: "", itens: ITENS, dataEntrada: "2026-11-23" }),
    ).rejects.toThrow(/já foi importada/);
  });
});
