import { describe, it, expect } from "vitest";
import { codigoUf, calcularDigitoVerificador, montarChaveAcesso } from "./nfce";

describe("nfce — codigoUf", () => {
  it("resolve o RS (cliente-alvo) para 43", () => {
    expect(codigoUf("RS")).toBe("43");
  });
  it("aceita a sigla em qualquer caixa", () => {
    expect(codigoUf("sp")).toBe("35");
    expect(codigoUf(" rs ")).toBe("43");
  });
  it("lança para UF desconhecida", () => {
    expect(() => codigoUf("XX")).toThrow(/UF inválida/);
  });
});

describe("nfce — calcularDigitoVerificador (módulo 11)", () => {
  it("43 zeros → resto 0 → DV 0 (regra: resto ≤ 1 vira 0)", () => {
    expect(calcularDigitoVerificador("0".repeat(43))).toBe("0");
  });
  it("43 uns → soma 229 → resto 9 → DV 2 (vetor determinístico)", () => {
    // pesos 2..9 cíclicos: 5 ciclos (2+..+9=44)*5=220 + (2+3+4)=9 = 229
    // 229 % 11 = 9 ; 11 - 9 = 2
    expect(calcularDigitoVerificador("1".repeat(43))).toBe("2");
  });
  it("exige exatamente 43 dígitos", () => {
    expect(() => calcularDigitoVerificador("123")).toThrow(/43 dígitos/);
  });
  it("ignora máscara (conta só dígitos)", () => {
    expect(calcularDigitoVerificador("0".repeat(43))).toBe(
      calcularDigitoVerificador("0".repeat(43))
    );
  });
});

describe("nfce — montarChaveAcesso", () => {
  const base = {
    uf: "RS",
    dataEmissao: new Date("2026-07-13T10:00:00"),
    cnpj: "12.345.678/0001-95",
    serie: 1,
    numero: 1,
    codigoNumerico: 12345678,
  };

  it("produz 44 dígitos, todos numéricos", () => {
    const chave = montarChaveAcesso(base);
    expect(chave).toHaveLength(44);
    expect(chave).toMatch(/^\d{44}$/);
  });

  it("começa pelo cUF e traz AAMM da data de emissão", () => {
    const chave = montarChaveAcesso(base);
    expect(chave.slice(0, 2)).toBe("43"); // RS
    expect(chave.slice(2, 6)).toBe("2607"); // 2026-07
  });

  it("embute o CNPJ (sem máscara), modelo 65 e a série", () => {
    const chave = montarChaveAcesso(base);
    expect(chave.slice(6, 20)).toBe("12345678000195"); // CNPJ
    expect(chave.slice(20, 22)).toBe("65"); // modelo NFC-e
    expect(chave.slice(22, 25)).toBe("001"); // série 1 → 3 dígitos
    expect(chave.slice(25, 34)).toBe("000000001"); // nNF 1 → 9 dígitos
    expect(chave.slice(34, 35)).toBe("1"); // tpEmis normal
  });

  it("o 44º dígito é o DV coerente com os 43 primeiros", () => {
    const chave = montarChaveAcesso(base);
    expect(chave[43]).toBe(calcularDigitoVerificador(chave.slice(0, 43)));
  });

  it("recusa número de nota acima de 9 dígitos (erro claro, não trunca)", () => {
    expect(() => montarChaveAcesso({ ...base, numero: 1234567890 }))
      .toThrow(/excede 9 dígitos/);
  });

  it("recusa dataEmissao inválida", () => {
    expect(() => montarChaveAcesso({ ...base, dataEmissao: "não-é-data" }))
      .toThrow(/dataEmissao inválida/);
  });
});
