import { describe, it, expect } from "vitest";
import { rotaInicialPermitida } from "./navegacaoInicial";

describe("rotaInicialPermitida — casa segura do usuário (anti-loop)", () => {
  it("caixa/admin com pdv cai no PDV", () => {
    expect(rotaInicialPermitida({ pdv: true, palm: true })).toBe("/app/pdv");
  });

  it("garçom (palm, sem pdv) cai no Palm, não no PDV (evita o laço)", () => {
    const garcom = { pdv: false, palm: true, cozinha: true, clientes: true };
    expect(rotaInicialPermitida(garcom)).toBe("/palm");
  });

  it("usuário só com permissão gated por plano cai na rota quando o módulo está habilitado", () => {
    const perms = { pdv: false, palm: false, financeiro: true };
    expect(rotaInicialPermitida(perms, () => true)).toBe("/app/financeiro");
  });

  it("pula rotas cujo módulo o plano não inclui (nunca escolhe a casa que cairia no upgrade)", () => {
    const perms = { pdv: false, palm: false, financeiro: true, clientes: true };
    const soClientes = (m) => m === "clientes";
    expect(rotaInicialPermitida(perms, soClientes)).toBe("/app/clientes");
  });

  it("sem nenhuma permissão de navegação retorna null (chamador mostra 'sem acesso')", () => {
    expect(rotaInicialPermitida({})).toBeNull();
    expect(rotaInicialPermitida(null)).toBeNull();
  });

  it("sem função de módulo, não aplica gating de plano (rotas gated valem pela permissão)", () => {
    expect(rotaInicialPermitida({ cozinha: true })).toBe("/app/cozinha");
  });
});
