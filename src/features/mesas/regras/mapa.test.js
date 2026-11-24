import { describe, it, expect } from "vitest";
import { proximaPosicaoLivre, capacidadeDaMesa, erroNovaMesa } from "./mapa";

// Refatoração 4.10: as Mesas do computador e a seção Mesas do celular usam estas
// regras; antes cada tela tinha a sua cópia.
describe("regras do mapa de mesas", () => {
  it("mesa nova entra à direita da última, na linha 1", () => {
    expect(proximaPosicaoLivre([])).toEqual({ posicao_x: 1, posicao_y: 1 });
    expect(proximaPosicaoLivre([{ posicao_x: 2 }, { posicao_x: 5 }])).toEqual({ posicao_x: 6, posicao_y: 1 });
  });

  it("capacidade tem pelo menos 1 lugar, e vazio vira 4", () => {
    expect(capacidadeDaMesa("6")).toBe(6);
    expect(capacidadeDaMesa("")).toBe(4);
    expect(capacidadeDaMesa("-2")).toBe(1);
  });

  it("mesa nova precisa de número que ainda não existe", () => {
    const mesas = [{ numero: "1" }];
    expect(erroNovaMesa("", mesas)).toBe("Informe o número ou nome da mesa.");
    expect(erroNovaMesa("1", mesas)).toBe("Já existe uma mesa com este número/nome.");
    expect(erroNovaMesa("Varanda", mesas)).toBeNull();
  });
});
