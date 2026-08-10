import { describe, it, expect } from "vitest";
import { montarDanfeNfce, formatarChaveEmGrupos } from "./nfceDanfe";

// Chave de 44 dígitos válida em formato (conteúdo não importa aqui).
const CHAVE = "43260712345678000195650010000000011000000017";

const BASE = {
  emit: {
    xNome: "Restaurante do Zé LTDA",
    xFant: "Zé Lanches",
    cnpj: "12345678000195",
    ie: "1234567890",
    xLgr: "Rua das Flores",
    nro: "100",
    xBairro: "Centro",
    xMun: "Porto Alegre",
    uf: "RS",
  },
  itens: [
    { cProd: "A1", xProd: "X-Salada", qCom: 2, uCom: "UN", vUnCom: 15, vProd: 30 },
    { cProd: "A2", xProd: "Refrigerante", qCom: 1, uCom: "UN", vUnCom: 6, vProd: 6, vDesc: 1 },
  ],
  pagamentos: [{ tPag: "01", vPag: 40, vTroco: 5 }],
  chave: CHAVE,
  tpAmb: 1,
  dataEmissao: "2026-07-13T14:00:00Z",
};

describe("formatarChaveEmGrupos", () => {
  it("quebra a chave de 44 dígitos em 11 grupos de 4", () => {
    const f = formatarChaveEmGrupos(CHAVE);
    expect(f.split(" ")).toHaveLength(11);
    expect(f.startsWith("4326 0712")).toBe(true);
  });

  it("ignora máscara e devolve vazio para chave incompleta", () => {
    expect(formatarChaveEmGrupos("123")).toBe("");
    expect(formatarChaveEmGrupos(`NFe${CHAVE}`.replace(/(.{4})/g, "$1 "))).toBe(
      formatarChaveEmGrupos(CHAVE),
    );
  });
});

describe("montarDanfeNfce — totais e itens", () => {
  it("soma produtos, desconto e total corretamente", () => {
    const d = montarDanfeNfce(BASE);
    expect(d.itens).toHaveLength(2);
    expect(d.totais.quantidadeItens).toBe(2);
    expect(d.totais.valorProdutos).toBe("36,00");
    expect(d.totais.valorDesconto).toBe("1,00");
    expect(d.totais.temDesconto).toBe(true);
    expect(d.totais.valorTotal).toBe("35,00"); // 36 - 1
  });

  it("formata quantidade sem zeros supérfluos e valor em pt-BR", () => {
    const d = montarDanfeNfce({
      ...BASE,
      itens: [{ xProd: "Café", qCom: 1.5, vUnCom: 1234.5, vProd: 1851.75 }],
      pagamentos: [{ tPag: "17", vPag: 1851.75 }],
    });
    expect(d.itens[0].quantidade).toBe("1,5");
    expect(d.itens[0].valorUnitario).toBe("1.234,50");
    expect(d.itens[0].valorTotal).toBe("1.851,75");
  });

  it("não marca desconto quando não há", () => {
    const d = montarDanfeNfce({
      ...BASE,
      itens: [{ xProd: "Água", qCom: 1, vUnCom: 5, vProd: 5 }],
      pagamentos: [{ tPag: "01", vPag: 5 }],
    });
    expect(d.totais.temDesconto).toBe(false);
    expect(d.totais.valorDesconto).toBe("0,00");
  });
});

describe("montarDanfeNfce — pagamentos e troco", () => {
  it("rotula a forma de pagamento e mostra o troco quando > 0", () => {
    const d = montarDanfeNfce(BASE);
    expect(d.pagamentos[0]).toEqual({ rotulo: "Dinheiro", valor: "40,00" });
    expect(d.troco).toBe("5,00");
  });

  it("não mostra troco quando é zero e cai em 'Outros' para tPag desconhecido", () => {
    const d = montarDanfeNfce({
      ...BASE,
      pagamentos: [{ tPag: "88", vPag: 35 }],
    });
    expect(d.troco).toBeNull();
    expect(d.pagamentos[0].rotulo).toBe("Outros");
  });
});

describe("montarDanfeNfce — chave formatada", () => {
  it("expõe a chave em grupos de 4 e os dígitos crus", () => {
    const d = montarDanfeNfce(BASE);
    expect(d.chaveAcesso).toBe(CHAVE);
    expect(d.chaveFormatada.split(" ")).toHaveLength(11);
  });
});

describe("montarDanfeNfce — tarja de homologação", () => {
  it("inclui a tarja SEM VALOR FISCAL quando tpAmb=2", () => {
    const d = montarDanfeNfce({ ...BASE, tpAmb: 2 });
    expect(d.ambiente).toBe("homologacao");
    expect(d.avisos).toContain(
      "EMITIDA EM AMBIENTE DE HOMOLOGAÇÃO — SEM VALOR FISCAL",
    );
  });

  it("não inclui a tarja em produção (tpAmb=1)", () => {
    const d = montarDanfeNfce({ ...BASE, tpAmb: 1, protocolo: "135260000123456" });
    expect(d.ambiente).toBe("producao");
    expect(d.avisos.join(" ")).not.toContain("HOMOLOGAÇÃO");
  });
});

describe("montarDanfeNfce — consumidor identificado x anônimo", () => {
  it("anônimo quando não há CPF/CNPJ", () => {
    const d = montarDanfeNfce(BASE);
    expect(d.consumidor).toEqual({
      identificado: false,
      texto: "CONSUMIDOR NÃO IDENTIFICADO",
    });
  });

  it("identificado quando há CPF (com nome opcional)", () => {
    const d = montarDanfeNfce({
      ...BASE,
      dest: { cpf: "11122233344", xNome: "Maria" },
    });
    expect(d.consumidor.identificado).toBe(true);
    expect(d.consumidor.documento).toBe("11122233344");
    expect(d.consumidor.nome).toBe("Maria");
  });
});

describe("montarDanfeNfce — estado pendente x autorizada", () => {
  it("pendente quando não há protocolo (nota não autorizada)", () => {
    const d = montarDanfeNfce(BASE);
    expect(d.autorizada).toBe(false);
    expect(d.estado).toBe("pendente");
    expect(d.avisos).toContain("DOCUMENTO PENDENTE DE AUTORIZAÇÃO");
    expect(d.mostrarQrCode).toBe(false);
  });

  it("autorizada quando há protocolo, e expõe o QR quando a url veio pronta", () => {
    const d = montarDanfeNfce({
      ...BASE,
      protocolo: "135260000123456",
      urlQrCode: "https://sefaz.rs.gov.br/nfce?p=CHAVE|2|1|000001|HASH",
      dataAutorizacao: "2026-07-13T14:00:05Z",
    });
    expect(d.autorizada).toBe(true);
    expect(d.estado).toBe("autorizada");
    expect(d.protocolo).toBe("135260000123456");
    expect(d.mostrarQrCode).toBe(true);
    expect(d.avisos).not.toContain("DOCUMENTO PENDENTE DE AUTORIZAÇÃO");
  });
});

describe("montarDanfeNfce — validações", () => {
  it("exige ao menos um item", () => {
    expect(() => montarDanfeNfce({ ...BASE, itens: [] })).toThrow(/item/i);
  });

  it("exige ao menos uma forma de pagamento", () => {
    expect(() => montarDanfeNfce({ ...BASE, pagamentos: [] })).toThrow(/pagamento/i);
  });
});
