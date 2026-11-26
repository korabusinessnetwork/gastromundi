import { describe, it, expect } from "vitest";
import { fmtDt } from "./apoio";

describe("fmtDt, data da compra", () => {
  it("mostra o mesmo dia que foi escolhido no formulário", () => {
    // A compra grava o dia como "AAAA-MM-DD". Lido com new Date(), isso vira
    // meia-noite UTC, que no Brasil ainda é o dia anterior.
    expect(fmtDt("2026-11-20")).toBe("20/11/26");
    expect(fmtDt("2026-01-01")).toBe("01/01/26");
  });

  it("sem data mostra o marcador de vazio", () => {
    expect(fmtDt("")).toBe("—");
    expect(fmtDt(null)).toBe("—");
  });
});
