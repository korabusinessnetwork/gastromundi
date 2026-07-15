import { describe, it, expect } from "vitest";
import { diaLocalISO, rotuloDiaBR, agruparVendasPorDia } from "./datas";
import { totalPorMetodo } from "./pagamentos";

describe("diaLocalISO", () => {
  it("resolve o dia local em America/Sao_Paulo (UTC-3)", () => {
    // 2026-07-21T02:00:00Z = 2026-07-20 23:00 em São Paulo → dia 20, não 21
    expect(diaLocalISO("2026-07-21T02:00:00.000Z")).toBe("2026-07-20");
  });

  it("venda às 21h locais não cai no dia seguinte", () => {
    // 21:30 BRT = 00:30Z do dia seguinte; deve continuar no dia local 15
    expect(diaLocalISO("2026-07-16T00:30:00.000Z")).toBe("2026-07-15");
  });

  it("meio-dia UTC continua no mesmo dia local", () => {
    expect(diaLocalISO("2026-07-21T12:00:00.000Z")).toBe("2026-07-21");
  });

  it("retorna null para entrada vazia ou inválida", () => {
    expect(diaLocalISO(null)).toBeNull();
    expect(diaLocalISO("")).toBeNull();
    expect(diaLocalISO("não-é-data")).toBeNull();
  });
});

describe("rotuloDiaBR", () => {
  it("formata YYYY-MM-DD como dd/mm/aaaa", () => {
    expect(rotuloDiaBR("2026-07-21")).toBe("21/07/2026");
  });
  it("trata entrada inválida", () => {
    expect(rotuloDiaBR(null)).toBe("—");
    expect(rotuloDiaBR("2026-07")).toBe("—");
  });
});

describe("agruparVendasPorDia", () => {
  const vendas = [
    { id: 1, at: "2026-07-21T12:00:00.000Z", total: 100, pagamentos: [{ metodo: "dinheiro", valor: 100 }] },
    { id: 2, at: "2026-07-21T15:00:00.000Z", total: 50,  pagamentos: [{ metodo: "pix", valor: 50 }] },
    // 02:00Z do dia 22 = 23:00 BRT do dia 21 → agrupa no dia 21 local
    { id: 3, at: "2026-07-22T02:00:00.000Z", total: 30,  pagamentos: [{ metodo: "dinheiro", valor: 30 }] },
    { id: 4, at: "2026-07-22T14:00:00.000Z", total: 80,  pagamentos: [{ metodo: "credito", valor: 80 }] },
  ];

  it("agrupa por dia local e conta comandas", () => {
    const dias = agruparVendasPorDia(vendas);
    // dia 21 tem 3 comandas (incl. a de 02:00Z do dia 22 UTC), dia 22 tem 1
    expect(dias.map((d) => d.dia)).toEqual(["2026-07-22", "2026-07-21"]);
    const d21 = dias.find((d) => d.dia === "2026-07-21");
    expect(d21.comandas).toBe(3);
    expect(d21.total).toBe(180);
  });

  it("calcula ticket médio (total / comandas)", () => {
    const dias = agruparVendasPorDia(vendas);
    const d21 = dias.find((d) => d.dia === "2026-07-21");
    expect(d21.ticket).toBeCloseTo(180 / 3);
  });

  it("soma por método quando totalPorMetodo é fornecido", () => {
    const dias = agruparVendasPorDia(vendas, { totalPorMetodo });
    const d21 = dias.find((d) => d.dia === "2026-07-21");
    expect(d21.metodos).toEqual({ dinheiro: 130, pix: 50 });
  });

  it("ordena do mais recente para o mais antigo", () => {
    const dias = agruparVendasPorDia(vendas);
    expect(dias[0].dia).toBe("2026-07-22");
  });

  it("lida com lista vazia/indefinida", () => {
    expect(agruparVendasPorDia([])).toEqual([]);
    expect(agruparVendasPorDia(undefined)).toEqual([]);
  });
});
