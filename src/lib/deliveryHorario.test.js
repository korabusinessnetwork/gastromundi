import { describe, it, expect } from "vitest";
import {
  DIAS_SEMANA,
  HORARIO_PADRAO,
  paraMinutos,
  normalizarHorario,
  horarioValido,
  deliveryDeveEstarAberto,
  ajusteAutomaticoAbertura,
  resumoHorario,
} from "./deliveryHorario";

// Helper: constrói um Date num dia/horário conhecidos (relógio local).
// diaSemana 0=domingo … 6=sábado. 2026-07-19 é um DOMINGO, então o offset
// é direto (19 + diaSemana cai na mesma semana de julho/2026).
const em = (diaSemana, hh, mm = 0) => new Date(2026, 6, 19 + diaSemana, hh, mm, 0);

describe("paraMinutos", () => {
  it("converte HH:MM em minutos desde a meia-noite", () => {
    expect(paraMinutos("00:00")).toBe(0);
    expect(paraMinutos("08:05")).toBe(485);
    expect(paraMinutos("8:05")).toBe(485); // aceita hora sem zero à esquerda
    expect(paraMinutos("23:59")).toBe(1439);
  });
  it("rejeita formatos e faixas inválidas", () => {
    expect(paraMinutos("24:00")).toBeNull();
    expect(paraMinutos("18:60")).toBeNull();
    expect(paraMinutos("18-30")).toBeNull();
    expect(paraMinutos("")).toBeNull();
    expect(paraMinutos(1800)).toBeNull();
    expect(paraMinutos(null)).toBeNull();
  });
});

describe("normalizarHorario", () => {
  it("devolve a forma completa com defaults seguros de entrada vazia", () => {
    expect(normalizarHorario(undefined)).toEqual({ auto: false, abre: null, fecha: null, dias: [] });
    expect(normalizarHorario("lixo")).toEqual({ auto: false, abre: null, fecha: null, dias: [] });
    expect(normalizarHorario({})).toEqual({ auto: false, abre: null, fecha: null, dias: [] });
  });
  it("coage tipos, zero-padroniza a hora e limpa os dias", () => {
    const out = normalizarHorario({ auto: true, abre: "8:05", fecha: "23:00", dias: [7, 1, 1, 3, -1, "2", 2] });
    expect(out).toEqual({ auto: true, abre: "08:05", fecha: "23:00", dias: [1, 2, 3] });
  });
  it("auto só é true quando estritamente === true", () => {
    expect(normalizarHorario({ auto: "sim" }).auto).toBe(false);
    expect(normalizarHorario({ auto: true }).auto).toBe(true);
  });
});

describe("horarioValido", () => {
  it("desligado é sempre válido (nada a preencher)", () => {
    expect(horarioValido({ auto: false })).toBe(true);
  });
  it("ligado exige abre/fecha diferentes e ao menos um dia", () => {
    expect(horarioValido({ auto: true, abre: "18:00", fecha: "23:00", dias: [1] })).toBe(true);
    expect(horarioValido({ auto: true, abre: "18:00", fecha: "18:00", dias: [1] })).toBe(false); // iguais
    expect(horarioValido({ auto: true, abre: "18:00", fecha: "23:00", dias: [] })).toBe(false); // sem dias
    expect(horarioValido({ auto: true, abre: null, fecha: "23:00", dias: [1] })).toBe(false); // sem abertura
  });
});

describe("deliveryDeveEstarAberto — não governa (null)", () => {
  it("retorna null quando o agendamento está desligado", () => {
    expect(deliveryDeveEstarAberto({ auto: false, abre: "18:00", fecha: "23:00", dias: [1] })).toBeNull();
  });
  it("retorna null quando está ligado mas incompleto (não fecha por engano)", () => {
    expect(deliveryDeveEstarAberto({ auto: true, abre: "18:00", fecha: "18:00", dias: [1] })).toBeNull();
    expect(deliveryDeveEstarAberto({ auto: true, abre: "18:00", fecha: "23:00", dias: [] })).toBeNull();
    expect(deliveryDeveEstarAberto({ auto: true, abre: null, fecha: "23:00", dias: [1] })).toBeNull();
  });
});

describe("deliveryDeveEstarAberto — janela no mesmo dia", () => {
  const h = { auto: true, abre: "18:00", fecha: "23:00", dias: [1] }; // só segunda

  it("aberto dentro da janela no dia ativo", () => {
    expect(deliveryDeveEstarAberto(h, em(1, 18, 0))).toBe(true); // 18:00 — borda de abertura inclui
    expect(deliveryDeveEstarAberto(h, em(1, 20, 30))).toBe(true);
    expect(deliveryDeveEstarAberto(h, em(1, 22, 59))).toBe(true);
  });
  it("fechado nas bordas e fora da janela", () => {
    expect(deliveryDeveEstarAberto(h, em(1, 17, 59))).toBe(false); // antes de abrir
    expect(deliveryDeveEstarAberto(h, em(1, 23, 0))).toBe(false); // 23:00 já é fechado (meio-aberto)
    expect(deliveryDeveEstarAberto(h, em(1, 23, 30))).toBe(false);
  });
  it("fechado num dia que não é de atendimento, mesmo dentro do horário", () => {
    expect(deliveryDeveEstarAberto(h, em(2, 20, 0))).toBe(false); // terça, dentro do horário
    expect(deliveryDeveEstarAberto(h, em(0, 20, 0))).toBe(false); // domingo
  });
});

describe("deliveryDeveEstarAberto — janela que vira a noite", () => {
  const h = { auto: true, abre: "18:00", fecha: "02:00", dias: [5] }; // só sexta

  it("aberto na noite do dia ativo (antes da meia-noite)", () => {
    expect(deliveryDeveEstarAberto(h, em(5, 18, 0))).toBe(true);
    expect(deliveryDeveEstarAberto(h, em(5, 23, 59))).toBe(true);
  });
  it("aberto na madrugada seguinte (rescaldo do dia ativo)", () => {
    expect(deliveryDeveEstarAberto(h, em(6, 1, 59))).toBe(true); // sábado 01:59, ainda da sexta
  });
  it("fechado na madrugada quando o dia anterior não era de atendimento", () => {
    // sábado→domingo: o dia anterior (sábado) não é de atendimento
    expect(deliveryDeveEstarAberto(h, em(0, 1, 0))).toBe(false); // domingo 01:00
  });
  it("fechado após o horário de fechar e antes de abrir no dia ativo", () => {
    expect(deliveryDeveEstarAberto(h, em(6, 2, 0))).toBe(false); // sábado 02:00 (borda de fechar)
    expect(deliveryDeveEstarAberto(h, em(5, 17, 59))).toBe(false); // sexta, antes de abrir
    expect(deliveryDeveEstarAberto(h, em(5, 3, 0))).toBe(false); // sexta de tarde... 03:00 sexta: nem noturno nem rescaldo (quinta inativa)
  });
});

describe("ajusteAutomaticoAbertura", () => {
  const h = { auto: true, abre: "18:00", fecha: "23:00", dias: [1] };

  it("não muda quando o agendamento não governa", () => {
    expect(ajusteAutomaticoAbertura({ aberto: true, horario: { auto: false } }, em(1, 20)))
      .toEqual({ mudar: false, aberto: true });
  });
  it("manda abrir quando está fechado mas deveria abrir", () => {
    expect(ajusteAutomaticoAbertura({ aberto: false, horario: h }, em(1, 20)))
      .toEqual({ mudar: true, aberto: true });
  });
  it("manda fechar quando está aberto mas deveria fechar", () => {
    expect(ajusteAutomaticoAbertura({ aberto: true, horario: h }, em(2, 20)))
      .toEqual({ mudar: true, aberto: false });
  });
  it("não muda quando já está no estado certo", () => {
    expect(ajusteAutomaticoAbertura({ aberto: true, horario: h }, em(1, 20)))
      .toEqual({ mudar: false, aberto: true });
  });
});

describe("resumoHorario", () => {
  it("resume dias contíguos como faixa", () => {
    expect(resumoHorario({ auto: true, abre: "18:00", fecha: "23:00", dias: [1, 2, 3, 4, 5] }))
      .toBe("Seg a Sex · 18:00 às 23:00");
  });
  it("resume a semana toda", () => {
    expect(resumoHorario({ auto: true, abre: "11:00", fecha: "15:00", dias: [0, 1, 2, 3, 4, 5, 6] }))
      .toBe("todos os dias · 11:00 às 15:00");
  });
  it("lista dias soltos e marca a virada de noite", () => {
    expect(resumoHorario({ auto: true, abre: "18:00", fecha: "02:00", dias: [0, 6] }))
      .toBe("Dom, Sáb · 18:00 às 02:00 (do dia seguinte)");
  });
  it("retorna null quando não há agendamento válido", () => {
    expect(resumoHorario({ auto: false, abre: "18:00", fecha: "23:00", dias: [1] })).toBeNull();
    expect(resumoHorario({ auto: true, abre: "18:00", fecha: "18:00", dias: [1] })).toBeNull();
  });
});

describe("constantes", () => {
  it("DIAS_SEMANA cobre a semana no padrão getDay()", () => {
    expect(DIAS_SEMANA.map((d) => d.id)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(DIAS_SEMANA[0].label).toBe("Domingo");
    expect(DIAS_SEMANA[6].label).toBe("Sábado");
  });
  it("HORARIO_PADRAO nasce desligado", () => {
    expect(HORARIO_PADRAO.auto).toBe(false);
    expect(normalizarHorario(HORARIO_PADRAO).dias).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });
});
