import { describe, it, expect } from "vitest";
import {
  apenasDigitos,
  validarCpf,
  validarCnpj,
  validarDocumento,
  formatarDocumento,
} from "./documento";

describe("apenasDigitos", () => {
  it("remove máscara e caracteres não numéricos", () => {
    expect(apenasDigitos("529.982.247-25")).toBe("52998224725");
    expect(apenasDigitos("11.222.333/0001-81")).toBe("11222333000181");
  });
  it("tolera null/undefined/número", () => {
    expect(apenasDigitos(null)).toBe("");
    expect(apenasDigitos(undefined)).toBe("");
    expect(apenasDigitos(12345)).toBe("12345");
  });
});

describe("validarCpf", () => {
  it("aceita CPF válido (com e sem máscara)", () => {
    expect(validarCpf("529.982.247-25")).toBe(true);
    expect(validarCpf("52998224725")).toBe(true);
    expect(validarCpf("111.444.777-35")).toBe(true);
  });
  it("rejeita dígito verificador errado", () => {
    expect(validarCpf("52998224724")).toBe(false);
    expect(validarCpf("111.444.777-30")).toBe(false);
  });
  it("rejeita comprimento errado", () => {
    expect(validarCpf("123")).toBe(false);
    expect(validarCpf("5299822472")).toBe(false); // 10 dígitos
    expect(validarCpf("529982247250")).toBe(false); // 12 dígitos
  });
  it("rejeita todos os dígitos iguais", () => {
    expect(validarCpf("00000000000")).toBe(false);
    expect(validarCpf("11111111111")).toBe(false);
  });
  it("rejeita um CNPJ (14 dígitos) como CPF", () => {
    expect(validarCpf("11222333000181")).toBe(false);
  });
});

describe("validarCnpj", () => {
  it("aceita CNPJ válido (com e sem máscara)", () => {
    expect(validarCnpj("11.222.333/0001-81")).toBe(true);
    expect(validarCnpj("11222333000181")).toBe(true);
  });
  it("rejeita dígito verificador errado", () => {
    expect(validarCnpj("11222333000180")).toBe(false);
  });
  it("rejeita comprimento errado e todos iguais", () => {
    expect(validarCnpj("112223330001")).toBe(false); // 12 dígitos
    expect(validarCnpj("00000000000000")).toBe(false);
  });
  it("rejeita um CPF (11 dígitos) como CNPJ", () => {
    expect(validarCnpj("52998224725")).toBe(false);
  });
});

describe("validarDocumento", () => {
  it("roteia por tipo", () => {
    expect(validarDocumento("52998224725", "cpf")).toBe(true);
    expect(validarDocumento("11222333000181", "cnpj")).toBe(true);
    expect(validarDocumento("52998224725", "cnpj")).toBe(false);
    expect(validarDocumento("11222333000181", "cpf")).toBe(false);
  });
  it("trata tipo ausente/inválido como cpf (default do form)", () => {
    expect(validarDocumento("52998224725", undefined)).toBe(true);
    expect(validarDocumento("52998224725", "xpto")).toBe(true);
  });
});

describe("formatarDocumento", () => {
  it("aplica máscara completa de CPF", () => {
    expect(formatarDocumento("52998224725", "cpf")).toBe("529.982.247-25");
  });
  it("aplica máscara completa de CNPJ", () => {
    expect(formatarDocumento("11222333000181", "cnpj")).toBe("11.222.333/0001-81");
  });
  it("mascara progressivamente enquanto digita (CPF)", () => {
    expect(formatarDocumento("5", "cpf")).toBe("5");
    expect(formatarDocumento("529", "cpf")).toBe("529");
    expect(formatarDocumento("5299", "cpf")).toBe("529.9");
    expect(formatarDocumento("529982", "cpf")).toBe("529.982");
    expect(formatarDocumento("5299822", "cpf")).toBe("529.982.2");
    expect(formatarDocumento("529982247", "cpf")).toBe("529.982.247");
    expect(formatarDocumento("5299822472", "cpf")).toBe("529.982.247-2");
  });
  it("mascara progressivamente enquanto digita (CNPJ)", () => {
    expect(formatarDocumento("11", "cnpj")).toBe("11");
    expect(formatarDocumento("112", "cnpj")).toBe("11.2");
    expect(formatarDocumento("11222", "cnpj")).toBe("11.222");
    expect(formatarDocumento("11222333", "cnpj")).toBe("11.222.333");
    expect(formatarDocumento("112223330", "cnpj")).toBe("11.222.333/0");
    expect(formatarDocumento("112223330001", "cnpj")).toBe("11.222.333/0001");
  });
  it("trunca no tamanho do tipo", () => {
    expect(formatarDocumento("5299822472599", "cpf")).toBe("529.982.247-25");
    expect(formatarDocumento("112223330001810", "cnpj")).toBe("11.222.333/0001-81");
  });
  it("ignora caracteres não numéricos na entrada", () => {
    expect(formatarDocumento("529.982.247-25", "cpf")).toBe("529.982.247-25");
  });
});
