import { describe, it, expect } from "vitest";
import { fmtComanda } from "./rotuloComanda";

describe("fmtComanda", () => {
  it("número puro vira 'Comanda N', mesmo com espaço em volta", () => {
    expect(fmtComanda("7")).toBe("Comanda 7");
    expect(fmtComanda(12)).toBe("Comanda 12");
    expect(fmtComanda(" 3 ")).toBe("Comanda  3 ");
  });

  it("nome livre passa intacto", () => {
    expect(fmtComanda("Mesa VIP")).toBe("Mesa VIP");
    expect(fmtComanda("Balcão")).toBe("Balcão");
    expect(fmtComanda("7A")).toBe("7A");
  });

  it("vazio e ausente voltam como vieram, para quem chama decidir o marcador", () => {
    expect(fmtComanda("")).toBe("");
    expect(fmtComanda(null)).toBeNull();
    expect(fmtComanda(undefined)).toBeUndefined();
  });
});
