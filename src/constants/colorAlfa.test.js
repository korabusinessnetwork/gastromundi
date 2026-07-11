import { describe, it, expect } from "vitest";
import { alfa } from "./colorAlfa";
import C from "./colors";

describe("alfa (F018: colors.js agora contém nomes de tokens)", () => {
  it("converte sufixo hex de alfa pra porcentagem equivalente", () => {
    // C.accent é agora "--gm-accent" (não mais "#7c3aed")
    expect(alfa(C.accent, "44")).toBe("color-mix(in srgb, var(--gm-accent) 27%, transparent)");
    expect(alfa(C.accent, "22")).toBe("color-mix(in srgb, var(--gm-accent) 13%, transparent)");
    expect(alfa(C.accent, "1a")).toBe("color-mix(in srgb, var(--gm-accent) 10%, transparent)");
  });

  it("usa var(--gm-*) pra cores de marca (segue o tema do tenant)", () => {
    expect(alfa(C.red, "18")).toContain("var(--gm-red)");
    expect(alfa(C.green, "18")).toContain("var(--gm-green)");
    expect(alfa(C.blue, "18")).toContain("var(--gm-blue)");
  });

  it("cai para a cor literal quando não é um token de marca (ex: cor semântica fixa)", () => {
    expect(alfa("#f59e0b", "18")).toBe("color-mix(in srgb, #f59e0b 9%, transparent)");
  });

  it("check direto por '--gm-' prefix (não usa mais mapa HEX_PARA_TOKEN)", () => {
    // Qualquer string começando com "--gm-" é tratada como token
    expect(alfa("--gm-custom-token", "44")).toContain("var(--gm-custom-token)");
  });

  it("trata null/undefined de cor gracefully (usa falllback literal)", () => {
    expect(alfa(null, "44")).toBe("color-mix(in srgb, null 27%, transparent)");
    expect(alfa(undefined, "44")).toBe("color-mix(in srgb, undefined 27%, transparent)");
  });
});
