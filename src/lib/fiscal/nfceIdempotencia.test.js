import { describe, it, expect } from "vitest";
import { notaReaproveitavel, escolherNotaReaproveitavel } from "./nfceIdempotencia";

describe("notaReaproveitavel", () => {
  it("autorizada é sempre reaproveitável (idempotência)", () => {
    expect(notaReaproveitavel({ status: "autorizada", xml_tipo: "proc" })).toBe(true);
    expect(notaReaproveitavel({ status: "autorizada", xml_tipo: null })).toBe(true);
  });

  it("pendente COM xml assinado é reaproveitável (contingência real na fila)", () => {
    expect(notaReaproveitavel({ status: "pendente", xml_tipo: "assinado" })).toBe(true);
  });

  it("pendente SEM xml assinado é FANTASMA (falha_pos_reserva) — NÃO reaproveitável", () => {
    expect(notaReaproveitavel({ status: "pendente", xml_tipo: null })).toBe(false);
    expect(notaReaproveitavel({ status: "pendente" })).toBe(false);
  });

  it("rejeitada não é reaproveitável", () => {
    expect(notaReaproveitavel({ status: "rejeitada", xml_tipo: null })).toBe(false);
  });

  it("entrada inválida não é reaproveitável (defensivo)", () => {
    expect(notaReaproveitavel(null)).toBe(false);
    expect(notaReaproveitavel(undefined)).toBe(false);
    expect(notaReaproveitavel("x")).toBe(false);
  });
});

describe("escolherNotaReaproveitavel", () => {
  it("devolve a primeira reaproveitável na ordem dada (mais recente primeiro)", () => {
    const notas = [
      { status: "pendente", xml_tipo: "assinado", chave: "recente" },
      { status: "autorizada", xml_tipo: "proc", chave: "antiga" },
    ];
    expect(escolherNotaReaproveitavel(notas).chave).toBe("recente");
  });

  it("PULA o fantasma mais recente e reaproveita a autorizada anterior", () => {
    const notas = [
      { status: "pendente", xml_tipo: null, chave: "fantasma" }, // falha_pos_reserva
      { status: "autorizada", xml_tipo: "proc", chave: "boa" },
    ];
    expect(escolherNotaReaproveitavel(notas).chave).toBe("boa");
  });

  it("só fantasma → null: a venda pode REEMITIR (não fica travada)", () => {
    const notas = [{ status: "pendente", xml_tipo: null, chave: "fantasma" }];
    expect(escolherNotaReaproveitavel(notas)).toBeNull();
  });

  it("sem notas → null", () => {
    expect(escolherNotaReaproveitavel([])).toBeNull();
    expect(escolherNotaReaproveitavel(null)).toBeNull();
    expect(escolherNotaReaproveitavel(undefined)).toBeNull();
  });
});
