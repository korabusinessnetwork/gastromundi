import { describe, it, expect, vi } from "vitest";
import { destravarComSenha, PRAZO_BLOQUEIO_MS } from "./bloqueioTela";

/**
 * O cadeado existe porque o PDV não fecha nunca: até agora o prazo de sessão
 * chamava o logout, e o logout leva embora o carrinho montado e não lançado.
 * O que estes testes prendem é a regra combinada com o dono: com internet, a
 * senha vale; sem internet, a tela libera e o destrave fica registrado.
 */

const semRede = () => true;
const comRede = () => false;

describe("destravarComSenha", () => {
  it("senha certa, com internet: destrava e diz que foi verificado", async () => {
    const autenticar = vi.fn(async () => ({ error: null }));

    const r = await destravarComSenha("ana", "segredo", {
      autenticar, montarEmail: () => "ana@casa.local", estaOffline: comRede,
    });

    expect(r).toEqual({ ok: true, verificado: true, erro: null });
    expect(autenticar).toHaveBeenCalledWith("ana@casa.local", "segredo");
  });

  it("senha errada, com internet: não destrava", async () => {
    const r = await destravarComSenha("ana", "chute", {
      autenticar: async () => ({ error: { message: "Invalid login credentials" } }),
      montarEmail: () => "ana@casa.local",
      estaOffline: comRede,
    });

    expect(r.ok).toBe(false);
    expect(r.erro).toBe("Senha incorreta.");
  });

  it("sem internet: libera sem verificar, e avisa que não verificou", async () => {
    // Decisão do dono: o PDV opera offline por projeto, e cadeado que só abre
    // online transforma queda de link em caixa parado.
    const autenticar = vi.fn();

    const r = await destravarComSenha("ana", "qualquer", {
      autenticar, montarEmail: () => "ana@casa.local", estaOffline: semRede,
    });

    expect(r).toEqual({ ok: true, verificado: false, erro: null });
    expect(autenticar).not.toHaveBeenCalled();
  });

  it("internet que cai no meio da conferência também libera sem verificar", async () => {
    const r = await destravarComSenha("ana", "segredo", {
      autenticar: async () => ({ error: { message: "TypeError: Failed to fetch" } }),
      montarEmail: () => "ana@casa.local",
      estaOffline: comRede,
    });

    expect(r).toEqual({ ok: true, verificado: false, erro: null });
  });

  it("exceção de transporte não vira senha errada", async () => {
    const r = await destravarComSenha("ana", "segredo", {
      autenticar: async () => { throw new Error("Failed to fetch"); },
      montarEmail: () => "ana@casa.local",
      estaOffline: comRede,
    });

    expect(r.ok).toBe(true);
    expect(r.verificado).toBe(false);
  });

  it("senha em branco não vai à rede e pede a senha", async () => {
    const autenticar = vi.fn();

    const r = await destravarComSenha("ana", "", { autenticar, estaOffline: comRede });

    expect(r.ok).toBe(false);
    expect(r.erro).toMatch(/digite a senha/i);
    expect(autenticar).not.toHaveBeenCalled();
  });

  it("endereço de acesso inválido fala do endereço, não da senha", async () => {
    const r = await destravarComSenha("ana", "segredo", {
      autenticar: vi.fn(), montarEmail: () => null, estaOffline: comRede,
    });

    expect(r.ok).toBe(false);
    expect(r.erro).toMatch(/endereço de acesso/i);
  });
});

describe("prazo de bloqueio", () => {
  it("são as duas horas que o dono escolheu, não os 30 minutos de antes", () => {
    expect(PRAZO_BLOQUEIO_MS).toBe(2 * 60 * 60 * 1000);
  });
});
