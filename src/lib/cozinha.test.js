import { describe, it, expect, vi } from "vitest";

vi.mock("./supabase", () => ({ supabase: {} }));
vi.mock("./logger", () => ({ logAction: vi.fn() }));
vi.mock("./jarvas", () => ({ emitirEvento: vi.fn() }));

import { tempoDecorridoMin, estaAtrasado, SLA_MINUTOS_PADRAO } from "./cozinha";

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
