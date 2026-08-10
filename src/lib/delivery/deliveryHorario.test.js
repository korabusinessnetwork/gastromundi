import { describe, it, expect } from "vitest";
import {
  DIAS_SEMANA,
  HORARIO_PADRAO,
  FAIXA_PADRAO,
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
    expect(normalizarHorario(undefined)).toEqual({ auto: false, dias: [], faixas: [] });
    expect(normalizarHorario("lixo")).toEqual({ auto: false, dias: [], faixas: [] });
    expect(normalizarHorario({})).toEqual({ auto: false, dias: [], faixas: [] });
  });
  it("coage tipos, zero-padroniza a hora e limpa os dias", () => {
    const out = normalizarHorario({
      auto: true,
      dias: [7, 1, 1, 3, -1, "2", 2],
      faixas: [{ abre: "8:05", fecha: "23:00" }],
    });
    expect(out).toEqual({
      auto: true,
      dias: [1, 2, 3],
      faixas: [{ abre: "08:05", fecha: "23:00" }],
    });
  });
  it("auto só é true quando estritamente === true", () => {
    expect(normalizarHorario({ auto: "sim" }).auto).toBe(false);
    expect(normalizarHorario({ auto: true }).auto).toBe(true);
  });
  it("migra o formato legado (abre/fecha no topo) para uma faixa", () => {
    expect(normalizarHorario({ auto: true, abre: "8:00", fecha: "23:00", dias: [1] }))
      .toEqual({ auto: true, dias: [1], faixas: [{ abre: "08:00", fecha: "23:00" }] });
  });
  it("prefere a lista `faixas` quando ela existe (ignora abre/fecha legado)", () => {
    const out = normalizarHorario({
      abre: "08:00",
      fecha: "10:00",
      faixas: [{ abre: "18:00", fecha: "23:00" }],
    });
    expect(out.faixas).toEqual([{ abre: "18:00", fecha: "23:00" }]);
  });
  it("preserva várias faixas e descarta as totalmente vazias", () => {
    const out = normalizarHorario({
      auto: true,
      dias: [1],
      faixas: [
        { abre: "08:00", fecha: "10:00" },
        { abre: "", fecha: "" }, // ruído: cai fora
        { abre: "11:00", fecha: "14:00" },
        { abre: "18:00", fecha: "00:00" },
      ],
    });
    expect(out.faixas).toEqual([
      { abre: "08:00", fecha: "10:00" },
      { abre: "11:00", fecha: "14:00" },
      { abre: "18:00", fecha: "00:00" },
    ]);
  });
});

describe("horarioValido", () => {
  it("desligado é sempre válido (nada a preencher)", () => {
    expect(horarioValido({ auto: false })).toBe(true);
  });
  it("ligado exige ao menos um dia, ao menos uma faixa e todas completas", () => {
    expect(horarioValido({ auto: true, dias: [1], faixas: [{ abre: "18:00", fecha: "23:00" }] })).toBe(true);
    // faixa com abre === fecha
    expect(horarioValido({ auto: true, dias: [1], faixas: [{ abre: "18:00", fecha: "18:00" }] })).toBe(false);
    // sem dias
    expect(horarioValido({ auto: true, dias: [], faixas: [{ abre: "18:00", fecha: "23:00" }] })).toBe(false);
    // sem faixas
    expect(horarioValido({ auto: true, dias: [1], faixas: [] })).toBe(false);
    // uma faixa incompleta entre válidas invalida o conjunto
    expect(horarioValido({
      auto: true,
      dias: [1],
      faixas: [{ abre: "08:00", fecha: "10:00" }, { abre: "11:00", fecha: null }],
    })).toBe(false);
  });
  it("aceita várias faixas completas no mesmo dia", () => {
    expect(horarioValido({
      auto: true,
      dias: [1, 2, 3, 4, 5],
      faixas: [
        { abre: "08:00", fecha: "10:00" },
        { abre: "11:00", fecha: "14:00" },
        { abre: "18:00", fecha: "00:00" },
      ],
    })).toBe(true);
  });
});

describe("deliveryDeveEstarAberto — não governa (null)", () => {
  it("retorna null quando o agendamento está desligado", () => {
    expect(deliveryDeveEstarAberto({ auto: false, dias: [1], faixas: [{ abre: "18:00", fecha: "23:00" }] })).toBeNull();
  });
  it("retorna null quando está ligado mas incompleto (não fecha por engano)", () => {
    expect(deliveryDeveEstarAberto({ auto: true, dias: [1], faixas: [{ abre: "18:00", fecha: "18:00" }] })).toBeNull();
    expect(deliveryDeveEstarAberto({ auto: true, dias: [], faixas: [{ abre: "18:00", fecha: "23:00" }] })).toBeNull();
    expect(deliveryDeveEstarAberto({ auto: true, dias: [1], faixas: [] })).toBeNull();
  });
});

describe("deliveryDeveEstarAberto — janela no mesmo dia", () => {
  const h = { auto: true, dias: [1], faixas: [{ abre: "18:00", fecha: "23:00" }] }; // só segunda

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
  const h = { auto: true, dias: [5], faixas: [{ abre: "18:00", fecha: "02:00" }] }; // só sexta

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
    expect(deliveryDeveEstarAberto(h, em(5, 3, 0))).toBe(false); // sexta 03:00: nem noturno nem rescaldo (quinta inativa)
  });
});

describe("deliveryDeveEstarAberto — múltiplas faixas no mesmo dia", () => {
  // Caso do dono: abre 08 fecha 10, abre 11 fecha 14, abre 18 fecha 00.
  const h = {
    auto: true,
    dias: [1],
    faixas: [
      { abre: "08:00", fecha: "10:00" },
      { abre: "11:00", fecha: "14:00" },
      { abre: "18:00", fecha: "00:00" },
    ],
  };

  it("aberto dentro de qualquer uma das faixas", () => {
    expect(deliveryDeveEstarAberto(h, em(1, 8, 30))).toBe(true); // faixa 1
    expect(deliveryDeveEstarAberto(h, em(1, 12, 0))).toBe(true); // faixa 2
    expect(deliveryDeveEstarAberto(h, em(1, 23, 59))).toBe(true); // faixa 3 (até 00:00)
  });
  it("fechado nos vãos entre as faixas", () => {
    expect(deliveryDeveEstarAberto(h, em(1, 10, 30))).toBe(false); // entre 1 e 2
    expect(deliveryDeveEstarAberto(h, em(1, 16, 0))).toBe(false); // entre 2 e 3
    expect(deliveryDeveEstarAberto(h, em(1, 7, 59))).toBe(false); // antes da primeira
  });
  it("fecha 00:00 não vaza para a madrugada seguinte", () => {
    expect(deliveryDeveEstarAberto(h, em(2, 0, 0))).toBe(false); // terça 00:00
    expect(deliveryDeveEstarAberto(h, em(2, 0, 30))).toBe(false); // terça 00:30
  });
  it("fechado nos dias fora de `dias`, mesmo dentro de uma faixa", () => {
    expect(deliveryDeveEstarAberto(h, em(3, 12, 0))).toBe(false); // quarta ao meio-dia
  });
});

describe("ajusteAutomaticoAbertura", () => {
  const h = { auto: true, dias: [1], faixas: [{ abre: "18:00", fecha: "23:00" }] };

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
    expect(resumoHorario({ auto: true, dias: [1, 2, 3, 4, 5], faixas: [{ abre: "18:00", fecha: "23:00" }] }))
      .toBe("Seg a Sex · 18:00 às 23:00");
  });
  it("resume a semana toda", () => {
    expect(resumoHorario({ auto: true, dias: [0, 1, 2, 3, 4, 5, 6], faixas: [{ abre: "11:00", fecha: "15:00" }] }))
      .toBe("todos os dias · 11:00 às 15:00");
  });
  it("lista dias soltos e marca a virada de noite", () => {
    expect(resumoHorario({ auto: true, dias: [0, 6], faixas: [{ abre: "18:00", fecha: "02:00" }] }))
      .toBe("Dom, Sáb · 18:00 às 02:00 (do dia seguinte)");
  });
  it("lista várias faixas separadas por vírgula", () => {
    expect(resumoHorario({
      auto: true,
      dias: [0, 1, 2, 3, 4, 5, 6],
      faixas: [
        { abre: "08:00", fecha: "10:00" },
        { abre: "11:00", fecha: "14:00" },
        { abre: "18:00", fecha: "00:00" },
      ],
    })).toBe("todos os dias · 08:00 às 10:00, 11:00 às 14:00, 18:00 às 00:00");
  });
  it("resume config no formato legado (abre/fecha no topo)", () => {
    expect(resumoHorario({ auto: true, abre: "18:00", fecha: "23:00", dias: [1, 2, 3, 4, 5] }))
      .toBe("Seg a Sex · 18:00 às 23:00");
  });
  it("retorna null quando não há agendamento válido", () => {
    expect(resumoHorario({ auto: false, dias: [1], faixas: [{ abre: "18:00", fecha: "23:00" }] })).toBeNull();
    expect(resumoHorario({ auto: true, dias: [1], faixas: [{ abre: "18:00", fecha: "18:00" }] })).toBeNull();
  });
});

describe("constantes", () => {
  it("DIAS_SEMANA cobre a semana no padrão getDay()", () => {
    expect(DIAS_SEMANA.map((d) => d.id)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(DIAS_SEMANA[0].label).toBe("Domingo");
    expect(DIAS_SEMANA[6].label).toBe("Sábado");
  });
  it("HORARIO_PADRAO nasce desligado, com todos os dias e uma faixa", () => {
    expect(HORARIO_PADRAO.auto).toBe(false);
    expect(normalizarHorario(HORARIO_PADRAO).dias).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(normalizarHorario(HORARIO_PADRAO).faixas).toEqual([{ abre: "18:00", fecha: "23:00" }]);
  });
  it("FAIXA_PADRAO é a janela sugerida", () => {
    expect(FAIXA_PADRAO).toEqual({ abre: "18:00", fecha: "23:00" });
  });
});
