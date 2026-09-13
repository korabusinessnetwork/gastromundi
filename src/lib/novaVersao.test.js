import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  anunciarNovaVersao,
  assinarNovaVersao,
  temNovaVersao,
  aplicarNovaVersao,
  esquecerNovaVersao,
} from "./novaVersao";

beforeEach(() => esquecerNovaVersao());

describe("aviso de versão nova", () => {
  it("sem anúncio, não há nada esperando", () => {
    expect(temNovaVersao()).toBe(false);
  });

  it("o anúncio chega a quem está ouvindo", () => {
    const ouvinte = vi.fn();
    assinarNovaVersao(ouvinte);

    anunciarNovaVersao(vi.fn());

    expect(ouvinte).toHaveBeenCalledWith(true);
    expect(temNovaVersao()).toBe(true);
  });

  it("quem monta depois do anúncio também descobre", () => {
    anunciarNovaVersao(vi.fn());
    expect(temNovaVersao()).toBe(true);
  });

  it("cancelar a assinatura para de receber, e o desmonte depende disso", () => {
    const ouvinte = vi.fn();
    const cancelar = assinarNovaVersao(ouvinte);

    cancelar();
    anunciarNovaVersao(vi.fn());

    expect(ouvinte).not.toHaveBeenCalled();
  });

  it("aplicar chama a função do plugin pedindo o recarregamento", async () => {
    const trocar = vi.fn(() => Promise.resolve());
    anunciarNovaVersao(trocar);

    expect(await aplicarNovaVersao()).toEqual({ error: null });
    expect(trocar).toHaveBeenCalledWith(true);
  });

  it("falha ao trocar devolve o motivo e deixa o operador onde está", async () => {
    anunciarNovaVersao(() => Promise.reject(new Error("rede caiu")));

    expect(await aplicarNovaVersao()).toEqual({ error: "rede caiu" });
  });

  it("aplicar sem anúncio nenhum não explode", async () => {
    const { error } = await aplicarNovaVersao();
    expect(error).toBeTruthy();
  });
});
