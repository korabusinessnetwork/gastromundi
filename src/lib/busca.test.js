import { describe, it, expect } from "vitest";
import { nomeBateComBusca } from "./busca";

describe("nomeBateComBusca", () => {
  it("ignora acento, maiúscula e espaço sobrando", () => {
    expect(nomeBateComBusca("Café expresso", "cafe")).toBe(true);
    expect(nomeBateComBusca("Pão de queijo", "  PAO  ")).toBe(true);
  });

  it("acha pelo meio do nome", () => {
    expect(nomeBateComBusca("Suco de laranja", "laranja")).toBe(true);
  });

  it("termo vazio acha tudo, termo diferente não acha", () => {
    expect(nomeBateComBusca("Café", "")).toBe(true);
    expect(nomeBateComBusca("Café", "chá")).toBe(false);
  });

  it("nome ausente não quebra", () => {
    expect(nomeBateComBusca(undefined, "x")).toBe(false);
  });
});

import { ehGerencia } from "@/constants/roles";

// Refatoração 4.9: "admin ou gerente" estava escrito à mão em 11 lugares.
describe("ehGerencia", () => {
  it("admin e gerente são gerência; caixa e garçom não", () => {
    expect(ehGerencia({ role: "admin" })).toBe(true);
    expect(ehGerencia({ role: "gerente" })).toBe(true);
    expect(ehGerencia({ role: "caixa" })).toBe(false);
    expect(ehGerencia({ role: "garcom" })).toBe(false);
  });

  it("sem usuário não é gerência", () => {
    expect(ehGerencia(null)).toBe(false);
  });
});
