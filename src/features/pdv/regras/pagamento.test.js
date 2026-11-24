import { describe, it, expect } from "vitest";
import { METODOS_PADRAO, metodoBloqueadoSemRede, trocoEmDinheiro } from "./pagamento";

describe("METODOS_PADRAO", () => {
  it("são os quatro meios de quem não configurou os seus", () => {
    expect(METODOS_PADRAO).toEqual(["dinheiro", "credito", "debito", "pix"]);
  });
});

describe("metodoBloqueadoSemRede", () => {
  const tef = { credito: true, debito: true };

  it("sem internet e com TEF ligado, o método da maquininha fica bloqueado", () => {
    expect(metodoBloqueadoSemRede("credito", { redeOnline: false, tefLigado: true, metodosTef: tef })).toBe(true);
  });

  it("dinheiro e Pix não passam pela maquininha e seguem liberados", () => {
    expect(metodoBloqueadoSemRede("dinheiro", { redeOnline: false, tefLigado: true, metodosTef: tef })).toBe(false);
  });

  it("com internet, ou sem o add-on de TEF, nada fica bloqueado", () => {
    expect(metodoBloqueadoSemRede("credito", { redeOnline: true, tefLigado: true, metodosTef: tef })).toBe(false);
    expect(metodoBloqueadoSemRede("credito", { redeOnline: false, tefLigado: false, metodosTef: tef })).toBe(false);
  });
});

describe("trocoEmDinheiro", () => {
  it("devolve a diferença em centavos exatos", () => {
    expect(trocoEmDinheiro(10, 6.1)).toBe(3.9);
    expect(trocoEmDinheiro(100, 68.3)).toBe(31.7);
  });

  it("nunca é negativo: o que falta não é troco", () => {
    expect(trocoEmDinheiro(50, 68.3)).toBe(0);
  });

  it("recebido em branco vale zero", () => {
    expect(trocoEmDinheiro(undefined, 10)).toBe(0);
  });
});
