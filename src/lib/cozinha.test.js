import { describe, it, expect, vi } from "vitest";

vi.mock("./supabase", () => ({ supabase: {} }));
vi.mock("./logger", () => ({ logAction: vi.fn() }));
vi.mock("./jarvas", () => ({ emitirEvento: vi.fn() }));

import { tempoDecorridoMin, estaAtrasado, formatarTempoDecorrido, SLA_MINUTOS_PADRAO } from "./cozinha";

describe("tempoDecorridoMin", () => {
  it("calcula minutos decorridos entre duas datas", () => {
    const desde = "2026-07-06T10:00:00.000Z";
    const agora = "2026-07-06T10:12:30.000Z";
    expect(tempoDecorridoMin(desde, agora)).toBe(12);
  });

  it("retorna 0 quando a data não está definida", () => {
    expect(tempoDecorridoMin(null)).toBe(0);
    expect(tempoDecorridoMin(undefined)).toBe(0);
  });

  it("nunca retorna negativo (data futura)", () => {
    const desde = "2026-07-06T10:00:00.000Z";
    const agora = "2026-07-06T09:00:00.000Z";
    expect(tempoDecorridoMin(desde, agora)).toBe(0);
  });
});

describe("formatarTempoDecorrido", () => {
  it("mostra minutos crus abaixo de 1 hora", () => {
    expect(formatarTempoDecorrido(0)).toBe("0 min");
    expect(formatarTempoDecorrido(8)).toBe("8 min");
    expect(formatarTempoDecorrido(59)).toBe("59 min");
  });

  it("mostra horas (e minutos) de 1h a 1 dia", () => {
    expect(formatarTempoDecorrido(60)).toBe("1h");
    expect(formatarTempoDecorrido(85)).toBe("1h 25min");
    expect(formatarTempoDecorrido(1439)).toBe("23h 59min");
  });

  it("mostra dias (e horas) a partir de 1 dia — o caso 8510 min vira legível", () => {
    expect(formatarTempoDecorrido(1440)).toBe("1d");
    expect(formatarTempoDecorrido(8510)).toBe("5d 21h"); // era "8510 min" na tela
  });

  it("nunca quebra com entrada inválida (trata como 0)", () => {
    expect(formatarTempoDecorrido(-5)).toBe("0 min");
    expect(formatarTempoDecorrido(NaN)).toBe("0 min");
    expect(formatarTempoDecorrido(undefined)).toBe("0 min");
  });
});

describe("estaAtrasado", () => {
  const agora = "2026-07-06T10:30:00.000Z";

  it("pedido aguardando conta o atraso desde a criação", () => {
    const pedido = { status_cozinha: "aguardando", created_at: "2026-07-06T10:10:00.000Z" };
    expect(estaAtrasado(pedido, 15, agora)).toBe(true); // 20min >= 15
  });

  it("pedido aguardando dentro do SLA não está atrasado", () => {
    const pedido = { status_cozinha: "aguardando", created_at: "2026-07-06T10:20:00.000Z" };
    expect(estaAtrasado(pedido, 15, agora)).toBe(false); // 10min < 15
  });

  it("pedido em_preparo conta o atraso desde o início do preparo, não da criação", () => {
    const pedido = {
      status_cozinha: "em_preparo",
      created_at: "2026-07-06T09:00:00.000Z", // muito antigo — não deve contar
      em_preparo_em: "2026-07-06T10:20:00.000Z", // recente — 10min < 15
    };
    expect(estaAtrasado(pedido, 15, agora)).toBe(false);
  });

  it("pedido pronto nunca está atrasado", () => {
    const pedido = { status_cozinha: "pronto", em_preparo_em: "2026-07-06T09:00:00.000Z" };
    expect(estaAtrasado(pedido, 15, agora)).toBe(false);
  });

  it("usa o SLA padrão quando não informado", () => {
    const pedido = { status_cozinha: "aguardando", created_at: "2026-07-06T10:14:00.000Z" };
    expect(SLA_MINUTOS_PADRAO).toBe(15);
    expect(estaAtrasado(pedido, undefined, agora)).toBe(true); // 16min >= 15
  });

  it("lida com pedido nulo/indefinido sem lançar exceção", () => {
    expect(estaAtrasado(null)).toBe(false);
    expect(estaAtrasado(undefined)).toBe(false);
  });
});
