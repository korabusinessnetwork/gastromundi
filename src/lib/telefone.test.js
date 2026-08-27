import { describe, it, expect } from "vitest";
import {
  apenasDigitosTelefone,
  formatarTelefone,
  mascararTelefone,
  telefoneValido,
} from "./telefone";

describe("apenasDigitosTelefone", () => {
  it("tira máscara e aguenta nulo", () => {
    expect(apenasDigitosTelefone("(11) 91234-5678")).toBe("11912345678");
    expect(apenasDigitosTelefone(null)).toBe("");
  });
});

describe("formatarTelefone", () => {
  it("formata celular e fixo", () => {
    expect(formatarTelefone("11912345678")).toBe("(11) 91234-5678");
    expect(formatarTelefone("1112345678")).toBe("(11) 1234-5678");
  });

  it("devolve como veio quando não dá pra formatar", () => {
    expect(formatarTelefone("123")).toBe("123");
    expect(formatarTelefone(null)).toBe("");
  });
});

describe("mascararTelefone", () => {
  it("fecha a máscara conforme o operador digita", () => {
    expect(mascararTelefone("1")).toBe("1");
    expect(mascararTelefone("11")).toBe("11");
    expect(mascararTelefone("119")).toBe("(11) 9");
    expect(mascararTelefone("1191234")).toBe("(11) 9123-4");
    expect(mascararTelefone("11912345678")).toBe("(11) 91234-5678");
  });

  it("não deixa passar de 11 dígitos", () => {
    expect(mascararTelefone("119123456789999")).toBe("(11) 91234-5678");
  });
});

describe("telefoneValido", () => {
  it("aceita celular e fixo com DDD", () => {
    expect(telefoneValido("(11) 91234-5678")).toBe(true);
    expect(telefoneValido("1132145678")).toBe(true);
  });

  it("recusa o número curto que o cadastro aceitava calado", () => {
    // Era exatamente este caso do relatório: "123" salvo sem nenhum aviso.
    expect(telefoneValido("123")).toBe(false);
    expect(telefoneValido("")).toBe(false);
    expect(telefoneValido(null)).toBe(false);
  });

  it("recusa DDD inexistente", () => {
    expect(telefoneValido("0012345678")).toBe(false);
    expect(telefoneValido("1012345678")).toBe(false);
  });

  it("recusa celular de 11 dígitos que não começa em 9", () => {
    expect(telefoneValido("11812345678")).toBe(false);
  });

  it("recusa fixo começando em 0 ou 1", () => {
    expect(telefoneValido("1101234567")).toBe(false);
    expect(telefoneValido("1112345678")).toBe(false);
  });
});
