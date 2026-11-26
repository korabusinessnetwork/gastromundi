import { describe, it, expect } from "vitest";
import { faixaNova, horarioParaEdicao } from "./edicaoHorario";
import { FAIXA_PADRAO } from "@/features/delivery/regras/deliveryHorario";

// Refatoração 4.10: a edição do horário é a mesma nas Configurações do
// computador e do celular.
describe("edição do horário do delivery", () => {
  it("faixa nova nasce no horário padrão, com identidade própria", () => {
    const a = faixaNova();
    const b = faixaNova();
    expect(a).toMatchObject(FAIXA_PADRAO);
    expect(a.uid).toBeTruthy();
    expect(a.uid).not.toBe(b.uid);
  });

  it("horário do banco ganha identidade em cada faixa", () => {
    const h = horarioParaEdicao({ auto: true, dias: [1, 2], faixas: [{ abre: "11:00", fecha: "15:00" }] });
    expect(h.faixas).toHaveLength(1);
    expect(h.faixas[0]).toMatchObject({ abre: "11:00", fecha: "15:00" });
    expect(h.faixas[0].uid).toBeTruthy();
  });
});
