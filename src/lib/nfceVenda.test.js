import { describe, it, expect } from "vitest";
import { montarVendaFiscal, tPagDoMetodo, destDoCliente } from "./nfceVenda";

describe("tPagDoMetodo", () => {
  it("mapeia os métodos comuns do PDV para o tPag da SEFAZ", () => {
    expect(tPagDoMetodo("dinheiro")).toBe("01");
    expect(tPagDoMetodo("credito")).toBe("03");
    expect(tPagDoMetodo("debito")).toBe("04");
    expect(tPagDoMetodo("pix")).toBe("17");
    expect(tPagDoMetodo("fiado")).toBe("05");
  });

  it("é insensível a caixa/espaço e cai em 99 (Outros) para desconhecido", () => {
    expect(tPagDoMetodo("  PIX ")).toBe("17");
    expect(tPagDoMetodo("cortesia")).toBe("99");
    expect(tPagDoMetodo(null)).toBe("99");
  });
});

describe("montarVendaFiscal — itens", () => {
  it("mapeia nome/qtd/preço e calcula vProd, ignorando cancelados", () => {
    const { itens } = montarVendaFiscal({
      items: [
        { name: "X-Salada", price: 15, qty: 2, id: "p1" },
        { name: "Cancelado", price: 9, qty: 1, id: "p2", cancelado: true },
      ],
    });
    expect(itens).toHaveLength(1);
    expect(itens[0]).toMatchObject({ cProd: "p1", xProd: "X-Salada", qCom: 2, vUnCom: 15, vProd: 30, uCom: "UN" });
  });

  it("não inventa dados fiscais do produto (NCM/CFOP/icms ausentes — ponto de extensão)", () => {
    const { itens } = montarVendaFiscal({ items: [{ name: "Água", price: 5, qty: 1 }] });
    expect(itens[0]).not.toHaveProperty("ncm");
    expect(itens[0]).not.toHaveProperty("cfop");
    expect(itens[0]).not.toHaveProperty("icms");
  });

  it("usa índice como código e default de qtd quando faltam", () => {
    const { itens } = montarVendaFiscal({ items: [{ name: "Item sem id", price: 10 }] });
    expect(itens[0].cProd).toBe("1");
    expect(itens[0].qCom).toBe(1);
  });
});

describe("montarVendaFiscal — pagamentos", () => {
  it("mapeia método→tPag e anexa troco só quando > 0", () => {
    const { pagamentos } = montarVendaFiscal({
      pagamentos: [
        { metodo: "dinheiro", valor: 40, troco: 10 },
        { metodo: "pix", valor: 31, troco: 0 },
      ],
    });
    expect(pagamentos[0]).toEqual({ tPag: "01", vPag: 40, vTroco: 10 });
    expect(pagamentos[1]).toEqual({ tPag: "17", vPag: 31 });
  });

  it("descarta pagamentos sem método ou com valor não-positivo", () => {
    const { pagamentos } = montarVendaFiscal({
      pagamentos: [{ metodo: null, valor: 10 }, { metodo: "pix", valor: 0 }, { metodo: "credito", valor: 20 }],
    });
    expect(pagamentos).toHaveLength(1);
    expect(pagamentos[0].tPag).toBe("03");
  });
});

describe("montarVendaFiscal — consumidor", () => {
  it("dest nulo por padrão (NFC-e anônima) e preservado quando presente", () => {
    expect(montarVendaFiscal({}).dest).toBeNull();
    const dest = { cpf: "11122233344" };
    expect(montarVendaFiscal({ dest }).dest).toBe(dest);
  });
});

describe("destDoCliente", () => {
  it("monta o dest de CPF (só dígitos + nome) a partir do cliente", () => {
    expect(destDoCliente({ documento: "52998224725", documento_tipo: "cpf", nome: "João Silva" }))
      .toEqual({ cpf: "52998224725", xNome: "João Silva" });
  });

  it("monta o dest de CNPJ a partir do cliente", () => {
    expect(destDoCliente({ documento: "11222333000181", documento_tipo: "cnpj", nome: "Empresa X" }))
      .toEqual({ cnpj: "11222333000181", xNome: "Empresa X" });
  });

  it("descarta a máscara e guarda só os dígitos", () => {
    expect(destDoCliente({ documento: "529.982.247-25", documento_tipo: "cpf", nome: "João" }))
      .toEqual({ cpf: "52998224725", xNome: "João" });
  });

  it("sem documento_tipo assume CPF", () => {
    expect(destDoCliente({ documento: "52998224725", nome: "João" }))
      .toEqual({ cpf: "52998224725", xNome: "João" });
  });

  it("omite xNome quando o cliente não tem nome", () => {
    expect(destDoCliente({ documento: "52998224725", documento_tipo: "cpf" }))
      .toEqual({ cpf: "52998224725" });
  });

  it("retorna null sem cliente, sem documento ou com documento de tamanho errado", () => {
    expect(destDoCliente(null)).toBeNull();
    expect(destDoCliente(undefined)).toBeNull();
    expect(destDoCliente({ nome: "Sem doc" })).toBeNull();
    expect(destDoCliente({ documento: "", documento_tipo: "cpf" })).toBeNull();
    // CPF com 10 dígitos (truncado) e CNPJ com 11 → não vaza documento errado
    expect(destDoCliente({ documento: "5299822472", documento_tipo: "cpf" })).toBeNull();
    expect(destDoCliente({ documento: "52998224725", documento_tipo: "cnpj" })).toBeNull();
  });
});
