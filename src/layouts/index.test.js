import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  LAYOUTS,
  LAYOUT_PADRAO_NOVOS,
  listarLayouts,
  layoutDoTema,
  varianteDoHorario,
  temTrocaAutomatica,
  variaveisDoLayout,
  msAteProximaTroca,
} from "./index";

describe("catálogo de layouts", () => {
  it("tem todos os modelos nomeados, salvos para mudanças futuras", () => {
    expect(Object.keys(LAYOUTS).sort()).toEqual(
      ["casa", "claro", "escuro", "marca", "noturno", "padrao"].sort()
    );
  });

  it("listarLayouts devolve codigo/nome/descricao de cada modelo", () => {
    const lista = listarLayouts();
    expect(lista).toHaveLength(6);
    for (const item of lista) {
      expect(item.codigo).toBeTruthy();
      expect(item.nome).toBeTruthy();
      expect(item.descricao).toBeTruthy();
    }
  });

  it("o padrão de novos estabelecimentos é o layout da marca (1b)", () => {
    expect(LAYOUT_PADRAO_NOVOS).toBe("marca");
    expect(LAYOUTS.marca).toBeTruthy();
  });
});

describe("layoutDoTema", () => {
  it("tema sem layout cai no padrao", () => {
    expect(layoutDoTema(null)).toBe("padrao");
    expect(layoutDoTema(undefined)).toBe("padrao");
    expect(layoutDoTema({})).toBe("padrao");
    expect(layoutDoTema({ accent: "#123456" })).toBe("padrao");
  });

  it("layout desconhecido ou inválido cai no padrao (nunca quebra)", () => {
    expect(layoutDoTema({ layout: "inexistente" })).toBe("padrao");
    expect(layoutDoTema({ layout: 42 })).toBe("padrao");
  });

  it("layout válido é respeitado", () => {
    expect(layoutDoTema({ layout: "marca" })).toBe("marca");
    expect(layoutDoTema({ layout: "casa" })).toBe("casa");
  });
});

describe("varianteDoHorario (19h → noturno · 6h → diurno)", () => {
  it("madrugada (antes das 6h) é noturno", () => {
    expect(varianteDoHorario(0)).toBe("noturno");
    expect(varianteDoHorario(5)).toBe("noturno");
  });

  it("das 6h às 18h59 é diurno", () => {
    expect(varianteDoHorario(6)).toBe("diurno");
    expect(varianteDoHorario(12)).toBe("diurno");
    expect(varianteDoHorario(18)).toBe("diurno");
  });

  it("das 19h em diante é noturno", () => {
    expect(varianteDoHorario(19)).toBe("noturno");
    expect(varianteDoHorario(23)).toBe("noturno");
  });
});

describe("temTrocaAutomatica", () => {
  it("marca e casa trocam sozinhos (dia/noite diferentes)", () => {
    expect(temTrocaAutomatica("marca")).toBe(true);
    expect(temTrocaAutomatica("casa")).toBe(true);
  });

  it("layouts fixos não armam timer", () => {
    expect(temTrocaAutomatica("padrao")).toBe(false);
    expect(temTrocaAutomatica("claro")).toBe(false);
    expect(temTrocaAutomatica("escuro")).toBe(false);
    expect(temTrocaAutomatica("noturno")).toBe(false);
  });

  it("código desconhecido cai no padrao (sem timer)", () => {
    expect(temTrocaAutomatica("inexistente")).toBe(false);
  });
});

describe("variaveisDoLayout", () => {
  it("padrao devolve mapa vazio — herda tema.css, aparência atual intacta", () => {
    expect(variaveisDoLayout("padrao", "diurno")).toEqual({});
    expect(variaveisDoLayout("padrao", "noturno")).toEqual({});
  });

  it("marca diurno usa o roxo-índigo #473CA8 da marca (1b)", () => {
    const vars = variaveisDoLayout("marca", "diurno");
    expect(vars["--gm-accent"]).toBe("#473CA8");
    expect(vars["--gm-bg"]).toBe("#F4F5F7");
  });

  it("marca noturno é o alto contraste 1c", () => {
    const vars = variaveisDoLayout("marca", "noturno");
    expect(vars["--gm-bg"]).toBe("#101215");
    expect(vars["--gm-text"]).toBe("#FFFFFF");
  });

  it("casa tem as duas variantes da paleta Casa Coffee, com fontes da marca", () => {
    const dia = variaveisDoLayout("casa", "diurno");
    const noite = variaveisDoLayout("casa", "noturno");
    expect(dia["--gm-bg"]).toBe("#F4EDE1");
    expect(noite["--gm-bg"]).toBe("#241B17");
    expect(dia["--gm-font-texto"]).toContain("Sora");
    expect(noite["--gm-font-titulo"]).toContain("Saira");
  });

  it("só emite tokens --gm-* conhecidos (nunca CSS arbitrário)", () => {
    for (const codigo of Object.keys(LAYOUTS)) {
      for (const variante of ["diurno", "noturno"]) {
        for (const token of Object.keys(variaveisDoLayout(codigo, variante))) {
          expect(token).toMatch(/^--gm-[a-z_-]+$/);
        }
      }
    }
  });

  it("layout/variante desconhecidos degradam sem quebrar", () => {
    expect(variaveisDoLayout("inexistente", "diurno")).toEqual({});
    expect(variaveisDoLayout("marca", "qualquer")["--gm-accent"]).toBe("#473CA8");
  });

  it("devolve cópia — mutar o retorno não corrompe o catálogo", () => {
    const vars = variaveisDoLayout("marca", "diurno");
    vars["--gm-accent"] = "#000000";
    expect(variaveisDoLayout("marca", "diurno")["--gm-accent"]).toBe("#473CA8");
  });
});

describe("msAteProximaTroca", () => {
  const ms = (h, m = 0) => msAteProximaTroca(new Date(2026, 6, 18, h, m, 0, 0));
  const HORA = 3600 * 1000;

  it("de manhã/tarde aponta para as 19:00", () => {
    expect(ms(10)).toBe(9 * HORA + 1000);
    expect(ms(18, 30)).toBe(0.5 * HORA + 1000);
  });

  it("à noite aponta para as 06:00 do dia seguinte", () => {
    expect(ms(19)).toBe(11 * HORA + 1000);
    expect(ms(23)).toBe(7 * HORA + 1000);
  });

  it("de madrugada aponta para as 06:00 do mesmo dia", () => {
    expect(ms(5)).toBe(1 * HORA + 1000);
    expect(ms(0, 30)).toBe(5.5 * HORA + 1000);
  });

  it("sempre positivo, com 1s de folga além da fronteira", () => {
    expect(ms(19, 0)).toBeGreaterThan(0);
    expect(msAteProximaTroca(new Date(2026, 6, 18, 18, 59, 59, 500))).toBe(1500);
  });
});

// R7L8 (segundo furo da mesma superfície): a lista fechada de layouts existe
// DUAS vezes — este catálogo e o ARRAY dentro de `alterar_layout_tenant`
// (20260801). Nada amarrava as duas cópias: um 7º layout adicionado só aqui
// apareceria no dropdown do Console e o banco recusaria com "Layout inválido"
// na hora de salvar — erro que só aparece depois do clique, com o nome do
// modelo já escolhido na tela. Esta é a amarra.
describe("catálogo de layouts × lista fechada da RPC (20260801)", () => {
  const sql = readFileSync(
    join(__dirname, "../../supabase/migrations/20260801_alterar_layout_tenant.sql"),
    "utf8"
  );

  it("a RPC aceita exatamente os layouts que o catálogo oferece", () => {
    const m = sql.match(/p_layout\s*<>\s*ALL\s*\(ARRAY\[([^\]]+)\]\)/);
    expect(m).not.toBeNull();
    const doBanco = m[1]
      .split(",")
      .map((s) => s.trim().replace(/^'|'$/g, ""))
      .sort();
    expect(doBanco).toEqual(Object.keys(LAYOUTS).sort());
  });

  it("cada layout tem o próprio código como chave do catálogo", () => {
    // A tela manda `codigo` para a RPC, mas quem monta a lista de opções
    // percorre as CHAVES. Divergir aqui manda para o banco um valor que a
    // lista fechada nem examina.
    for (const [chave, layout] of Object.entries(LAYOUTS)) {
      expect(layout.codigo).toBe(chave);
    }
  });
});
