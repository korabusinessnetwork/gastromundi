import { describe, it, expect } from "vitest";
import { passwordStrength, sanitizeInput } from "./crypto";

describe("passwordStrength", () => {
  it("classifica senha muito curta (< 4) como muito fraca", () => {
    expect(passwordStrength("ab").level).toBe(0);
    expect(passwordStrength("").level).toBe(0);
  });

  it("classifica senha curta (< 6) como fraca", () => {
    expect(passwordStrength("abcd").level).toBe(1);
  });

  it("classifica senha média (só minúsculas, < 10 chars)", () => {
    expect(passwordStrength("abcdef").level).toBe(2);
  });

  it("classifica senha boa (dois critérios extras: maiúscula + número)", () => {
    expect(passwordStrength("abcdefA1").level).toBe(3);
  });

  it("classifica senha forte (três ou mais critérios extras)", () => {
    expect(passwordStrength("abcdefA1!").level).toBe(4);
  });

  it("senha longa (>= 10) sem outros critérios já conta como um critério extra", () => {
    expect(passwordStrength("abcdefghij").level).toBe(2);
  });
});

describe("sanitizeInput", () => {
  it("remove caracteres perigosos de HTML/JS (< > \" ' `)", () => {
    expect(sanitizeInput(`<script>alert('x')</script>`)).toBe("scriptalert(x)/script");
  });

  it("aplica trim removendo espaços nas bordas", () => {
    expect(sanitizeInput("  admin  ")).toBe("admin");
  });

  it("limita ao tamanho máximo padrão (60)", () => {
    const entrada = "a".repeat(100);
    expect(sanitizeInput(entrada).length).toBe(60);
  });

  it("aceita um tamanho máximo customizado", () => {
    expect(sanitizeInput("abcdefghij", 3)).toBe("abc");
  });
});
