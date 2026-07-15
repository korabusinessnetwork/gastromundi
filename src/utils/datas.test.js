import { describe, it, expect } from "vitest";
import { diaLocalISO, rotuloDiaBR, agruparVendasPorDia, intervaloPeriodo, agruparVendasPorOperador } from "./datas";
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

describe("intervaloPeriodo", () => {
  const agora = new Date("2026-07-21T15:00:00.000Z").getTime();

  it("'tudo' não recorta", () => {
    expect(intervaloPeriodo("tudo", "", "", agora)).toEqual({ ini: null, fim: null });
  });

  it("'semana' cobre os últimos 7 dias", () => {
    const { ini, fim } = intervaloPeriodo("semana", "", "", agora);
    expect(fim).toBe(agora);
    expect(agora - ini).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it("'mes' cobre os últimos 30 dias", () => {
    const { ini } = intervaloPeriodo("mes", "", "", agora);
    expect(agora - ini).toBe(30 * 24 * 60 * 60 * 1000);
  });

  it("custom usa as datas informadas (fim inclui o dia todo)", () => {
    const { ini, fim } = intervaloPeriodo("custom", "2026-07-10", "2026-07-15", agora);
    expect(new Date(ini).getHours()).toBe(0);
    expect(fim).toBeGreaterThan(ini);
  });

  it("custom vazio não recorta", () => {
    expect(intervaloPeriodo("custom", "", "", agora)).toEqual({ ini: null, fim: null });
  });
});

describe("agruparVendasPorOperador", () => {
  const vendas = [
    { cashier: "ana",  total: 100 },
    { cashier: "ana",  total: 50 },
    { cashier: "bruno", total: 200 },
    { cashier: null,   total: 20 },
  ];

  it("agrupa por operador com total, vendas e ticket", () => {
    const ops = agruparVendasPorOperador(vendas);
    const ana = ops.find((o) => o.operador === "ana");
    expect(ana.vendas).toBe(2);
    expect(ana.total).toBe(150);
    expect(ana.ticket).toBe(75);
  });

  it("calcula participação (%) no faturamento", () => {
    const ops = agruparVendasPorOperador(vendas);
    // total geral = 370; bruno = 200 → ~54.05%
    const bruno = ops.find((o) => o.operador === "bruno");
    expect(bruno.participacao).toBeCloseTo((200 / 370) * 100);
  });

  it("ordena por total desc e trata operador ausente como —", () => {
    const ops = agruparVendasPorOperador(vendas);
    expect(ops[0].operador).toBe("bruno");
    expect(ops.some((o) => o.operador === "—")).toBe(true);
  });

  it("lida com lista vazia", () => {
    expect(agruparVendasPorOperador([])).toEqual([]);
  });
});
